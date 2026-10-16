// Persistent records (IndexedDB via Dexie). All amounts are integer yen.
import type { Relation } from '../engine/family';

export type ItemBlock = 'payment' | 'deduction' | 'attendance';

/** 税計算上の分類（requirements F-02）. */
export type TaxCategory =
  | 'taxablePay'
  | 'nonTaxablePay'
  | 'socialInsurance'
  | 'incomeTax'
  | 'yearEndAdjustment'
  | 'residentTax'
  | 'fixedTaxReduction'
  | 'otherDeduction'
  | 'pending';

export const TAX_CATEGORY_LABEL: Record<TaxCategory, string> = {
  taxablePay: '課税支給',
  nonTaxablePay: '非課税支給',
  socialInsurance: '社会保険料',
  incomeTax: '所得税',
  yearEndAdjustment: '所得税（年調精算）',
  residentTax: '住民税',
  fixedTaxReduction: '定額減税',
  otherDeduction: 'その他控除',
  pending: '分類待ち',
};

/** 予測方式（requirements F-10）. */
export type ForecastMethod = 'recent' | 'avg3' | 'lastYear' | 'fixed' | 'none';

export const FORECAST_METHOD_LABEL: Record<ForecastMethod, string> = {
  recent: '直近月の値を延長',
  avg3: '直近3か月平均',
  lastYear: '前年同月実績',
  fixed: '固定額',
  none: '予測しない',
};

/** Which standard remuneration a social insurance item is levied on (F-11). */
export type InsuranceBase = 'health' | 'nursing' | 'pension' | 'childSupport';

export interface ItemMaster {
  id: string;
  name: string;
  insuranceBase?: InsuranceBase;
  /** Not part of 報酬 for the standard remuneration (e.g. stock-related payments). */
  excludeFromRemuneration?: boolean;
  /** Former or alternative printed names mapped to this item. */
  aliases: string[];
  block: ItemBlock;
  category: TaxCategory;
  defaultMethod: ForecastMethod;
  fixedAmount?: number;
  order: number;
}

export type PayslipKind = 'salary' | 'bonus';

export interface Payslip {
  id: string;
  year: number;
  month: number;
  kind: PayslipKind;
  /** Distinguishes several slips of the same kind in a month (1-based). */
  seq: number;
  payDate?: string;
  cumulative: { payment: number | null; socialInsurance: number | null; incomeTax: number | null };
  attendance: { name: string; hours: number }[];
  remarks: string[];
  sourceFile?: string;
  createdAt: string;
}

export interface PayslipLine {
  id: string;
  payslipId: string;
  itemId: string;
  amount: number;
}

/** Manual forecast override for one cell (method 手入力). */
export interface ForecastOverride {
  id: string;
  year: number;
  month: number;
  kind: PayslipKind;
  itemId: string;
  amount: number;
}

export interface WithholdingSlipRecord {
  year: number;
  paymentAmount: number;
  employmentIncome: number;
  totalDeductions: number;
  withheldTax: number;
  socialInsurance: number;
  lifeInsuranceDeduction: number;
  earthquakeInsuranceDeduction: number;
  housingLoanCredit: number;
  /** 生命保険料の金額の内訳（記載がある様式のみ。取込時に保存）. */
  lifeInsurancePremiums?: {
    generalNew: number;
    generalOld: number;
    careMedical: number;
    pensionNew: number;
    pensionOld: number;
  } | null;
  sourceFile?: string;
}

export interface FamilyMember {
  id: string;
  name: string;
  relation: Relation;
  birthDate: string;
  /** 見込み合計所得（年分ごと）. */
  incomeByYear: Record<string, number>;
  isDependentOfSelf: boolean;
  livesTogether: boolean;
  isLinealAscendant: boolean;
}

export type InsuranceKind =
  'generalLife' | 'careMedical' | 'pension' | 'earthquake' | 'oldLongTerm';

export const INSURANCE_KIND_LABEL: Record<InsuranceKind, string> = {
  generalLife: '一般生命保険',
  careMedical: '介護医療保険',
  pension: '個人年金保険',
  earthquake: '地震保険',
  oldLongTerm: '旧長期損害保険',
};

export interface InsuranceContract {
  id: string;
  kind: InsuranceKind;
  /** 旧契約（2011年以前締結）. Ignored for care-medical and earthquake. */
  isOld: boolean;
  company: string;
  premiumByYear: Record<string, number>;
  certificateReceivedOn: Record<string, string>;
  submittedForYearEnd: Record<string, boolean>;
}

export type OtherDeductionKind =
  'socialInsurance' | 'smallBusiness' | 'housingLoan' | 'housingLoanResident';

export const OTHER_DEDUCTION_LABEL: Record<OtherDeductionKind, string> = {
  socialInsurance: '天引き外の社会保険料',
  smallBusiness: '小規模企業共済等掛金（iDeCo）',
  housingLoan: '住宅ローン控除（所得税）',
  housingLoanResident: '住宅ローン控除（住民税分）',
};

export interface OtherDeduction {
  id: string;
  year: number;
  kind: OtherDeductionKind;
  amount: number;
  note?: string;
}

export type MedicalCategory = 'treatment' | 'medicine' | 'care' | 'other';

export const MEDICAL_CATEGORY_LABEL: Record<MedicalCategory, string> = {
  treatment: '診療・治療',
  medicine: '医薬品',
  care: '介護保険サービス',
  other: 'その他の医療費',
};

export interface MedicalExpense {
  id: string;
  date: string;
  patientId: string;
  payee: string;
  category: MedicalCategory;
  amount: number;
  source: 'manual' | 'myna';
  hasReceipt: boolean;
  isSelfMedicationEligible: boolean;
}

export type ReimbursementKind = 'insurance' | 'highCost' | 'childbirth' | 'other';

export const REIMBURSEMENT_KIND_LABEL: Record<ReimbursementKind, string> = {
  insurance: '保険金',
  highCost: '高額療養費',
  childbirth: '出産育児一時金等',
  other: 'その他',
};

export interface Reimbursement {
  id: string;
  medicalExpenseId: string;
  kind: ReimbursementKind;
  amount: number;
}

export interface FurusatoDonation {
  id: string;
  date: string;
  municipality: string;
  amount: number;
  portal: string;
  gift: string;
  receiptReceived: boolean;
  oneStop: 'none' | 'applied';
  appliedOn?: string;
}

/** A saved furusato what-if (F-22) with the figures at the time it was saved. */
export interface FurusatoScenarioRecord {
  id: string;
  year: number;
  name: string;
  savedAt: string;
  input: { extraTaxablePay: number; extraDonation: number; extraMedical: number };
  /** Snapshot when saved; the screen also shows the figures recomputed with today's data. */
  result: {
    limit: number;
    recommended: number;
    remaining: number;
    annualTax: number;
    salary: number;
    donations: number;
    leaveMonths: number[];
    hasForecast: boolean;
  };
  note?: string;
}

/** Per-year settings (health check-up for self-medication, scenario values …). */
export interface YearSetting {
  year: number;
  hasHealthCheckup: boolean;
  selfIsSpeciallyDisabled: boolean;
  /** Salary months without pay (育児休業など). Forecasts for these months (salary and bonus) are zero. */
  leaveMonths?: number[];
  /** 健康保険・介護保険の本人負担率の手入力値（未設定なら明細から推定）. */
  healthRate?: number;
  nursingRate?: number;
}
