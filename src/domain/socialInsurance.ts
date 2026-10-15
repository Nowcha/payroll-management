// F-11: 社会保険料の再予測（定時決定）. 4〜6月の報酬の平均から標準報酬月額の等級を求め、
// 9月分保険料（翌月徴収のため10月支給の給与）以降の予測に反映する。純粋関数。
import type { SocialInsuranceRule, StandardRemunerationGrade } from '../engine';
import { insuranceBaseOf, isExcludedFromRemuneration } from './itemSeeds';
import { actualAmounts, salaryHistoryBefore, type Amounts, type Ledger } from './ledger';
import type { InsuranceBase, ItemMaster, YearSetting } from './types';

const PPM = 1_000_000;
const DETERMINATION_MONTHS = [4, 5, 6] as const;
/** Premiums change two months after the 3-month window ends (window Jun–Aug → October slip). */
const LAG_MONTHS = 2;

export function gradeOf(
  grades: readonly StandardRemunerationGrade[],
  remuneration: number,
): StandardRemunerationGrade {
  const found = [...grades].reverse().find((g) => remuneration >= g.from);
  const first = grades[0];
  if (!found && !first) throw new Error('standard remuneration grades are empty');
  return found ?? (first as StandardRemunerationGrade);
}

/** Employee share: 50銭以下切捨て・50銭超切上げ. Rate is applied at 1e-6 precision. */
export function employeePremium(grade: number, rate: number): number {
  const ppm = Math.round(rate * PPM);
  const product = grade * ppm;
  const whole = Math.floor(product / PPM);
  return product - whole * PPM > PPM / 2 ? whole + 1 : whole;
}

/** 報酬 = 給与の支給項目（課税・非課税）の合計。賞与と「報酬に含めない」項目は除く. */
export function remunerationOf(ledger: Ledger, amounts: Amounts | undefined): number {
  let total = 0;
  for (const [itemId, v] of amounts ?? []) {
    const item = ledger.itemById.get(itemId);
    if (!item || isExcludedFromRemuneration(item)) continue;
    if (item.category === 'taxablePay' || item.category === 'nonTaxablePay') total += v;
  }
  return total;
}

function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : Math.floor(values.reduce((a, v) => a + v, 0) / values.length);
}

/**
 * Health grade in force for a slip. Below the pension cap the two grades coincide, so the
 * pension premium identifies it exactly; otherwise fall back to the remuneration of the three
 * months that ended two months before the premium last changed.
 */
function healthGradeAt(
  ledger: Ledger,
  item: ItemMaster,
  latest: { year: number; month: number; amounts: Amounts },
  rule: SocialInsuranceRule,
): number | null {
  const pensionItem = ledger.items.find((i) => insuranceBaseOf(i) === 'pension');
  const pensionPremium = pensionItem ? (latest.amounts.get(pensionItem.id) ?? 0) : 0;
  const cap = rule.pensionGrades[rule.pensionGrades.length - 1]?.amount ?? 0;
  const byPension = rule.pensionGrades.find(
    (g) => g.amount < cap && employeePremium(g.amount, rule.pensionEmployeeRate) === pensionPremium,
  );
  if (byPension) return byPension.amount;

  const history = salaryHistoryBefore(ledger, latest.year, latest.month + 1);
  const premium = latest.amounts.get(item.id) ?? 0;
  let start = latest;
  for (const h of history) {
    if (h.amounts.get(item.id) !== premium) break;
    start = h;
  }
  const window = salaryHistoryBefore(ledger, start.year, start.month)
    .filter((h) => {
      const monthsBefore = (start.year - h.year) * 12 + (start.month - h.month);
      return monthsBefore >= LAG_MONTHS && monthsBefore < LAG_MONTHS + 3;
    })
    .map((h) => remunerationOf(ledger, h.amounts));
  const avg = average(window);
  return avg === null || avg === 0 ? null : gradeOf(rule.healthGrades, avg).amount;
}

/** Estimates the employee rate of a health-grade item (健康保険・介護保険) from its latest premium. */
export function estimateRate(
  ledger: Ledger,
  item: ItemMaster,
  year: number,
  rule: SocialInsuranceRule,
): number | null {
  const latest = salaryHistoryBefore(ledger, year + 1, 1).find(
    (h) => (h.amounts.get(item.id) ?? 0) > 0,
  );
  if (!latest) return null;
  const grade = healthGradeAt(ledger, item, latest, rule);
  if (grade === null) return null;
  return Math.round(((latest.amounts.get(item.id) ?? 0) / grade) * PPM) / PPM;
}

export type RevisionKind = 'regular' | 'occasional';

export const REVISION_LABEL: Record<RevisionKind, string> = {
  regular: '定時決定（4〜6月の平均）',
  occasional: '随時改定（固定的賃金の変動後3か月の平均）',
};

export interface Revision {
  kind: RevisionKind;
  /** Months whose remuneration was averaged. */
  months: { year: number; month: number; remuneration: number }[];
  averageRemuneration: number;
  healthGrade: StandardRemunerationGrade;
  pensionGrade: StandardRemunerationGrade;
  /** First payslip month that deducts the revised premium. */
  fromMonth: number;
  /** itemId → monthly premium from fromMonth. */
  premiums: Map<string, number>;
}

export interface RemunerationPlan {
  rates: Partial<Record<InsuranceBase, { rate: number; source: 'estimated' | 'manual' | 'law' }>>;
  /** Applicable revisions in payslip-month order; later ones override earlier ones. */
  revisions: Revision[];
}

/** 随時改定 needs a difference of two grades or more. */
const OCCASIONAL_MIN_GRADE_DIFF = 2;
/** Premium months whose occasional revision supersedes the 定時決定 of that year (Jul–Sep). */
const SUPERSEDES_REGULAR = [7, 8, 9];

