// Joins the payslip table with registered deductions and runs the tax engine (pure).
import {
  NO_EARTHQUAKE_PREMIUMS,
  NO_LIFE_PREMIUMS,
  estimateRefund,
  getParams,
  type EarthquakePremiums,
  type FamilyMemberInput,
  type LifeInsurancePremiums,
  type MedicalExpenseInput,
  type RefundEstimate,
  type TaxpayerInput,
} from '../engine';
import {
  buildYearTable,
  withYearEndForecast,
  yearTotals,
  type YearTable,
  type YearTotals,
} from './forecast';
import type { Ledger } from './ledger';
import type {
  FamilyMember,
  ForecastOverride,
  FurusatoDonation,
  InsuranceContract,
  MedicalExpense,
  OtherDeduction,
  Reimbursement,
  YearSetting,
} from './types';

export interface DeductionRecords {
  family: readonly FamilyMember[];
  insurance: readonly InsuranceContract[];
  otherDeductions: readonly OtherDeduction[];
  medicalExpenses: readonly MedicalExpense[];
  reimbursements: readonly Reimbursement[];
  donations: readonly FurusatoDonation[];
  yearSettings: readonly YearSetting[];
}

export const EMPTY_RECORDS: DeductionRecords = {
  family: [],
  insurance: [],
  otherDeductions: [],
  medicalExpenses: [],
  reimbursements: [],
  donations: [],
  yearSettings: [],
};

/** F-22: values placed on top of the registered data. */
export interface Scenario {
  extraTaxablePay: number;
  extraDonation: number;
  extraMedical: number;
}

export const NO_SCENARIO: Scenario = { extraTaxablePay: 0, extraDonation: 0, extraMedical: 0 };

export interface AnnualSummary {
  year: number;
  table: YearTable;
  totals: YearTotals;
  input: TaxpayerInput;
  estimate: RefundEstimate;
  donationsTotal: number;
  /** 上限（医療費控除の有無に応じた方）− 寄付済み. */
  furusatoRemaining: number;
  hasForecast: boolean;
}

const inYear = (date: string, year: number): boolean => date.startsWith(`${year}-`);

export function lifePremiums(
  contracts: readonly InsuranceContract[],
  year: number,
): LifeInsurancePremiums {
  const p = { ...NO_LIFE_PREMIUMS };
  for (const c of contracts) {
    const amount = c.premiumByYear[String(year)] ?? 0;
    if (c.kind === 'generalLife') p[c.isOld ? 'generalOld' : 'generalNew'] += amount;
    if (c.kind === 'careMedical') p.careMedical += amount;
    if (c.kind === 'pension') p[c.isOld ? 'pensionOld' : 'pensionNew'] += amount;
  }
  return p;
}

export function earthquakePremiums(
  contracts: readonly InsuranceContract[],
  year: number,
): EarthquakePremiums {
  const p = { ...NO_EARTHQUAKE_PREMIUMS };
  for (const c of contracts) {
    const amount = c.premiumByYear[String(year)] ?? 0;
    if (c.kind === 'earthquake') p.earthquake += amount;
    if (c.kind === 'oldLongTerm') p.oldLongTerm += amount;
  }
  return p;
}

export function familyInputs(family: readonly FamilyMember[], year: number): FamilyMemberInput[] {
  return family.map((m) => ({
    id: m.id,
    relation: m.relation,
    birthDate: m.birthDate,
    totalIncome: m.incomeByYear[String(year)] ?? 0,
    isDependentOfSelf: m.isDependentOfSelf,
    livesTogether: m.livesTogether,
    isLinealAscendant: m.isLinealAscendant,
  }));
}

export function medicalInputs(
  expenses: readonly MedicalExpense[],
  reimbursements: readonly Reimbursement[],
  year: number,
): MedicalExpenseInput[] {
  return expenses
    .filter((e) => inYear(e.date, year))
    .map((e) => ({
      amount: e.amount,
      reimbursements: reimbursements
        .filter((r) => r.medicalExpenseId === e.id)
        .map((r) => r.amount),
      isSelfMedicationEligible: e.isSelfMedicationEligible,
    }));
}

function sumOther(
  records: readonly OtherDeduction[],
  year: number,
  kind: OtherDeduction['kind'],
): number {
  return records
    .filter((r) => r.year === year && r.kind === kind)
    .reduce((a, r) => a + r.amount, 0);
}

