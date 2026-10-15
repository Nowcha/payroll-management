// App-wide data: live IndexedDB queries + the selected tax year.
import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SUPPORTED_YEARS } from '../engine';
import type { DeductionRecords } from '../domain/annual';
import { getDb, type PayrollDb } from '../domain/db';
import { buildLedger, type Ledger } from '../domain/ledger';
import type {
  ForecastOverride,
  ItemMaster,
  Payslip,
  PayslipLine,
  WithholdingSlipRecord,
} from '../domain/types';

export interface AppData {
  db: PayrollDb;
  year: number;
  setYear: (year: number) => void;
  items: ItemMaster[];
  payslips: Payslip[];
  lines: PayslipLine[];
  overrides: ForecastOverride[];
  withholding: WithholdingSlipRecord[];
  records: DeductionRecords;
  ledger: Ledger;
  ready: boolean;
  error: string | null;
}

const AppContext = createContext<AppData | null>(null);

const latestYear = (): number => {
  const thisYear = new Date().getFullYear();
  return SUPPORTED_YEARS.includes(thisYear) ? thisYear : Math.max(...SUPPORTED_YEARS);
};

export function AppDataProvider({ children }: { children: ReactNode }) {
  const db = getDb();
  const [year, setYear] = useState<number>(latestYear);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    db.open().catch((e: unknown) =>
      setError(`データベースを開けません: ${e instanceof Error ? e.message : String(e)}`),
    );
  }, [db]);

  const snapshot = useLiveQuery(async () => {
    const [
      items,
      payslips,
      lines,
      overrides,
      withholding,
      family,
      insurance,
      otherDeductions,
      medicalExpenses,
      reimbursements,
      donations,
      yearSettings,
    ] = await Promise.all([
      db.items.toArray(),
      db.payslips.toArray(),
      db.payslipLines.toArray(),
      db.forecastOverrides.toArray(),
      db.withholdingSlips.toArray(),
      db.family.toArray(),
      db.insurance.toArray(),
      db.otherDeductions.toArray(),
      db.medicalExpenses.toArray(),
      db.reimbursements.toArray(),
      db.donations.toArray(),
      db.yearSettings.toArray(),
    ]);
    return {
      items,
      payslips,
      lines,
      overrides,
      withholding,
      records: {
        family,
        insurance,
        otherDeductions,
        medicalExpenses,
        reimbursements,
        donations,
        yearSettings,
      },
    };
  }, [db]);

  const ledger = useMemo(
    () => buildLedger(snapshot?.items ?? [], snapshot?.payslips ?? [], snapshot?.lines ?? []),
    [snapshot],
  );

  const value: AppData = {
    db,
    year,
    setYear,
    items: snapshot?.items ?? [],
    payslips: snapshot?.payslips ?? [],
    lines: snapshot?.lines ?? [],
    overrides: snapshot?.overrides ?? [],
    withholding: snapshot?.withholding ?? [],
    records: snapshot?.records ?? {
      family: [],
      insurance: [],
      otherDeductions: [],
      medicalExpenses: [],
      reimbursements: [],
      donations: [],
      yearSettings: [],
    },
    ledger,
    ready: snapshot !== undefined,
    error,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppData(): AppData {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppData must be used inside AppDataProvider');
  return ctx;
}
