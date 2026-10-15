// 給与所得の源泉徴収票 reader. The printed layout differs between years (page size and
// coordinates changed between 2024 and 2025), so values are located relative to their labels.
import {
  amountInColumn,
  findLabel,
  findLabelStartingWith,
  mergeWords,
  numericItems,
  numericRowBelow,
  type NumericItem,
} from './layout';
import { parseAmount, type PdfPageText, type TextItem } from './pdfText';

export interface WithholdingSlipData {
  year: number;
  paymentAmount: number;
  employmentIncome: number;
  totalDeductions: number;
  withheldTax: number;
  socialInsurance: number;
  lifeInsuranceDeduction: number;
  earthquakeInsuranceDeduction: number;
  housingLoanCredit: number;
  /** 基礎控除の額（記載がある様式のみ）. */
  basicDeduction: number | null;
  /** 所得金額調整控除額（記載がある様式のみ）. */
  incomeAdjustment: number | null;
  lifeInsurancePremiums: {
    generalNew: number;
    generalOld: number;
    careMedical: number;
    pensionNew: number;
    pensionOld: number;
  } | null;
  /** 摘要欄の定額減税の控除済額（2024年分）. */
  fixedTaxReductionApplied: number | null;
  remarks: string;
}

export class WithholdingParseError extends Error {}

const ROW_DISTANCE = 80;
const PAGE_RIGHT = Number.MAX_SAFE_INTEGER;

const ROW_MAIN = [
  '支払金額',
  '給与所得控除後の金額',
  '所得控除の額の合計額',
  '源泉徴収税額',
] as const;
const ROW_DEDUCTIONS = [
  '社会保険料等の金額',
  '生命保険料の控除額',
  '地震保険料の控除額',
  '住宅借入金等特別控除の額',
] as const;

function requireLabel(items: readonly TextItem[], label: string): TextItem {
  const found = findLabel(items, label);
  if (!found) throw new WithholdingParseError(`源泉徴収票に「${label}」の欄が見つかりません`);
  return found;
}

function readRow(
  items: readonly TextItem[],
  numbers: readonly NumericItem[],
  labels: readonly string[],
  required: boolean,
): Map<string, number | null> {
  const found = labels.map((l) => (required ? requireLabel(items, l) : findLabel(items, l)));
  const result = new Map<string, number | null>();
  labels.forEach((label, i) => {
    const item = found[i];
    if (!item) {
      result.set(label, null);
      return;
    }
    const rightNeighbours = found
      .filter((f): f is TextItem => f !== undefined && f.x > item.x)
      .map((f) => f.x);
    const nextLabelX = rightNeighbours.length > 0 ? Math.min(...rightNeighbours) : PAGE_RIGHT;
    result.set(
      label,
      amountInColumn(numbers, { label: item, nextLabelX, maxDistanceBelow: ROW_DISTANCE }),
    );
  });
  return result;
}

function readYear(items: readonly TextItem[]): number {
  const yearLabel = items.find((i) => /^年\s*分$/.test(i.str));
  const era = yearLabel
    ? items
        .filter(
          (i) => Math.abs(i.y - yearLabel.y) < 2 && i.x < yearLabel.x && /^\d{1,2}$/.test(i.str),
        )
        .sort((a, b) => b.x - a.x)[0]
    : undefined;
  if (!era) throw new WithholdingParseError('源泉徴収票の年分（令和○年分）が読めません');
  return 2018 + Number(era.str);
}

function readLifePremiums(
  items: readonly TextItem[],
  numbers: readonly NumericItem[],
): WithholdingSlipData['lifeInsurancePremiums'] {
  const label = findLabelStartingWith(items, '新生命保険料');
  if (!label) return null;
  const row = numericRowBelow(numbers, label.y, 30);
  if (row.length !== 5) return null;
  const [generalNew, generalOld, careMedical, pensionNew, pensionOld] = row.map((n) => n.amount);
  return {
    generalNew: generalNew ?? 0,
    generalOld: generalOld ?? 0,
    careMedical: careMedical ?? 0,
    pensionNew: pensionNew ?? 0,
    pensionOld: pensionOld ?? 0,
  };
}

function readRemarks(items: readonly TextItem[]): string {
  const header = items.find((i) => i.str.includes('摘要'));
  if (!header) return '';
  return items
    .filter((i) => Math.abs(i.y - header.y) < 4 && i.x > header.x)
    .sort((a, b) => a.x - b.x)
    .map((i) => i.str)
    .join('');
}

function readFixedReduction(remarks: string): number | null {
  const match = /減税控除済額\s*([0-9０-９,，]+)円/.exec(remarks);
  return match?.[1] ? parseAmount(match[1]) : null;
}

function valueOf(row: Map<string, number | null>, label: string): number {
  const v = row.get(label);
  if (v === null || v === undefined) {
    throw new WithholdingParseError(`源泉徴収票の「${label}」の金額が読めません`);
  }
  return v;
}

export function parseWithholdingSlip(pages: readonly PdfPageText[]): WithholdingSlipData {
  const page = pages[0];
  if (!page) throw new WithholdingParseError('PDF にページがありません');
  const items = mergeWords(page.items);
  const numbers = numericItems(items);
  const main = readRow(items, numbers, ROW_MAIN, true);
  const deductions = readRow(items, numbers, ROW_DEDUCTIONS, true);
  const extra = readRow(items, numbers, ['基礎控除の額', '調整控除額'], false);
  const remarks = readRemarks(items);
  return {
    year: readYear(items),
    paymentAmount: valueOf(main, '支払金額'),
    employmentIncome: valueOf(main, '給与所得控除後の金額'),
    totalDeductions: valueOf(main, '所得控除の額の合計額'),
    withheldTax: valueOf(main, '源泉徴収税額'),
    socialInsurance: valueOf(deductions, '社会保険料等の金額'),
    lifeInsuranceDeduction: valueOf(deductions, '生命保険料の控除額'),
    earthquakeInsuranceDeduction: valueOf(deductions, '地震保険料の控除額'),
    housingLoanCredit: valueOf(deductions, '住宅借入金等特別控除の額'),
    basicDeduction: extra.get('基礎控除の額') ?? null,
    incomeAdjustment: extra.get('調整控除額') ?? null,
    lifeInsurancePremiums: readLifePremiums(items, numbers),
    fixedTaxReductionApplied: readFixedReduction(remarks),
    remarks,
  };
}
