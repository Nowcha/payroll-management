// F-18〜F-20: upper limit, donation ledger, remaining room and warnings.
import { useState } from 'react';
import { furusatoWarnings } from '../../domain/annual';
import { newId } from '../../domain/repo';
import type { FurusatoDonation } from '../../domain/types';
import { useAppData } from '../state';
import { useAnnual } from '../useAnnual';
import { FurusatoScenario } from './FurusatoScenario';
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
  Meter,
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
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="rounded-3xl border border-rule bg-surface p-5 shadow-[var(--shadow-card)] sm:p-7">
          <Stat
            size="lg"
            label="残枠"
            tone={summary.furusatoRemaining >= 0 ? 'accent' : 'owed'}
            value={<Money value={summary.furusatoRemaining} />}
          />
          <div className="mt-5">
            <Meter
              value={summary.donationsTotal}
              max={active.limit}
              tone={summary.furusatoRemaining < 0 ? 'owed' : 'accent'}
            />
          </div>
          <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-rule pt-5">
            <Stat
              size="sm"
              label="上限額"
              value={<Money value={active.limit} />}
              note={filing ? '医療費控除あり' : '医療費控除なし'}
            />
            <Stat
              size="sm"
              label="寄付済み"
              value={<Money value={summary.donationsTotal} />}
              note={`${donations.length}件`}
            />
            <Stat
              size="sm"
              label="推奨寄付額"
              value={<Money value={summary.hasForecast ? active.recommended : active.limit} />}
              note={summary.hasForecast ? '予測を含むため90%' : '全月実績'}
            />
          </dl>
        </section>
        <Panel
          title="医療費控除による違い"
          description="医療費控除を使うと住民税の所得割が下がり、上限も下がります"
        >
          <dl className="divide-y divide-rule text-sm">
            {(
              [
                ['医療費控除なし', <Money key="a" value={withoutMedical.limit} />],
                ['医療費控除あり', <Money key="b" value={withMedical.limit} />],
                ['所得割額（なし）', <Money key="c" value={withoutMedical.incomeLevy} />],
                [
                  '限界税率',
                  <span key="d" className="figures">
                    {(withoutMedical.marginalRate * 100).toFixed(0)}%
                  </span>,
                ],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex items-center justify-between py-2">
                <dt className="text-ink-soft">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
      {warnings.map((w) => (
        <Notice key={w.message} level={w.level}>
          {w.message}
        </Notice>
      ))}
      <FurusatoScenario base={summary} />
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
          <div className="mb-4 grid gap-3 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-3">
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
