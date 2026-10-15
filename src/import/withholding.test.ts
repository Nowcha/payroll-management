// Synthetic layout only — the coordinates mimic the slip structure, the amounts are invented.
import { describe, expect, it } from 'vitest';
import { mergeWords } from './layout';
import type { PdfPageText, TextItem } from './pdfText';
import { parseAmount } from './pdfText';
import { parseWithholdingSlip, WithholdingParseError } from './withholding';

const t = (str: string, x: number, y: number, width = str.length * 9): TextItem => ({
  str,
  x,
  y,
  width,
  height: 9,
});

function slip(extra: TextItem[] = []): PdfPageText {
  return {
    pageNumber: 1,
    width: 595,
    height: 842,
    items: [
      t('令 和', 83, 802),
      t('07', 149, 802, 18),
      t('年 分', 187, 802, 45),
      // split label "支払金額"
      t('支', 155, 687),
      t('払', 173, 687),
      t('金', 191, 687),
      t('額', 209, 687),
      t('給与所得控除後の金額', 252, 692),
      t('所得控除の額の合計額', 363, 687),
      t('源泉徴収税額', 492, 687),
      t('5,000,000', 172, 648, 63),
      t('3,560,000', 283, 648, 63),
      t('1,180,000', 394, 648, 63),
      t('77,500', 519, 648, 49),
      t('社会保険料等の金額', 50, 560),
      t('生命保険料の控除額', 189, 560),
      t('地震保険料の控除額', 327, 560),
      t('住宅借入金等特別控除の額', 452, 560),
      t('700,000', 91, 523, 63),
      t('40,000', 250, 523, 42),
      t('0', 423, 523, 7),
      t('0', 561, 523, 7),
      t('生命保険料の', 22, 440),
      t('新生命保険料', 60, 440),
      t('100,000', 120, 430, 40),
      t('0', 250, 430, 6),
      t('0', 357, 430, 6),
      t('0', 455, 430, 6),
      t('0', 563, 430, 6),
      t('(摘要)', 22, 509),
      ...extra,
    ],
  };
}

describe('layout helpers', () => {
  it('merges single characters but keeps full labels apart', () => {
    const merged = mergeWords([
      t('支', 0, 10),
      t('払', 10, 10),
      t('新生命保険料', 30, 10),
      t('旧', 90, 10),
    ]);
    expect(merged.map((m) => m.str)).toEqual(['支払', '新生命保険料', '旧']);
  });
  it('parses printed amounts', () => {
    expect(parseAmount('1,234,567')).toBe(1_234_567);
    expect(parseAmount('３００００')).toBe(30_000);
    expect(parseAmount('△1,200')).toBe(-1_200);
    expect(parseAmount('円')).toBeNull();
  });
});

describe('parseWithholdingSlip', () => {
  it('reads values relative to their labels', () => {
    const r = parseWithholdingSlip([slip()]);
    expect(r).toMatchObject({
      year: 2025,
      paymentAmount: 5_000_000,
      employmentIncome: 3_560_000,
      totalDeductions: 1_180_000,
      withheldTax: 77_500,
      socialInsurance: 700_000,
      lifeInsuranceDeduction: 40_000,
      earthquakeInsuranceDeduction: 0,
      housingLoanCredit: 0,
      lifeInsurancePremiums: {
        generalNew: 100_000,
        generalOld: 0,
        careMedical: 0,
        pensionNew: 0,
        pensionOld: 0,
      },
      fixedTaxReductionApplied: null,
    });
  });
  it('reads the fixed tax reduction from the remarks', () => {
    const r = parseWithholdingSlip([
      slip([
        t('源泉徴収時所得税減税控除済額', 52, 508),
        t('６００００円、控除外額', 202, 508),
        t('０円', 322, 508),
      ]),
    ]);
    expect(r.fixedTaxReductionApplied).toBe(60_000);
  });
  it('fails loudly when a required label is missing', () => {
    const page = slip();
    const broken = { ...page, items: page.items.filter((i) => i.str !== '源泉徴収税額') };
    expect(() => parseWithholdingSlip([broken])).toThrow(WithholdingParseError);
  });
});
