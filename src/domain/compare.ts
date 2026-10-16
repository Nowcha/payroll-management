// 月次比較・累計比較（requirements F-06 / F-07）.
import { actualAmounts, isSpecialPeriod, type Ledger, type SlotKey } from './ledger';
import { payOf, type PayBreakdown } from './takeHome';
import type { ItemMaster } from './types';

export interface CompareRow {
  key: string;
  label: string;
  /** 支給合計・控除合計・差引支給額（手取り）の集計行. */
  isTotal: boolean;
  current: number;
  base: number;
  diff: number;
  /** null when the base is zero. */
  rate: number | null;
  exceedsThreshold: boolean;
}

export interface MonthComparison {
  vsPreviousMonth: CompareRow[];
  vsLastYear: CompareRow[];
  /** 定額減税など特殊要因がある月の注記. */
  notes: string[];
}

export const DEFAULT_THRESHOLD = 0.1;

function row(
  key: string,
  label: string,
  isTotal: boolean,
  current: number,
  base: number,
  threshold: number,
): CompareRow {
  const diff = current - base;
  const rate = base === 0 ? null : diff / Math.abs(base);
  return {
    key,
    label,
    isTotal,
    current,
    base,
    diff,
    rate,
    exceedsThreshold: rate === null ? current !== 0 : Math.abs(rate) > threshold,
  };
}

const TOTAL_ROWS: readonly [keyof PayBreakdown, string][] = [
  ['gross', '支給合計'],
  ['deductions', '控除合計'],
  ['net', '差引支給額（手取り）'],
];

function rows(
  ledger: Ledger,
  items: readonly ItemMaster[],
  current: Map<string, number> | undefined,
  base: Map<string, number> | undefined,
  threshold: number,
): CompareRow[] {
  const itemRows = items
    .map((item) =>
      row(
        item.id,
        item.name,
        false,
        current?.get(item.id) ?? 0,
        base?.get(item.id) ?? 0,
        threshold,
      ),
    )
    .filter((r) => r.current !== 0 || r.base !== 0);
  if (itemRows.length === 0) return [];
  const c = payOf(ledger, current);
  const b = payOf(ledger, base);
  return [
    ...itemRows,
    ...TOTAL_ROWS.map(([key, label]) =>
      row(`total:${key}`, label, true, c[key], b[key], threshold),
    ),
  ];
}

function previousSlot(year: number, slot: SlotKey): { year: number; slot: SlotKey } {
  if (slot.kind === 'bonus') return { year: year - 1, slot };
  return slot.month === 1
    ? { year: year - 1, slot: { month: 12, kind: 'salary' } }
    : { year, slot: { month: slot.month - 1, kind: 'salary' } };
}

export function compareMonth(
  ledger: Ledger,
  year: number,
  slot: SlotKey,
  threshold = DEFAULT_THRESHOLD,
): MonthComparison {
  const items = ledger.items.filter((i) => i.block !== 'attendance');
  const current = actualAmounts(ledger, year, slot);
  const prev = previousSlot(year, slot);
  const notes: string[] = [];
  for (const [y, m] of [
    [year, slot.month],
    [prev.year, prev.slot.month],
    [year - 1, slot.month],
  ] as const) {
    if (isSpecialPeriod(y, m)) notes.push(`${y}年${m}月は定額減税の特殊要因あり（所得税・住民税）`);
  }
  return {
    vsPreviousMonth: rows(
      ledger,
      items,
      current,
      actualAmounts(ledger, prev.year, prev.slot),
      threshold,
    ),
    vsLastYear: rows(ledger, items, current, actualAmounts(ledger, year - 1, slot), threshold),
    notes: [...new Set(notes)],
  };
}

function cumulative(ledger: Ledger, year: number, throughMonth: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, amounts] of ledger.actual.get(year) ?? []) {
    if (Number(key.slice(0, 2)) > throughMonth) continue;
    for (const [itemId, v] of amounts) out.set(itemId, (out.get(itemId) ?? 0) + v);
  }
  return out;
}

/** 年初から throughMonth までの累計（給与＋賞与の実績）を前年同期と比較. */
export function compareCumulative(
  ledger: Ledger,
  year: number,
  throughMonth: number,
  threshold = DEFAULT_THRESHOLD,
): CompareRow[] {
  const items = ledger.items.filter((i) => i.block !== 'attendance');
  return rows(
    ledger,
    items,
    cumulative(ledger, year, throughMonth),
    cumulative(ledger, year - 1, throughMonth),
    threshold,
  );
}

export function latestActualMonth(ledger: Ledger, year: number): number {
  let latest = 0;
  for (const key of ledger.actual.get(year)?.keys() ?? [])
    latest = Math.max(latest, Number(key.slice(0, 2)));
  return latest;
}
