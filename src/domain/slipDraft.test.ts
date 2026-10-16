// Synthetic data only.
import { describe, expect, it } from 'vitest';
import { getParams } from '../engine';
import { computeAnnual, EMPTY_RECORDS } from './annual';
import { buildLedger } from './ledger';
import { seedItems } from './itemSeeds';
import { buildSlipDraft, draftChecks } from './slipDraft';
import type { FamilyMember, Payslip, PayslipLine } from './types';

const items = seedItems();
const id = (name: string): string => {
  const item = items.find((i) => i.name === name);
  if (!item) throw new Error(name);
  return item.id;
};

function ledgerFor(year: number, months: number) {
  const payslips: Payslip[] = [];
  const lines: PayslipLine[] = [];
  for (let m = 1; m <= months; m++) {
    const pid = `${year}-${m}`;
    payslips.push({
      id: pid,
      year,
      month: m,
      kind: 'salary',
      seq: 1,
      cumulative: { payment: null, socialInsurance: null, incomeTax: null },
      attendance: [],
      remarks: [],
      createdAt: '2026-01-01T00:00:00Z',
    });
    for (const [name, amount] of [
      ['基本給', 400_000],
      ['健康保険', 20_000],
      ['厚生年金', 36_600],
      ['所得税', 10_000],
    ] as const) {
      lines.push({ id: `${pid}-${name}`, payslipId: pid, itemId: id(name), amount });
    }
  }
  return buildLedger(items, payslips, lines);
}

const child = (birthDate: string): FamilyMember => ({
  id: birthDate,
  name: '子',
  relation: 'child',
  birthDate,
  incomeByYear: {},
  isDependentOfSelf: true,
  livesTogether: true,
  isLinealAscendant: false,
});

describe('buildSlipDraft', () => {
  it('lays out the year-end figures and counts dependents by category', () => {
    const records = { ...EMPTY_RECORDS, family: [child('2008-04-01'), child('2015-04-01')] };
    const s = computeAnnual(ledgerFor(2025, 12), 2025, records);
    const d = buildSlipDraft(s);
    expect(d).toMatchObject({
      paymentAmount: 4_800_000,
      socialInsurance: 679_200,
      withheldTax: s.estimate.yearEnd.annualTax,
      employmentIncome: s.estimate.yearEnd.income.employmentIncome,
      hasForecast: false,
      dependents: { general: 1, under16: 1, specific: 0, elderly: 0 },
      basicDeduction: s.estimate.yearEnd.deductions.basic,
      remarks: [],
    });
  });
  it('omits a 480,000 basic deduction and writes the fixed tax reduction remark for 2024', () => {
    const d = buildSlipDraft(computeAnnual(ledgerFor(2024, 12), 2024, EMPTY_RECORDS));
    const perPerson = getParams(2024).incomeTax.fixedTaxReduction?.value.perPerson ?? 0;
    expect(d.basicDeduction).toBeNull();
    expect(d.fixedTaxReductionApplied).toBe(perPerson);
    expect(d.remarks).toEqual([
      `源泉徴収時所得税減税控除済額${perPerson.toLocaleString('ja-JP')}円、控除外額0円`,
    ]);
  });
  it('flags a forecast year and compares with a registered slip', () => {
    const s = computeAnnual(ledgerFor(2026, 3), 2026, EMPTY_RECORDS);
    const d = buildSlipDraft(s);
    expect(d.hasForecast).toBe(true);
    const checks = draftChecks(d, {
      year: 2026,
      paymentAmount: d.paymentAmount + 1,
      employmentIncome: d.employmentIncome,
      totalDeductions: d.totalDeductions,
      withheldTax: d.withheldTax,
      socialInsurance: d.socialInsurance,
      lifeInsuranceDeduction: 0,
      earthquakeInsuranceDeduction: 0,
      housingLoanCredit: 0,
    });
    expect(checks.filter((c) => c.draft !== c.slip).map((c) => c.label)).toEqual(['支払金額']);
  });
});
