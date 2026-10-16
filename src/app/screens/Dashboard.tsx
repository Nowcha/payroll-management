import { Icon } from '../icon';
import { useState } from 'react';
import { furusatoWarnings, slipDifferences, type AnnualSummary } from '../../domain/annual';
import { slotId } from '../../domain/ledger';
import { useAppData } from '../state';
import { useAnnual } from '../useAnnual';
import { Badge, Meter, Money, Notice, Page, Panel, Stat, yen } from '../ui';

const today = (): string => new Date().toISOString().slice(0, 10);

interface Alert {
  level: 'error' | 'warn' | 'info';
  text: string;
  href: string;
}

/** Monthly taxable pay: actual (solid), forecast (hatched), leave (empty). One series, so no legend box. */
function MonthlyIncome({ summary }: { summary: AnnualSummary }) {
  const { ledger } = useAppData();
  const [hover, setHover] = useState<number | null>(null);
  const months = Array.from({ length: 12 }, (_, i) => {
    const id = slotId({ month: i + 1, kind: 'salary' });
    let pay = 0;
    for (const [itemId, cell] of summary.table.cells.get(id) ?? []) {
      if (ledger.itemById.get(itemId)?.category === 'taxablePay') pay += cell.amount;
    }
    const state = summary.table.actualSlotIds.has(id)
      ? 'actual'
      : summary.table.leaveSlotIds.has(id)
        ? 'leave'
        : 'forecast';
    return { month: i + 1, pay, state };
  });
  const max = Math.max(1, ...months.map((m) => m.pay));
  const shown = hover === null ? null : months[hover - 1];
  return (
    <Panel
      title="月ごとの課税支給"
      description="実績は塗り、予測は斜線、休業月は空欄"
      aside={
        <span className="figures text-xs text-ink-soft">
          {shown
            ? `${shown.month}月 ${yen(shown.pay)}円${shown.state === 'forecast' ? '（予測）' : shown.state === 'leave' ? '（休業）' : ''}`
            : ''}
        </span>
      }
    >
      <div className="flex h-36 items-end gap-1.5" onMouseLeave={() => setHover(null)}>
        {months.map((m) => (
          <button
            key={m.month}
            type="button"
            aria-label={`${m.month}月 ${yen(m.pay)}円 ${m.state === 'actual' ? '実績' : m.state === 'leave' ? '休業' : '予測'}`}
            onMouseEnter={() => setHover(m.month)}
            onFocus={() => setHover(m.month)}
            onClick={() => setHover(m.month)}
            className="group flex h-full flex-1 flex-col items-stretch justify-end gap-1.5"
          >
            <span
              className={`block rounded-t-[4px] transition-opacity duration-200 ${
                m.state === 'actual'
                  ? 'bg-accent'
                  : m.state === 'forecast'
                    ? 'forecast-cell border border-b-0 border-accent/40'
                    : ''
              } ${hover !== null && hover !== m.month ? 'opacity-50' : ''}`}
              style={{ height: `${Math.max(m.pay > 0 ? 4 : 0, (m.pay / max) * 100)}%` }}
            />
            <span
              className={`figures text-center text-[10px] ${m.state === 'leave' ? 'text-owed' : 'text-ink-faint'}`}
            >
              {m.state === 'leave' ? '休' : m.month}
            </span>
          </button>
        ))}
      </div>
    </Panel>
  );
}

