// F-15〜F-17: medical expenses, linked reimbursements and deduction judgement.
import { useState } from 'react';
import { netOfReimbursement } from '../../engine';
import { deleteMedicalExpense, newId } from '../../domain/repo';
import {
  MEDICAL_CATEGORY_LABEL,
  REIMBURSEMENT_KIND_LABEL,
  type MedicalCategory,
  type MedicalExpense,
  type Reimbursement,
  type ReimbursementKind,
} from '../../domain/types';
import { useAppData } from '../state';
import { useAnnual } from '../useAnnual';
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Field,
  Money,
  Notice,
  Page,
  Panel,
  Select,
  Stat,
  TableScroll,
  TD,
  TD_NUM,
  TH,
  TextInput,
  YenInput,
  errorText,
} from '../ui';

const blank = (year: number, patientId: string): MedicalExpense => ({
  id: newId(),
  date: `${year}-01-01`,
  patientId,
  payee: '',
  category: 'treatment',
  amount: 0,
  source: 'manual',
  hasReceipt: true,
  isSelfMedicationEligible: false,
});

function groupSum(rows: { key: string; value: number }[]): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.key, (m.get(r.key) ?? 0) + r.value);
  return [...m].sort((a, b) => b[1] - a[1]);
}

export function MedicalScreen() {
  const { db, year, records } = useAppData();
  const { summary, error } = useAnnual();
  const [draft, setDraft] = useState<MedicalExpense | null>(null);
  const [reimb, setReimb] = useState<{
    expenseId: string;
    kind: ReimbursementKind;
    amount: number;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  if (error) return <Notice level="error">{error}</Notice>;
  if (!summary) return null;

  const setting = records.yearSettings.find((s) => s.year === year) ?? {
    year,
    hasHealthCheckup: false,
    selfIsSpeciallyDisabled: false,
  };
  const expenses = records.medicalExpenses
    .filter((e) => e.date.startsWith(`${year}-`))
    .sort((a, b) => a.date.localeCompare(b.date));
  const reimbursementsOf = (id: string): Reimbursement[] =>
    records.reimbursements.filter((r) => r.medicalExpenseId === id);
  const patientName = (id: string): string =>
    records.family.find((f) => f.id === id)?.name ?? (id === 'self' ? '本人' : '（削除済み）');
  const net = (e: MedicalExpense): number =>
    netOfReimbursement({
      amount: e.amount,
      reimbursements: reimbursementsOf(e.id).map((r) => r.amount),
      isSelfMedicationEligible: e.isSelfMedicationEligible,
    });
  const m = summary.estimate.medical;
  const patients = [
    { id: 'self', name: '本人' },
    ...records.family.map((f) => ({ id: f.id, name: f.name })),
  ];

  const save = async (): Promise<void> => {
    if (!draft) return;
    if (draft.amount <= 0 || !draft.payee.trim()) {
      setMessage('支払先と金額を入力してください');
      return;
    }
    try {
      await db.medicalExpenses.put(draft);
      setDraft(null);
      setMessage(null);
    } catch (e: unknown) {
      setMessage(errorText(e));
    }
  };

  const addReimbursement = async (): Promise<void> => {
    if (!reimb || reimb.amount <= 0) return;
    try {
      await db.reimbursements.put({
        id: newId(),
        medicalExpenseId: reimb.expenseId,
        kind: reimb.kind,
        amount: reimb.amount,
      });
      setReimb(null);
    } catch (e: unknown) {
      setMessage(errorText(e));
    }
  };

  return (
    <Page
      title={`${year}年の医療費`}
      lead="家族分をまとめて本人が申告する前提。補填額は支出ごとに紐づけ、他の医療費からは差し引きません。"
    >
      <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
        <Panel>
          <div className="grid grid-cols-2 gap-5">
            <Stat
              size="lg"
              label="医療費控除（採用）"
              tone={m.deduction > 0 ? 'refund' : 'neutral'}
              value={<Money value={m.deduction} />}
              note={
                m.method === 'selfMedication'
                  ? 'セルフメディケーション税制が有利'
                  : m.method === 'regular'
                    ? '通常の医療費控除'
                    : '控除なし'
              }
            />
            <Stat
              label="確定申告による還付見込み"
              tone="refund"
              value={<Money value={summary.estimate.finalReturnRefund} />}
            />
            <Stat label="補填後の医療費" value={<Money value={m.netExpenses} />} />
            <Stat
              label="足切り額"
              value={<Money value={m.floor} />}
              note={
                m.netExpenses > m.floor
                  ? `超過 ${(m.netExpenses - m.floor).toLocaleString()}円`
                  : `あと ${(m.floor - m.netExpenses).toLocaleString()}円で足切りを超えます`
              }
            />
          </div>
        </Panel>
        <Panel title="セルフメディケーションとの比較">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>通常の医療費控除</dt>
              <dd>
                <Money value={m.regular} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>セルフメディケーション</dt>
              <dd>
                <Money value={m.selfMedication} />
              </dd>
            </div>
          </dl>
          <div className="mt-3">
            <Checkbox
              label={`${year}年に健康診断・予防接種等を受けた（セルフメディケーションの要件）`}
              checked={setting.hasHealthCheckup}
              onChange={(v) => void db.yearSettings.put({ ...setting, hasHealthCheckup: v })}
            />
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            併用はできません。有利な方を自動で採用します。
          </p>
        </Panel>
      </div>
      {summary.estimate.shouldFileReturn &&
        records.donations.some((d) => d.date.startsWith(`${year}-`) && d.oneStop === 'applied') && (
          <Notice level="error">
            医療費控除で確定申告する場合、ワンストップ特例は無効になります。ふるさと納税の全寄付を申告に含めてください。
          </Notice>
        )}
      <Panel
        title="支出一覧"
        aside={
          <Button variant="primary" onClick={() => setDraft(blank(year, 'self'))}>
            支出を追加
          </Button>
        }
      >
        {message && <Notice level="error">{message}</Notice>}
        {draft && (
          <div className="mb-4 grid gap-3 rounded-sm border border-ink/30 bg-paper p-3 sm:grid-cols-3">
            <Field label="日付">
              <TextInput
                type="date"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </Field>
            <Field label="受診者">
              <Select
                value={draft.patientId}
                onChange={(e) => setDraft({ ...draft, patientId: e.target.value })}
              >
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="支払先">
              <TextInput
                value={draft.payee}
                onChange={(e) => setDraft({ ...draft, payee: e.target.value })}
              />
            </Field>
            <Field label="区分">
              <Select
                value={draft.category}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value as MedicalCategory })
                }
              >
                {(Object.keys(MEDICAL_CATEGORY_LABEL) as MedicalCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {MEDICAL_CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="金額">
              <YenInput value={draft.amount} onChange={(v) => setDraft({ ...draft, amount: v })} />
            </Field>
            <Field label="取得元">
              <Select
                value={draft.source}
                onChange={(e) =>
                  setDraft({ ...draft, source: e.target.value as MedicalExpense['source'] })
                }
              >
                <option value="manual">手入力</option>
                <option value="myna">マイナポータル</option>
              </Select>
            </Field>
            <div className="flex flex-col gap-2 sm:col-span-3">
              <Checkbox
                label="領収書を保管している"
                checked={draft.hasReceipt}
                onChange={(v) => setDraft({ ...draft, hasReceipt: v })}
              />
              <Checkbox
                label="セルフメディケーション税制の対象医薬品"
                checked={draft.isSelfMedicationEligible}
                onChange={(v) => setDraft({ ...draft, isSelfMedicationEligible: v })}
              />
            </div>
            <div className="flex gap-2 sm:col-span-3">
              <Button variant="primary" onClick={() => void save()}>
                保存
              </Button>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                キャンセル
              </Button>
            </div>
          </div>
        )}
        {expenses.length === 0 ? (
          <EmptyState>
            {year}年の医療費は未登録です（出産費用と出産育児一時金もここで登録します）
          </EmptyState>
        ) : (
          <TableScroll>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={TH}>日付</th>
                  <th className={TH}>受診者／支払先</th>
                  <th className={`${TH} text-right`}>金額</th>
                  <th className={TH}>補填</th>
                  <th className={`${TH} text-right`}>差引</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td className={`${TD} figures whitespace-nowrap`}>{e.date}</td>
                    <td className={TD}>
                      {patientName(e.patientId)}／{e.payee}
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        <Badge>{MEDICAL_CATEGORY_LABEL[e.category]}</Badge>
                        {e.isSelfMedicationEligible && (
                          <Badge tone="refund">セルフメディケーション対象</Badge>
                        )}
                        {!e.hasReceipt && <Badge tone="caution">領収書なし</Badge>}
                      </div>
                    </td>
                    <td className={TD_NUM}>{e.amount.toLocaleString()}</td>
                    <td className={TD}>
                      {reimbursementsOf(e.id).map((r) => (
                        <div key={r.id} className="flex items-center gap-1 text-xs">
                          {REIMBURSEMENT_KIND_LABEL[r.kind]}{' '}
                          <span className="figures">{r.amount.toLocaleString()}</span>
                          <button
                            type="button"
                            className="text-ink-soft hover:text-owed"
                            aria-label="補填を削除"
                            onClick={() => void db.reimbursements.delete(r.id)}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {reimb?.expenseId === e.id ? (
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <Select
                            value={reimb.kind}
                            onChange={(ev) =>
                              setReimb({ ...reimb, kind: ev.target.value as ReimbursementKind })
                            }
                            aria-label="補填の種類"
                          >
                            {(Object.keys(REIMBURSEMENT_KIND_LABEL) as ReimbursementKind[]).map(
                              (k) => (
                                <option key={k} value={k}>
                                  {REIMBURSEMENT_KIND_LABEL[k]}
                                </option>
                              ),
                            )}
                          </Select>
                          <span className="w-28">
                            <YenInput
                              value={reimb.amount}
                              onChange={(v) => setReimb({ ...reimb, amount: v })}
                              aria-label="補填額"
                            />
                          </span>
                          <Button onClick={() => void addReimbursement()}>追加</Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          onClick={() =>
                            setReimb({ expenseId: e.id, kind: 'insurance', amount: 0 })
                          }
                        >
                          ＋補填
                        </Button>
                      )}
                    </td>
                    <td className={TD_NUM}>{net(e).toLocaleString()}</td>
                    <td className={`${TD} whitespace-nowrap text-right`}>
                      <Button variant="ghost" onClick={() => setDraft(e)}>
                        編集
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          if (window.confirm('この支出と紐づく補填を削除しますか？'))
                            void deleteMedicalExpense(db, e.id);
                        }}
                      >
                        削除
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Panel>
      {expenses.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              [
                '受診者別',
                groupSum(expenses.map((e) => ({ key: patientName(e.patientId), value: net(e) }))),
              ],
              ['支払先別', groupSum(expenses.map((e) => ({ key: e.payee, value: net(e) })))],
            ] as const
          ).map(([title, rows]) => (
            <Panel key={title} title={`${title}（補填後）`}>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {rows.map(([k, v]) => (
                    <tr key={k}>
                      <td className={TD}>{k}</td>
                      <td className={TD_NUM}>{v.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          ))}
        </div>
      )}
    </Page>
  );
}
