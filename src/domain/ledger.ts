// In-memory view of all payslips used by forecasting, comparison and aggregation (pure).
import type { ItemMaster, Payslip, PayslipKind, PayslipLine } from './types';

export interface SlotKey {
  month: number;
  kind: PayslipKind;
}

export const slotId = (s: SlotKey): string =>
  `${String(s.month).padStart(2, '0')}${s.kind === 'bonus' ? 'B' : 'S'}`;

/** Amounts per item for one actual slot (several slips of the same slot are summed). */
export type Amounts = Map<string, number>;

export interface Ledger {
  items: ItemMaster[];
  itemById: Map<string, ItemMaster>;
  /** year → slotId → amounts. */
  actual: Map<number, Map<string, Amounts>>;
  /** year → slotId → slips (for cumulative / attendance). */
  slips: Map<number, Map<string, Payslip[]>>;
}

export function buildLedger(
  items: readonly ItemMaster[],
  payslips: readonly Payslip[],
  lines: readonly PayslipLine[],
): Ledger {
  const linesBySlip = new Map<string, PayslipLine[]>();
  for (const l of lines) {
    const list = linesBySlip.get(l.payslipId) ?? [];
    list.push(l);
    linesBySlip.set(l.payslipId, list);
  }
  const actual = new Map<number, Map<string, Amounts>>();
  const slips = new Map<number, Map<string, Payslip[]>>();
  for (const p of payslips) {
    const key = slotId(p);
    const yearActual = actual.get(p.year) ?? new Map<string, Amounts>();
    const amounts = yearActual.get(key) ?? new Map<string, number>();
    for (const l of linesBySlip.get(p.id) ?? []) {
      amounts.set(l.itemId, (amounts.get(l.itemId) ?? 0) + l.amount);
    }
    yearActual.set(key, amounts);
    actual.set(p.year, yearActual);
    const yearSlips = slips.get(p.year) ?? new Map<string, Payslip[]>();
    yearSlips.set(key, [...(yearSlips.get(key) ?? []), p]);
    slips.set(p.year, yearSlips);
  }
  return {
    items: [...items].sort((a, b) => a.order - b.order),
    itemById: new Map(items.map((i) => [i.id, i])),
    actual,
    slips,
  };
}

export function actualAmounts(ledger: Ledger, year: number, slot: SlotKey): Amounts | undefined {
  return ledger.actual.get(year)?.get(slotId(slot));
}

/** Actual salary slots strictly before (year, month), newest first. */
export function salaryHistoryBefore(
  ledger: Ledger,
  year: number,
  month: number,
): { year: number; month: number; amounts: Amounts }[] {
  const out: { year: number; month: number; amounts: Amounts }[] = [];
  const years = [...ledger.actual.keys()].filter((y) => y <= year).sort((a, b) => b - a);
  for (const y of years) {
    for (let m = 12; m >= 1; m--) {
      if (y === year && m >= month) continue;
      const amounts = actualAmounts(ledger, y, { month: m, kind: 'salary' });
      if (amounts) out.push({ year: y, month: m, amounts });
    }
  }
  return out;
}

/** 令和6年分の定額減税で源泉所得税・住民税が通常と異なる期間（requirements 3.1）. */
export function isSpecialPeriod(year: number, month: number): boolean {
  return year === 2024 && month >= 6;
}
