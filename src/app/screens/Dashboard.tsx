import { furusatoWarnings } from '../../domain/annual';
import { useAppData } from '../state';
import { useAnnual } from '../useAnnual';
import { Badge, Money, Notice, Page, Panel, Stat } from '../ui';

const today = (): string => new Date().toISOString().slice(0, 10);

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

  const alerts: { level: 'error' | 'warn' | 'info'; text: string; href: string }[] = [];
  const pending = items.filter((i) => i.category === 'pending');
  if (pending.length > 0) {
    alerts.push({
      level: 'warn',
      text: `分類待ちの項目が${pending.length}件あります（${pending.map((p) => p.name).join('、')}）。税計算に反映されません`,
      href: '#/settings',
    });
  }
  const missingCert = records.insurance.filter(
    (c) => (c.premiumByYear[String(year)] ?? 0) > 0 && !c.certificateReceivedOn[String(year)],
  );
  if (missingCert.length > 0) {
    alerts.push({
      level: 'info',
      text: `控除証明書が未受領の保険契約が${missingCert.length}件あります`,
      href: '#/deductions',
    });
  }
  for (const w of furusatoWarnings(records.donations, year, filing, today())) {
    alerts.push({ level: w.level, text: w.message, href: '#/furusato' });
  }
  for (const p of estimate.unconfirmed) {
    alerts.push({
      level: 'warn',
      text: `税制パラメータ「${p.name}」が要確認のまま計算に使われています`,
      href: '#/settings',
    });
  }
  if (slip) {
    if (slip.paymentAmount !== totals.taxablePay) {
      alerts.push({
        level: 'warn',
        text: `源泉徴収票の支払金額と明細の年間合計が ${(totals.taxablePay - slip.paymentAmount).toLocaleString()}円 ずれています`,
        href: '#/payslips',
      });
    }
    if (slip.withheldTax !== estimate.yearEnd.annualTax) {
      alerts.push({
        level: 'warn',
        text: `源泉徴収票の源泉徴収税額（${slip.withheldTax.toLocaleString()}円）と試算の年税額が一致しません`,
        href: '#/result',
      });
    }
  }
  const leaveMonths = records.yearSettings.find((s) => s.year === year)?.leaveMonths ?? [];
  if (leaveMonths.includes(12)) {
    alerts.push({
      level: 'info',
      text: '12月が休業のため、年末調整の精算時期は会社の扱いによります（12月中の振込・翌年の給与・確定申告のいずれか）',
      href: '#/payslips',
    });
  }
  if (payslips.filter((p) => p.year === year).length === 0) {
    alerts.push({
      level: 'info',
      text: `${year}年の明細が未登録です。給与明細画面からPDFを取り込んでください`,
      href: '#/payslips',
    });
  }

  return (
    <Page
      title={`${year}年分の見通し`}
      lead={
        summary.hasForecast
          ? `予測を含む：給与${totals.forecastSalaryMonths}か月・賞与${totals.forecastBonusCount}回` +
            (leaveMonths.length > 0 ? `／休業 ${leaveMonths.map((m) => `${m}月`).join('・')}` : '')
          : '全月が実績です'
      }
    >
      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <Panel className="md:row-span-2">
          <div className="space-y-5">
            <Stat
              size="lg"
              label="年末調整の過不足見込み"
              tone={balance <= 0 ? 'refund' : 'owed'}
              value={<Money value={Math.abs(balance)} />}
              note={balance <= 0 ? '12月の給与で戻る見込み' : '12月の給与で追加徴収の見込み'}
            />
            <Stat
              label="確定申告で追加で戻る見込み"
              tone={estimate.finalReturnRefund > 0 ? 'refund' : 'neutral'}
              value={<Money value={estimate.finalReturnRefund} />}
              note={
                estimate.finalReturnRefund > 0
                  ? '医療費控除・寄附金控除による還付'
                  : '医療費控除の足切りを超えていません'
              }
            />
            <div className="grid grid-cols-2 gap-4 border-t border-rule pt-4">
              <Stat
                label="年税額（年調ベース）"
                value={<Money value={estimate.yearEnd.annualTax} />}
              />
              <Stat label="源泉徴収税額（1〜12月）" value={<Money value={totals.incomeTax} />} />
              <Stat label="給与収入（課税支給）" value={<Money value={totals.taxablePay} />} />
              <Stat label="社会保険料" value={<Money value={totals.socialInsurance} />} />
            </div>
          </div>
        </Panel>
        <Panel
          title="ふるさと納税"
          aside={filing ? <Badge tone="caution">医療費控除あり</Badge> : undefined}
        >
          <div className="grid grid-cols-2 gap-4">
            <Stat label="上限額" value={<Money value={limit.limit} />} />
            <Stat label="寄付済み" value={<Money value={summary.donationsTotal} />} />
            <Stat
              label="残枠"
              tone={summary.furusatoRemaining >= 0 ? 'refund' : 'owed'}
              value={<Money value={summary.furusatoRemaining} />}
            />
            <Stat
              label="推奨寄付額"
              value={<Money value={summary.hasForecast ? limit.recommended : limit.limit} />}
              note={summary.hasForecast ? '予測を含むため上限の90%' : '全月実績のため上限どおり'}
            />
          </div>
        </Panel>
        <Panel title="未処理アラート">
          {alerts.length === 0 ? (
            <p className="text-sm text-ink-soft">対応が必要な項目はありません。</p>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li key={a.text}>
                  <a href={a.href} className="block hover:opacity-80">
                    <Notice level={a.level}>{a.text}</Notice>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </Page>
  );
}
