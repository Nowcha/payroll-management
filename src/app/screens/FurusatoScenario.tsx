// F-22 on the furusato screen: try income / medical changes and see the limit move.
// Planned facts (leave months, bonus amounts) belong in the payslip screen so every screen uses them.
import { useState } from 'react';
import { NO_SCENARIO, type AnnualSummary, type Scenario } from '../../domain/annual';
import { useAnnual } from '../useAnnual';
import { Field, Panel, TableScroll, TD, TD_NUM, TH, YenInput, yen } from '../ui';

function limitOf(s: AnnualSummary): number {
  return s.estimate.shouldFileReturn
    ? s.estimate.furusato.withMedical.limit
    : s.estimate.furusato.withoutMedical.limit;
}

export function FurusatoScenario({ base }: { base: AnnualSummary }) {
  const [scenario, setScenario] = useState<Scenario>(NO_SCENARIO);
  const { summary: alt } = useAnnual(scenario);
  const changed =
    scenario !== NO_SCENARIO &&
    (scenario.extraTaxablePay !== 0 || scenario.extraMedical !== 0 || scenario.extraDonation !== 0);
  const rows: [string, number, number | null][] = [
    ['上限額', limitOf(base), alt ? limitOf(alt) : null],
    ['残枠', base.furusatoRemaining, alt ? alt.furusatoRemaining : null],
    [
      '年税額（年調ベース）',
      base.estimate.yearEnd.annualTax,
      alt ? alt.estimate.yearEnd.annualTax : null,
    ],
  ];
  return (
    <Panel
      title="仮置きで試す"
      aside={
        <span className="text-xs text-ink-soft">
          保存されません。確定した予定は給与明細画面の休業月・手入力で登録
        </span>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="課税支給の増減" hint="例：賞与が出ないなら −748855">
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
              <th className={`${TH} text-right`}>現在</th>
              <th className={`${TH} text-right`}>仮置き</th>
              <th className={`${TH} text-right`}>差</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, now, next]) => (
              <tr key={label}>
                <td className={TD}>{label}</td>
                <td className={TD_NUM}>{yen(now)}</td>
                <td className={TD_NUM}>{changed && next !== null ? yen(next) : '—'}</td>
                <td className={`${TD_NUM} font-bold`}>
                  {changed && next !== null
                    ? `${next - now > 0 ? '+' : ''}${yen(next - now)}`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </Panel>
  );
}
