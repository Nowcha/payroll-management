// Engine unit tests. Synthetic figures only — never real payslip data.
import { describe, expect, it } from 'vitest';
import {
  NO_EARTHQUAKE_PREMIUMS,
  NO_EXTRAS,
  NO_LIFE_PREMIUMS,
  ageAtYearEnd,
  applyRate,
  basicDeduction,
  calcIncomeTax,
  calcResidentTax,
  classifyDependent,
  earthquakeInsuranceDeduction,
  employmentIncome,
  estimateRefund,
  floorTo,
  furusatoLimit,
  getParams,
  incomeAdjustmentDeduction,
  lifeInsuranceDeduction,
  medicalDeduction,
  validateParams,
  type FamilyMemberInput,
  type TaxpayerInput,
} from './index';

const p2024 = getParams(2024);
const p2025 = getParams(2025);
const p2026 = getParams(2026);

function taxpayer(overrides: Partial<TaxpayerInput>): TaxpayerInput {
  return {
    year: 2025,
    salary: 0,
    socialInsurance: 0,
    smallBusinessMutualAid: 0,
    lifeInsurance: NO_LIFE_PREMIUMS,
    earthquakeInsurance: NO_EARTHQUAKE_PREMIUMS,
    family: [],
    housingLoanCredit: 0,
    housingLoanCreditResident: 0,
    selfIsSpeciallyDisabled: false,
    ...overrides,
  };
}

const child = (birthDate: string): FamilyMemberInput => ({
  relation: 'child',
  birthDate,
  totalIncome: 0,
  isDependentOfSelf: true,
  livesTogether: true,
  isLinealAscendant: false,
});

describe('money', () => {
  it('applies rates exactly in integer space', () => {
    expect(applyRate(666_500, 1.021)).toBe(680_496);
    expect(applyRate(30_001, 0.5, 'ceil')).toBe(15_001);
    expect(floorTo(5_532_899, 1000)).toBe(5_532_000);
  });
  it('rejects fractional yen', () => {
    expect(() => applyRate(10.5, 0.1)).toThrow(RangeError);
  });
});

describe('params', () => {
  it.each([2024, 2025, 2026])('%i.json is structurally valid', (year) => {
    expect(validateParams(getParams(year))).toEqual([]);
  });
  it('flags missing sources', () => {
    expect(
      validateParams({
        x: { value: 1, sourceUrl: 'http://a', status: '確認済', checkedOn: '2026-01-01' },
      }),
    ).toEqual(['x: sourceUrl must be https']);
  });
  it('throws for unsupported years', () => {
    expect(() => getParams(2023)).toThrow(/2023年分/);
  });
});

describe('employment income (給与所得控除・別表第五)', () => {
  const inc = (p: typeof p2024, salary: number): number =>
    employmentIncome(salary, p.incomeTax.employmentIncomeDeduction, p.incomeTax.appendix5).value;

  it('uses the formula from 6.6M upward with yen rounding', () => {
    expect(inc(p2024, 9_000_000)).toBe(7_050_000);
    expect(inc(p2025, 7_000_000)).toBe(5_200_000);
    expect(inc(p2025, 7_000_001)).toBe(5_200_000);
  });
  it('rounds salary down to 4,000 yen below 6.6M', () => {
    expect(inc(p2024, 5_000_000)).toBe(3_560_000);
    expect(inc(p2024, 5_003_999)).toBe(3_560_000);
    expect(inc(p2024, 6_000_000)).toBe(4_360_000);
  });
  it('handles the 2024 minimum-guarantee zone and fixed rows', () => {
    expect(inc(p2024, 550_999)).toBe(0);
    expect(inc(p2024, 551_000)).toBe(1_000);
    expect(inc(p2024, 1_618_999)).toBe(1_068_999);
    expect(inc(p2024, 1_621_500)).toBe(1_070_000);
    expect(inc(p2024, 1_628_000)).toBe(1_076_800);
  });
  it('applies the 2026 minimum of 740,000 up to 2.2M (not 1.9M)', () => {
    expect(inc(p2026, 2_190_999)).toBe(1_450_999);
    expect(inc(p2026, 2_192_000)).toBe(1_451_000);
    expect(inc(p2026, 2_199_999)).toBe(1_456_000);
    expect(inc(p2026, 2_200_000)).toBe(1_460_000);
    expect(inc(p2026, 1_900_000)).toBe(1_160_000);
  });
  it('marks the 2025 lower band as unconfirmed', () => {
    const r = employmentIncome(
      1_500_000,
      p2025.incomeTax.employmentIncomeDeduction,
      p2025.incomeTax.appendix5,
    );
    expect(r.value).toBe(850_000);
    expect(r.steps.flatMap((s) => s.params ?? []).some((pr) => pr.status === '要確認')).toBe(true);
  });
});

