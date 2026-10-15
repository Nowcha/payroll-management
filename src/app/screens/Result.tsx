// F-21: calculation steps with provenance. F-22: scenario comparison.
import { useState } from 'react';
import type { Step } from '../../engine';
import { NO_SCENARIO, type Scenario } from '../../domain/annual';
import { slotId } from '../../domain/ledger';
import { useAppData } from '../state';
import { useAnnual } from '../useAnnual';
import {
  Badge,
  Field,
  Notice,
  Page,
  Panel,
  TableScroll,
  TD,
  TD_NUM,
  TH,
  YenInput,
  yen,
} from '../ui';

function StepTable({ steps }: { steps: Step[] }) {
  return (
    <TableScroll>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={TH}>段階</th>
            <th className={TH}>式</th>
            <th className={`${TH} text-right`}>金額</th>
            <th className={TH}>根拠</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s, i) => (
            <tr key={`${s.label}-${i}`}>
              <td className={`${TD} whitespace-nowrap font-semibold`}>{s.label}</td>
              <td className={`${TD} figures text-xs text-ink-soft`}>{s.formula}</td>
              <td className={TD_NUM}>{yen(s.value)}</td>
              <td className={TD}>
                {s.params?.map((p) => (
                  <a
                    key={p.name}
                    href={p.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mr-1 inline-block hover:underline"
                  >
                    <Badge tone={p.status === '確認済' ? 'neutral' : 'caution'}>
                      {p.name}（{p.status}）
                    </Badge>
                  </a>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

export function ResultScreen() {
  const { year, ledger } = useAppData();
  const base = useAnnual();
  const [scenario, setScenario] = useState<Scenario>(NO_SCENARIO);
  const alt = useAnnual(scenario);
  if (base.error) return <Notice level="error">{base.error}</Notice>;
  if (!base.summary || !alt.summary) return null;
  const s = base.summary;

  const payBySource = { actual: 0, forecast: 0, override: 0 };
  for (const slot of s.table.slots) {
    for (const [itemId, cell] of s.table.cells.get(slotId(slot)) ?? []) {
      if (ledger.itemById.get(itemId)?.category === 'taxablePay')
        payBySource[cell.source] += cell.amount;
    }
  }
  const changed =
    scenario.extraTaxablePay !== 0 || scenario.extraDonation !== 0 || scenario.extraMedical !== 0;
  const compareRows: [string, number, number][] = [
    ['年税額（年調ベース）', s.estimate.yearEnd.annualTax, alt.summary.estimate.yearEnd.annualTax],
    ['年末調整の過不足', s.estimate.yearEndBalance, alt.summary.estimate.yearEndBalance],
    [
      '確定申告による還付見込み',
      s.estimate.finalReturnRefund,
      alt.summary.estimate.finalReturnRefund,
    ],
    [
      'ふるさと上限',
      s.estimate.furusato.withoutMedical.limit,
      alt.summary.estimate.furusato.withoutMedical.limit,
    ],
    ['ふるさと残枠', s.furusatoRemaining, alt.summary.furusatoRemaining],
  ];

  return (
    <Page
      title={`${year}年分の試算結果`}
      lead="年末調整ベースと確定申告ベースの2回計算し、差を還付見込みとします。"
    >
      {s.estimate.unconfirmed.length > 0 && (
        <Notice level="warn">
          要確認の税制パラメータを使っています：
          {s.estimate.unconfirmed.map((p) => p.name).join('、')}
        </Notice>
      )}
      <Panel title="給与収入の出所">
        <div className="flex flex-wrap gap-6 text-sm">
          <span>
            実績 <strong className="figures">{yen(payBySource.actual)}</strong>円
          </span>
          <span>
            予測 <strong className="figures">{yen(payBySource.forecast)}</strong>円
          </span>
          <span>
            手入力の予測 <strong className="figures">{yen(payBySource.override)}</strong>円
          </span>
        </div>
      </Panel>
      <Panel title="① 年末調整ベース（所得税）">
        <StepTable steps={s.estimate.steps.yearEnd} />
      </Panel>
      <Panel title="② 確定申告ベース（医療費控除・寄附金控除を追加）">
        <StepTable steps={s.estimate.steps.finalReturn} />
      </Panel>
      <Panel title="医療費控除の判定">
        <StepTable steps={s.estimate.steps.medical} />
      </Panel>
      <Panel title="住民税所得割とふるさと上限">
        <StepTable steps={s.estimate.steps.furusato} />
      </Panel>
      <Panel title="シナリオ比較（仮置き）">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="賞与・課税支給の増減" hint="例：冬の賞与が20万円増えるなら 200000">
            <YenInput
              value={scenario.extraTaxablePay}
              onChange={(v) => setScenario({ ...scenario, extraTaxablePay: v })}
            />
          </Field>
          <Field label="追加の寄付額">
            <YenInput
              value={scenario.extraDonation}
              onChange={(v) => setScenario({ ...scenario, extraDonation: v })}
            />
          </Field>
          <Field label="追加の医療費">
            <YenInput
              value={scenario.extraMedical}
              onChange={(v) => setScenario({ ...scenario, extraMedical: v })}
            />
          </Field>
        </div>
        <TableScroll>
          <table className="mt-4 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TH}>指標</th>
                <th className={`${TH} text-right`}>現在</th>
                <th className={`${TH} text-right`}>シナリオ</th>
                <th className={`${TH} text-right`}>差</th>
              </tr>
            </thead>
            <tbody>
              {compareRows.map(([label, now, next]) => (
                <tr key={label}>
                  <td className={TD}>{label}</td>
                  <td className={TD_NUM}>{yen(now)}</td>
                  <td className={TD_NUM}>{changed ? yen(next) : '—'}</td>
                  <td className={`${TD_NUM} ${next - now !== 0 ? 'font-bold' : ''}`}>
                    {changed ? `${next - now > 0 ? '+' : ''}${yen(next - now)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Panel>
    </Page>
  );
}
