// 12-month table with forecasts for missing slots (requirements 3.1 / F-09 / F-10).
import {
  actualAmounts,
  isSpecialPeriod,
  salaryHistoryBefore,
  slotId,
  type Amounts,
  type Ledger,
  type SlotKey,
} from './ledger';
import { premiumsAt, type RemunerationPlan } from './socialInsurance';
import type { ForecastMethod, ForecastOverride, ItemMaster, TaxCategory } from './types';

export type CellSource = 'actual' | 'forecast' | 'override';
export type CellMethod = ForecastMethod | 'taxRate' | 'yearEnd' | 'standardRemuneration';

export interface Cell {
  amount: number;
  source: CellSource;
  method?: CellMethod;
}

export interface YearTable {
  year: number;
  slots: SlotKey[];
  /** slotId → itemId → cell. Items absent from a slot are zero. */
  cells: Map<string, Map<string, Cell>>;
  actualSlotIds: Set<string>;
  /** Forecast slots inside a leave period (no pay, social insurance exempt). */
  leaveSlotIds: Set<string>;
}

export interface TableOptions {
  overrides?: readonly ForecastOverride[];
  /** Salary months without pay (育児休業など); bonuses in these months are zero as well. */
  leaveMonths?: readonly number[];
  /** F-11 定時決定 plan applied from its reflectFromMonth. */
  plan?: RemunerationPlan | null;
}

const HISTORY_FOR_AVERAGE = 3;
const TAX_CATEGORIES: readonly TaxCategory[] = ['incomeTax'];

function amountOf(amounts: Amounts | undefined, itemId: string): number {
  return amounts?.get(itemId) ?? 0;
}

function sumCategory(
  ledger: Ledger,
  amounts: Amounts | Map<string, Cell>,
  category: TaxCategory,
): number {
  let total = 0;
  for (const [itemId, v] of amounts) {
    if (ledger.itemById.get(itemId)?.category === category)
      total += typeof v === 'number' ? v : v.amount;
  }
  return total;
}

function bonusMonths(ledger: Ledger, year: number): number[] {
  const months = new Set<number>();
  for (const y of [year, year - 1]) {
    for (const key of ledger.actual.get(y)?.keys() ?? []) {
      if (key.endsWith('B')) months.add(Number(key.slice(0, 2)));
    }
  }
  return [...months];
}

/** Payment order within a month: bonus first, then salary (matches the printed cumulative totals). */
export function yearSlots(ledger: Ledger, year: number): SlotKey[] {
  const bonus = new Set(bonusMonths(ledger, year));
  const slots: SlotKey[] = [];
  for (let m = 1; m <= 12; m++) {
    if (bonus.has(m)) slots.push({ month: m, kind: 'bonus' });
    slots.push({ month: m, kind: 'salary' });
  }
  return slots;
}

function forecastSalaryItem(
  ledger: Ledger,
  item: ItemMaster,
  year: number,
  month: number,
): Cell | null {
  const history = salaryHistoryBefore(ledger, year, month);
  const method = item.defaultMethod;
  const recent = (): number => amountOf(history[0]?.amounts, item.id);
  const avg3 = (): number => {
    const window = history.slice(0, HISTORY_FOR_AVERAGE);
    if (window.length === 0) return 0;
    return Math.floor(window.reduce((a, h) => a + amountOf(h.amounts, item.id), 0) / window.length);
  };
  let amount: number;
  let used: CellMethod = method;
  switch (method) {
    case 'recent':
      amount = recent();
      break;
    case 'avg3':
      amount = avg3();
      break;
    case 'lastYear': {
      const affected = item.category === 'incomeTax' || item.category === 'residentTax';
      if (affected && isSpecialPeriod(year - 1, month)) {
        amount = avg3();
        used = 'avg3';
      } else {
        amount = amountOf(actualAmounts(ledger, year - 1, { month, kind: 'salary' }), item.id);
      }
      break;
    }
    case 'fixed':
      amount = item.fixedAmount ?? 0;
      break;
    default:
      return null;
  }
  return amount === 0 ? null : { amount, source: 'forecast', method: used };
}

/** 源泉税率 = 直近3か月の所得税 ÷ 課税支給（定額減税の特殊期間は除外）. */
function recentWithholdingRate(ledger: Ledger, year: number, month: number): number {
  const window = salaryHistoryBefore(ledger, year, month)
    .filter((h) => !isSpecialPeriod(h.year, h.month))
    .slice(0, HISTORY_FOR_AVERAGE);
  const pay = window.reduce((a, h) => a + sumCategory(ledger, h.amounts, 'taxablePay'), 0);
  const tax = window.reduce((a, h) => a + sumCategory(ledger, h.amounts, 'incomeTax'), 0);
  return pay > 0 ? tax / pay : 0;
}

