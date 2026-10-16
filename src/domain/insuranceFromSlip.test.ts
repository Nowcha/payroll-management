// Synthetic data only.
import { describe, expect, it } from 'vitest';
import { contractsFromSlips } from './insuranceFromSlip';
import type { WithholdingSlipRecord } from './types';

const slip = (year: number, generalNew: number, careMedical: number): WithholdingSlipRecord => ({
  year,
  paymentAmount: 0,
  employmentIncome: 0,
  totalDeductions: 0,
  withheldTax: 0,
  socialInsurance: 0,
  lifeInsuranceDeduction: 0,
  earthquakeInsuranceDeduction: 0,
  housingLoanCredit: 0,
  lifeInsurancePremiums: { generalNew, generalOld: 0, careMedical, pensionNew: 0, pensionOld: 0 },
});

describe('contractsFromSlips', () => {
  it('creates one contract per non-zero premium column', () => {
    const c = contractsFromSlips([slip(2024, 60_000, 0), slip(2025, 60_000, 20_000)], []);
    expect(c.map((x) => [x.id, x.kind, x.isOld, x.premiumByYear])).toEqual([
      ['slip-generalNew', 'generalLife', false, { 2024: 60_000, 2025: 60_000 }],
      ['slip-careMedical', 'careMedical', false, { 2024: 0, 2025: 20_000 }],
    ]);
    expect(c[0]?.submittedForYearEnd).toEqual({ 2024: true, 2025: true });
  });
  it('extends the latest premium to the next year without overwriting edits', () => {
    const first = contractsFromSlips([slip(2025, 60_000, 0)], [], 2026);
    expect(first[0]?.premiumByYear).toEqual({ 2025: 60_000, 2026: 60_000 });
    const edited = [
      { ...first[0]!, premiumByYear: { 2025: 60_000, 2026: 72_000 }, company: 'A生命' },
    ];
    const again = contractsFromSlips([slip(2025, 60_000, 0)], edited, 2026);
    expect(again[0]).toMatchObject({
      company: 'A生命',
      premiumByYear: { 2025: 60_000, 2026: 72_000 },
    });
  });
  it('ignores slips without a premium breakdown', () => {
    expect(contractsFromSlips([{ ...slip(2025, 1, 1), lifeInsurancePremiums: null }], [])).toEqual(
      [],
    );
  });
});
