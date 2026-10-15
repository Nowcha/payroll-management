import type { EarthquakePremiums, LifeInsurancePremiums } from './deductions';
import type { FamilyMemberInput } from './family';

/** Everything the engine needs for one tax year. All amounts are integer yen. */
export interface TaxpayerInput {
  year: number;
  /** 給与収入（課税支給の年合計：実績＋予測）. */
  salary: number;
  /** 社会保険料（天引き＋天引き外）. */
  socialInsurance: number;
  /** 小規模企業共済等掛金（iDeCo 等）. */
  smallBusinessMutualAid: number;
  lifeInsurance: LifeInsurancePremiums;
  earthquakeInsurance: EarthquakePremiums;
  family: readonly FamilyMemberInput[];
  /** 住宅借入金等特別控除（所得税）. */
  housingLoanCredit: number;
  /** 住宅借入金等特別控除の住民税控除分. */
  housingLoanCreditResident: number;
  selfIsSpeciallyDisabled: boolean;
  /**
   * 定額減税（2024年分）の対象人数の上書き。未指定なら本人＋扶養親族（同一生計配偶者は対象外の前提）.
   */
  fixedTaxReductionPersons?: number;
}

export interface FinalReturnExtras {
  /** 医療費控除額（医療費モジュールで算出済みの値）. */
  medicalDeduction: number;
  /** 特定寄附金の合計（ふるさと納税を含む）. */
  donations: number;
}

export const NO_EXTRAS: FinalReturnExtras = { medicalDeduction: 0, donations: 0 };
