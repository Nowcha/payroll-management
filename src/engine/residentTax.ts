// 住民税所得割（ふるさと納税上限の算定に必要な範囲） — requirements 3.5.

import {
  basicDeduction,
  dependentDeduction,
  earthquakeInsuranceDeduction,
  lifeInsuranceDeduction,
  type DependentBreakdown,
} from './deductions';
import type { DependentCategory } from './family';
import { computeIncome } from './incomeTax';
import { applyRate, clampMin, floorTo } from './money';
import type { TaxpayerInput } from './input';
import type { AdjustmentDeductionRule, TaxParams } from './params/types';
import { ref, step, type Traced } from './trace';

const LEVY_UNIT = 100;

export interface ResidentTaxResult {
  fiscalYearLabel: string;
  totalIncome: number;
  deductionsTotal: number;
  taxableIncome: number;
  /** 人的控除額の差の合計額（調整控除・限界税率判定に使う）. */
  personalDeductionDifference: number;
  adjustmentDeduction: number;
  /** 所得割額（調整控除後・住宅ローン控除後、寄附金税額控除前）. */
  incomeLevy: number;
}

function differenceFor(category: DependentCategory, rule: AdjustmentDeductionRule): number {
  const d = rule.differences;
  switch (category) {
    case 'general':
      return d.dependentGeneral;
    case 'specific':
      return d.dependentSpecific;
    case 'elderly':
      return d.dependentElderly;
    case 'elderlyCohabiting':
      return d.dependentElderlyCohabiting;
    default:
      return 0;
  }
}

export function personalDeductionDifference(
  dependents: readonly DependentBreakdown[],
  rule: AdjustmentDeductionRule,
): number {
  return dependents.reduce(
    (acc, d) => acc + differenceFor(d.category, rule),
    rule.differences.basic,
  );
}

/** 調整控除の合計額（道府県民税・市町村民税の合算）. */
export function adjustmentDeduction(
  taxableIncome: number,
  totalIncome: number,
  difference: number,
  rule: AdjustmentDeductionRule,
): number {
  if (totalIncome > rule.totalIncomeLimit) return 0;
  if (taxableIncome <= rule.threshold) {
    return applyRate(Math.min(difference, taxableIncome), rule.rate);
  }
  const base = clampMin(difference - (taxableIncome - rule.threshold));
  return Math.max(applyRate(base, rule.rate), rule.minimum);
}

export function calcResidentTax(
  params: TaxParams,
  input: TaxpayerInput,
  medicalDeduction: number,
): Traced<ResidentTaxResult> {
  const rt = params.residentTax;
  const income = computeIncome(params, input);
  const { totalIncome } = income.value;
  const life = lifeInsuranceDeduction(
    input.lifeInsurance,
    rt.lifeInsurance,
    false,
    '生命保険料控除（住民税）',
  );
  const quake = earthquakeInsuranceDeduction(
    input.earthquakeInsurance,
    rt.earthquakeInsurance,
    '地震保険料控除（住民税）',
  );
  const deps = dependentDeduction(input.family, input.year, rt.dependents, '扶養控除（住民税）');
  const basic = basicDeduction(totalIncome, rt.basicDeduction, '基礎控除（住民税）');
  const deductionsTotal =
    input.socialInsurance +
    input.smallBusinessMutualAid +
    life.value +
    quake.value +
    deps.value +
    basic.value +
    medicalDeduction;
  const taxableIncome = floorTo(
    clampMin(totalIncome - deductionsTotal),
    rt.rounding.value.taxableIncomeUnit,
  );

  const adjRule = rt.adjustmentDeduction.value;
  const difference = personalDeductionDifference(deps.breakdown, adjRule);
  const adjustment = adjustmentDeduction(taxableIncome, totalIncome, difference, adjRule);
  // Prefecture : municipality split of the adjustment follows the levy rates (2% : 3%).
  const { prefectural, municipal } = rt.incomeLevyRate.value;
  const prefBasis = Math.round(prefectural * 10_000);
  const totalBasis = prefBasis + Math.round(municipal * 10_000);
  const prefAdjustment = Math.floor((adjustment * prefBasis) / totalBasis);
  const muniAdjustment = adjustment - prefAdjustment;
  const levyBeforeCredit =
    floorTo(clampMin(applyRate(taxableIncome, prefectural) - prefAdjustment), LEVY_UNIT) +
    floorTo(clampMin(applyRate(taxableIncome, municipal) - muniAdjustment), LEVY_UNIT);
  const incomeLevy = clampMin(levyBeforeCredit - input.housingLoanCreditResident);

  return {
    value: {
      fiscalYearLabel: rt.fiscalYearLabel,
      totalIncome,
      deductionsTotal,
      taxableIncome,
      personalDeductionDifference: difference,
      adjustmentDeduction: adjustment,
      incomeLevy,
    },
    steps: [
      step('合計所得金額（総所得金額等）', totalIncome),
      step('社会保険料控除', input.socialInsurance),
      ...life.steps,
      ...quake.steps,
      ...deps.steps,
      ...basic.steps,
      ...(medicalDeduction > 0 ? [step('医療費控除', medicalDeduction)] : []),
      step('所得控除の合計（住民税）', deductionsTotal),
      step(
        '課税総所得金額（住民税）',
        taxableIncome,
        `${totalIncome} − ${deductionsTotal}（1,000円未満切捨て）`,
      ),
      step('調整控除', adjustment, `人的控除差${difference}に基づく`, [
        ref('調整控除', rt.adjustmentDeduction),
      ]),
      step(
        `所得割額（${rt.fiscalYearLabel}）`,
        incomeLevy,
        `${taxableIncome} × 10% − 調整控除${adjustment}（都・区それぞれ100円未満切捨て） − 住宅ローン控除${input.housingLoanCreditResident}`,
        [ref('所得割税率', rt.incomeLevyRate)],
      ),
    ],
  };
}
