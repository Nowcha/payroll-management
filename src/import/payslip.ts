// 給与・賞与明細の読取（requirements 6.2）。項目名行の直下・同じ列の数値をその項目の金額とする。
import layoutJson from './layouts/payslip-default.json';
import { parseAmount, type PdfPageText, type TextItem } from './pdfText';

export type PayslipKind = 'salary' | 'bonus';
export type PayslipBlock = 'payment' | 'deduction' | 'attendance' | 'notes';

export interface PayslipLayout {
  blockMarkers: Record<PayslipBlock, [string, string]>;
  markerMaxX: number;
  maxLabelDistanceFromBlock: number;
  amountRowOffset: { min: number; max: number };
  maxAmountRightOfLabelCenter: number;
  titles: { salary: string; bonus: string };
  totals: {
    payment: string[];
    socialInsurance: string[];
    deduction: string[];
    net: string[];
    bankTransfer: string[];
  };
  socialInsuranceItems: string[];
  cumulative: { payment: string; socialInsurance: string; incomeTax: string };
  ignoredNoteItems: string[];
}

export const DEFAULT_PAYSLIP_LAYOUT = layoutJson as unknown as PayslipLayout;

export interface PayslipLine {
  block: 'payment' | 'deduction';
  name: string;
  amount: number;
}

export interface ParsedPayslip {
  year: number;
  month: number;
  kind: PayslipKind;
  /** Item lines excluding totals/subtotals. */
  lines: PayslipLine[];
  attendance: { name: string; hours: number }[];
  totals: {
    payment: number;
    socialInsurance: number | null;
    deduction: number;
    net: number;
    bankTransfer: number | null;
  };
  cumulative: { payment: number | null; socialInsurance: number | null; incomeTax: number | null };
  remarks: string[];
  warnings: string[];
}

export class PayslipParseError extends Error {}

interface LabelCell {
  label: TextItem;
  value: TextItem | undefined;
}

const SPACED_HEADER = /^(\S\s)+\S$/;

function parseHours(text: string): number | null {
  return /^\d+(\.\d+)?$/.test(text) ? Number(text) : null;
}

function isNumberLike(text: string): boolean {
  return parseAmount(text) !== null || parseHours(text) !== null;
}

function blockCenters(
  items: readonly TextItem[],
  layout: PayslipLayout,
): Map<PayslipBlock, number> {
  const centers = new Map<PayslipBlock, number>();
  for (const [block, [top, bottom]] of Object.entries(layout.blockMarkers) as [
    PayslipBlock,
    [string, string],
  ][]) {
    const markers = items.filter(
      (i) => i.x < layout.markerMaxX && (i.str === top || i.str === bottom),
    );
    if (markers.length >= 2) {
      centers.set(block, markers.reduce((a, m) => a + m.y, 0) / markers.length);
    }
  }
  return centers;
}

function nearestBlock(
  y: number,
  centers: Map<PayslipBlock, number>,
  maxDistance: number,
): PayslipBlock | null {
  let best: { block: PayslipBlock; d: number } | null = null;
  for (const [block, cy] of centers) {
    const d = Math.abs(cy - y);
    if (d <= maxDistance && (!best || d < best.d)) best = { block, d };
  }
  return best?.block ?? null;
}

/** Value directly under a label: next row down, right-aligned within the label's column. */
function valueUnder(
  label: TextItem,
  numbers: readonly TextItem[],
  layout: PayslipLayout,
): TextItem | undefined {
  const center = label.x + label.width / 2;
  return numbers
    .filter((n) => {
      const dy = label.y - n.y;
      const right = n.x + n.width;
      return (
        dy >= layout.amountRowOffset.min &&
        dy <= layout.amountRowOffset.max &&
        right > center &&
        right - center <= layout.maxAmountRightOfLabelCenter
      );
    })
    .sort((a, b) => a.x + a.width - (b.x + b.width))[0];
}