function forecastSlot(
  ledger: Ledger,
  year: number,
  slot: SlotKey,
  plan: RemunerationPlan | null,
): Map<string, Cell> {
  const cells = new Map<string, Cell>();
  const forecastable = ledger.items.filter(
    (i) =>
      i.block !== 'attendance' && i.category !== 'pending' && !TAX_CATEGORIES.includes(i.category),
  );
  if (slot.kind === 'bonus') {
    const last = actualAmounts(ledger, year - 1, slot);
    for (const item of forecastable) {
      const amount = amountOf(last, item.id);
      if (amount !== 0) cells.set(item.id, { amount, source: 'forecast', method: 'lastYear' });
    }
    const lastPay = last ? sumCategory(ledger, last, 'taxablePay') : 0;
    const rate = lastPay > 0 && last ? sumCategory(ledger, last, 'incomeTax') / lastPay : 0;
    setTaxCells(ledger, cells, rate);
    return cells;
  }
  for (const item of forecastable) {
    const cell = forecastSalaryItem(ledger, item, year, slot.month);
    if (cell) cells.set(item.id, cell);
  }
  const revised = premiumsAt(plan, slot.month);
  if (revised) {
    for (const [itemId, amount] of revised) {
      if (amount > 0)
        cells.set(itemId, { amount, source: 'forecast', method: 'standardRemuneration' });
      else cells.delete(itemId);
    }
  }
  setTaxCells(ledger, cells, recentWithholdingRate(ledger, year, slot.month));
  return cells;
}

function setTaxCells(ledger: Ledger, cells: Map<string, Cell>, rate: number): void {
  const taxItem = ledger.items.find((i) => i.category === 'incomeTax');
  if (!taxItem) return;
  const pay = sumCategory(ledger, cells, 'taxablePay');
  const amount = Math.floor(pay * rate);
  if (amount > 0) cells.set(taxItem.id, { amount, source: 'forecast', method: 'taxRate' });
}

export function buildYearTable(
  ledger: Ledger,
  year: number,
  options: TableOptions = {},
): YearTable {
  const { overrides = [], leaveMonths = [], plan = null } = options;
  const slots = yearSlots(ledger, year);
  const cells = new Map<string, Map<string, Cell>>();
  const actualSlotIds = new Set<string>();
  const leaveSlotIds = new Set<string>();
  for (const slot of slots) {
    const id = slotId(slot);
    const actual = actualAmounts(ledger, year, slot);
    if (actual) {
      actualSlotIds.add(id);
      cells.set(
        id,
        new Map(
          [...actual].map(([itemId, amount]) => [itemId, { amount, source: 'actual' as const }]),
        ),
      );
      continue;
    }
    const onLeave = leaveMonths.includes(slot.month);
    if (onLeave) leaveSlotIds.add(id);
    const forecast = onLeave ? new Map<string, Cell>() : forecastSlot(ledger, year, slot, plan);
    for (const o of overrides) {
      if (o.year === year && o.month === slot.month && o.kind === slot.kind) {
        forecast.set(o.itemId, { amount: o.amount, source: 'override' });
      }
    }
    cells.set(id, forecast);
  }
  return { year, slots, cells, actualSlotIds, leaveSlotIds };
}

export interface YearTotals {
  taxablePay: number;
  nonTaxablePay: number;
  socialInsurance: number;
  /** 源泉所得税（年調精算を除く）. */
  incomeTax: number;
  yearEndAdjustment: number;
  residentTax: number;
  forecastSalaryMonths: number;
  forecastBonusCount: number;
  leaveSalaryMonths: number;
}

export function yearTotals(ledger: Ledger, table: YearTable): YearTotals {
  const totals: YearTotals = {
    taxablePay: 0,
    nonTaxablePay: 0,
    socialInsurance: 0,
    incomeTax: 0,
    yearEndAdjustment: 0,
    residentTax: 0,
    forecastSalaryMonths: 0,
    forecastBonusCount: 0,
    leaveSalaryMonths: 0,
  };
  for (const slot of table.slots) {
    const id = slotId(slot);
    const slotCells = table.cells.get(id) ?? new Map<string, Cell>();
    if (table.leaveSlotIds.has(id) && slot.kind === 'salary') totals.leaveSalaryMonths++;
    if (!table.actualSlotIds.has(id) && !table.leaveSlotIds.has(id) && slotCells.size > 0) {
      if (slot.kind === 'salary') totals.forecastSalaryMonths++;
      else totals.forecastBonusCount++;
    }
    totals.taxablePay += sumCategory(ledger, slotCells, 'taxablePay');
    totals.nonTaxablePay += sumCategory(ledger, slotCells, 'nonTaxablePay');
    totals.socialInsurance += sumCategory(ledger, slotCells, 'socialInsurance');
    totals.incomeTax += sumCategory(ledger, slotCells, 'incomeTax');
    totals.yearEndAdjustment += sumCategory(ledger, slotCells, 'yearEndAdjustment');
    totals.residentTax += sumCategory(ledger, slotCells, 'residentTax');
  }
  return totals;
}

/** Sets the December 年調過不足 forecast once the engine has produced the annual tax. */
export function withYearEndForecast(ledger: Ledger, table: YearTable, amount: number): YearTable {
  const dec = slotId({ month: 12, kind: 'salary' });
  const item = ledger.items.find((i) => i.category === 'yearEndAdjustment');
  if (!item || amount === 0 || table.actualSlotIds.has(dec)) return table;
  const cells = new Map(table.cells);
  const decCells = new Map(cells.get(dec) ?? []);
  decCells.set(item.id, { amount, source: 'forecast', method: 'yearEnd' });
  cells.set(dec, decCells);
  return { ...table, cells };
}
