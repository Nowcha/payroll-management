// 医療費控除 and セルフメディケーション税制 (requirements 3.4).

import { applyRate, assertYen } from './money';
import type { MedicalRule, Sourced } from './params/types';
import { ref, step, type Traced } from './trace';

export interface MedicalExpenseInput {
  amount: number;
  /** Reimbursements linked to this expense (insurance, 高額療養費, 出産育児一時金 …). */
  reimbursements: readonly number[];
  /** Eligible for セルフメディケーション税制 (specified OTC medicine). */
  isSelfMedicationEligible: boolean;
}

export type MedicalMethod = 'none' | 'regular' | 'selfMedication';

export interface MedicalDeductionResult {
  regular: number;
  selfMedication: number;
  /** Self-medication requires the taxpayer's health check-up etc. */
  selfMedicationAvailable: boolean;
  method: MedicalMethod;
  deduction: number;
  netExpenses: number;
  floor: number;
}

/**
 * Reimbursements reduce only the expense they belong to; any excess is not carried
 * over to other expenses (国税庁 No.1120 注).
 */
export function netOfReimbursement(expense: MedicalExpenseInput): number {
  assertYen(expense.amount, 'medical amount');
  const reimbursed = expense.reimbursements.reduce((a, r) => a + assertYen(r, 'reimbursement'), 0);
  return Math.max(0, expense.amount - reimbursed);
}

export function medicalDeduction(
  expenses: readonly MedicalExpenseInput[],
  totalIncome: number,
  hasHealthCheckup: boolean,
  sourced: Sourced<MedicalRule>,
): Traced<MedicalDeductionResult> {
  const rule = sourced.value;
  const netExpenses = expenses.reduce((acc, e) => acc + netOfReimbursement(e), 0);
  const floor = Math.min(rule.floorAmount, applyRate(Math.max(0, totalIncome), rule.floorRate));
  const regular = Math.min(Math.max(0, netExpenses - floor), rule.cap);

  const otc = expenses
    .filter((e) => e.isSelfMedicationEligible)
    .reduce((acc, e) => acc + netOfReimbursement(e), 0);
  const selfMedication = Math.min(
    Math.max(0, otc - rule.selfMedicationFloor),
    rule.selfMedicationCap,
  );
  const canSelfMedicate = hasHealthCheckup && selfMedication > 0;

  let method: MedicalMethod = 'none';
  if (regular > 0 || canSelfMedicate) {
    method = canSelfMedicate && selfMedication > regular ? 'selfMedication' : 'regular';
  }
  const deduction =
    method === 'selfMedication' ? selfMedication : method === 'regular' ? regular : 0;
  const params = [ref('医療費控除', sourced)];
  return {
    value: {
      regular,
      selfMedication,
      selfMedicationAvailable: hasHealthCheckup,
      method,
      deduction,
      netExpenses,
      floor,
    },
    steps: [
      step('補填後の医療費', netExpenses),
      step('足切り額', floor, `min(${rule.floorAmount}, 総所得金額等${totalIncome} × 5%)`, params),
      step('医療費控除（通常）', regular, `min(${netExpenses} − ${floor}, ${rule.cap})`, params),
      step(
        'セルフメディケーション',
        selfMedication,
        `min(対象医薬品${otc} − ${rule.selfMedicationFloor}, ${rule.selfMedicationCap})`,
        params,
      ),
      step('採用する医療費控除', deduction, method === 'none' ? '控除なし' : method),
    ],
  };
}