function readHeader(
  items: readonly TextItem[],
  layout: PayslipLayout,
): { year: number; month: number; kind: PayslipKind } {
  const title = items
    .find((i) => i.str.replace(/\s/g, '').endsWith('明細書'))
    ?.str.replace(/\s/g, '');
  const kind: PayslipKind | null =
    title === layout.titles.salary ? 'salary' : title === layout.titles.bonus ? 'bonus' : null;
  if (!kind) throw new PayslipParseError(`明細書の種別を判定できません（${title ?? '表題なし'}）`);
  const period = items.map((i) => /(\d{4})年(\d{2})月\s*分/.exec(i.str)).find((m) => m !== null);
  if (!period) throw new PayslipParseError('明細の対象年月（YYYY年MM月 分）が見つかりません');
  return { year: Number(period[1]), month: Number(period[2]), kind };
}

function pick(cells: readonly LabelCell[], names: readonly string[]): number | null {
  const cell = cells.find((c) => names.includes(c.label.str) && c.value);
  return cell?.value ? parseAmount(cell.value.str) : null;
}

export function parsePayslip(
  pages: readonly PdfPageText[],
  layout: PayslipLayout = DEFAULT_PAYSLIP_LAYOUT,
): ParsedPayslip {
  const page = pages[0];
  if (!page) throw new PayslipParseError('PDF にページがありません');
  const items = page.items;
  const header = readHeader(items, layout);
  const centers = blockCenters(items, layout);
  if (!centers.has('payment') || !centers.has('deduction')) {
    throw new PayslipParseError('支給・控除ブロックの見出しが見つかりません');
  }

  const numbers = items.filter((i) => isNumberLike(i.str));
  const labels = items.filter(
    (i) => !isNumberLike(i.str) && !(i.x < layout.markerMaxX && i.str.length === 1),
  );
  const cells = labels.map((label) => ({ label, value: valueUnder(label, numbers, layout) }));
  const warnings: string[] = [];
  const lines: PayslipLine[] = [];
  const attendance: { name: string; hours: number }[] = [];
  const totalNames = new Set([
    ...layout.totals.payment,
    ...layout.totals.socialInsurance,
    ...layout.totals.deduction,
    ...layout.totals.net,
    ...layout.totals.bankTransfer,
    ...layout.ignoredNoteItems,
  ]);

  for (const { label, value } of cells) {
    const block = nearestBlock(label.y, centers, layout.maxLabelDistanceFromBlock);
    if (!block || totalNames.has(label.str)) continue;
    if (!value) {
      if (!SPACED_HEADER.test(label.str) && block !== 'notes') {
        warnings.push(`「${label.str}」の直下に金額がありません`);
      }
      continue;
    }
    if (block === 'attendance') {
      const hours = parseHours(value.str);
      if (hours !== null) attendance.push({ name: label.str, hours });
      continue;
    }
    if (block === 'notes') continue;
    const amount = parseAmount(value.str);
    if (amount === null) {
      warnings.push(`「${label.str}」の金額「${value.str}」が整数円ではありません`);
      continue;
    }
    lines.push({ block, name: label.str, amount });
  }

  const payment = pick(cells, layout.totals.payment);
  const deduction = pick(cells, layout.totals.deduction);
  const net = pick(cells, layout.totals.net);
  if (payment === null || deduction === null || net === null) {
    throw new PayslipParseError('支給合計・控除合計・差引支給額のいずれかが読めません');
  }

  const cumulativeRowY = labels.find((l) => l.str === layout.cumulative.payment)?.y;
  const remarks =
    cumulativeRowY === undefined
      ? []
      : items
          .filter((i) => i.y < cumulativeRowY - layout.amountRowOffset.max)
          .sort((a, b) => b.y - a.y || a.x - b.x)
          .map((i) => i.str);

  return {
    ...header,
    lines,
    attendance,
    totals: {
      payment,
      socialInsurance: pick(cells, layout.totals.socialInsurance),
      deduction,
      net,
      bankTransfer: pick(cells, layout.totals.bankTransfer),
    },
    cumulative: {
      payment: pick(cells, [layout.cumulative.payment]),
      socialInsurance: pick(cells, [layout.cumulative.socialInsurance]),
      incomeTax: pick(cells, [layout.cumulative.incomeTax]),
    },
    remarks,
    warnings,
  };
}
