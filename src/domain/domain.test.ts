// Synthetic data only.
import { describe, expect, it } from 'vitest';
import type { ParsedPayslip } from '../import/payslip';
import { computeAnnual, EMPTY_RECORDS, furusatoWarnings } from './annual';
import { compareCumulative, compareMonth } from './compare';
import { buildYearTable, yearTotals } from './forecast';
import { planImport } from './importer';
import { seedItems } from './itemSeeds';
import { buildLedger } from './ledger';
import type { FurusatoDonation, ItemMaster } from './types';

const items = seedItems();
const byName = (name: string): ItemMaster => {
  const found = items.find((i) => i.name === name);
  if (!found) throw new Error(name);
  return found;
};

interface SlipSpec {
  year: number;
  month: number;
  kind?: 'salary' | 'bonus';
  pay: Record<string, number>;
  ded: Record<string, number>;
}

let cum = { year: 0, payment: 0, social: 0, tax: 0 };

function parsed(spec: SlipSpec): ParsedPayslip {
  if (cum.year !== spec.year) cum = { year: spec.year, payment: 0, social: 0, tax: 0 };
  const payment = Object.values(spec.pay).reduce((a, v) => a + v, 0);
  const deduction = Object.values(spec.ded).reduce((a, v) => a + v, 0);
  const social = ['健康保険', '厚生年金', '雇用保険'].reduce((a, n) => a + (spec.ded[n] ?? 0), 0);
  cum = {
    year: spec.year,
    payment: cum.payment + payment,
    social: cum.social + social,
    tax: cum.tax + (spec.ded['所得税'] ?? 0) + (spec.ded['年調過不足額'] ?? 0),
  };
  return {
    year: spec.year,
    month: spec.month,
    kind: spec.kind ?? 'salary',
    lines: [
      ...Object.entries(spec.pay).map(([name, amount]) => ({
        block: 'payment' as const,
        name,
        amount,
      })),
      ...Object.entries(spec.ded).map(([name, amount]) => ({
        block: 'deduction' as const,
        name,
        amount,
      })),
    ],
    attendance: [],
    totals: {
      payment,
      socialInsurance: social,
      deduction,
      net: payment - deduction,
      bankTransfer: payment - deduction,
    },
    cumulative: { payment: cum.payment, socialInsurance: cum.social, incomeTax: cum.tax },
    remarks: [],
    warnings: [],
  };
}

const salary = (year: number, month: number, overtime = 50_000): SlipSpec => ({
  year,
  month,
  pay: { 基本給: 400_000, 時間外勤務手当: overtime },
  ded: { 健康保険: 20_000, 厚生年金: 40_000, 雇用保険: 2_700, 所得税: 20_000, 住民税: 25_000 },
});

function ledgerOf(specs: SlipSpec[]) {
  cum = { year: 0, payment: 0, social: 0, tax: 0 };
  let n = 0;
  const plan = planImport(
    specs.map((s, i) => ({ fileName: `f${i}.pdf`, slip: parsed(s) })),
    items,
    [],
    [],
    () => `id${++n}`,
    '2026-01-01T00:00:00Z',
  );
  return {
    plan,
    ledger: buildLedger(
      [...items, ...plan.newItems],
      plan.slips.map((s) => s.payslip),
      plan.slips.flatMap((s) => s.lines),
    ),
  };
}

describe('planImport', () => {
  it('accepts consistent slips and creates pending items for unknown names', () => {
    const spec = salary(2025, 1);
    const { plan } = ledgerOf([
      { ...spec, pay: { ...spec.pay, 謎の手当: 1_000 } },
      salary(2025, 2),
    ]);
    expect(plan.slips.every((s) => s.ok)).toBe(true);
    expect(plan.newItems.map((i) => [i.name, i.category])).toEqual([['謎の手当', 'pending']]);
  });
  it('rejects a slip whose cumulative total does not continue', () => {
    cum = { year: 0, payment: 0, social: 0, tax: 0 };
    const first = parsed(salary(2025, 1));
    const second = parsed(salary(2025, 2));
    const broken = { ...second, cumulative: { ...second.cumulative, payment: 1 } };
    let n = 0;
    const plan = planImport(
      [
        { fileName: 'a.pdf', slip: first },
        { fileName: 'b.pdf', slip: broken },
      ],
      items,
      [],
      [],
      () => `x${++n}`,
      'now',
    );
    expect(plan.slips.map((s) => s.ok)).toEqual([true, false]);
    expect(plan.slips[1]?.cumulativeIssues[0]).toMatch(/支給累計/);
  });
  it('rejects a slip failing the arithmetic checks', () => {
    const slip = parsed(salary(2025, 1));
    const plan = planImport(
      [
        {
          fileName: 'a.pdf',
          slip: { ...slip, totals: { ...slip.totals, payment: slip.totals.payment + 1 } },
        },
      ],
      items,
      [],
      [],
      () => 'z',
      'now',
    );
    expect(plan.slips[0]?.ok).toBe(false);
  });
});

