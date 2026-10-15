// F-22 on the furusato screen: try income / medical / donation changes, save named results,
// and compare each saved result with the same inputs recomputed on today's data.
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { computeAnnual, NO_SCENARIO, type AnnualSummary, type Scenario } from '../../domain/annual';
import { newId } from '../../domain/repo';
import type { FurusatoScenarioRecord } from '../../domain/types';
import { useAppData } from '../state';
import { useAnnual } from '../useAnnual';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Notice,
  Panel,
  TableScroll,
  TD,
  TD_NUM,
  TH,
  TextInput,
  YenInput,
  errorText,
  yen,
} from '../ui';

function limitOf(s: AnnualSummary): number {
  return s.estimate.shouldFileReturn
    ? s.estimate.furusato.withMedical.limit
    : s.estimate.furusato.withoutMedical.limit;
}

function recommendedOf(s: AnnualSummary): number {
  const limit = s.estimate.shouldFileReturn
    ? s.estimate.furusato.withMedical
    : s.estimate.furusato.withoutMedical;
  return s.hasForecast ? limit.recommended : limit.limit;
}

const isEmpty = (s: Scenario): boolean =>
  s.extraTaxablePay === 0 && s.extraMedical === 0 && s.extraDonation === 0;

function describe(input: Scenario): string {
  const parts = [
    input.extraTaxablePay !== 0
      ? `課税支給 ${input.extraTaxablePay > 0 ? '+' : ''}${yen(input.extraTaxablePay)}`
      : '',
    input.extraMedical !== 0 ? `医療費 +${yen(input.extraMedical)}` : '',
    input.extraDonation !== 0 ? `寄付 +${yen(input.extraDonation)}` : '',
  ].filter(Boolean);
  return parts.length === 0 ? '仮置きなし（登録データのまま）' : parts.join('・');
}