describe('所得金額調整控除', () => {
  const rule = p2026.incomeTax.incomeAdjustmentDeduction;
  const eligible = {
    selfIsSpeciallyDisabled: false,
    hasDependentUnder23: true,
    hasSpeciallyDisabledFamily: false,
  };
  it('is 10% of salary over 8.5M capped at 10M', () => {
    expect(incomeAdjustmentDeduction(9_500_000, eligible, rule).value).toBe(100_000);
    expect(incomeAdjustmentDeduction(12_000_000, eligible, rule).value).toBe(150_000);
    expect(incomeAdjustmentDeduction(8_500_000, eligible, rule).value).toBe(0);
  });
  it('needs an eligible family situation', () => {
    expect(
      incomeAdjustmentDeduction(9_500_000, { ...eligible, hasDependentUnder23: false }, rule).value,
    ).toBe(0);
  });
});

describe('basic deduction', () => {
  it('follows the 2025 income steps', () => {
    const b = p2025.incomeTax.basicDeduction;
    expect(basicDeduction(1_320_000, b, '').value).toBe(950_000);
    expect(basicDeduction(1_320_001, b, '').value).toBe(880_000);
    expect(basicDeduction(6_550_001, b, '').value).toBe(580_000);
    expect(basicDeduction(25_000_001, b, '').value).toBe(0);
  });
  it('follows the 2026 income steps', () => {
    const b = p2026.incomeTax.basicDeduction;
    expect(basicDeduction(4_890_000, b, '').value).toBe(1_040_000);
    expect(basicDeduction(4_890_001, b, '').value).toBe(670_000);
    expect(basicDeduction(6_550_001, b, '').value).toBe(620_000);
  });
  it('resident tax basic deduction stays at 430,000', () => {
    expect(basicDeduction(8_000_000, p2026.residentTax.basicDeduction, '').value).toBe(430_000);
  });
});

describe('insurance deductions', () => {
  const life = (
    p: typeof p2026,
    prem: Partial<typeof NO_LIFE_PREMIUMS>,
    u23 = false,
    rt = false,
  ): number =>
    lifeInsuranceDeduction(
      { ...NO_LIFE_PREMIUMS, ...prem },
      rt ? p.residentTax.lifeInsurance : p.incomeTax.lifeInsurance,
      u23,
      '',
    ).value;

  it('income tax new contracts', () => {
    expect(life(p2025, { generalNew: 100_000 })).toBe(40_000);
    expect(life(p2025, { generalNew: 30_001 })).toBe(25_001);
    expect(life(p2025, { generalNew: 9_000, pensionNew: 120_000 })).toBe(49_000);
    expect(life(p2025, { generalNew: 200_000, careMedical: 200_000, pensionNew: 200_000 })).toBe(
      120_000,
    );
  });
  it('2026 under-23 special raises general life insurance to 60,000', () => {
    expect(life(p2026, { generalNew: 150_000 }, true)).toBe(60_000);
    expect(life(p2026, { generalNew: 100_000 }, true)).toBe(55_000);
    expect(life(p2025, { generalNew: 150_000 }, true)).toBe(40_000);
  });
  it('mixed old and new contracts take the best option', () => {
    expect(life(p2025, { generalOld: 120_000, generalNew: 50_000 })).toBe(50_000);
    expect(life(p2025, { generalOld: 30_000, generalNew: 30_000 })).toBe(40_000);
  });
  it('resident tax tiers and caps', () => {
    expect(life(p2026, { generalNew: 60_000 }, true, true)).toBe(28_000);
    expect(life(p2026, { generalNew: 20_000 }, false, true)).toBe(16_000);
    expect(
      life(p2026, { generalNew: 99_999, careMedical: 99_999, pensionNew: 99_999 }, false, true),
    ).toBe(70_000);
  });
  it('earthquake insurance halves for resident tax', () => {
    expect(
      earthquakeInsuranceDeduction(
        { earthquake: 60_000, oldLongTerm: 0 },
        p2026.incomeTax.earthquakeInsurance,
        '',
      ).value,
    ).toBe(50_000);
    expect(
      earthquakeInsuranceDeduction(
        { earthquake: 30_000, oldLongTerm: 0 },
        p2026.residentTax.earthquakeInsurance,
        '',
      ).value,
    ).toBe(15_000);
    expect(
      earthquakeInsuranceDeduction(
        { earthquake: 40_000, oldLongTerm: 30_000 },
        p2026.incomeTax.earthquakeInsurance,
        '',
      ).value,
    ).toBe(50_000);
  });
});