/** 固定的賃金: pay items forecast as "直近月の値を延長". */
function fixedWage(ledger: Ledger, amounts: Amounts): number {
  let total = 0;
  for (const [itemId, v] of amounts) {
    const item = ledger.itemById.get(itemId);
    if (!item || isExcludedFromRemuneration(item) || item.defaultMethod !== 'recent') continue;
    if (item.category === 'taxablePay' || item.category === 'nonTaxablePay') total += v;
  }
  return total;
}

function gradeIndex(grades: readonly StandardRemunerationGrade[], amount: number): number {
  return grades.findIndex((g) => g.amount === amount);
}

function nearestGrade(
  grades: readonly StandardRemunerationGrade[],
  amount: number,
): StandardRemunerationGrade {
  return grades.reduce((best, g) =>
    Math.abs(g.amount - amount) < Math.abs(best.amount - amount) ? g : best,
  );
}

function planRates(
  ledger: Ledger,
  insured: readonly ItemMaster[],
  year: number,
  rule: SocialInsuranceRule,
  setting: YearSetting | undefined,
): RemunerationPlan['rates'] {
  const rates: RemunerationPlan['rates'] = {
    pension: { rate: rule.pensionEmployeeRate, source: 'law' },
    childSupport: { rate: rule.childSupportEmployeeRate, source: 'law' },
  };
  for (const item of insured) {
    const base = insuranceBaseOf(item);
    if (base !== 'health' && base !== 'nursing') continue;
    const manual = base === 'health' ? setting?.healthRate : setting?.nursingRate;
    const rate = manual ?? estimateRate(ledger, item, year, rule);
    if (rate !== null && rate !== undefined) {
      rates[base] = { rate, source: manual !== undefined ? 'manual' : 'estimated' };
    }
  }
  return rates;
}

/**
 * F-11: 定時決定 (April–June average, from the October slip) and 随時改定 (fixed wages changed
 * in month M, average of M..M+2, two grades or more, from the M+4 slip). An occasional revision
 * taking effect for the July–September premium replaces that year's 定時決定.
 */
export function remunerationPlan(
  ledger: Ledger,
  year: number,
  rule: SocialInsuranceRule,
  setting: YearSetting | undefined,
): RemunerationPlan | null {
  const insured = ledger.items.filter(
    (i) => insuranceBaseOf(i) !== undefined && i.category === 'socialInsurance',
  );
  const rates = planRates(ledger, insured, year, rule, setting);
  const salary = (month: number): Amounts | undefined =>
    actualAmounts(ledger, year, { month, kind: 'salary' });

  const revisionFor = (
    kind: RevisionKind,
    months: Revision['months'],
    fromMonth: number,
  ): Revision | null => {
    const avg = average(months.map((m) => m.remuneration));
    if (avg === null) return null;
    const healthGrade = gradeOf(rule.healthGrades, avg);
    const pensionGrade = gradeOf(rule.pensionGrades, avg);
    const premiums = new Map<string, number>();
    for (const item of insured) {
      const base = insuranceBaseOf(item);
      const rate = base ? rates[base]?.rate : undefined;
      if (!base || rate === undefined || rate === 0) continue;
      const grade = base === 'pension' ? pensionGrade.amount : healthGrade.amount;
      premiums.set(item.id, employeePremium(grade, rate));
    }
    return {
      kind,
      months,
      averageRemuneration: avg,
      healthGrade,
      pensionGrade,
      fromMonth,
      premiums,
    };
  };

  const regularMonths = DETERMINATION_MONTHS.flatMap((month) => {
    const amounts = salary(month);
    return amounts ? [{ year, month, remuneration: remunerationOf(ledger, amounts) }] : [];
  });
  const regular = revisionFor('regular', regularMonths, rule.reflectFromMonth);

  const healthItem = insured.find((i) => insuranceBaseOf(i) === 'health');
  const healthRate = rates.health?.rate;
  const occasional: Revision[] = [];
  for (let m = 2; m + 4 <= 12; m++) {
    const before = salary(m - 1);
    const window = [m, m + 1, m + 2].map((month) => ({ month, amounts: salary(month) }));
    const first = window[0]?.amounts;
    if (!before || !first || window.some((w) => !w.amounts) || !healthItem || !healthRate) continue;
    if (fixedWage(ledger, before) === fixedWage(ledger, first)) continue;
    const revision = revisionFor(
      'occasional',
      window.map((w) => ({
        year,
        month: w.month,
        remuneration: remunerationOf(ledger, w.amounts),
      })),
      m + 4,
    );
    const current = nearestGrade(rule.healthGrades, (before.get(healthItem.id) ?? 0) / healthRate);
    const diff = revision
      ? Math.abs(
          gradeIndex(rule.healthGrades, revision.healthGrade.amount) -
            gradeIndex(rule.healthGrades, current.amount),
        )
      : 0;
    if (revision && diff >= OCCASIONAL_MIN_GRADE_DIFF) occasional.push(revision);
  }
  const supersedes = occasional.some((r) => SUPERSEDES_REGULAR.includes(r.fromMonth - 1));
  const revisions = [...(regular && !supersedes ? [regular] : []), ...occasional].sort(
    (a, b) => a.fromMonth - b.fromMonth,
  );
  return revisions.length === 0 ? null : { rates, revisions };
}

/** Premiums in force for a payslip month according to the plan (latest revision wins). */
export function premiumsAt(
  plan: RemunerationPlan | null,
  month: number,
): Map<string, number> | null {
  const applicable = plan?.revisions.filter((r) => r.fromMonth <= month) ?? [];
  return applicable.at(-1)?.premiums ?? null;
}
