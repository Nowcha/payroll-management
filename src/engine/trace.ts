// Calculation trace: every engine result carries the steps that produced it so the UI
// can show "which value, which formula" (requirements 6, 説明可能性).

import type { ConfirmationStatus, Sourced } from './params/types';

export interface ParamRef {
  name: string;
  sourceUrl: string;
  status: ConfirmationStatus;
}

export interface Step {
  label: string;
  value: number;
  /** Human-readable formula with the concrete numbers substituted. */
  formula?: string;
  params?: ParamRef[];
}

export interface Traced<T> {
  value: T;
  steps: Step[];
}

export function ref<T>(name: string, sourced: Sourced<T>): ParamRef {
  return { name, sourceUrl: sourced.sourceUrl, status: sourced.status };
}

export function step(label: string, value: number, formula?: string, params?: ParamRef[]): Step {
  return params
    ? { label, value, formula, params }
    : formula
      ? { label, value, formula }
      : { label, value };
}

/** Collects parameters marked 要確認 that were used anywhere in the given steps. */
export function unconfirmedParams(steps: readonly Step[]): ParamRef[] {
  const seen = new Map<string, ParamRef>();
  for (const s of steps) {
    for (const p of s.params ?? []) {
      if (p.status === '要確認') seen.set(p.name, p);
    }
  }
  return [...seen.values()];
}
