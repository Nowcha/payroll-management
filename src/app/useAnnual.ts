import { useMemo } from 'react';
import { computeAnnual, NO_SCENARIO, type AnnualSummary, type Scenario } from '../domain/annual';
import { useAppData } from './state';

export interface AnnualState {
  summary: AnnualSummary | null;
  error: string | null;
}

/** Annual figures for the selected year (actual + forecast + registered deductions). */
export function useAnnual(scenario: Scenario = NO_SCENARIO, yearOverride?: number): AnnualState {
  const { ledger, year, records, overrides } = useAppData();
  const target = yearOverride ?? year;
  return useMemo(() => {
    try {
      return { summary: computeAnnual(ledger, target, records, overrides, scenario), error: null };
    } catch (e: unknown) {
      return { summary: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [ledger, target, records, overrides, scenario]);
}
