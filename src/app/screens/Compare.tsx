import { useMemo, useState } from 'react';
import {
  compareCumulative,
  compareMonth,
  DEFAULT_THRESHOLD,
  latestActualMonth,
  type CompareRow,
} from '../../domain/compare';
import { actualAmounts, slotId } from '../../domain/ledger';
import type { PayslipKind } from '../../domain/types';
import { useAppData } from '../state';
import { useAnnual } from '../useAnnual';
import {
  EmptyState,
  Field,
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
            <tr key={r.item.id} className={r.exceedsThreshold ? 'bg-caution/10' : ''}>
              <td className={TD}>
                {r.item.name}
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

export function CompareScreen() {
  const { year, ledger, payslips } = useAppData();
  const { summary } = useAnnual();
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
  const chartItem =
    chartItems.find((i) => i.id === itemId) ??
    chartItems.find((i) => i.name === '時間外勤務手当') ??
    chartItems[0];
  const series = ((): TrendSeries[] => {
    if (!chartItem || !summary) return [];
    const current = Array.from({ length: 12 }, (_, i) => {
      const id = slotId({ month: i + 1, kind: 'salary' });
      return {
        month: i + 1,
        value: summary.table.cells.get(id)?.get(chartItem.id)?.amount ?? 0,
        isForecast: !summary.table.actualSlotIds.has(id),
      };
    });
    const previous = Array.from({ length: 12 }, (_, i) => {
      const a = actualAmounts(ledger, year - 1, { month: i + 1, kind: 'salary' });
      return { month: i + 1, value: a ? (a.get(chartItem.id) ?? 0) : null, isForecast: false };
    });
    const out: TrendSeries[] = [{ label: `${year}年`, color: THIS_YEAR_COLOR, points: current }];
    if (previous.some((p) => p.value !== null))
      out.push({ label: `${year - 1}年`, color: LAST_YEAR_COLOR, points: previous });
    return out;
  })();

  return (
    <Page
      title="比較"
      lead="前月比・前年同月比・年初からの累計比較。閾値を超えた項目を強調します。"
    >
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
              value={chartItem?.id ?? ''}
              onChange={(e) => setItemId(e.target.value)}
              aria-label="グラフの項目"
            >
              {chartItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>
          </span>
        }
      >
        {chartItem && series.length > 0 ? (
          <TrendChart title={chartItem.name} series={series} />
        ) : (
          <EmptyState>データがありません</EmptyState>
        )}
      </Panel>
    </Page>
  );
}
