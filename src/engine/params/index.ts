import params2024 from '../../../params/2024.json';
import params2025 from '../../../params/2025.json';
import params2026 from '../../../params/2026.json';
import type { TaxParams } from './types';

export type * from './types';

const ALL: Record<number, unknown> = {
  2024: params2024,
  2025: params2025,
  2026: params2026,
};

export const SUPPORTED_YEARS: readonly number[] = Object.keys(ALL).map(Number);

export class UnsupportedYearError extends Error {
  constructor(year: number) {
    super(`${year}年分の税制パラメータがありません（params/${year}.json を追加してください）`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSourcedLeaf(value: Record<string, unknown>): boolean {
  return 'value' in value && 'sourceUrl' in value && 'status' in value;
}

/**
 * Structural validation: every parameter group must be a Sourced leaf with an https URL,
 * a known status and a check date. Returns a list of problems (empty = valid).
 */
export function validateParams(raw: unknown, path = ''): string[] {
  if (!isRecord(raw)) return [`${path || 'root'}: object expected`];
  const problems: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    const here = path ? `${path}.${key}` : key;
    if (key === 'year' || key === 'fiscalYearLabel' || value === null) continue;
    if (!isRecord(value)) {
      problems.push(`${here}: parameter must be an object`);
      continue;
    }
    if (!isSourcedLeaf(value)) {
      problems.push(...validateParams(value, here));
      continue;
    }
    if (typeof value.sourceUrl !== 'string' || !value.sourceUrl.startsWith('https://')) {
      problems.push(`${here}: sourceUrl must be https`);
    }
    if (value.status !== '確認済' && value.status !== '要確認') {
      problems.push(`${here}: unknown status ${String(value.status)}`);
    }
    if (typeof value.checkedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.checkedOn)) {
      problems.push(`${here}: checkedOn must be YYYY-MM-DD`);
    }
  }
  return problems;
}

export function getParams(year: number): TaxParams {
  const raw = ALL[year];
  if (raw === undefined) throw new UnsupportedYearError(year);
  const problems = validateParams(raw);
  if (problems.length > 0) {
    throw new Error(`params/${year}.json is invalid:\n${problems.join('\n')}`);
  }
  return raw as TaxParams;
}
