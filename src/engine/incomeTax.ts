// 所得税（年末調整ベース／確定申告ベース） — requirements 3.2 / 3.3.

import {
  basicDeduction,
  dependentDeduction,
  earthquakeInsuranceDeduction,
  lifeInsuranceDeduction,
  type DependentBreakdown,
} from './deductions';
import { employmentIncome, incomeAdjustmentDeduction } from './employmentIncome';
import { hasDependentUnder23, isDependentRelative } from './family';
import { applyRate, clampMin, floorTo } from './money';
import type { FinalReturnExtras, TaxpayerInput } from './input';
import type { RateBracket, TaxParams } from './params/types';
import { ref, step, type Step, type Traced } from './trace';

export interface IncomeSummary {
  employmentIncome: number;
  incomeAdjustment: number;
  /** 合計所得金額＝総所得金額等（給与所得のみの前提）. */
  totalIncome: number;
  hasDependentUnder23: boolean;
}

/** 給与所得 → 所得金額調整控除 → 合計所得金額. Shared with the resident tax. */
export function computeIncome(params: TaxParams, input: TaxpayerInput): Traced<IncomeSummary> {
  const it = params.incomeTax;
  const employment = employmentIncome(input.salary, it.employmentIncomeDeduction, it.appendix5);
  const under23 = hasDependentUnder23(input.family, input.year, it.dependents.value.incomeLimit);
  const adjustment = incomeAdjustmentDeduction(
    input.salary,
    {
      selfIsSpeciallyDisabled: input.selfIsSpeciallyDisabled,
      hasDependentUnder23: under23,
      hasSpeciallyDisabledFamily: false,
    },
    it.incomeAdjustmentDeduction,
  );
  const totalIncome = clampMin(employment.value - adjustment.value);
  return {
    value: {
      employmentIncome: employment.value,
      incomeAdjustment: adjustment.value,
      totalIncome,
      hasDependentUnder23: under23,
    },
    steps: [
      step('給与収入', input.salary),
      ...employment.steps,
      ...adjustment.steps,
      step('合計所得金額（総所得金額等）', totalIncome),
    ],
  };
}

export function findRateBracket(table: readonly RateBracket[], taxable: number): RateBracket {
  const found = table.find((b) => b.upTo === null || taxable <= b.upTo);
  if (!found) throw new Error('rate table must end with an open bracket');
  return found;
}

export interface IncomeTaxResult {
  mode: 'yearEnd' | 'finalReturn';
  income: IncomeSummary;
  deductions: {
    socialInsurance: number;
    smallBusinessMutualAid: number;
    lifeInsurance: number;
    earthquakeInsurance: number;
    dependents: number;
    basic: number;
    medical: number;
    donation: number;
    total: number;
  };
  dependents: DependentBreakdown[];
  taxableIncome: number;
  marginalRate: number;
  calculatedTax: number;
  housingLoanCredit: number;
  fixedTaxReduction: number;
  /** 基準所得税額（税額控除・定額減税の後）. */
  baseTax: number;
  reconstructionTax: number;
  /** 年税額（所得税及び復興特別所得税）. */
  annualTax: number;
}

function donationDeduction(params: TaxParams, donations: number, totalIncome: number): number {
  if (donations <= 0) return 0;
  const rule = params.donation.value;
  const capped = Math.min(donations, applyRate(totalIncome, rule.incomeTaxCapRate));
  return clampMin(capped - rule.selfPay);
}

function fixedTaxReduction(
  params: TaxParams,
  input: TaxpayerInput,
  totalIncome: number,
  dependents: readonly DependentBreakdown[],
): number {
  const rule = params.incomeTax.fixedTaxReduction;
  if (!rule || totalIncome > rule.value.totalIncomeLimit) return 0;
  const persons =
    input.fixedTaxReductionPersons ??
    1 + dependents.filter((d) => isDependentRelative(d.category)).length;
  return persons * rule.value.perPerson;
}

/**
 * Computes the annual income tax. `yearEnd` follows 年末調整 (no medical/donation deductions,
 * 年税額 rounded down to 100 yen). `finalReturn` adds medical and donation deductions and
 * computes 所得税及び復興特別所得税の額 without the 100-yen rounding (refunds are exact).
 */