describe('family', () => {
  it('computes age at Dec 31 (Jan 1 births count a year early)', () => {
    expect(ageAtYearEnd('2010-01-01', 2026)).toBe(17);
    expect(ageAtYearEnd('2010-01-02', 2026)).toBe(16);
  });
  it('classifies dependents by age', () => {
    expect(classifyDependent(child('2020-05-01'), 2026, 620_000)).toBe('under16');
    expect(classifyDependent(child('2007-06-01'), 2026, 620_000)).toBe('specific');
    expect(
      classifyDependent(
        { ...child('1950-01-10'), relation: 'parent', isLinealAscendant: true },
        2026,
        620_000,
      ),
    ).toBe('elderlyCohabiting');
    expect(classifyDependent({ ...child('2007-06-01'), totalIncome: 700_000 }, 2026, 620_000)).toBe(
      'notDependent',
    );
    expect(classifyDependent({ ...child('1993-01-10'), relation: 'spouse' }, 2026, 620_000)).toBe(
      'notDependent',
    );
  });
});

describe('income tax (year-end adjustment)', () => {
  it('matches the published example: taxable 3,000,000 → 206,700', () => {
    // 6,000,000 → 給与所得 4,360,000; basic 680,000 (2025); social 680,000 → taxable 3,000,000.
    const r = calcIncomeTax(
      p2025,
      taxpayer({ salary: 6_000_000, socialInsurance: 680_000 }),
      'yearEnd',
      NO_EXTRAS,
    );
    expect(r.value.taxableIncome).toBe(3_000_000);
    expect(r.value.calculatedTax).toBe(202_500);
    expect(r.value.annualTax).toBe(206_700);
  });
  it('computes a 2025 case end to end', () => {
    const r = calcIncomeTax(
      p2025,
      taxpayer({ salary: 7_000_000, socialInsurance: 1_000_000 }),
      'yearEnd',
      NO_EXTRAS,
    );
    expect(r.value.income.totalIncome).toBe(5_200_000);
    expect(r.value.deductions.basic).toBe(630_000);
    expect(r.value.taxableIncome).toBe(3_570_000);
    expect(r.value.annualTax).toBe(292_500);
  });
  it('applies the 2024 fixed reduction with a zero floor', () => {
    const base = taxpayer({ year: 2024, salary: 2_000_000, socialInsurance: 300_000 });
    const r = calcIncomeTax(p2024, base, 'yearEnd', NO_EXTRAS);
    expect(r.value.calculatedTax).toBe(27_000);
    expect(r.value.annualTax).toBe(0);
    const withChild = calcIncomeTax(
      p2024,
      { ...base, salary: 6_000_000, socialInsurance: 880_000, family: [child('2020-05-01')] },
      'yearEnd',
      NO_EXTRAS,
    );
    // taxable 3,000,000 → 202,500 − 60,000 = 142,500 → ×1.021 = 145,492 → 145,400
    expect(withChild.value.fixedTaxReduction).toBe(60_000);
    expect(withChild.value.annualTax).toBe(145_400);
  });
  it('applies the 2026 under-23 measures for a newborn', () => {
    const r = calcIncomeTax(
      p2026,
      taxpayer({
        year: 2026,
        salary: 9_000_000,
        socialInsurance: 1_200_000,
        lifeInsurance: { ...NO_LIFE_PREMIUMS, generalNew: 150_000 },
        family: [child('2026-03-01')],
      }),
      'yearEnd',
      NO_EXTRAS,
    );
    expect(r.value.income.employmentIncome).toBe(7_050_000);
    expect(r.value.income.incomeAdjustment).toBe(50_000);
    expect(r.value.income.totalIncome).toBe(7_000_000);
    expect(r.value.deductions.lifeInsurance).toBe(60_000);
    expect(r.value.deductions.basic).toBe(620_000);
    expect(r.value.deductions.dependents).toBe(0);
  });
});

