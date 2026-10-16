// F-23: 源泉徴収票のドラフト — the year-end figures laid out as on the slip (pure).
import type { LifeInsurancePremiums } from '../engine';
import type { AnnualSummary } from './annual';
import type { WithholdingSlipRecord } from './types';

/** 2020〜2024年分の様式は基礎控除が48万円のとき記載しない（2025年分以降は常に記載）. */
const BASIC_DEDUCTION_OMITTED = { untilYear: 2024, amount: 480_000 };

export interface DependentCounts {
  specific: number;
  /** 老人扶養親族（うち同居老親等）. */
  elderly: number;
  elderlyCohabiting: number;
  general: number;
  under16: number;
}

export interface SlipDraft {
  year: number;
  /** Any figure rests on forecast months (or the December 年調 forecast). */
  hasForecast: boolean;
  paymentAmount: number;
  employmentIncome: number;
  totalDeductions: number;
  withheldTax: number;
  dependents: DependentCounts;
  socialInsurance: number;
  lifeInsuranceDeduction: number;
  earthquakeInsuranceDeduction: number;
  housingLoanCredit: number;
  lifePremiums: LifeInsurancePremiums;
  oldLongTermPremium: number;
  /** null = 記載なし. */
  basicDeduction: number | null;
  incomeAdjustment: number | null;
  /** 定額減税の控除済額（2024年分のみ。それ以外は0）. */
  fixedTaxReductionApplied: number;
  remarks: string[];
}

export function buildSlipDraft(summary: AnnualSummary): SlipDraft {
  const ye = summary.estimate.yearEnd;
  const counts: DependentCounts = {
    specific: 0,
    elderly: 0,
    elderlyCohabiting: 0,
    general: 0,
    under16: 0,
  };
  for (const d of ye.dependents) {
    if (d.category === 'specific') counts.specific++;
    else if (d.category === 'general') counts.general++;
    else if (d.category === 'under16') counts.under16++;
    else if (d.category === 'elderly' || d.category === 'elderlyCohabiting') {
      counts.elderly++;
      if (d.category === 'elderlyCohabiting') counts.elderlyCohabiting++;
    }
  }
  const basic = ye.deductions.basic;
  const omitBasic =
    summary.year <= BASIC_DEDUCTION_OMITTED.untilYear && basic === BASIC_DEDUCTION_OMITTED.amount;
  const remarks: string[] = [];
  if (ye.fixedTaxReductionTotal > 0) {
    remarks.push(
      `源泉徴収時所得税減税控除済額${ye.fixedTaxReduction.toLocaleString('ja-JP')}円、` +
        `控除外額${(ye.fixedTaxReductionTotal - ye.fixedTaxReduction).toLocaleString('ja-JP')}円`,
    );
  }
  return {
    year: summary.year,
    hasForecast: summary.hasForecast,
    paymentAmount: summary.totals.taxablePay,
    employmentIncome: ye.income.employmentIncome,
    totalDeductions: ye.deductions.total,
    withheldTax: ye.annualTax,
    dependents: counts,
    socialInsurance: ye.deductions.socialInsurance + ye.deductions.smallBusinessMutualAid,
    lifeInsuranceDeduction: ye.deductions.lifeInsurance,
    earthquakeInsuranceDeduction: ye.deductions.earthquakeInsurance,
    housingLoanCredit: ye.housingLoanCredit,
    lifePremiums: summary.input.lifeInsurance,
    oldLongTermPremium: summary.input.earthquakeInsurance.oldLongTerm,
    basicDeduction: omitBasic ? null : basic,
    incomeAdjustment: ye.income.incomeAdjustment > 0 ? ye.income.incomeAdjustment : null,
    fixedTaxReductionApplied: ye.fixedTaxReduction,
    remarks,
  };
}

export interface DraftCheck {
  label: string;
  draft: number;
  slip: number;
}

/** Draft vs the registered (確定) slip, for the fields the slip reader captures. */
export function draftChecks(draft: SlipDraft, slip: WithholdingSlipRecord): DraftCheck[] {
  const rows: DraftCheck[] = [
    { label: '支払金額', draft: draft.paymentAmount, slip: slip.paymentAmount },
    { label: '給与所得控除後の金額', draft: draft.employmentIncome, slip: slip.employmentIncome },
    { label: '所得控除の額の合計額', draft: draft.totalDeductions, slip: slip.totalDeductions },
    { label: '源泉徴収税額', draft: draft.withheldTax, slip: slip.withheldTax },
    { label: '社会保険料等の金額', draft: draft.socialInsurance, slip: slip.socialInsurance },
    {
      label: '生命保険料の控除額',
      draft: draft.lifeInsuranceDeduction,
      slip: slip.lifeInsuranceDeduction,
    },
    {
      label: '地震保険料の控除額',
      draft: draft.earthquakeInsuranceDeduction,
      slip: slip.earthquakeInsuranceDeduction,
    },
    {
      label: '住宅借入金等特別控除の額',
      draft: draft.housingLoanCredit,
      slip: slip.housingLoanCredit,
    },
  ];
  const p = slip.lifeInsurancePremiums;
  if (p) {
    rows.push(
      { label: '新生命保険料の金額', draft: draft.lifePremiums.generalNew, slip: p.generalNew },
      { label: '旧生命保険料の金額', draft: draft.lifePremiums.generalOld, slip: p.generalOld },
      { label: '介護医療保険料の金額', draft: draft.lifePremiums.careMedical, slip: p.careMedical },
      { label: '新個人年金保険料の金額', draft: draft.lifePremiums.pensionNew, slip: p.pensionNew },
      { label: '旧個人年金保険料の金額', draft: draft.lifePremiums.pensionOld, slip: p.pensionOld },
    );
  }
  if (slip.basicDeduction != null && draft.basicDeduction !== null)
    rows.push({ label: '基礎控除の額', draft: draft.basicDeduction, slip: slip.basicDeduction });
  if (slip.fixedTaxReductionApplied != null)
    rows.push({
      label: '定額減税の控除済額（摘要）',
      draft: draft.fixedTaxReductionApplied,
      slip: slip.fixedTaxReductionApplied,
    });
  return rows;
}