export function calcIncomeTax(
  params: TaxParams,
  input: TaxpayerInput,
  mode: 'yearEnd' | 'finalReturn',
  extras: FinalReturnExtras,
): Traced<IncomeTaxResult> {
  const it = params.incomeTax;
  const income = computeIncome(params, input);
  const { totalIncome } = income.value;

  const life = lifeInsuranceDeduction(
    input.lifeInsurance,
    it.lifeInsurance,
    income.value.hasDependentUnder23,
    '生命保険料控除',
  );
  const quake = earthquakeInsuranceDeduction(
    input.earthquakeInsurance,
    it.earthquakeInsurance,
    '地震保険料控除',
  );
  const deps = dependentDeduction(input.family, input.year, it.dependents, '扶養控除');
  const basic = basicDeduction(totalIncome, it.basicDeduction, '基礎控除');
  const medical = mode === 'finalReturn' ? extras.medicalDeduction : 0;
  const donation =
    mode === 'finalReturn' ? donationDeduction(params, extras.donations, totalIncome) : 0;
  const total =
    input.socialInsurance +
    input.smallBusinessMutualAid +
    life.value +
    quake.value +
    deps.value +
    basic.value +
    medical +
    donation;

  const roundingRef = [ref('端数処理', it.rounding)];
  const taxableIncome = floorTo(clampMin(totalIncome - total), it.rounding.value.taxableIncomeUnit);
  const bracket = findRateBracket(it.rateTable.value, taxableIncome);
  const calculatedTax = clampMin(applyRate(taxableIncome, bracket.rate) - bracket.quickDeduction);
  const afterCredit = clampMin(calculatedTax - input.housingLoanCredit);
  const reduction = fixedTaxReduction(params, input, totalIncome, deps.breakdown);
  const baseTax = clampMin(afterCredit - reduction);
  const reconstructionTax = applyRate(baseTax, it.reconstructionRate.value);
  const annualTax =
    mode === 'yearEnd'
      ? floorTo(
          applyRate(baseTax, 1 + it.reconstructionRate.value),
          it.rounding.value.annualTaxUnit,
        )
      : baseTax + reconstructionTax;

  const steps: Step[] = [
    ...income.steps,
    step('社会保険料控除', input.socialInsurance),
    ...(input.smallBusinessMutualAid > 0
      ? [step('小規模企業共済等掛金控除', input.smallBusinessMutualAid)]
      : []),
    ...life.steps,
    ...quake.steps,
    ...deps.steps,
    ...basic.steps,
    ...(mode === 'finalReturn'
      ? [
          step('医療費控除', medical),
          step('寄附金控除', donation, `min(寄附${extras.donations}, 総所得金額等×40%) − 2,000`, [
            ref('寄附金控除', params.donation),
          ]),
        ]
      : []),
    step('所得控除の合計', total),
    step(
      '課税所得金額',
      taxableIncome,
      `${totalIncome} − ${total}（1,000円未満切捨て）`,
      roundingRef,
    ),
    step(
      '算出税額',
      calculatedTax,
      `${taxableIncome} × ${bracket.rate * 100}% − ${bracket.quickDeduction}`,
      [ref('所得税率', it.rateTable)],
    ),
    ...(input.housingLoanCredit > 0 ? [step('住宅借入金等特別控除', input.housingLoanCredit)] : []),
    ...(it.fixedTaxReduction
      ? [
          step('定額減税', reduction, '本人＋扶養親族 × 30,000円（0円が下限）', [
            ref('定額減税', it.fixedTaxReduction),
          ]),
        ]
      : []),
    step('基準所得税額', baseTax),
    mode === 'yearEnd'
      ? step('年税額（年末調整）', annualTax, `${baseTax} × 102.1%（100円未満切捨て）`, [
          ref('復興特別所得税', it.reconstructionRate),
          ...roundingRef,
        ])
      : step(
          '所得税及び復興特別所得税の額（確定申告）',
          annualTax,
          `${baseTax} + 復興特別所得税${reconstructionTax}`,
          [ref('復興特別所得税', it.reconstructionRate)],
        ),
  ];

  return {
    value: {
      mode,
      income: income.value,
      deductions: {
        socialInsurance: input.socialInsurance,
        smallBusinessMutualAid: input.smallBusinessMutualAid,
        lifeInsurance: life.value,
        earthquakeInsurance: quake.value,
        dependents: deps.value,
        basic: basic.value,
        medical,
        donation,
        total,
      },
      dependents: deps.breakdown,
      taxableIncome,
      marginalRate: bracket.rate,
      calculatedTax,
      housingLoanCredit: Math.min(input.housingLoanCredit, calculatedTax),
      fixedTaxReduction: Math.min(reduction, afterCredit),
      baseTax,
      reconstructionTax,
      annualTax,
    },
    steps,
  };
}
