// IndexedDB access. Everything stays in the browser (requirements 6: 外部送信なし).
import type { PayrollDb } from './db';
import { newId } from './db';
import type { ImportPlan } from './importer';
import type { Payslip, PayslipLine, WithholdingSlipRecord } from './types';

/** Saves the accepted slips of a plan (rejected ones are skipped) and any new items. */
export async function saveImportPlan(db: PayrollDb, plan: ImportPlan): Promise<number> {
  const accepted = plan.slips.filter((s) => s.ok);
  const usedItemIds = new Set(accepted.flatMap((s) => s.lines.map((l) => l.itemId)));
  await db.transaction('rw', db.items, db.payslips, db.payslipLines, async () => {
    await db.items.bulkPut(plan.newItems.filter((i) => usedItemIds.has(i.id)));
    for (const s of accepted) {
      await db.payslipLines.where('payslipId').equals(s.payslip.id).delete();
      await db.payslips.put(s.payslip);
      await db.payslipLines.bulkAdd(s.lines);
    }
  });
  return accepted.length;
}

export async function savePayslip(
  db: PayrollDb,
  payslip: Payslip,
  lines: readonly PayslipLine[],
): Promise<void> {
  await db.transaction('rw', db.payslips, db.payslipLines, async () => {
    await db.payslipLines.where('payslipId').equals(payslip.id).delete();
    await db.payslips.put(payslip);
    await db.payslipLines.bulkAdd(lines.map((l) => ({ ...l, payslipId: payslip.id })));
  });
}

export async function deletePayslip(db: PayrollDb, id: string): Promise<void> {
  await db.transaction('rw', db.payslips, db.payslipLines, async () => {
    await db.payslipLines.where('payslipId').equals(id).delete();
    await db.payslips.delete(id);
  });
}

export async function saveWithholdingSlip(
  db: PayrollDb,
  record: WithholdingSlipRecord,
): Promise<void> {
  await db.withholdingSlips.put(record);
}

export async function deleteMedicalExpense(db: PayrollDb, id: string): Promise<void> {
  await db.transaction('rw', db.medicalExpenses, db.reimbursements, async () => {
    await db.reimbursements.where('medicalExpenseId').equals(id).delete();
    await db.medicalExpenses.delete(id);
  });
}

export { newId };
