import { useMemo, useState } from 'react';
import {
  compareCumulative,
  compareMonth,
  DEFAULT_THRESHOLD,
  latestActualMonth,
  type CompareRow,
} from '../../domain/compare';
import { NO_SCENARIO } from '../../domain/annual';
import type { Cell } from '../../domain/forecast';
import { actualAmounts, slotId, type Amounts } from '../../domain/ledger';
import { payOf, type PayBreakdown, type TakeHome } from '../../domain/takeHome';
import type { PayslipKind } from '../../domain/types';
import { useAppData } from '../state';
import { useAnnual } from '../useAnnual';
import {
  EmptyState,
  Field,
  Money,
  Notice,
  Page,
  Panel,
  Select,
  TableScroll,
  TD,
  TD_NUM,
  TH,
  TextInput,
  yen,
} from '../ui';
import { TrendChart, type TrendSeries } from './TrendChart';

// Validated with the dataviz palette checker on both surfaces (light #00876f/#b8711f, dark #2fa98a/#b57b36).
const THIS_YEAR_COLOR = 'var(--color-series-1)';
const LAST_YEAR_COLOR = 'var(--color-series-2)';

function CompareTable({ rows, baseLabel }: { rows: CompareRow[]; baseLabel: string }) {
  if (rows.length === 0) return <EmptyState>比較できる実績がありません</EmptyState>;
  return (
    <TableScroll>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={TH}>項目</th>
            <th className={`${TH} text-right`}>当期</th>
            <th className={`${TH} text-right`}>{baseLabel}</th>
            <th className={`${TH} text-right`}>差額</th>
            <th className={`${TH} text-right`}>増減率</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.key}
              className={
                r.isTotal
                  ? r.key === 'total:net'
                    ? 'bg-accent-soft/60 font-semibold'
                    : 'bg-paper-deep/60 font-medium'
                  : r.exceedsThreshold
                    ? 'bg-caution/10'
                    : ''
              }
            >
              <td className={`${TD} whitespace-nowrap`}>
                {r.label}
                {r.exceedsThreshold && (
                  <span className="ml-1 text-[10px] font-bold text-owed">閾値超</span>
                )}
              </td>
              <td className={TD_NUM}>{yen(r.current)}</td>
              <td className={TD_NUM}>{yen(r.base)}</td>
              <td className={TD_NUM}>
                {r.diff > 0 ? '+' : ''}
                {yen(r.diff)}
              </td>
              <td className={TD_NUM}>
                {r.rate === null ? '—' : `${r.rate > 0 ? '+' : ''}${(r.rate * 100).toFixed(1)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

const PAY_SERIES: readonly { id: string; key: keyof PayBreakdown; name: string }[] = [
  { id: 'total:net', key: 'net', name: '差引支給額（手取り）' },
  { id: 'total:gross', key: 'gross', name: '支給合計' },
  { id: 'total:deductions', key: 'deductions', name: '控除合計' },
];

const ANNUAL_ROWS: readonly { key: keyof TakeHome; label: string; strong?: boolean }[] = [
  { key: 'gross', label: '支給合計' },
  { key: 'deductions', label: '控除合計' },
  { key: 'net', label: '手取り（差引支給額の合計）' },
  { key: 'otherDeductions', label: 'うち天引き（持株・保険など）' },
  { key: 'finalReturnRefund', label: '確定申告での還付見込み' },
  { key: 'finalNet', label: '最終的な手取り', strong: true },
];

function AnnualTakeHome({
  year,
  current,
  previous,
}: {
  year: number;
  current: TakeHome;
  previous: TakeHome | null;
}) {
  return (
    <TableScroll>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={TH}>項目</th>
            <th className={`${TH} text-right`}>{year}年</th>
            {previous && <th className={`${TH} text-right`}>{year - 1}年</th>}
            {previous && <th className={`${TH} text-right`}>差額</th>}
          </tr>
        </thead>
        <tbody>
          {ANNUAL_ROWS.map((r) => {
            const diff = previous ? current[r.key] - previous[r.key] : 0;
            return (
              <tr key={r.key} className={r.strong ? 'bg-accent-soft/60 font-semibold' : ''}>
                <td className={TD}>{r.label}</td>
                <td className={TD_NUM}>{yen(current[r.key])}</td>
                {previous && <td className={TD_NUM}>{yen(previous[r.key])}</td>}
                {previous && (
                  <td className={TD_NUM}>
                    {diff > 0 ? '+' : ''}
                    {yen(diff)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableScroll>
  );
}

export function CompareScreen() {
  const { year, ledger, payslips } = useAppData();
  const { summary } = useAnnual();
  const { summary: lastYear } = useAnnual(NO_SCENARIO, year - 1);
  const latest = latestActualMonth(ledger, year);
  const [month, setMonth] = useState(0);
  const [kind, setKind] = useState<PayslipKind>('salary');
  const [thresholdPct, setThresholdPct] = useState(DEFAULT_THRESHOLD * 100);
  const [itemId, setItemId] = useState('');
  const targetMonth = month || latest || 1;
  const threshold = Math.max(0, thresholdPct) / 100;
  const bonusMonths = payslips
    .filter((p) => p.year === year && p.kind === 'bonus')
    .map((p) => p.month);

  const monthCmp = useMemo(
    () => compareMonth(ledger, year, { month: targetMonth, kind }, threshold),
    [ledger, year, targetMonth, kind, threshold],
  );
  const cumulative = useMemo(
    () => compareCumulative(ledger, year, targetMonth, threshold),
    [ledger, year, targetMonth, threshold],
  );

  const chartItems = ledger.items.filter((i) => i.block !== 'attendance');
  const chartOptions = [
    ...PAY_SERIES.map((p) => ({ id: p.id, name: p.name })),
    ...chartItems.map((i) => ({ id: i.id, name: i.name })),
  ];
  const chartOption = chartOptions.find((o) => o.id === itemId) ?? chartOptions[0];
  const valueOf = (amounts: Amounts | Map<string, Cell> | undefined): number => {
    if (!chartOption) return 0;
    const pay = PAY_SERIES.find((p) => p.id === chartOption.id);
    if (pay) return payOf(ledger, amounts)[pay.key];
    const v = amounts?.get(chartOption.id);
    return typeof v === 'number' ? v : (v?.amount ?? 0);
  };
  const series = ((): TrendSeries[] => {
    if (!chartOption || !summary) return [];
    const current = Array.from({ length: 12 }, (_, i) => {
      const id = slotId({ month: i + 1, kind: 'salary' });
      return {
        month: i + 1,
        value: valueOf(summary.table.cells.get(id)),
        isForecast: !summary.table.actualSlotIds.has(id),
      };
    });
    const previous = Array.from({ length: 12 }, (_, i) => {
      const a = actualAmounts(ledger, year - 1, { month: i + 1, kind: 'salary' });
      return { month: i + 1, value: a ? valueOf(a) : null, isForecast: false };
    });
    const out: TrendSeries[] = [{ label: `${year}年`, color: THIS_YEAR_COLOR, points: current }];
    if (previous.some((p) => p.value !== null))
      out.push({ label: `${year - 1}年`, color: LAST_YEAR_COLOR, points: previous });
    return out;
  })();

  return (
    <Page
      title="比較"
      lead="前月比・前年同月比・年初からの累計比較と、年間の手取り。閾値を超えた項目を強調します。"
    >
      {summary && (
        <Panel
          title="年間の手取り"
          description={`${year}年は${summary.hasForecast ? '実績＋予測（12月の年調見込みを含む）' : '全月実績'}。最終的な手取り＝差引支給額の年合計＋確定申告の還付`}
          aside={
            <span className="text-right">
              <span className="block text-[11px] text-ink-soft">最終的な手取り</span>
              <span className="text-lg font-semibold">
                <Money value={summary.takeHome.finalNet} />
              </span>
            </span>
          }
        >
          <AnnualTakeHome
            year={year}
            current={summary.takeHome}
            previous={lastYear?.takeHome ?? null}
          />
        </Panel>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="対象月">
          <Select value={targetMonth} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}月
              </option>
            ))}
          </Select>
        </Field>
        <Field label="種別">
          <Select value={kind} onChange={(e) => setKind(e.target.value as PayslipKind)}>
            <option value="salary">給与</option>
            <option value="bonus" disabled={!bonusMonths.includes(targetMonth)}>
              賞与
            </option>
          </Select>
        </Field>
        <Field label="強調する増減率（%）">
          <TextInput
            type="number"
            min={0}
            value={thresholdPct}
            onChange={(e) => setThresholdPct(Number(e.target.value))}
          />
        </Field>
      </div>
      {monthCmp.notes.map((n) => (
        <Notice key={n} level="warn">
          {n}。2025年分の「前年同月実績」予測からは除外し、直近平均を使います
        </Notice>
      ))}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={kind === 'bonus' ? '前年の賞与比' : '前月比'}>
          <CompareTable
            rows={monthCmp.vsPreviousMonth}
            baseLabel={kind === 'bonus' ? '前年' : '前月'}
          />
        </Panel>
        <Panel title="前年同月比">
          <CompareTable rows={monthCmp.vsLastYear} baseLabel="前年同月" />
        </Panel>
      </div>
      <Panel title={`累計比較（1〜${targetMonth}月の実績、前年同期比）`}>
        <CompareTable rows={cumulative} baseLabel="前年同期" />
      </Panel>
      <Panel
        title="推移グラフ"
        aside={
          <span className="w-48">
            <Select
              value={chartOption?.id ?? ''}
              onChange={(e) => setItemId(e.target.value)}
              aria-label="グラフの項目"
            >
              <optgroup label="集計">
                {PAY_SERIES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="明細の項目">
                {chartItems.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </optgroup>
            </Select>
          </span>
        }
      >
        {chartOption && series.length > 0 ? (
          <TrendChart title={chartOption.name} series={series} />
        ) : (
          <EmptyState>データがありません</EmptyState>
        )}
      </Panel>
    </Page>
  );
}
