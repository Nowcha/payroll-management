// 手取り（差引支給額）の集計. Mirrors the payslip: 支給合計 − 控除合計 = 差引支給額.
import type { Cell, YearTable } from './forecast';
import { slotId, type Amounts, type Ledger, type SlotKey } from './ledger';

export interface PayBreakdown {
  /** 支給合計（課税・非課税の支給項目の和）. */
  gross: number;
  /** 控除合計（社会保険料・税・年調精算・天引き項目の和）. */
  deductions: number;
  /** 差引支給額＝手取り（振込額）. */
  net: number;
  /** 控除のうち税・社会保険料以外の天引き（持株・保険料など）. 振込額に足すと実質の手取り. */
  otherDeductions: number;
}

export const ZERO_PAY: PayBreakdown = { gross: 0, deductions: 0, net: 0, otherDeductions: 0 };

export function payOf(
  ledger: Ledger,
  amounts: Amounts | Map<string, Cell> | undefined,
): PayBreakdown {
  let gross = 0;
  let deductions = 0;
  let otherDeductions = 0;
  for (const [itemId, v] of amounts ?? []) {
    const item = ledger.itemById.get(itemId);
    const amount = typeof v === 'number' ? v : v.amount;
    if (item?.block === 'payment') gross += amount;
    else if (item?.block === 'deduction') {
      deductions += amount;
      if (item.category === 'otherDeduction') otherDeductions += amount;
    }
  }
  return { gross, deductions, net: gross - deductions, otherDeductions };
}

export function addPay(a: PayBreakdown, b: PayBreakdown): PayBreakdown {
  return {
    gross: a.gross + b.gross,
    deductions: a.deductions + b.deductions,
    net: a.net + b.net,
    otherDeductions: a.otherDeductions + b.otherDeductions,
  };
}

export function slotPay(ledger: Ledger, table: YearTable, slot: SlotKey): PayBreakdown {
  return payOf(ledger, table.cells.get(slotId(slot)));
}

/** Year total of the table (actual + forecast, including the December 年調 forecast). */
export function tablePay(ledger: Ledger, table: YearTable): PayBreakdown {
  return table.slots.reduce((acc, s) => addPay(acc, slotPay(ledger, table, s)), ZERO_PAY);
}

/** Actual slips only, January through `throughMonth` (salary and bonus). */
export function actualPayThrough(ledger: Ledger, year: number, throughMonth = 12): PayBreakdown {
  let acc = ZERO_PAY;
  for (const [key, amounts] of ledger.actual.get(year) ?? []) {
    if (Number(key.slice(0, 2)) <= throughMonth) acc = addPay(acc, payOf(ledger, amounts));
  }
  return acc;
}

export interface TakeHome extends PayBreakdown {
  /** 確定申告で戻る見込み（年調後の追加還付）. */
  finalReturnRefund: number;
  /** 最終的な手取り＝振込額の年合計＋確定申告の還付. */
  finalNet: number;
}

export function takeHome(pay: PayBreakdown, finalReturnRefund: number): TakeHome {
  return { ...pay, finalReturnRefund, finalNet: pay.net + finalReturnRefund };
}