export function DashboardScreen() {
  const { year, items, records, withholding, payslips } = useAppData();
  const { summary, error } = useAnnual();
  if (error) return <Notice level="error">{error}</Notice>;
  if (!summary) return null;
  const { estimate, totals } = summary;
  const filing = estimate.shouldFileReturn;
  const limit = filing ? estimate.furusato.withMedical : estimate.furusato.withoutMedical;
  const balance = estimate.yearEndBalance;
  const slip = withholding.find((w) => w.year === year);
  const leaveMonths = records.yearSettings.find((s) => s.year === year)?.leaveMonths ?? [];
  const hasData = payslips.some((p) => p.year === year);

  const alerts: Alert[] = [];
  const pending = items.filter((i) => i.category === 'pending');
  if (pending.length > 0) {
    alerts.push({
      level: 'warn',
      text: `分類待ちの項目が${pending.length}件（${pending.map((p) => p.name).join('、')}）。税計算に反映されません`,
      href: '#/settings',
    });
  }
  const missingCert = records.insurance.filter(
    (c) => (c.premiumByYear[String(year)] ?? 0) > 0 && !c.certificateReceivedOn[String(year)],
  );
  if (missingCert.length > 0) {
    alerts.push({
      level: 'info',
      text: `控除証明書が未受領の保険契約が${missingCert.length}件`,
      href: '#/deductions',
    });
  }
  for (const w of furusatoWarnings(records.donations, year, filing, today())) {
    alerts.push({ level: w.level, text: w.message, href: '#/furusato' });
  }
  for (const p of estimate.unconfirmed) {
    alerts.push({
      level: 'warn',
      text: `税制パラメータ「${p.name}」が要確認のまま使われています`,
      href: '#/settings',
    });
  }
  if (slip) {
    const diffs = slipDifferences(slip, summary);
    const taxMismatch = slip.withheldTax !== estimate.yearEnd.annualTax;
    if (taxMismatch || diffs.length > 0) {
      const head = taxMismatch
        ? `源泉徴収票の年税額 ${yen(slip.withheldTax)}円 と試算 ${yen(estimate.yearEnd.annualTax)}円 がずれています。`
        : '源泉徴収票と試算の内訳がずれています。';
      const causes = diffs
        .filter((d) => d.label !== '所得控除の額の合計額' || diffs.length === 1)
        .map((d) => `${d.label}（票 ${yen(d.slip)} / 試算 ${yen(d.calc)}）`)
        .join('、');
      alerts.push({
        level: 'warn',
        text: causes ? `${head}差のある項目：${causes}` : head,
        href: diffs[0]?.href ?? '#/result',
      });
    }
  }
  if (leaveMonths.includes(12)) {
    alerts.push({
      level: 'info',
      text: '12月が休業のため、年末調整の精算時期は会社の扱いによります（12月中の振込・翌年の給与・確定申告）',
      href: '#/payslips',
    });
  }
  if (!hasData) {
    alerts.push({
      level: 'info',
      text: `${year}年の明細が未登録です。給与明細画面からPDFを取り込んでください`,
      href: '#/payslips',
    });
  }

  const refund = balance <= 0;
  const forecastNote = [
    totals.forecastSalaryMonths > 0 ? `給与${totals.forecastSalaryMonths}か月` : '',
    totals.forecastBonusCount > 0 ? `賞与${totals.forecastBonusCount}回` : '',
  ]
    .filter(Boolean)
    .join('・');
  const verdict = refund
    ? `年末調整で${yen(Math.abs(balance))}円が戻る見込みです。`
    : `年末調整で${yen(balance)}円の追加徴収が見込まれます。`;
  const basis = summary.hasForecast
    ? [
        forecastNote ? `${forecastNote}の予測を含みます。` : '',
        leaveMonths.length > 0 ? `休業（${leaveMonths.join('・')}月）を反映済みです。` : '',
      ].join('')
    : '全月が実績です。';
  const sentence = hasData
    ? verdict + basis
    : '明細を取り込むと、年末調整と確定申告の見込みがここに表示されます。';
  const remainingRatio = limit.limit > 0 ? summary.donationsTotal / limit.limit : 0;

  return (
    <Page title={`${year}年分の見通し`} eyebrow={summary.hasForecast ? '予測を含む' : '実績で確定'}>
      <section className="relative overflow-hidden rounded-3xl border border-rule bg-surface p-5 shadow-[var(--shadow-card)] sm:p-8">
        <div
          aria-hidden
          className={`pointer-events-none absolute -top-24 -right-24 size-72 rounded-full blur-3xl ${refund ? 'bg-refund-soft' : 'bg-owed-soft'}`}
        />
        <div className="relative grid gap-8 xl:grid-cols-[1.2fr_1fr] xl:items-end">
          <div>
            <Badge tone={refund ? 'refund' : 'owed'}>
              {refund ? (
                <Icon name="check_circle" className="size-3.5" />
              ) : (
                <Icon name="event_upcoming" className="size-3.5" />
              )}
              {refund ? '年末調整で還付' : '年末調整で追加徴収'}
            </Badge>
            <div className="mt-3">
              <Stat
                size="lg"
                label=""
                tone={refund ? 'refund' : 'owed'}
                value={<Money value={Math.abs(balance)} />}
              />
            </div>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft">{sentence}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-rule pt-5 sm:grid-cols-4 xl:grid-cols-2 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-8">
            <Stat
              size="sm"
              label="確定申告での追加還付"
              tone={estimate.finalReturnRefund > 0 ? 'refund' : 'neutral'}
              value={<Money value={estimate.finalReturnRefund} />}
            />
            <Stat
              size="sm"
              label="年税額（年調ベース）"
              value={<Money value={estimate.yearEnd.annualTax} />}
            />
            <Stat
              size="sm"
              label="給与収入（課税支給）"
              value={<Money value={totals.taxablePay} />}
            />
            <Stat
              size="sm"
              label="最終的な手取り"
              tone="accent"
              value={<Money value={summary.takeHome.finalNet} />}
              note={
                <a href="#/compare" className="hover:underline">
                  手取り {yen(summary.takeHome.net)}円＋還付
                </a>
              }
            />
          </dl>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="ふるさと納税"
          description={filing ? '医療費控除で確定申告する前提の上限' : '年末調整のみの前提の上限'}
          aside={
            <a
              href="#/furusato"
              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
            >
              寄付を管理 <Icon name="arrow_forward" className="size-3.5" />
            </a>
          }
        >
          <Stat
            label="残枠"
            tone={summary.furusatoRemaining >= 0 ? 'accent' : 'owed'}
            value={<Money value={summary.furusatoRemaining} />}
          />
          <div className="mt-4">
            <Meter
              value={summary.donationsTotal}
              max={limit.limit}
              tone={remainingRatio > 1 ? 'owed' : 'accent'}
            />
            <div className="figures mt-2 flex justify-between text-xs text-ink-soft">
              <span>寄付済み {yen(summary.donationsTotal)}円</span>
              <span>上限 {yen(limit.limit)}円</span>
            </div>
          </div>
          <div className="mt-4 rounded-xl bg-paper-deep px-3 py-2.5 text-xs text-ink-soft">
            推奨寄付額{' '}
            <span className="figures font-semibold text-ink">
              {yen(summary.hasForecast ? limit.recommended : limit.limit)}円
            </span>
            {summary.hasForecast ? '（予測を含むため上限の90%）' : ''}
          </div>
        </Panel>

        <div className="lg:col-span-2">
          <MonthlyIncome summary={summary} />
        </div>
      </div>

      <Panel title="要対応" description={alerts.length === 0 ? undefined : `${alerts.length}件`}>
        {alerts.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-ink-soft">
            <Icon name="check_circle" filled className="size-[18px] text-refund" />{' '}
            対応が必要な項目はありません
          </p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {alerts.map((a) => (
              <li key={a.text}>
                <a href={a.href} className="block transition-opacity hover:opacity-80">
                  <Notice level={a.level}>{a.text}</Notice>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Page>
  );
}
