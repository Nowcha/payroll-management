import Dexie, { type EntityTable } from 'dexie';
import { seedItems } from './itemSeeds';
import type {
  FamilyMember,
  ForecastOverride,
  FurusatoDonation,
  InsuranceContract,
  ItemMaster,
  MedicalExpense,
  OtherDeduction,
  Payslip,
  PayslipLine,
  Reimbursement,
  WithholdingSlipRecord,
  YearSetting,
} from './types';

export class PayrollDb extends Dexie {
  items!: EntityTable<ItemMaster, 'id'>;
  payslips!: EntityTable<Payslip, 'id'>;
  payslipLines!: EntityTable<PayslipLine, 'id'>;
  forecastOverrides!: EntityTable<ForecastOverride, 'id'>;
  withholdingSlips!: EntityTable<WithholdingSlipRecord, 'year'>;
  family!: EntityTable<FamilyMember, 'id'>;
  insurance!: EntityTable<InsuranceContract, 'id'>;
  otherDeductions!: EntityTable<OtherDeduction, 'id'>;
  medicalExpenses!: EntityTable<MedicalExpense, 'id'>;
  reimbursements!: EntityTable<Reimbursement, 'id'>;
  donations!: EntityTable<FurusatoDonation, 'id'>;
  yearSettings!: EntityTable<YearSetting, 'year'>;

  constructor(name = 'payroll-management') {
    super(name);
    this.version(1).stores({
      items: 'id, name, block, category, order',
      payslips: 'id, year, [year+month], kind',
      payslipLines: 'id, payslipId, itemId',
      forecastOverrides: 'id, year, [year+month+kind+itemId]',
      withholdingSlips: 'year',
      family: 'id',
      insurance: 'id, kind',
      otherDeductions: 'id, year',
      medicalExpenses: 'id, date, patientId',
      reimbursements: 'id, medicalExpenseId',
      donations: 'id, date',
      yearSettings: 'year',
    });
    // Runs once, inside the creation transaction, so concurrent renders cannot double-seed.
    this.on('populate', (tx) => {
      void tx.table('items').bulkAdd(seedItems());
    });
  }
}

export const TABLE_NAMES = [
  'items',
  'payslips',
  'payslipLines',
  'forecastOverrides',
  'withholdingSlips',
  'family',
  'insurance',
  'otherDeductions',
  'medicalExpenses',
  'reimbursements',
  'donations',
  'yearSettings',
] as const;

export type TableName = (typeof TABLE_NAMES)[number];

let instance: PayrollDb | null = null;

export function getDb(): PayrollDb {
  instance ??= new PayrollDb();
  return instance;
}

export function newId(): string {
  return crypto.randomUUID();
}
