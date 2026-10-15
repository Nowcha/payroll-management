// Family members and dependent classification (age as of Dec 31 of the tax year).

export type Relation = 'spouse' | 'child' | 'parent' | 'other';

export interface FamilyMemberInput {
  id?: string;
  relation: Relation;
  /** ISO date YYYY-MM-DD. */
  birthDate: string;
  /** Estimated 合計所得金額 for the year. */
  totalIncome: number;
  /** Claimed as the taxpayer's own 扶養親族 (spouse is never a 扶養親族). */
  isDependentOfSelf: boolean;
  livesTogether: boolean;
  /** Lineal ascendant (parent/grandparent) of the taxpayer or spouse. */
  isLinealAscendant: boolean;
}

export type DependentCategory =
  'notDependent' | 'under16' | 'general' | 'specific' | 'elderly' | 'elderlyCohabiting';

export const DEPENDENT_CATEGORY_LABEL: Record<DependentCategory, string> = {
  notDependent: '扶養親族でない',
  under16: '年少扶養親族（16歳未満・控除なし）',
  general: '一般の控除対象扶養親族',
  specific: '特定扶養親族（19〜22歳）',
  elderly: '老人扶養親族',
  elderlyCohabiting: '老人扶養親族（同居老親等）',
};

function parseIsoDate(iso: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new RangeError(`invalid date: ${iso}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/**
 * Age on Dec 31 of the year. Under the age-calculation law a person gains a year on the day
 * before the birthday, so someone born on Jan 1 of the next year is already counted.
 */
export function ageAtYearEnd(birthDate: string, year: number): number {
  const { y, m, d } = parseIsoDate(birthDate);
  const bornOnJan1 = m === 1 && d === 1;
  return year - y + (bornOnJan1 ? 1 : 0);
}

export function classifyDependent(
  member: FamilyMemberInput,
  year: number,
  incomeLimit: number,
): DependentCategory {
  if (member.relation === 'spouse' || !member.isDependentOfSelf) return 'notDependent';
  if (member.totalIncome > incomeLimit) return 'notDependent';
  const age = ageAtYearEnd(member.birthDate, year);
  if (age < 0) return 'notDependent';
  if (age < 16) return 'under16';
  if (age >= 19 && age <= 22) return 'specific';
  if (age >= 70) {
    return member.isLinealAscendant && member.livesTogether ? 'elderlyCohabiting' : 'elderly';
  }
  return 'general';
}

export function isDependentRelative(category: DependentCategory): boolean {
  return category !== 'notDependent';
}

export function hasDependentUnder23(
  family: readonly FamilyMemberInput[],
  year: number,
  incomeLimit: number,
): boolean {
  return family.some((m) => {
    const category = classifyDependent(m, year, incomeLimit);
    return isDependentRelative(category) && ageAtYearEnd(m.birthDate, year) < 23;
  });
}
