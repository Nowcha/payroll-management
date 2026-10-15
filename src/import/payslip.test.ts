// Synthetic grid mimicking the payslip layout (requirements 6.2). Amounts are invented.
import { describe, expect, it } from 'vitest';
import { DEFAULT_PAYSLIP_LAYOUT, parsePayslip, PayslipParseError } from './payslip';
import { checkCumulative, checkPayslip } from './payslipChecks';
import type { PdfPageText, TextItem } from './pdfText';

const t = (str: string, x: number, y: number, width = str.length * 10): TextItem => ({
  str,
  x,
  y,
  width,
  height: 10,
});
/** Right-aligned amount ending at the column's right edge (columns are 85pt wide from x=40). */
const amt = (str: string, col: number, y: number): TextItem =>
  t(str, 125 + col * 85 - str.length * 5, y, str.length * 5);

function page(extra: TextItem[] = [], title = '給与 明細書'): PdfPageText {
  return {
    pageNumber: 1,
    width: 842,
    height: 595,
    items: [
      t(title, 424, 556),
      t('2026年04月 分', 417, 535),
      t('支', 31, 471),
      t('給', 31, 451),
      t('基本給', 72, 500),
      amt('300,000', 0, 484),
      t('時間外勤務手当', 52, 468),
      amt('20,000', 0, 452),
      t('支給合計', 748, 436),
      amt('320,000', 8, 420),
      t('控', 31, 363),
      t('除', 31, 343),
      t('健康保険', 67, 392),
      amt('15,000', 0, 376),
      t('厚生年金', 237, 392),
      amt('27,000', 2, 376),
      t('社会保険料合計', 562, 392),
      amt('42,000', 6, 376),
      t('所得税', 667, 392),
      amt('8,000', 7, 376),
      t('控除合計', 748, 328),
      amt('50,000', 8, 312),
      t('勤', 31, 263),
      t('怠', 31, 243),
      t('時 間 外 勤 務 時 間', 165, 253),
      t('時間外勤務時間', 52, 237),
      amt('10.50', 0, 221),
      t('記', 31, 203),
      t('事', 31, 193),
      t('銀行振込額', 147, 205),
      amt('270,000', 1, 189),
      t('差引支給額', 743, 205),
      amt('270,000', 8, 189),
      t('支給累計', 575, 149),
      amt('1,280,000', 6, 135),
      t('社会保険累計', 650, 149),
      amt('168,000', 7, 135),
      t('所得税累計', 740, 149),
      amt('32,000', 8, 135),
      t('お知らせ', 100, 119),
      ...extra,
    ],
  };
}

describe('parsePayslip', () => {
  it('reads each value directly under its label in the same column', () => {
    const r = parsePayslip([page()]);
    expect(r).toMatchObject({ year: 2026, month: 4, kind: 'salary' });
    expect(r.lines).toEqual([
      { block: 'payment', name: '基本給', amount: 300_000 },
      { block: 'payment', name: '時間外勤務手当', amount: 20_000 },
      { block: 'deduction', name: '健康保険', amount: 15_000 },
      { block: 'deduction', name: '厚生年金', amount: 27_000 },
      { block: 'deduction', name: '所得税', amount: 8_000 },
    ]);
    expect(r.attendance).toEqual([{ name: '時間外勤務時間', hours: 10.5 }]);
    expect(r.totals).toEqual({
      payment: 320_000,
      socialInsurance: 42_000,
      deduction: 50_000,
      net: 270_000,
      bankTransfer: 270_000,
    });
    expect(r.cumulative).toEqual({
      payment: 1_280_000,
      socialInsurance: 168_000,
      incomeTax: 32_000,
    });
    expect(r.remarks).toEqual(['お知らせ']);
  });
  it('detects bonus slips', () => {
    expect(parsePayslip([page([], '賞与 明細書')]).kind).toBe('bonus');
  });
  it('rejects unknown documents', () => {
    expect(() => parsePayslip([page([], '請求書')])).toThrow(PayslipParseError);
  });
});

describe('payslip checks', () => {
  const social = new Set(DEFAULT_PAYSLIP_LAYOUT.socialInsuranceItems);
  it('passes the five checks on a consistent slip', () => {
    const checks = checkPayslip(parsePayslip([page()]), (n) => social.has(n));
    expect(checks).toHaveLength(5);
    expect(checks.every((c) => c.ok)).toBe(true);
  });
  it('fails when a deduction line is missing', () => {
    const slip = parsePayslip([page()]);
    const broken = { ...slip, lines: slip.lines.filter((l) => l.name !== '所得税') };
    expect(checkPayslip(broken, (n) => social.has(n)).find((c) => !c.ok)?.name).toBe(
      '控除項目の和＝控除合計',
    );
  });
  it('checks running totals', () => {
    const printed = { payment: 100, socialInsurance: 10, incomeTax: 5 };
    expect(
      checkCumulative([{ key: 'a', payment: 100, socialInsurance: 10, incomeTax: 5, printed }]),
    ).toEqual([]);
    expect(
      checkCumulative([{ key: 'a', payment: 90, socialInsurance: 10, incomeTax: 5, printed }])[0]
        ?.field,
    ).toBe('支給累計');
  });
});
