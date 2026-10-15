// Leave months (育休など) and F-11 social insurance re-forecast for the selected year.
import { useState } from 'react';
import { REVISION_LABEL, type RemunerationPlan } from '../../../domain/socialInsurance';
import type { YearSetting } from '../../../domain/types';
import { useAppData } from '../../state';
import {
  Badge,
  Button,
  Notice,
  Panel,
  TableScroll,
  TD,
  TD_NUM,
  TH,
  TextInput,
  errorText,
  yen,
} from '../../ui';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

function RateEditor({
  label,
  current,
  source,
  onSave,
}: {
  label: string;
  current: number | undefined;
  source: string | undefined;
  onSave: (rate: number | undefined) => void;
}) {
  const [draft, setDraft] = useState(current === undefined ? '' : (current * 100).toFixed(3));
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-40 font-semibold">{label}</span>
      <span className="w-24">
        <TextInput
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={`${label}（%）`}
        />
      </span>
      <span>%</span>
      {source && (
        <Badge tone={source === 'manual' ? 'caution' : 'neutral'}>
          {source === 'manual' ? '手入力' : source === 'law' ? '法定' : '明細から推定'}
        </Badge>
      )}
      <Button
        onClick={() => {
          const v = Number(draft);
          if (draft.trim() !== '' && Number.isFinite(v) && v >= 0 && v < 20)
            onSave(Math.round(v * 1000) / 100000);
        }}
      >
        保存
      </Button>
      {source === 'manual' && (
        <Button variant="ghost" onClick={() => onSave(undefined)}>
          推定に戻す
        </Button>
      )}
    </div>
  );
}

export function SocialPlanPanel({ plan }: { plan: RemunerationPlan | null }) {
  const { db, year, records, items } = useAppData();
  const [error, setError] = useState<string | null>(null);
  const setting: YearSetting = records.yearSettings.find((s) => s.year === year) ?? {
    year,
    hasHealthCheckup: false,
    selfIsSpeciallyDisabled: false,
  };
  const leave = new Set(setting.leaveMonths ?? []);

  const save = (patch: Partial<YearSetting>): void => {
    db.yearSettings
      .put({ ...setting, ...patch })
      .then(() => setError(null))
      .catch((e: unknown) => setError(errorText(e)));
  };
  const toggle = (m: number): void => {
    const next = new Set(leave);
    if (next.has(m)) next.delete(m);
    else next.add(m);
    save({ leaveMonths: [...next].sort((a, b) => a - b) });
  };
  const itemName = (id: string): string => items.find((i) => i.id === id)?.name ?? id;

  return (
    <Panel title="休業月と社会保険料の再予測">
      {error && <Notice level="error">{error}</Notice>}
      <div className="space-y-2">
        <h3 className="text-sm font-bold">休業（無給）の月</h3>
        <p className="text-xs text-ink-soft">
          育児休業などで給与が出ない月を選びます。予測の給与・賞与・社会保険料（育休中は免除）・源泉税が0になり、年税額とふるさと上限に反映されます。実績が登録された月には影響しません。休業月の賞与など個別の金額は、上のグリッドのセルから手入力できます。
        </p>
        <div className="grid grid-cols-6 gap-1 sm:grid-cols-12">
          {MONTHS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={leave.has(m)}
              onClick={() => toggle(m)}
              className={`min-h-9 rounded-sm border text-sm font-semibold transition-colors ${
                leave.has(m)
                  ? 'border-owed bg-owed-soft text-owed'
                  : 'border-rule bg-white text-ink-soft hover:border-ink'
              }`}
            >
              {m}月
            </button>
          ))}
        </div>
        {leave.has(12) && (
          <Notice level="warn">
            12月が休業のため、年末調整の精算時期は会社の扱いによります（12月中の振込、翌年の給与で精算、または確定申告）。ダッシュボードの「年末調整の過不足」は精算額の見込みとして表示します。
          </Notice>
        )}
      </div>

      <div className="mt-6 space-y-3 border-t border-rule pt-4">
        <h3 className="text-sm font-bold">社会保険料の再予測（標準報酬月額）</h3>
        {!plan ? (
          <p className="text-sm text-ink-soft">
            {year}
            年の4〜6月の給与明細が登録されると、定時決定による10月支給分以降の保険料を予測します。
          </p>
        ) : (
          <>
            {plan.revisions.map((r) => (
              <div
                key={`${r.kind}-${r.fromMonth}`}
                className="rounded-sm border border-rule bg-paper p-3 text-sm"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <Badge tone="refund">{REVISION_LABEL[r.kind]}</Badge>
                  <span className="font-semibold">{r.fromMonth}月支給分から</span>
                  <span className="text-ink-soft">
                    対象：{r.months.map((m) => `${m.month}月 ${yen(m.remuneration)}`).join('、')}
                  </span>
                </div>
                <div className="mt-1">
                  報酬平均 <span className="figures">{yen(r.averageRemuneration)}</span>円 →
                  健康保険の標準報酬 <span className="figures">{yen(r.healthGrade.amount)}</span>
                  円・厚生年金 <span className="figures">{yen(r.pensionGrade.amount)}</span>円
                </div>
                <TableScroll>
                  <table className="mt-2 w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        <th className={TH}>項目</th>
                        <th className={`${TH} text-right`}>予測保険料（月額）</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...r.premiums].map(([id, amount]) => (
                        <tr key={id}>
                          <td className={TD}>{itemName(id)}</td>
                          <td className={TD_NUM}>{yen(amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>
              </div>
            ))}
            <div className="space-y-2">
              <RateEditor
                key={`h-${plan.rates.health?.rate}`}
                label="健康保険（本人負担）"
                current={plan.rates.health?.rate}
                source={plan.rates.health?.source}
                onSave={(v) => save({ healthRate: v })}
              />
              {plan.rates.nursing && (
                <RateEditor
                  key={`n-${plan.rates.nursing.rate}`}
                  label="介護保険（本人負担）"
                  current={plan.rates.nursing.rate}
                  source={plan.rates.nursing.source}
                  onSave={(v) => save({ nursingRate: v })}
                />
              )}
              <p className="text-xs text-ink-soft">
                厚生年金9.15%・子ども子育て支援金0.115%（令和8年度）は法定。健康保険料率は加入する健保組合ごとに異なるため、直近の明細の保険料から推定しています。休業月は免除のため0です。
              </p>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
