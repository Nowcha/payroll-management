import { useState } from 'react';
import { calcResidentTax, getParams } from '../../engine';
import { newId } from '../../domain/repo';
import {
  OTHER_DEDUCTION_LABEL,
  type OtherDeduction,
  type OtherDeductionKind,
} from '../../domain/types';
import { useAppData } from '../state';
import { useAnnual } from '../useAnnual';
import {
  Button,
  Checkbox,
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
  YenInput,
  errorText,
} from '../ui';
import { FamilyPanel } from './deductions/FamilyPanel';
import { InsurancePanel } from './deductions/InsurancePanel';

function OtherDeductionsPanel() {
  const { db, year, records } = useAppData();
  const [draft, setDraft] = useState<OtherDeduction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = records.otherDeductions.filter((r) => r.year === year);
  const save = async (): Promise<void> => {
    if (!draft) return;
    try {
      await db.otherDeductions.put(draft);
      setDraft(null);
    } catch (e: unknown) {
      setError(errorText(e));
    }
  };
  return (
    <Panel
      title="その他の控除"
      aside={
        <Button onClick={() => setDraft({ id: newId(), year, kind: 'socialInsurance', amount: 0 })}>
          追加
        </Button>
      }
    >
      {error && <Notice level="error">{error}</Notice>}
      {draft && (
        <div className="mb-4 grid gap-3 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-3">
          <Field label="種類">
            <Select
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value as OtherDeductionKind })}
            >
              {(Object.keys(OTHER_DEDUCTION_LABEL) as OtherDeductionKind[]).map((k) => (
                <option key={k} value={k}>
                  {OTHER_DEDUCTION_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="金額">
            <YenInput value={draft.amount} onChange={(v) => setDraft({ ...draft, amount: v })} />
          </Field>
          <Field label="メモ">
            <TextInput
              value={draft.note ?? ''}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
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
      {rows.length === 0 ? (
        <EmptyState>{year}年の登録はありません（住宅ローン控除・iDeCo は現在なし）</EmptyState>
      ) : (
        <TableScroll>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={TD}>{OTHER_DEDUCTION_LABEL[r.kind]}</td>
                  <td className={TD_NUM}>{r.amount.toLocaleString()}</td>
                  <td className={`${TD} text-ink-soft`}>{r.note}</td>
                  <td className={`${TD} whitespace-nowrap text-right`}>
                    <Button variant="ghost" onClick={() => setDraft(r)}>
                      編集
                    </Button>
                    <Button variant="ghost" onClick={() => void db.otherDeductions.delete(r.id)}>
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
  );
}

export function DeductionsScreen() {
  const { db, year, records } = useAppData();
  const { summary, error } = useAnnual();
  const setting = records.yearSettings.find((s) => s.year === year) ?? {
    year,
    hasHealthCheckup: false,
    selfIsSpeciallyDisabled: false,
  };
  const residentSteps = summary ? calcResidentTax(getParams(year), summary.input, 0).steps : [];
  const stepValue = (label: string): number =>
    residentSteps.find((s) => s.label === label)?.value ?? 0;
  return (
    <Page
      title="控除"
      lead="家族・保険・その他の控除を登録すると、試算とふるさと上限に反映されます。"
    >
      {error && <Notice level="error">{error}</Notice>}
      <FamilyPanel />
      <InsurancePanel
        lifeDeduction={summary?.estimate.yearEnd.deductions.lifeInsurance ?? 0}
        earthquakeDeduction={summary?.estimate.yearEnd.deductions.earthquakeInsurance ?? 0}
        residentLife={stepValue('生命保険料控除（住民税）')}
        residentEarthquake={stepValue('地震保険料控除（住民税）')}
      />
      <OtherDeductionsPanel />
      <Panel title="本人">
        <Checkbox
          label="本人が特別障害者に該当する（所得金額調整控除の判定に使用）"
          checked={setting.selfIsSpeciallyDisabled}
          onChange={(v) => void db.yearSettings.put({ ...setting, selfIsSpeciallyDisabled: v })}
        />
        <TableScroll>
          <table className="mt-3 w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TH}>{year}年分の控除（試算）</th>
                <th className={`${TH} text-right`}>所得税</th>
              </tr>
            </thead>
            <tbody>
              {summary &&
                Object.entries({
                  社会保険料控除: summary.estimate.yearEnd.deductions.socialInsurance,
                  生命保険料控除: summary.estimate.yearEnd.deductions.lifeInsurance,
                  地震保険料控除: summary.estimate.yearEnd.deductions.earthquakeInsurance,
                  扶養控除: summary.estimate.yearEnd.deductions.dependents,
                  基礎控除: summary.estimate.yearEnd.deductions.basic,
                  所得金額調整控除: summary.estimate.yearEnd.income.incomeAdjustment,
                }).map(([label, v]) => (
                  <tr key={label}>
                    <td className={TD}>{label}</td>
                    <td className={TD_NUM}>{v.toLocaleString()}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </TableScroll>
      </Panel>
    </Page>
  );
}
