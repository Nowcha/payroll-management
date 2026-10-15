// Integer-yen arithmetic. Rates are converted to basis points (1/10000) so that
// multiplication stays in exact integer space and rounding direction is explicit.

const BASIS = 10_000;

export type RoundingMode = 'floor' | 'ceil';

export function assertYen(value: number, label = 'amount'): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be an integer number of yen: ${value}`);
  }
  return value;
}

function toBasisPoints(rate: number): number {
  const bp = Math.round(rate * BASIS);
  if (Math.abs(bp / BASIS - rate) > 1e-12) {
    throw new RangeError(`rate ${rate} is finer than 0.01% and cannot be applied exactly`);
  }
  return bp;
}

function divide(numerator: number, denominator: number, mode: RoundingMode): number {
  const q = numerator / denominator;
  return mode === 'floor' ? Math.floor(q) : Math.ceil(q);
}

/** amount × rate, rounded to whole yen in the given direction. */
export function applyRate(amount: number, rate: number, mode: RoundingMode = 'floor'): number {
  assertYen(amount);
  const product = amount * toBasisPoints(rate);
  if (!Number.isSafeInteger(product)) throw new RangeError('amount too large for exact rate math');
  return divide(product, BASIS, mode);
}

/** Rounds down to a multiple of unit (e.g. 1,000円未満切捨て). */
export function floorTo(amount: number, unit: number): number {
  assertYen(amount);
  return Math.floor(amount / unit) * unit;
}

export function clampMin(amount: number, min = 0): number {
  return amount < min ? min : amount;
}

export function sum(values: readonly number[]): number {
  return values.reduce((acc, v) => acc + assertYen(v), 0);
}

export function formatYen(value: number): string {
  return `${value.toLocaleString('ja-JP')}円`;
}
