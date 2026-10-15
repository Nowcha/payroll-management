// Turns parsed PDFs into records. Slips failing the 5 checks or the cumulative check are
// rejected (requirements 6.2); unknown item names become 分類待ち items instead of errors.
import { DEFAULT_PAYSLIP_LAYOUT, type ParsedPayslip } from '../import/payslip';
import { checkCumulative, checkPayslip, type CheckResult } from '../import/payslipChecks';
import type { ItemMaster, Payslip, PayslipLine } from './types';

export interface PlannedSlip {
  fileName: string;
  payslip: Payslip;
  lines: PayslipLine[];
  checks: CheckResult[];
  cumulativeIssues: string[];
  warnings: string[];
  ok: boolean;
}

export interface ImportPlan {
  slips: PlannedSlip[];
  newItems: ItemMaster[];
}

type IdFactory = () => string;

function resolveItem(
  name: string,
  block: 'payment' | 'deduction',
  items: ItemMaster[],
  newItems: ItemMaster[],
  newId: IdFactory,
): ItemMaster {
  const found = items.find((i) => i.name === name || i.aliases.includes(name));
  if (found) return found;
  const maxOrder = items.reduce((m, i) => Math.max(m, i.order), 0);
  const created: ItemMaster = {
    id: newId(),
    name,
    aliases: [],
    block,
    category: 'pending',
    defaultMethod: 'none',
    order: maxOrder + 10,
  };
  items.push(created);
  newItems.push(created);
  return created;
}

const slotOrder = (p: Payslip): number => p.month * 10 + (p.kind === 'bonus' ? 0 : 5) + p.seq / 100;

export function planImport(
  parsed: readonly { fileName: string; slip: ParsedPayslip }[],
  existingItems: readonly ItemMaster[],
  existingPayslips: readonly Payslip[],
  existingLines: readonly PayslipLine[],
  newId: IdFactory,
  now: string,
): ImportPlan {
  const items = [...existingItems];
  const newItems: ItemMaster[] = [];
  const isSocial = (itemId: string, name: string): boolean => {
    const item = items.find((i) => i.id === itemId);
    if (item?.category === 'socialInsurance') return true;
    return (
      item?.category === 'pending' && DEFAULT_PAYSLIP_LAYOUT.socialInsuranceItems.includes(name)
    );
  };

  const planned: PlannedSlip[] = parsed.map(({ fileName, slip }) => {
    const sameSlot = existingPayslips.filter(
      (p) =>
        p.year === slip.year &&
        p.month === slip.month &&
        p.kind === slip.kind &&
        p.sourceFile !== fileName,
    );
    const replaced = existingPayslips.find(
      (p) =>
        p.year === slip.year &&
        p.month === slip.month &&
        p.kind === slip.kind &&
        p.sourceFile === fileName,
    );
    const payslip: Payslip = {
      id: replaced?.id ?? newId(),
      year: slip.year,
      month: slip.month,
      kind: slip.kind,
      seq: replaced?.seq ?? sameSlot.length + 1,
      cumulative: slip.cumulative,
      attendance: slip.attendance,
      remarks: slip.remarks,
      sourceFile: fileName,
      createdAt: now,
    };
    const lines = slip.lines.map((l) => ({
      id: newId(),
      payslipId: payslip.id,
      itemId: resolveItem(l.name, l.block, items, newItems, newId).id,
      amount: l.amount,
    }));
    const names = new Map(lines.map((l, i) => [l.itemId, slip.lines[i]?.name ?? '']));
    const checks = checkPayslip(slip, (name) => {
      const itemId = [...names].find(([, n]) => n === name)?.[0] ?? '';
      return isSocial(itemId, name);
    });
    return {
      fileName,
      payslip,
      lines,
      checks,
      cumulativeIssues: [],
      warnings: slip.warnings,
      ok: checks.every((c) => c.ok),
    };
  });

  applyCumulativeChecks(planned, items, existingPayslips, existingLines);
  return { slips: planned, newItems };
}

function applyCumulativeChecks(
  planned: PlannedSlip[],
  items: readonly ItemMaster[],
  existingPayslips: readonly Payslip[],
  existingLines: readonly PayslipLine[],
): void {
  const plannedIds = new Set(planned.map((p) => p.payslip.id));
  const category = (itemId: string): string | undefined =>
    items.find((i) => i.id === itemId)?.category;
  const linesOf = new Map<string, PayslipLine[]>();
  for (const l of existingLines) {
    if (plannedIds.has(l.payslipId)) continue;
    linesOf.set(l.payslipId, [...(linesOf.get(l.payslipId) ?? []), l]);
  }
  for (const p of planned) linesOf.set(p.payslip.id, p.lines);

  const all = [
    ...existingPayslips.filter((p) => !plannedIds.has(p.id)),
    ...planned.map((p) => p.payslip),
  ];
  const years = new Set(all.map((p) => p.year));
  for (const year of years) {
    const ordered = all.filter((p) => p.year === year).sort((a, b) => slotOrder(a) - slotOrder(b));
    const months = new Set(ordered.map((p) => p.month));
    const complete = [...months].length === Math.max(...months);
    const issues = checkCumulative(
      ordered.map((p) => {
        const lines = linesOf.get(p.id) ?? [];
        const sum = (cats: string[]): number =>
          lines
            .filter((l) => cats.includes(category(l.itemId) ?? ''))
            .reduce((a, l) => a + l.amount, 0);
        return {
          key: p.id,
          payment: lines.filter((l) => isPayLine(l, items)).reduce((a, l) => a + l.amount, 0),
          printed: p.cumulative,
          socialInsurance: sum(['socialInsurance']),
          incomeTax: sum(['incomeTax', 'yearEndAdjustment']),
        };
      }),
    );
    for (const issue of issues) {
      const target = planned.find((p) => p.payslip.id === issue.key);
      if (!target) continue;
      const note = complete ? '' : '（前の月の明細が未登録の可能性）';
      target.cumulativeIssues.push(
        `${issue.field}: 明細 ${issue.expected.toLocaleString()} ≠ 前月累計＋当月 ${issue.actual.toLocaleString()}${note}`,
      );
      target.ok = false;
    }
  }
}

function isPayLine(line: PayslipLine, items: readonly ItemMaster[]): boolean {
  return items.find((i) => i.id === line.itemId)?.block === 'payment';
}
