// 検算5本と累計照合（requirements 6.2）。通らない明細は登録しない。
import type { ParsedPayslip } from './payslip';

export interface CheckResult {
  name: string;
  expected: number;
  actual: number;
  ok: boolean;
}

const sumOf = (values: readonly number[]): number => values.reduce((a, v) => a + v, 0);

function check(name: string, expected: number, actual: number): CheckResult {
  return { name, expected, actual, ok: expected === actual };
}

/**
 * Runs the five arithmetic checks on one slip. `isSocialInsurance` decides which deduction
 * lines make up the social insurance subtotal (from the item master / layout definition).
 */
export function checkPayslip(
  slip: ParsedPayslip,
  isSocialInsurance: (name: string) => boolean,
): CheckResult[] {
  const payments = slip.lines.filter((l) => l.block === 'payment');
  const deductions = slip.lines.filter((l) => l.block === 'deduction');
  const social = deductions.filter((l) => isSocialInsurance(l.name));
  const results = [
    check('支給項目の和＝支給合計', slip.totals.payment, sumOf(payments.map((l) => l.amount))),
    check('控除項目の和＝控除合計', slip.totals.deduction, sumOf(deductions.map((l) => l.amount))),
    check(
      '支給合計−控除合計＝差引支給額',
      slip.totals.net,
      slip.totals.payment - slip.totals.deduction,
    ),
  ];
  if (slip.totals.socialInsurance !== null) {
    results.splice(
      1,
      0,
      check(
        '社保項目の和＝社会保険料合計',
        slip.totals.socialInsurance,
        sumOf(social.map((l) => l.amount)),
      ),
    );
  } else if (social.length > 0) {
    results.push(check('社会保険料合計の記載', 1, 0));
  }
  if (slip.totals.bankTransfer !== null) {
    results.push(check('差引支給額＝銀行振込額', slip.totals.bankTransfer, slip.totals.net));
  }
  return results;
}

export interface CumulativeInput {
  key: string;
  payment: number;
  socialInsurance: number;
  incomeTax: number;
  printed: ParsedPayslip['cumulative'];
}

export interface CumulativeIssue {
  key: string;
  field: '支給累計' | '社会保険累計' | '所得税累計';
  expected: number;
  actual: number;
}

/**
 * 前月累計＋当月＝当月累計. `entries` must be in payment order within one year. The first
 * slip of the year starts from zero.
 */
export function checkCumulative(entries: readonly CumulativeInput[]): CumulativeIssue[] {
  const issues: CumulativeIssue[] = [];
  let payment = 0;
  let social = 0;
  let tax = 0;
  for (const e of entries) {
    payment += e.payment;
    social += e.socialInsurance;
    tax += e.incomeTax;
    const c = e.printed;
    if (c.payment !== null && c.payment !== payment) {
      issues.push({ key: e.key, field: '支給累計', expected: c.payment, actual: payment });
    }
    if (c.socialInsurance !== null && c.socialInsurance !== social) {
      issues.push({
        key: e.key,
        field: '社会保険累計',
        expected: c.socialInsurance,
        actual: social,
      });
    }
    if (c.incomeTax !== null && c.incomeTax !== tax) {
      issues.push({ key: e.key, field: '所得税累計', expected: c.incomeTax, actual: tax });
    }
    // Re-anchor on the printed values so one bad slip does not cascade.
    payment = c.payment ?? payment;
    social = c.socialInsurance ?? social;
    tax = c.incomeTax ?? tax;
  }
  return issues;
}
