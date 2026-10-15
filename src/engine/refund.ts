// 還付試算（年末調整の過不足 → 確定申告での追加還付） — requirements 3.2 / 3.3 / F-21.

import { calcIncomeTax, type IncomeTaxResult } from './incomeTax';
import { NO_EXTRAS, type TaxpayerInput } from './input';
import { furusatoLimit, type FurusatoLimit } from './furusato';
import { medicalDeduction, type MedicalDeductionResult, type MedicalExpenseInput } from './medical';
import type { TaxParams } from './params/types';
import { step, unconfirmedParams, type ParamRef, type Step } from './trace';

export interface RefundInput {
  taxpayer: TaxpayerInput;
  /** 1〜12月の源泉徴収税額の合計（年末調整の精算前）. */
  withheldBeforeAdjustment: number;
  medicalExpenses: readonly MedicalExpenseInput[];
  hasHealthCheckup: boolean;
  /** その年の寄附（ふるさと納税）の合計. */
  donations: number;
}

export interface RefundEstimate {
  yearEnd: IncomeTaxResult;
  finalReturn: IncomeTaxResult;
  medical: MedicalDeductionResult;
  /** 年税額 − 源泉徴収税額（プラス＝追加徴収、マイナス＝還付）. */
  yearEndBalance: number;
  /** 確定申告で追加で戻る見込み額（0未満にはしない）. */
  finalReturnRefund: number;
  shouldFileReturn: boolean;
  furusato: { withoutMedical: FurusatoLimit; withMedical: FurusatoLimit };
  steps: { yearEnd: Step[]; finalReturn: Step[]; medical: Step[]; furusato: Step[] };
  unconfirmed: ParamRef[];
}

export function estimateRefund(params: TaxParams, input: RefundInput): RefundEstimate {
  const yearEnd = calcIncomeTax(params, input.taxpayer, 'yearEnd', NO_EXTRAS);
  const medical = medicalDeduction(
    input.medicalExpenses,
    yearEnd.value.income.totalIncome,
    input.hasHealthCheckup,
    params.incomeTax.medical,
  );
  const extras = { medicalDeduction: medical.value.deduction, donations: input.donations };
  const finalReturn = calcIncomeTax(params, input.taxpayer, 'finalReturn', extras);
  const yearEndBalance = yearEnd.value.annualTax - input.withheldBeforeAdjustment;
  const finalReturnRefund = Math.max(0, yearEnd.value.annualTax - finalReturn.value.annualTax);
  const withoutMedical = furusatoLimit(params, input.taxpayer, 0);
  const withMedical = furusatoLimit(params, input.taxpayer, medical.value.deduction);
  const shouldFileReturn = medical.value.deduction > 0;

  const yearEndSteps = [
    ...yearEnd.steps,
    step('源泉徴収税額の合計（1〜12月）', input.withheldBeforeAdjustment),
    step(
      '年末調整の過不足',
      yearEndBalance,
      `${yearEnd.value.annualTax} − ${input.withheldBeforeAdjustment}`,
    ),
  ];
  const finalSteps = [
    ...finalReturn.steps,
    step(
      '確定申告による還付見込み',
      finalReturnRefund,
      `年調年税額${yearEnd.value.annualTax} − 申告税額${finalReturn.value.annualTax}`,
    ),
  ];
  const all = [...yearEndSteps, ...finalSteps, ...medical.steps, ...withMedical.steps];
  return {
    yearEnd: yearEnd.value,
    finalReturn: finalReturn.value,
    medical: medical.value,
    yearEndBalance,
    finalReturnRefund,
    shouldFileReturn,
    furusato: { withoutMedical: withoutMedical.value, withMedical: withMedical.value },
    steps: {
      yearEnd: yearEndSteps,
      finalReturn: finalSteps,
      medical: medical.steps,
      furusato: withoutMedical.steps,
    },
    unconfirmed: unconfirmedParams(all),
  };
}
