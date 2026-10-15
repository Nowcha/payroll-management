// Shape of params/<year>.json. Every leaf parameter carries its primary source and
// confirmation status so the UI can show provenance and warn on unconfirmed values.

export type ConfirmationStatus = '確認済' | '要確認';

export interface Sourced<T> {
  value: T;
  sourceUrl: string;
  status: ConfirmationStatus;
  /** ISO date (YYYY-MM-DD) when the value was checked against the source. */
  checkedOn: string;
  note?: string;
}

/** A progressive bracket: applies while the base is <= upTo (null = no upper bound). */
export interface LinearBracket {
  upTo: number | null;
  rate: number;
  /** Constant added after multiplying by rate (may be negative). */
  add: number;
}

export interface RateBracket {
  /** Upper bound of taxable income for this bracket (null = no upper bound). */
  upTo: number | null;
  rate: number;
  quickDeduction: number;
}

export interface StepAmount {
  /** Applies while the reference amount (e.g. total income) is <= upTo. */
  upTo: number | null;
  amount: number;
}

export interface EmploymentIncomeDeduction {
  /** Deduction brackets by gross salary. First bracket is the minimum guarantee (rate 0). */
  brackets: LinearBracket[];
}

/** 所得税法別表第五: salary income for gross salary below `upTo`. */
export interface Appendix5Rule {
  /** Table applies to gross salary strictly below this amount. */
  upTo: number;
  /** Salary at or below this yields zero salary income. */
  zeroBelow: number;
  /** From this amount upward, salary is rounded down to `unit` before applying the formula. */
  roundingFrom: number;
  unit: number;
  /** Explicit table rows between the exact-minimum zone and `roundingFrom`. */
  fixedRows: { from: number; to: number; income: number }[];
}

export interface InsuranceTier {
  /** Applies while the paid premium is <= upTo (null = no upper bound). */
  upTo: number | null;
  rate: number;
  add: number;
}

export interface LifeInsuranceRule {
  /** New contracts (2012-): per-category tiers. */
  newTiers: InsuranceTier[];
  newCap: number;
  /** Old contracts (-2011): per-category tiers. */
  oldTiers: InsuranceTier[];
  oldCap: number;
  /** Cap per category when both old and new contracts exist. */
  mixedCap: number;
  /** Total cap across general / care-medical / pension. */
  totalCap: number;
  /** Optional higher tiers for new general life insurance when a dependent under 23 exists. */
  under23?: { tiers: InsuranceTier[]; cap: number; mixedCap: number };
}

export interface EarthquakeInsuranceRule {
  earthquakeTiers: InsuranceTier[];
  earthquakeCap: number;
  oldLongTermTiers: InsuranceTier[];
  oldLongTermCap: number;
  totalCap: number;
}

export interface DependentRule {
  /** Maximum total income of a dependent. */
  incomeLimit: number;
  general: number;
  /** Age 19-22 at Dec 31. */
  specific: number;
  /** Age 70+ at Dec 31. */
  elderly: number;
  /** Age 70+ lineal ascendant living together. */
  elderlyCohabiting: number;
}

export interface FixedTaxReduction {
  perPerson: number;
  totalIncomeLimit: number;
}

export interface MedicalRule {
  floorAmount: number;
  floorRate: number;
  cap: number;
  selfMedicationFloor: number;
  selfMedicationCap: number;
}

export interface DonationRule {
  selfPay: number;
  /** Income tax: deductible donations capped at this share of total income. */
  incomeTaxCapRate: number;
  /** Resident tax basic portion: donations capped at this share of total income. */
  residentBasicCapRate: number;
  residentBasicRate: number;
  /** Special portion is capped at this share of resident income-levy amount. */
  specialCapRate: number;
  /** Multiplier applied to the marginal income tax rate (reconstruction tax). */
  incomeTaxRateMultiplier: number;
}

export interface AdjustmentDeductionRule {
  /** Taxable income threshold separating the two formulas. */
  threshold: number;
  rate: number;
  minimum: number;
  totalIncomeLimit: number;
  /** Personal deduction differences (income tax vs resident tax) used by the formula. */
  differences: {
    basic: number;
    dependentGeneral: number;
    dependentSpecific: number;
    dependentElderly: number;
    dependentElderlyCohabiting: number;
  };
}

/** 所得金額調整控除（子ども・特別障害者等を有する者等）. */
export interface IncomeAdjustmentRule {
  salaryThreshold: number;
  salaryCap: number;
  rate: number;
}

export interface IncomeTaxParams {
  employmentIncomeDeduction: Sourced<EmploymentIncomeDeduction>;
  appendix5: Sourced<Appendix5Rule>;
  basicDeduction: Sourced<StepAmount[]>;
  incomeAdjustmentDeduction: Sourced<IncomeAdjustmentRule>;
  rateTable: Sourced<RateBracket[]>;
  reconstructionRate: Sourced<number>;
  lifeInsurance: Sourced<LifeInsuranceRule>;
  earthquakeInsurance: Sourced<EarthquakeInsuranceRule>;
  dependents: Sourced<DependentRule>;
  fixedTaxReduction: Sourced<FixedTaxReduction> | null;
  medical: Sourced<MedicalRule>;
  rounding: Sourced<{ taxableIncomeUnit: number; annualTaxUnit: number }>;
}

/** Resident tax levied in the following fiscal year on this year's income. */
export interface ResidentTaxParams {
  fiscalYearLabel: string;
  employmentIncomeDeduction: Sourced<EmploymentIncomeDeduction>;
  basicDeduction: Sourced<StepAmount[]>;
  incomeLevyRate: Sourced<{ prefectural: number; municipal: number }>;
  lifeInsurance: Sourced<LifeInsuranceRule>;
  earthquakeInsurance: Sourced<EarthquakeInsuranceRule>;
  dependents: Sourced<DependentRule>;
  adjustmentDeduction: Sourced<AdjustmentDeductionRule>;
  rounding: Sourced<{ taxableIncomeUnit: number }>;
}

export interface TaxParams {
  year: number;
  incomeTax: IncomeTaxParams;
  residentTax: ResidentTaxParams;
  donation: Sourced<DonationRule>;
}
