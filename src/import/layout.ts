// Geometry helpers for coordinate-based PDF reading (requirements 6.2).
import { parseAmount, type TextItem } from './pdfText';

const SAME_LINE_TOLERANCE = 1.5;
const MAX_FRAGMENT = 2;

/**
 * Joins characters printed one by one (e.g. "支","払","金","額") into words on the same line.
 * Only short fragments (<= 2 chars) are joined so that adjacent full labels stay separate.
 */
export function mergeWords(items: readonly TextItem[]): TextItem[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const merged: TextItem[] = [];
  let lastWasFragment = false;
  for (const item of sorted) {
    const prev = merged[merged.length - 1];
    const isFragment = item.str.length <= MAX_FRAGMENT && parseAmount(item.str) === null;
    const gap = prev ? item.x - (prev.x + prev.width) : Infinity;
    const canMerge =
      prev !== undefined &&
      isFragment &&
      lastWasFragment &&
      Math.abs(prev.y - item.y) <= SAME_LINE_TOLERANCE &&
      gap >= -0.5 &&
      gap <= Math.max(prev.height, item.height) * 1.2;
    if (canMerge) {
      merged[merged.length - 1] = {
        ...prev,
        str: prev.str + item.str,
        width: item.x + item.width - prev.x,
      };
    } else {
      merged.push({ ...item });
    }
    lastWasFragment = isFragment;
  }
  return merged;
}

// JS \s already covers the ideographic space (U+3000).
export const normalizeLabel = (s: string): string => s.replace(/[\s()（）]/g, '');

export function findLabel(items: readonly TextItem[], label: string): TextItem | undefined {
  const target = normalizeLabel(label);
  return items.find((i) => normalizeLabel(i.str) === target);
}

export function findLabelStartingWith(
  items: readonly TextItem[],
  prefix: string,
): TextItem | undefined {
  const target = normalizeLabel(prefix);
  return items.find((i) => normalizeLabel(i.str).startsWith(target));
}

export interface NumericItem extends TextItem {
  amount: number;
}

export function numericItems(items: readonly TextItem[]): NumericItem[] {
  return items.flatMap((i) => {
    const amount = parseAmount(i.str);
    return amount === null ? [] : [{ ...i, amount }];
  });
}

export interface ColumnQuery {
  label: TextItem;
  /** Left edge of the next label on the same row; the column ends there. */
  nextLabelX: number;
  maxDistanceBelow: number;
  margin?: number;
}

/**
 * Amount printed below (or level with, to the right of) a label: the nearest numeric item whose
 * right edge falls inside [label.x, nextLabelX) and whose baseline is within maxDistanceBelow.
 */
export function amountInColumn(numbers: readonly NumericItem[], q: ColumnQuery): number | null {
  const margin = q.margin ?? 10;
  const left = q.label.x - margin;
  const right = q.nextLabelX - margin;
  const candidates = numbers
    .filter((n) => {
      const rightEdge = n.x + n.width;
      const dy = q.label.y - n.y;
      return rightEdge > left && rightEdge <= right && dy >= 0 && dy <= q.maxDistanceBelow;
    })
    .sort((a, b) => b.y - a.y);
  return candidates[0]?.amount ?? null;
}

/** All numeric items on the first line below a reference y, ordered left to right. */
export function numericRowBelow(
  numbers: readonly NumericItem[],
  y: number,
  maxDistanceBelow: number,
): NumericItem[] {
  const below = numbers.filter((n) => n.y < y && y - n.y <= maxDistanceBelow);
  const top = Math.max(...below.map((n) => n.y));
  return below.filter((n) => Math.abs(n.y - top) <= SAME_LINE_TOLERANCE).sort((a, b) => a.x - b.x);
}
