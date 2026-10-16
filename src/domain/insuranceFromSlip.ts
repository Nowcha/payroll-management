// Registers life insurance contracts from the premium breakdown printed on 源泉徴収票 (pure).
import type { LifeInsurancePremiums } from '../engine';
import type { InsuranceContract, InsuranceKind, WithholdingSlipRecord } from './types';

const FIELDS: readonly [keyof LifeInsurancePremiums, InsuranceKind, boolean][] = [
  ['generalNew', 'generalLife', false],
  ['generalOld', 'generalLife', true],
  ['careMedical', 'careMedical', false],
  ['pensionNew', 'pension', false],
  ['pensionOld', 'pension', true],
];

export const SLIP_CONTRACT_COMPANY = '源泉徴収票の内訳';

/**
 * One contract per premium column of the slip (新/旧の一般・介護医療・個人年金), merged into any
 * contract registered earlier by this function. Slip years are marked as submitted for 年末調整.
 * `extendToYear` copies the latest slip's premium to a later year that has no slip yet.
 */
export function contractsFromSlips(
  slips: readonly WithholdingSlipRecord[],
  existing: readonly InsuranceContract[],
  extendToYear?: number,
): InsuranceContract[] {
  const withPremiums = slips.filter((s) => s.lifeInsurancePremiums).sort((a, b) => a.year - b.year);
  const latest = withPremiums.at(-1);
  const extend =
    latest && extendToYear !== undefined && !withPremiums.some((s) => s.year === extendToYear)
      ? String(extendToYear)
      : null;
  return FIELDS.flatMap(([field, kind, isOld]) => {
    const premiums = withPremiums.map(
      (s) => [String(s.year), s.lifeInsurancePremiums?.[field] ?? 0] as const,
    );
    if (premiums.every(([, v]) => v === 0)) return [];
    const id = `slip-${field}`;
    const prev = existing.find((c) => c.id === id);
    const premiumByYear: Record<string, number> = {
      ...prev?.premiumByYear,
      ...Object.fromEntries(premiums),
    };
    if (extend && premiumByYear[extend] === undefined)
      premiumByYear[extend] = latest?.lifeInsurancePremiums?.[field] ?? 0;
    return [
      {
        id,
        kind,
        isOld,
        company: prev?.company ?? SLIP_CONTRACT_COMPANY,
        premiumByYear,
        certificateReceivedOn: prev?.certificateReceivedOn ?? {},
        submittedForYearEnd: {
          ...prev?.submittedForYearEnd,
          ...Object.fromEntries(premiums.map(([y]) => [y, true])),
        },
      },
    ];
  });
}