export function FurusatoScenario({ base }: { base: AnnualSummary }) {
  const { db, year, ledger, records, overrides } = useAppData();
  const [scenario, setScenario] = useState<Scenario>(NO_SCENARIO);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<{ level: 'error' | 'info'; text: string } | null>(null);
  const { summary: alt } = useAnnual(scenario);
  const saved =
    useLiveQuery(
      () => db.furusatoScenarios.where('year').equals(year).sortBy('savedAt'),
      [db, year],
    ) ?? [];
  const changed = !isEmpty(scenario);
  const current = alt ?? base;

  const rows: [string, number, number][] = [
    ['上限額', limitOf(base), limitOf(current)],
    ['推奨寄付額', recommendedOf(base), recommendedOf(current)],
    ['残枠', base.furusatoRemaining, current.furusatoRemaining],
    ['年税額（年調ベース）', base.estimate.yearEnd.annualTax, current.estimate.yearEnd.annualTax],
  ];

  const save = async (): Promise<void> => {
    const leaveMonths = records.yearSettings.find((s) => s.year === year)?.leaveMonths ?? [];
    const record: FurusatoScenarioRecord = {
      id: newId(),
      year,
      name: name.trim() || `${new Date().toLocaleDateString('ja-JP')} の試算`,
      savedAt: new Date().toISOString(),
      input: { ...scenario },
      result: {
        limit: limitOf(current),
        recommended: recommendedOf(current),
        remaining: current.furusatoRemaining,
        annualTax: current.estimate.yearEnd.annualTax,
        salary: current.input.salary,
        donations: current.donationsTotal,
        leaveMonths: [...leaveMonths],
        hasForecast: current.hasForecast,
      },
    };
    try {
      await db.furusatoScenarios.add(record);
      setName('');
      setMessage({ level: 'info', text: `「${record.name}」を保存しました` });
    } catch (e: unknown) {
      setMessage({ level: 'error', text: errorText(e) });
    }
  };

  /** The same inputs evaluated on today's data (payslips, deductions, leave months may have changed). */
  const recompute = (r: FurusatoScenarioRecord): number | null => {
    try {
      return limitOf(computeAnnual(ledger, year, records, overrides, r.input));
    } catch {
      return null;
    }
  };

  return (
    <Panel
      title="試算（仮置き）"
      aside={
        <span className="text-xs text-ink-soft">
          確定した予定は給与明細画面の休業月・手入力で登録
        </span>
      }
    >
      {message && <Notice level={message.level}>{message.text}</Notice>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label="課税支給の増減"
          hint="予測（休業月を含む）に対する増減。休業月の分はすでに0なので入れない"
        >
          <YenInput
            value={scenario.extraTaxablePay}
            onChange={(v) => setScenario({ ...scenario, extraTaxablePay: v })}
          />
        </Field>
        <Field label="追加の医療費" hint="出産費用など（補填後）">
          <YenInput
            value={scenario.extraMedical}
            onChange={(v) => setScenario({ ...scenario, extraMedical: v })}
          />
        </Field>
        <Field label="追加の寄付">
          <YenInput
            value={scenario.extraDonation}
            onChange={(v) => setScenario({ ...scenario, extraDonation: v })}
          />
        </Field>
      </div>
      <TableScroll>
        <table className="mt-3 w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={TH}>指標</th>
              <th className={`${TH} text-right`}>登録データ</th>
              <th className={`${TH} text-right`}>仮置き後</th>
              <th className={`${TH} text-right`}>差</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, now, next]) => (
              <tr key={label}>
                <td className={TD}>{label}</td>
                <td className={TD_NUM}>{yen(now)}</td>
                <td className={TD_NUM}>{changed ? yen(next) : '—'}</td>
                <td className={`${TD_NUM} font-bold`}>
                  {changed ? `${next - now > 0 ? '+' : ''}${yen(next - now)}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Field label="この試算に名前をつけて保存">
            <TextInput
              value={name}
              placeholder="例：冬賞与なし・出産費用込み"
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        </div>
        <Button variant="primary" onClick={() => void save()}>
          保存
        </Button>
        {changed && (
          <Button variant="ghost" onClick={() => setScenario(NO_SCENARIO)}>
            仮置きをクリア
          </Button>
        )}
      </div>

      <h3 className="mt-6 text-sm font-bold">保存した試算（{year}年）</h3>
      {saved.length === 0 ? (
        <EmptyState>保存した試算はまだありません</EmptyState>
      ) : (
        <TableScroll>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TH}>名前・条件</th>
                <th className={`${TH} text-right`}>保存時の上限</th>
                <th className={`${TH} text-right`}>今のデータでの上限</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {[...saved].reverse().map((r) => {
                const now = recompute(r);
                return (
                  <tr key={r.id}>
                    <td className={TD}>
                      <div className="font-semibold">{r.name}</div>
                      <div className="text-xs text-ink-soft">
                        {new Date(r.savedAt).toLocaleString('ja-JP')}・{describe(r.input)}
                        {r.result.leaveMonths.length > 0 &&
                          `・休業 ${r.result.leaveMonths.map((m) => `${m}月`).join('')}`}
                      </div>
                      <div className="text-xs text-ink-soft">
                        給与収入 {yen(r.result.salary)}・年税額 {yen(r.result.annualTax)}・推奨{' '}
                        {yen(r.result.recommended)}・残枠 {yen(r.result.remaining)}
                      </div>
                    </td>
                    <td className={TD_NUM}>{yen(r.result.limit)}</td>
                    <td className={TD_NUM}>
                      {now === null ? '—' : yen(now)}
                      {now !== null && now !== r.result.limit && (
                        <div>
                          <Badge tone="caution">
                            データ更新で{now > r.result.limit ? '+' : ''}
                            {yen(now - r.result.limit)}
                          </Badge>
                        </div>
                      )}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-right`}>
                      <Button variant="ghost" onClick={() => setScenario({ ...r.input })}>
                        読み込む
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          if (window.confirm(`「${r.name}」を削除しますか？`))
                            void db.furusatoScenarios.delete(r.id);
                        }}
                      >
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
