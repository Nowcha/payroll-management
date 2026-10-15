import { applyRate, assertYen, floorTo } from './money';
import type {
  EmploymentIncomeDeduction,
  IncomeAdjustmentRule,
  LinearBracket,
  Sourced,
  Appendix5Rule,
} from './params/types';
import { ref, step, type Traced } from './trace';

function findBracket(brackets: readonly LinearBracket[], amount: number): LinearBracket {
  const found = brackets.find((b) => b.upTo === null || amount <= b.upTo);
  if (!found) throw new Error('employment income deduction brackets must end with an open bracket');
  return found;
}

/**
 * 給与所得控除額 by the plain bracket formula, rounded up to whole yen so that
 * salary income (salary − deduction) is effectively rounded down.
 */
export function employmentDeductionByFormula(
  salary: number,
  rule: EmploymentIncomeDeduction,
): number {
  const bracket = findBracket(rule.brackets, salary);
  const minimum = rule.brackets[0]?.add ?? 0;
  const deduction = applyRate(salary, bracket.rate, 'ceil') + bracket.add;
  return Math.max(minimum, deduction);
}

function appendix5Income(
  salary: number,
  rule: EmploymentIncomeDeduction,
  table: Appendix5Rule,
): { income: number; formula: string } {
  const minimum = rule.brackets[0]?.add ?? 0;
  if (salary < table.zeroBelow) return { income: 0, formula: `${table.zeroBelow}円未満のため0円` };
  const fixed = table.fixedRows.find((r) => salary >= r.from && salary < r.to);
  if (fixed) {
    return { income: fixed.income, formula: `別表第五 ${fixed.from}〜${fixed.to}円未満の行` };
  }
  const exactUntil = table.fixedRows[0]?.from ?? table.roundingFrom;
  if (salary < exactUntil) {
    return { income: salary - minimum, formula: `${salary} − 最低保障${minimum}` };
  }
  const rounded = floorTo(salary, table.unit);
  const deduction = employmentDeductionByFormula(rounded, rule);
  return {
    income: rounded - deduction,
    formula: `${table.unit}円未満切捨て ${rounded} − 控除${deduction}（別表第五）`,
  };
}

/** 給与所得（給与所得控除後の金額）. Uses 所得税法別表第五 below its upper bound. */
export function employmentIncome(
  salary: number,
  deductionRule: Sourced<EmploymentIncomeDeduction>,
  appendix5: Sourced<Appendix5Rule>,
): Traced<number> {
  assertYen(salary, 'salary');
  const params = [ref('給与所得控除', deductionRule)];
  if (salary < appendix5.value.upTo) {
    const { income, formula } = appendix5Income(salary, deductionRule.value, appendix5.value);
    params.push(ref('所得税法別表第五', appendix5));
    return { value: income, steps: [step('給与所得控除後の金額', income, formula, params)] };
  }
  const deduction = employmentDeductionByFormula(salary, deductionRule.value);
  const income = salary - deduction;
  return {
    value: income,
    steps: [
      step('給与所得控除額', deduction, undefined, params),
      step('給与所得控除後の金額', income, `${salary} − ${deduction}`),
    ],
  };
}

export interface IncomeAdjustmentEligibility {
  selfIsSpeciallyDisabled: boolean;
  hasDependentUnder23: boolean;
  hasSpeciallyDisabledFamily: boolean;
}

/** 所得金額調整控除（子ども・特別障害者等を有する者等）. */
export function incomeAdjustmentDeduction(
  salary: number,
  eligibility: IncomeAdjustmentEligibility,
  rule: Sourced<IncomeAdjustmentRule>,
): Traced<number> {
  const { salaryThreshold, salaryCap, rate } = rule.value;
  const eligible =
    eligibility.selfIsSpeciallyDisabled ||
    eligibility.hasDependentUnder23 ||
    eligibility.hasSpeciallyDisabledFamily;
  if (!eligible || salary <= salaryThreshold) return { value: 0, steps: [] };
  const base = Math.min(salary, salaryCap) - salaryThreshold;
  const value = applyRate(base, rate, 'ceil');
  return {
    value,
    steps: [
      step(
        '所得金額調整控除',
        value,
        `(min(${salary}, ${salaryCap}) − ${salaryThreshold}) × ${rate * 100}%`,
        [ref('所得金額調整控除', rule)],
      ),
    ],
  };
}