describe('resident tax and furusato limit', () => {
  const input = taxpayer({ salary: 7_000_000, socialInsurance: 1_000_000 });
  it('computes the income levy with the minimum adjustment deduction', () => {
    const r = calcResidentTax(p2025, input, 0);
    expect(r.value.taxableIncome).toBe(3_770_000);
    expect(r.value.adjustmentDeduction).toBe(2_500);
    expect(r.value.incomeLevy).toBe(374_500);
  });
  it('computes the furusato upper limit', () => {
    const r = furusatoLimit(p2025, input, 0);
    expect(r.value.marginalRate).toBe(0.2);
    expect(r.value.limit).toBe(109_645);
    expect(r.value.recommended).toBe(98_680);
  });
  it('lowers the limit when a medical deduction is used', () => {
    expect(furusatoLimit(p2025, input, 200_000).value.limit).toBeLessThan(109_645);
  });
});

describe('medical deduction', () => {
  const rule = p2025.incomeTax.medical;
  it('does not carry excess reimbursement to other expenses', () => {
    const r = medicalDeduction(
      [
        { amount: 200_000, reimbursements: [50_000], isSelfMedicationEligible: false },
        { amount: 30_000, reimbursements: [100_000], isSelfMedicationEligible: false },
      ],
      5_000_000,
      false,
      rule,
    );
    expect(r.value.netExpenses).toBe(150_000);
    expect(r.value.regular).toBe(50_000);
    expect(r.value.method).toBe('regular');
  });
  it('uses 5% of income as the floor for low income', () => {
    const r = medicalDeduction(
      [{ amount: 150_000, reimbursements: [], isSelfMedicationEligible: false }],
      1_500_000,
      false,
      rule,
    );
    expect(r.value.floor).toBe(75_000);
    expect(r.value.regular).toBe(75_000);
  });
  it('picks self-medication only when larger and a check-up was done', () => {
    const exp = [{ amount: 60_000, reimbursements: [], isSelfMedicationEligible: true }];
    expect(medicalDeduction(exp, 5_000_000, true, rule).value).toMatchObject({
      method: 'selfMedication',
      deduction: 48_000,
    });
    expect(medicalDeduction(exp, 5_000_000, false, rule).value.method).toBe('none');
  });
});

describe('refund estimate', () => {
  it('adds medical and donation deductions in the final return', () => {
    const r = estimateRefund(p2025, {
      taxpayer: taxpayer({ salary: 7_000_000, socialInsurance: 1_000_000 }),
      withheldBeforeAdjustment: 300_000,
      medicalExpenses: [],
      hasHealthCheckup: false,
      donations: 100_000,
    });
    expect(r.yearEnd.annualTax).toBe(292_500);
    expect(r.yearEndBalance).toBe(-7_500);
    expect(r.finalReturn.deductions.donation).toBe(98_000);
    expect(r.finalReturn.annualTax).toBe(272_504);
    expect(r.finalReturnRefund).toBe(19_996);
    expect(r.unconfirmed).toEqual([]);
  });
});