describe('forecast', () => {
  const specs = [
    salary(2025, 1, 30_000),
    salary(2025, 2, 60_000),
    salary(2025, 3, 90_000),
    {
      year: 2025,
      month: 6,
      kind: 'bonus' as const,
      pay: { 賞与基本給: 800_000 },
      ded: { 所得税: 80_000 },
    },
    ...[1, 2, 3].map((m) => salary(2026, m, 30_000 * m)),
  ];
  const { ledger } = ledgerOf(specs);

  it('fills missing months by item method and keeps actuals', () => {
    const table = buildYearTable(ledger, 2026);
    const apr = table.cells.get('04S');
    expect(apr?.get(byName('基本給').id)).toMatchObject({ amount: 400_000, method: 'recent' });
    expect(apr?.get(byName('時間外勤務手当').id)).toMatchObject({ amount: 60_000, method: 'avg3' });
    // tax rate = 60,000 / 1,380,000 of taxable pay
    expect(apr?.get(byName('所得税').id)?.amount).toBe(Math.floor(460_000 * (60_000 / 1_380_000)));
    expect(table.cells.get('01S')?.get(byName('基本給').id)?.source).toBe('actual');
  });
  it('forecasts bonuses from the same month last year', () => {
    const table = buildYearTable(ledger, 2026);
    expect(table.cells.get('06B')?.get(byName('賞与基本給').id)?.amount).toBe(800_000);
    expect(table.cells.get('06B')?.get(byName('所得税').id)?.amount).toBe(80_000);
  });
  it('counts forecast months and totals 12 months', () => {
    const totals = yearTotals(ledger, buildYearTable(ledger, 2026));
    expect(totals.forecastSalaryMonths).toBe(9);
    expect(totals.forecastBonusCount).toBe(1);
    expect(totals.taxablePay).toBe(400_000 * 12 + 30_000 + 60_000 + 90_000 + 60_000 * 9 + 800_000);
  });
  it('applies manual overrides', () => {
    const table = buildYearTable(ledger, 2026, [
      {
        id: 'o',
        year: 2026,
        month: 5,
        kind: 'salary',
        itemId: byName('基本給').id,
        amount: 500_000,
      },
    ]);
    expect(table.cells.get('05S')?.get(byName('基本給').id)).toEqual({
      amount: 500_000,
      source: 'override',
    });
  });
});

describe('annual', () => {
  it('predicts the December year-end adjustment from the engine', () => {
    const { ledger } = ledgerOf([1, 2, 3].map((m) => salary(2025, m)));
    const annual = computeAnnual(ledger, 2025, EMPTY_RECORDS);
    const dec = annual.table.cells.get('12S')?.get(byName('年調過不足額').id);
    expect(dec?.method).toBe('yearEnd');
    expect(dec?.amount).toBe(annual.estimate.yearEndBalance);
    expect(annual.hasForecast).toBe(true);
  });
});

describe('annual without data', () => {
  it('does not count an empty year as containing forecasts', () => {
    const { ledger } = ledgerOf([]);
    const annual = computeAnnual(ledger, 2026, EMPTY_RECORDS);
    expect(annual.totals.forecastSalaryMonths).toBe(0);
    expect(annual.hasForecast).toBe(false);
  });
});

describe('compare', () => {
  const { ledger } = ledgerOf([
    salary(2025, 3, 50_000),
    salary(2026, 2, 40_000),
    salary(2026, 3, 60_000),
  ]);
  it('compares with the previous month and the same month last year', () => {
    const r = compareMonth(ledger, 2026, { month: 3, kind: 'salary' });
    const ot = r.vsPreviousMonth.find((x) => x.item.name === '時間外勤務手当');
    expect(ot).toMatchObject({
      current: 60_000,
      base: 40_000,
      diff: 20_000,
      rate: 0.5,
      exceedsThreshold: true,
    });
    expect(r.vsLastYear.find((x) => x.item.name === '時間外勤務手当')?.diff).toBe(10_000);
  });
  it('flags the 2024 fixed tax reduction period', () => {
    const { ledger: l } = ledgerOf([salary(2024, 6), salary(2025, 6)]);
    expect(compareMonth(l, 2025, { month: 6, kind: 'salary' }).notes[0]).toMatch(/定額減税/);
  });
  it('compares year-to-date totals', () => {
    const rows = compareCumulative(ledger, 2026, 3);
    expect(rows.find((r) => r.item.name === '基本給')).toMatchObject({
      current: 800_000,
      base: 400_000,
    });
  });
});

describe('furusatoWarnings', () => {
  const d = (i: number, extra: Partial<FurusatoDonation> = {}): FurusatoDonation => ({
    id: String(i),
    date: '2026-05-01',
    municipality: `町${i}`,
    amount: 10_000,
    portal: '',
    gift: '',
    receiptReceived: true,
    oneStop: 'applied',
    ...extra,
  });
  it('warns about six or more municipalities', () => {
    const w = furusatoWarnings(
      [1, 2, 3, 4, 5, 6].map((i) => d(i)),
      2026,
      false,
      '2026-10-01',
    );
    expect(w[0]?.message).toMatch(/6自治体/);
  });
  it('warns that a tax return voids one-stop', () => {
    expect(furusatoWarnings([d(1)], 2026, true, '2026-10-01')[0]?.message).toMatch(/無効/);
  });
  it('reminds of the January 10 deadline', () => {
    const w = furusatoWarnings([d(1, { oneStop: 'none' })], 2026, false, '2026-12-20');
    expect(w.some((x) => x.message.includes('2027-01-10'))).toBe(true);
  });
});
