// F-18〜F-20: upper limit, donation ledger, remaining room and warnings.
import { useState } from 'react';
import { furusatoWarnings } from '../../domain/annual';
import { newId } from '../../domain/repo';
import type { FurusatoDonation } from '../../domain/types';
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

const blank = (year: number): FurusatoDonation => ({
  id: newId(),
  date: `${year}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`,
  municipality: '',
  amount: 0,
  portal: '',
  gift: '',
  receiptReceived: false,
  oneStop: 'none',
});

export function FurusatoScreen() {
  const { db, year, records } = useAppData();
  const { summary, error } = useAnnual();
  const [draft, setDraft] = useState<FurusatoDonation | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  if (error) return <Notice level="error">{error}</Notice>;
  if (!summary) return null;
  const { withoutMedical, withMedical } = summary.estimate.furusato;
  const filing = summary.estimate.shouldFileReturn;
  const active = filing ? withMedical : withoutMedical;
  const donations = records.donations
    .filter((d) => d.date.startsWith(`${year}-`))
    .sort((a, b) => a.date.localeCompare(b.date));
  const warnings = furusatoWarnings(
    records.donations,
    year,
    filing,
    new Date().toISOString().slice(0, 10),
  );

  const save = async (): Promise<void> => {
    if (!draft) return;
    if (
      !draft.municipality.trim() ||
      draft.amount <= 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)
    ) {
      setMessage('日付・自治体・金額を入力してください');
      return;
    }
    try {
      await db.donations.put(draft);
      setDraft(null);
      setMessage(null);
    } catch (e: unknown) {
      setMessage(errorText(e));
    }
  };

  const update = (d: FurusatoDonation, patch: Partial<FurusatoDonation>): void => {
    void db.donations.put({ ...d, ...patch }).catch((e: unknown) => setMessage(errorText(e)));
  };

  return (
    <Page
      title={`${year}年のふるさと納税`}
      lead="上限は実績＋予測の年収と登録済みの控除から算出。年分は寄付日で判定します。"
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Panel className="md:col-span-2">
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Stat
              size="lg"
              label="残枠"
              tone={summary.furusatoRemaining >= 0 ? 'refund' : 'owed'}
              value={<Money value={summary.furusatoRemaining} />}
            />
            <Stat
              label="上限額"
              value={<Money value={active.limit} />}
              note={filing ? '医療費控除ありの上限' : '医療費控除なしの上限'}
            />
            <Stat
              label="寄付済み"
              value={<Money value={summary.donationsTotal} />}
              note={`${donations.length}件`}
            />
            <Stat
              label="推奨寄付額"
              value={<Money value={summary.hasForecast ? active.recommended : active.limit} />}
              note={summary.hasForecast ? '予測を含むため上限の90%' : ''}
            />
          </div>
        </Panel>
        <Panel title="医療費控除による違い">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>医療費控除なし</dt>
              <dd>
                <Money value={withoutMedical.limit} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>医療費控除あり</dt>
              <dd>
                <Money value={withMedical.limit} />
              </dd>
            </div>
            <div className="flex justify-between text-ink-soft">
              <dt>所得割額（なし）</dt>
              <dd>
                <Money value={withoutMedical.incomeLevy} />
              </dd>
            </div>
            <div className="flex justify-between text-ink-soft">
              <dt>限界税率</dt>
              <dd className="figures">{(withoutMedical.marginalRate * 100).toFixed(0)}%</dd>
            </div>
          </dl>
        </Panel>
      </div>
      {warnings.map((w) => (
        <Notice key={w.message} level={w.level}>
          {w.message}
        </Notice>
      ))}
      <Panel
        title="寄付一覧"
        aside={
          <Button variant="primary" onClick={() => setDraft(blank(year))}>
            寄付を追加
          </Button>
        }
      >
        {message && <Notice level="error">{message}</Notice>}
        {draft && (
          <div className="mb-4 grid gap-3 rounded-sm border border-ink/30 bg-paper p-3 sm:grid-cols-3">
            <Field label="寄付日">
              <TextInput
                type="date"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </Field>
            <Field label="自治体">
              <TextInput
                value={draft.municipality}
                onChange={(e) => setDraft({ ...draft, municipality: e.target.value })}
              />
            </Field>
            <Field label="金額">
              <YenInput value={draft.amount} onChange={(v) => setDraft({ ...draft, amount: v })} />
            </Field>
            <Field label="ポータル">
              <TextInput
                value={draft.portal}
                onChange={(e) => setDraft({ ...draft, portal: e.target.value })}
              />
            </Field>
            <Field label="返礼品">
              <TextInput
                value={draft.gift}
                onChange={(e) => setDraft({ ...draft, gift: e.target.value })}
              />
            </Field>
            <Field label="ワンストップ申請">
              <Select
                value={draft.oneStop}
                onChange={(e) =>
                  setDraft({ ...draft, oneStop: e.target.value as FurusatoDonation['oneStop'] })
                }
              >
                <option value="none">未申請</option>
                <option value="applied">申請済み</option>
              </Select>
            </Field>
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
        {donations.length === 0 ? (
          <EmptyState>{year}年の寄付はまだありません</EmptyState>
        ) : (
          <TableScroll>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={TH}>寄付日</th>
                  <th className={TH}>自治体</th>
                  <th className={`${TH} text-right`}>金額</th>
                  <th className={TH}>返礼品</th>
                  <th className={TH}>受領証明書</th>
                  <th className={TH}>ワンストップ</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody>
                {donations.map((d) => (
                  <tr key={d.id}>
                    <td className={`${TD} figures whitespace-nowrap`}>{d.date}</td>
                    <td className={TD}>
                      {d.municipality}
                      <div className="text-xs text-ink-soft">{d.portal}</div>
                    </td>
                    <td className={TD_NUM}>{d.amount.toLocaleString()}</td>
                    <td className={TD}>{d.gift}</td>
                    <td className={TD}>
                      <Checkbox
                        label="受領"
                        checked={d.receiptReceived}
                        onChange={(v) => update(d, { receiptReceived: v })}
                      />
                    </td>
                    <td className={TD}>
                      {d.oneStop === 'applied' ? (
                        <Badge tone="refund">申請済{d.appliedOn ? ` ${d.appliedOn}` : ''}</Badge>
                      ) : (
                        <Button
                          variant="secondary"
                          onClick={() =>
                            update(d, {
                              oneStop: 'applied',
                              appliedOn: new Date().toISOString().slice(0, 10),
                            })
                          }
                        >
                          申請済みにする
                        </Button>
                      )}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-right`}>
                      <Button variant="ghost" onClick={() => setDraft(d)}>
                        編集
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          if (window.confirm('この寄付を削除しますか？'))
                            void db.donations.delete(d.id);
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
    </Page>
  );
}
