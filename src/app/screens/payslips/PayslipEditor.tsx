import { useState } from 'react';
import { newId, deletePayslip, savePayslip } from '../../../domain/repo';
import type { Payslip, PayslipKind, PayslipLine } from '../../../domain/types';
import { useAppData } from '../../state';
import {
  Button,
  EmptyState,
  Field,
  Money,
  Notice,
  Panel,
  Select,
  TableScroll,
  TD,
  TD_NUM,
  TH,
  YenInput,
  errorText,
} from '../../ui';

interface DraftLine {
  key: string;
  itemId: string;
  amount: number;
}

interface Draft {
  id: string | null;
  month: number;
  kind: PayslipKind;
  lines: DraftLine[];
}

const emptyDraft = (month: number): Draft => ({ id: null, month, kind: 'salary', lines: [] });

export function PayslipEditor() {
  const { db, year, payslips, lines, items } = useAppData();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState<{ level: 'error' | 'info'; text: string } | null>(null);
  const yearSlips = payslips
    .filter((p) => p.year === year)
    .sort((a, b) => a.month - b.month || (a.kind === 'bonus' ? -1 : 1) || a.seq - b.seq);
  const editable = items.filter((i) => i.block !== 'attendance');

  const linesOf = (id: string): PayslipLine[] => lines.filter((l) => l.payslipId === id);
  const toDraftLines = (src: PayslipLine[]): DraftLine[] =>
    src.map((l) => ({ key: newId(), itemId: l.itemId, amount: l.amount }));

  /** F-03: copy the latest salary slip before the chosen month. */
  const copyPrevious = (): void => {
    if (!draft) return;
    const prev = payslips
      .filter(
        (p) => p.kind === 'salary' && (p.year < year || (p.year === year && p.month < draft.month)),
      )
      .sort((a, b) => b.year - a.year || b.month - a.month)[0];
    if (!prev) {
      setMessage({ level: 'error', text: '前月以前の給与明細がありません' });
      return;
    }
    setDraft({ ...draft, lines: toDraftLines(linesOf(prev.id)) });
    setMessage({
      level: 'info',
      text: `${prev.year}年${prev.month}月の明細をコピーしました。差分だけ修正してください`,
    });
  };

  const save = async (): Promise<void> => {
    if (!draft) return;
    const valid = draft.lines.filter((l) => l.itemId && l.amount !== 0);
    if (valid.length === 0) {
      setMessage({ level: 'error', text: '金額のある行がありません' });
      return;
    }
    const existing = draft.id ? payslips.find((p) => p.id === draft.id) : undefined;
    const sameSlot = payslips.filter(
      (p) =>
        p.year === year && p.month === draft.month && p.kind === draft.kind && p.id !== draft.id,
    );
    const payslip: Payslip = {
      id: draft.id ?? newId(),
      year,
      month: draft.month,
      kind: draft.kind,
      seq: existing?.seq ?? sameSlot.length + 1,
      cumulative: existing?.cumulative ?? { payment: null, socialInsurance: null, incomeTax: null },
      attendance: existing?.attendance ?? [],
      remarks: existing?.remarks ?? [],
      sourceFile: existing?.sourceFile,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    try {
      await savePayslip(
        db,
        payslip,
        valid.map((l) => ({
          id: newId(),
          payslipId: payslip.id,
          itemId: l.itemId,
          amount: l.amount,
        })),
      );
      setDraft(null);
      setMessage({
        level: 'info',
        text: `${year}年${draft.month}月の${draft.kind === 'bonus' ? '賞与' : '給与'}明細を保存しました`,
      });
    } catch (e: unknown) {
      setMessage({ level: 'error', text: errorText(e) });
    }
  };

  const remove = async (p: Payslip): Promise<void> => {
    if (
      !window.confirm(
        `${p.year}年${p.month}月の${p.kind === 'bonus' ? '賞与' : '給与'}明細を削除します。よろしいですか？`,
      )
    )
      return;
    try {
      await deletePayslip(db, p.id);
    } catch (e: unknown) {
      setMessage({ level: 'error', text: errorText(e) });
    }
  };

  const updateLine = (key: string, patch: Partial<DraftLine>): void => {
    if (!draft) return;
    setDraft({ ...draft, lines: draft.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) });
  };

  const sumBlock = (
    block: 'payment' | 'deduction',
    src: { itemId: string; amount: number }[],
  ): number =>
    src
      .filter((l) => items.find((i) => i.id === l.itemId)?.block === block)
      .reduce((a, l) => a + l.amount, 0);

  return (
    <Panel
      title={`登録済みの明細（${yearSlips.length}件）`}
      aside={
        <Button
          variant="primary"
          onClick={() => setDraft(emptyDraft(Math.min(12, (yearSlips.at(-1)?.month ?? 0) + 1)))}
        >
          手入力で追加
        </Button>
      }
    >
      {message && (
        <div className="mb-3">
          <Notice level={message.level}>{message.text}</Notice>
        </div>
      )}
      {draft && (
        <div className="mb-4 space-y-3 rounded-xl border border-rule bg-paper p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="月">
              <Select
                value={draft.month}
                onChange={(e) => setDraft({ ...draft, month: Number(e.target.value) })}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m}月
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="種別">
              <Select
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as PayslipKind })}
              >
                <option value="salary">給与</option>
                <option value="bonus">賞与</option>
              </Select>
            </Field>
          </div>
          <div className="space-y-2">
            {draft.lines.map((l) => (
              <div key={l.key} className="grid grid-cols-[1fr_8rem_auto] items-center gap-2">
                <Select
                  value={l.itemId}
                  onChange={(e) => updateLine(l.key, { itemId: e.target.value })}
                  aria-label="項目"
                >
                  <option value="">項目を選択</option>
                  {editable.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.block === 'payment' ? '支給' : '控除'}：{i.name}
                    </option>
                  ))}
                </Select>
                <YenInput
                  value={l.amount}
                  onChange={(v) => updateLine(l.key, { amount: v })}
                  aria-label="金額"
                />
                <Button
                  variant="ghost"
                  aria-label="行を削除"
                  onClick={() =>
                    setDraft({ ...draft, lines: draft.lines.filter((x) => x.key !== l.key) })
                  }
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Button
              onClick={() =>
                setDraft({
                  ...draft,
                  lines: [...draft.lines, { key: newId(), itemId: '', amount: 0 }],
                })
              }
            >
              行を追加
            </Button>
            <Button onClick={copyPrevious}>前月をコピー</Button>
            <span className="self-center text-ink-soft">
              支給 <Money value={sumBlock('payment', draft.lines)} /> − 控除{' '}
              <Money value={sumBlock('deduction', draft.lines)} /> ＝ 差引{' '}
              <Money
                value={sumBlock('payment', draft.lines) - sumBlock('deduction', draft.lines)}
              />
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => void save()}>
              保存
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              キャンセル
            </Button>
          </div>
        </div>
      )}
      {yearSlips.length === 0 ? (
        <EmptyState>{year}年の明細はまだありません</EmptyState>
      ) : (
        <TableScroll>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TH}>対象</th>
                <th className={`${TH} text-right`}>支給合計</th>
                <th className={`${TH} text-right`}>控除合計</th>
                <th className={TH}>取込元</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {yearSlips.map((p) => {
                const ls = linesOf(p.id);
                return (
                  <tr key={p.id}>
                    <td className={TD}>
                      {p.month}月{p.kind === 'bonus' ? '賞与' : '給与'}
                      {p.seq > 1 ? `（${p.seq}）` : ''}
                    </td>
                    <td className={TD_NUM}>{sumBlock('payment', ls).toLocaleString()}</td>
                    <td className={TD_NUM}>{sumBlock('deduction', ls).toLocaleString()}</td>
                    <td className={`${TD} text-xs text-ink-soft`}>{p.sourceFile ?? '手入力'}</td>
                    <td className={`${TD} whitespace-nowrap text-right`}>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setDraft({
                            id: p.id,
                            month: p.month,
                            kind: p.kind,
                            lines: toDraftLines(ls),
                          })
                        }
                      >
                        編集
                      </Button>
                      <Button variant="ghost" onClick={() => void remove(p)}>
                        削除
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Panel>
  );
}