export function computeAnnual(
  ledger: Ledger,
  year: number,
  records: DeductionRecords,
  overrides: readonly ForecastOverride[] = [],
  scenario: Scenario = NO_SCENARIO,
): AnnualSummary {
  const params = getParams(year);
  const baseTable = buildYearTable(ledger, year, overrides);
  const baseTotals = yearTotals(ledger, baseTable);
  const setting = records.yearSettings.find((s) => s.year === year);
  const input: TaxpayerInput = {
    year,
    salary: baseTotals.taxablePay + scenario.extraTaxablePay,
    socialInsurance:
      baseTotals.socialInsurance + sumOther(records.otherDeductions, year, 'socialInsurance'),
    smallBusinessMutualAid: sumOther(records.otherDeductions, year, 'smallBusiness'),
    lifeInsurance: lifePremiums(records.insurance, year),
    earthquakeInsurance: earthquakePremiums(records.insurance, year),
    family: familyInputs(records.family, year),
    housingLoanCredit: sumOther(records.otherDeductions, year, 'housingLoan'),
    housingLoanCreditResident: sumOther(records.otherDeductions, year, 'housingLoanResident'),
    selfIsSpeciallyDisabled: setting?.selfIsSpeciallyDisabled ?? false,
  };
  const yearDonations = records.donations.filter((d) => inYear(d.date, year));
  const donationsTotal = yearDonations.reduce((a, d) => a + d.amount, 0) + scenario.extraDonation;
  const medical = medicalInputs(records.medicalExpenses, records.reimbursements, year);
  const medicalWithScenario =
    scenario.extraMedical > 0
      ? [
          ...medical,
          { amount: scenario.extraMedical, reimbursements: [], isSelfMedicationEligible: false },
        ]
      : medical;
  const estimate = estimateRefund(params, {
    taxpayer: input,
    withheldBeforeAdjustment: baseTotals.incomeTax,
    medicalExpenses: medicalWithScenario,
    hasHealthCheckup: setting?.hasHealthCheckup ?? false,
    donations: donationsTotal,
  });
  const table = withYearEndForecast(ledger, baseTable, estimate.yearEndBalance);
  const totals = yearTotals(ledger, table);
  const limit = estimate.shouldFileReturn
    ? estimate.furusato.withMedical.limit
    : estimate.furusato.withoutMedical.limit;
  return {
    year,
    table,
    totals,
    input,
    estimate,
    donationsTotal,
    furusatoRemaining: limit - donationsTotal,
    hasForecast: totals.forecastSalaryMonths > 0 || totals.forecastBonusCount > 0,
  };
}

export interface FurusatoWarning {
  level: 'error' | 'warn' | 'info';
  message: string;
}

const ONE_STOP_MAX_MUNICIPALITIES = 5;

/** F-20 warnings. `today` is ISO YYYY-MM-DD. */
export function furusatoWarnings(
  donations: readonly FurusatoDonation[],
  year: number,
  willFileReturn: boolean,
  today: string,
): FurusatoWarning[] {
  const inYearDonations = donations.filter((d) => inYear(d.date, year));
  const warnings: FurusatoWarning[] = [];
  const municipalities = new Set(inYearDonations.map((d) => d.municipality.trim()));
  if (municipalities.size > ONE_STOP_MAX_MUNICIPALITIES) {
    warnings.push({
      level: 'error',
      message: `寄付先が${municipalities.size}自治体あり、ワンストップ特例は使えません（5自治体まで）。確定申告が必要です`,
    });
  }
  if (willFileReturn && inYearDonations.some((d) => d.oneStop === 'applied')) {
    warnings.push({
      level: 'error',
      message: '確定申告をするとワンストップ特例は無効になります。全ての寄付を申告に含めてください',
    });
  }
  const deadline = `${year + 1}-01-10`;
  const pending = inYearDonations.filter((d) => d.oneStop === 'none');
  if (!willFileReturn && pending.length > 0 && today <= deadline) {
    warnings.push({
      level: 'warn',
      message: `ワンストップ特例の申請が未完了の寄付が${pending.length}件あります（申請期限 ${deadline} 必着）`,
    });
  }
  const noReceipt = inYearDonations.filter((d) => !d.receiptReceived).length;
  if (noReceipt > 0) {
    warnings.push({ level: 'info', message: `受領証明書が未受領の寄付が${noReceipt}件あります` });
  }
  return warnings;
}
