// Income deductions shared by the income tax and resident tax calculations.

import { applyRate, assertYen } from './money';
import type {
  DependentRule,
  EarthquakeInsuranceRule,
  InsuranceTier,
  LifeInsuranceRule,
  Sourced,
  StepAmount,
} from './params/types';
import { classifyDependent, type DependentCategory, type FamilyMemberInput } from './family';
import { ref, step, type Traced } from './trace';

export interface LifeInsurancePremiums {
  generalNew: number;
  generalOld: number;
  careMedical: number;
  pensionNew: number;
  pensionOld: number;
}

export interface EarthquakePremiums {
  earthquake: number;
  oldLongTerm: number;
}

export const NO_LIFE_PREMIUMS: LifeInsurancePremiums = {
  generalNew: 0,
  generalOld: 0,
  careMedical: 0,
  pensionNew: 0,
  pensionOld: 0,
};

export const NO_EARTHQUAKE_PREMIUMS: EarthquakePremiums = { earthquake: 0, oldLongTerm: 0 };

/** Applies an insurance tier table; fractions are rounded up (所令・地方税法の端数処理). */
export function tierAmount(premium: number, tiers: readonly InsuranceTier[]): number {
  assertYen(premium, 'premium');
  if (premium <= 0) return 0;
  const tier = tiers.find((t) => t.upTo === null || premium <= t.upTo);
  if (!tier) throw new Error('insurance tiers must end with an open tier');
  return applyRate(premium, tier.rate, 'ceil') + tier.add;
}

/** Best of: old only, new only, or both combined under the mixed cap. */
function categoryDeduction(
  newPremium: number,
  oldPremium: number,
  newTiers: readonly InsuranceTier[],
  oldTiers: readonly InsuranceTier[],
  mixedCap: number,
): number {
  const fromNew = tierAmount(newPremium, newTiers);
  const fromOld = tierAmount(oldPremium, oldTiers);
  if (newPremium > 0 && oldPremium > 0) {
    return Math.max(fromNew, fromOld, Math.min(fromNew + fromOld, mixedCap));
  }
  return fromNew + fromOld;
}

export function lifeInsuranceDeduction(
  premiums: LifeInsurancePremiums,
  sourced: Sourced<LifeInsuranceRule>,
  hasDependentUnder23: boolean,
  label: string,
): Traced<number> {
  const rule = sourced.value;
  const special = hasDependentUnder23 ? rule.under23 : undefined;
  const general = categoryDeduction(
    premiums.generalNew,
    premiums.generalOld,
    special?.tiers ?? rule.newTiers,
    rule.oldTiers,
    special?.mixedCap ?? rule.mixedCap,
  );
  const care = tierAmount(premiums.careMedical, rule.newTiers);
  const pension = categoryDeduction(
    premiums.pensionNew,
    premiums.pensionOld,
    rule.newTiers,
    rule.oldTiers,
    rule.mixedCap,
  );
  const value = Math.min(general + care + pension, rule.totalCap);
  const formula =
    `一般${general}${special ? '（23歳未満特例）' : ''} + 介護医療${care} + 個人年金${pension}` +
    `（上限${rule.totalCap}）`;
  return { value, steps: [step(label, value, formula, [ref(label, sourced)])] };
}

export function earthquakeInsuranceDeduction(
  premiums: EarthquakePremiums,
  sourced: Sourced<EarthquakeInsuranceRule>,
  label: string,
): Traced<number> {
  const rule = sourced.value;
  const eq = Math.min(tierAmount(premiums.earthquake, rule.earthquakeTiers), rule.earthquakeCap);
  const old = Math.min(
    tierAmount(premiums.oldLongTerm, rule.oldLongTermTiers),
    rule.oldLongTermCap,
  );
  const value = Math.min(eq + old, rule.totalCap);
  return {
    value,
    steps: [
      step(label, value, `地震${eq} + 旧長期${old}（上限${rule.totalCap}）`, [ref(label, sourced)]),
    ],
  };
}

export function stepAmount(steps: readonly StepAmount[], reference: number): number {
  const found = steps.find((s) => s.upTo === null || reference <= s.upTo);
  if (!found) throw new Error('step table must end with an open step');
  return found.amount;
}

export function basicDeduction(
  totalIncome: number,
  sourced: Sourced<StepAmount[]>,
  label: string,
): Traced<number> {
  const value = stepAmount(sourced.value, totalIncome);
  return {
    value,
    steps: [step(label, value, `合計所得金額 ${totalIncome} の区分`, [ref(label, sourced)])],
  };
}

export interface DependentBreakdown {
  category: DependentCategory;
  amount: number;
  member: FamilyMemberInput;
}

export function dependentAmount(category: DependentCategory, rule: DependentRule): number {
  switch (category) {
    case 'general':
      return rule.general;
    case 'specific':
      return rule.specific;
    case 'elderly':
      return rule.elderly;
    case 'elderlyCohabiting':
      return rule.elderlyCohabiting;
    default:
      return 0;
  }
}

export function dependentDeduction(
  family: readonly FamilyMemberInput[],
  year: number,
  sourced: Sourced<DependentRule>,
  label: string,
): Traced<number> & { breakdown: DependentBreakdown[] } {
  const breakdown = family.map((member) => {
    const category = classifyDependent(member, year, sourced.value.incomeLimit);
    return { category, amount: dependentAmount(category, sourced.value), member };
  });
  const value = breakdown.reduce((acc, b) => acc + b.amount, 0);
  const counted = breakdown.filter((b) => b.amount > 0);
  const formula =
    counted.length === 0
      ? '控除対象扶養親族なし'
      : counted.map((b) => `${b.category}:${b.amount}`).join(' + ');
  return {
    value,
    breakdown,
    steps:
      value === 0 && family.length === 0
        ? []
        : [step(label, value, formula, [ref(label, sourced)])],
  };
}
