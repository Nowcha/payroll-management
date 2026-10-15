// ふるさと納税の上限（自己負担2,000円で済む寄附額の上限） — requirements 3.5.

import { findRateBracket } from './incomeTax';
import { applyRate, clampMin } from './money';
import type { TaxpayerInput } from './input';
import type { TaxParams } from './params/types';
import { calcResidentTax } from './residentTax';
import { ref, step, type Traced } from './trace';

const SCALE = 10_000_000;

export interface FurusatoLimit {
  incomeLevy: number;
  /** 特例分の判定に使う所得税の限界税率（復興税加算前）. */
  marginalRate: number;
  limit: number;
  /** Recommended amount while the annual figures still contain forecasts. */
  recommended: number;
}

/**
 * 上限額 = 所得割額×20% ÷ (90% − 限界税率×1.021) + 2,000.
 * The marginal rate is determined from 住民税の課税総所得 − 人的控除差調整額 (総務省).
 */
export function furusatoLimit(
  params: TaxParams,
  input: TaxpayerInput,
  medicalDeduction: number,
  recommendedRatio = 0.9,
): Traced<FurusatoLimit> {
  const rule = params.donation.value;
  const resident = calcResidentTax(params, input, medicalDeduction);
  const { incomeLevy, taxableIncome, personalDeductionDifference } = resident.value;
  const rateBase = clampMin(taxableIncome - personalDeductionDifference);
  const marginalRate =
    taxableIncome > 0 ? findRateBracket(params.incomeTax.rateTable.value, rateBase).rate : 0;

  // Exact integer arithmetic in units of 1e-7.
  const specialCap = Math.round(rule.specialCapRate * SCALE);
  const denominator =
    Math.round((1 - rule.residentBasicRate) * SCALE) -
    Math.round(marginalRate * rule.incomeTaxRateMultiplier * SCALE);
  const limit =
    incomeLevy > 0 && denominator > 0
      ? Math.floor((incomeLevy * specialCap) / denominator) + rule.selfPay
      : 0;
  const recommended = applyRate(limit, recommendedRatio);
  return {
    value: { incomeLevy, marginalRate, limit, recommended },
    steps: [
      ...resident.steps,
      step(
        '限界税率の判定所得',
        rateBase,
        `${taxableIncome} − 人的控除差${personalDeductionDifference}`,
      ),
      step(
        'ふるさと納税の上限額',
        limit,
        `${incomeLevy} × 20% ÷ (90% − ${marginalRate * 100}% × 1.021) + ${rule.selfPay}`,
        [ref('ふるさと納税', params.donation)],
      ),
      step('推奨寄付額', recommended, `上限 × ${recommendedRatio * 100}%`),
    ],
  };
}
