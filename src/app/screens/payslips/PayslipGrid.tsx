import { useState } from 'react';
import type { Cell, YearTable } from '../../../domain/forecast';
import { slotId, type SlotKey } from '../../../domain/ledger';
import { newId } from '../../../domain/repo';
import { TAX_CATEGORY_LABEL, type ItemMaster } from '../../../domain/types';
import { useAppData } from '../../state';
import { Button, Money, Panel, TableScroll, TD_NUM, TH, YenInput, errorText, yen } from '../../ui';

const slotLabel = (s: SlotKey): string =>
  s.kind === 'bonus' ? `${s.month}月賞与` : `${s.month}月`;

const METHOD_LABEL: Record<string, string> = {
  recent: '直近月',
  avg3: '3か月平均',
  lastYear: '前年同月',
  fixed: '固定額',
  taxRate: '源泉税率',
  yearEnd: '年調見込み',
  standardRemuneration: '標準報酬（F-11）',
};

interface Selected {
  slot: SlotKey;
  item: ItemMaster;
  cell: Cell | undefined;
}

export function PayslipGrid({ table }: { table: YearTable }) {
  const { db, ledger, overrides, year } = useAppData();
  const [selected, setSelected] = useState<Selected | null>(null);
  const [draft, setDraft] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const rows = ledger.items.filter(
    (item) =>
      item.block !== 'attendance' &&
      table.slots.some((s) => (table.cells.get(slotId(s))?.get(item.id)?.amount ?? 0) !== 0),
  );
  const totalOf = (item: ItemMaster): number =>
    table.slots.reduce((a, s) => a + (table.cells.get(slotId(s))?.get(item.id)?.amount ?? 0), 0);

  const select = (slot: SlotKey, item: ItemMaster, cell: Cell | undefined): void => {
    if (table.actualSlotIds.has(slotId(slot))) return;
    setSelected({ slot, item, cell });
    setDraft(cell?.amount ?? 0);
    setMessage(null);
  };

  const existing = selected
    ? overrides.find(
        (o) =>
          o.year === year &&
          o.month === selected.slot.month &&
          o.kind === selected.slot.kind &&
          o.itemId === selected.item.id,
      )
    : undefined;

  const saveOverride = async (): Promise<void> => {
    if (!selected) return;
    try {
      await db.forecastOverrides.put({
        id: existing?.id ?? newId(),
        year,
        month: selected.slot.month,
        kind: selected.slot.kind,
        itemId: selected.item.id,
        amount: draft,
      });
      setSelected(null);
    } catch (e: unknown) {
      setMessage(errorText(e));
    }
  };

  const clearOverride = async (): Promise<void> => {
    if (!existing) return;
    try {
      await db.forecastOverrides.delete(existing.id);
      setSelected(null);
    } catch (e: unknown) {
      setMessage(errorText(e));
    }
  };

  return (
    <Panel
      title="項目 × 月"
      aside={
        <span className="flex items-center gap-2 text-xs text-ink-soft">
          <span className="forecast-cell inline-block h-3 w-5 border border-rule" />
          網掛け＝予測（クリックで手入力）
        </span>
      }
    >
      <TableScroll>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={`${TH} sticky left-0 z-[1] bg-white`}>項目</th>
              {table.slots.map((s) => (
                <th key={slotId(s)} className={`${TH} text-right`}>
                  {slotLabel(s)}
                  {table.leaveSlotIds.has(slotId(s)) && (
                    <span className="ml-0.5 text-owed">休</span>
                  )}
                </th>
              ))}
              <th className={`${TH} text-right`}>年合計</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <th
                  scope="row"
                  className="sticky left-0 z-[1] border-b border-rule bg-white px-2 py-1 text-left font-normal whitespace-nowrap"
                >
                  {item.name}
                  <span className="ml-1 text-[10px] text-ink-soft">
                    {TAX_CATEGORY_LABEL[item.category]}
                  </span>
                </th>
                {table.slots.map((s) => {
                  const cell = table.cells.get(slotId(s))?.get(item.id);
                  const isActual = table.actualSlotIds.has(slotId(s));
                  const isLeave = table.leaveSlotIds.has(slotId(s));
                  return (
                    <td
                      key={slotId(s)}
                      className={`${TD_NUM} ${isActual ? '' : `${isLeave ? 'bg-owed-soft/70' : 'forecast-cell'} cursor-pointer hover:outline hover:outline-1 hover:outline-ink`} ${cell?.source === 'override' ? 'font-bold' : ''}`}
                      title={
                        cell?.method
                          ? `予測：${METHOD_LABEL[cell.method] ?? cell.method}`
                          : cell?.source === 'override'
                            ? '手入力の予測'
                            : undefined
                      }
                      onClick={() => select(s, item, cell)}
                    >
                      {cell ? yen(cell.amount) : ''}
                    </td>
                  );
                })}
                <td className={`${TD_NUM} font-bold`}>{yen(totalOf(item))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      {selected && (
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-rule pt-3">
          <div className="text-sm">
            <div className="font-bold">
              {slotLabel(selected.slot)}・{selected.item.name}
            </div>
            <div className="text-xs text-ink-soft">
              現在の予測：{selected.cell ? <Money value={selected.cell.amount} /> : 'なし'}
            </div>
          </div>
          <div className="w-40">
            <YenInput value={draft} onChange={setDraft} aria-label="手入力の予測額" />
          </div>
          <Button variant="primary" onClick={() => void saveOverride()}>
            手入力で保存
          </Button>
          {existing && (
            <Button variant="danger" onClick={() => void clearOverride()}>
              手入力を解除
            </Button>
          )}
          <Button variant="ghost" onClick={() => setSelected(null)}>
            閉じる
          </Button>
          {message && <p className="w-full text-sm text-owed">{message}</p>}
        </div>
      )}
    </Panel>
  );
}
