// F-13: family members with automatic age category and deduction eligibility.
import { useState } from 'react';
import {
  ageAtYearEnd,
  classifyDependent,
  DEPENDENT_CATEGORY_LABEL,
  getParams,
  type Relation,
} from '../../../engine';
import { newId } from '../../../domain/repo';
import type { FamilyMember } from '../../../domain/types';
import { useAppData } from '../../state';
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Field,
  Notice,
  Panel,
  Select,
  TableScroll,
  TD,
  TH,
  TextInput,
  YenInput,
  errorText,
} from '../../ui';

const RELATION_LABEL: Record<Relation, string> = {
  spouse: '配偶者',
  child: '子',
  parent: '親',
  other: 'その他',
};

const blank = (): FamilyMember => ({
  id: newId(),
  name: '',
  relation: 'child',
  birthDate: '',
  incomeByYear: {},
  isDependentOfSelf: true,
  livesTogether: true,
  isLinealAscendant: false,
});

export function FamilyPanel() {
  const { db, year, records } = useAppData();
  const [draft, setDraft] = useState<FamilyMember | null>(null);
  const [error, setError] = useState<string | null>(null);
  const limit = getParams(year).incomeTax.dependents.value.incomeLimit;

  const save = async (): Promise<void> => {
    if (!draft) return;
    if (!draft.name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(draft.birthDate)) {
      setError('氏名と生年月日を入力してください');
      return;
    }
    try {
      await db.family.put({
        ...draft,
        isDependentOfSelf: draft.relation === 'spouse' ? false : draft.isDependentOfSelf,
      });
      setDraft(null);
      setError(null);
    } catch (e: unknown) {
      setError(errorText(e));
    }
  };

  const remove = async (m: FamilyMember): Promise<void> => {
    if (
      !window.confirm(
        `${m.name} を削除します。医療費の受診者として使われている場合は表示名が消えます。よろしいですか？`,
      )
    )
      return;
    await db.family.delete(m.id);
  };

  return (
    <Panel
      title="家族"
      aside={
        <Button variant="primary" onClick={() => setDraft(blank())}>
          追加
        </Button>
      }
    >
      <p className="mb-3 text-xs text-ink-soft">
        年齢区分は{year}
        年12月31日時点で自動判定します。配偶者は共働きのため配偶者控除の対象外（医療費の受診者として登録）。扶養親族の所得要件：合計所得
        {limit.toLocaleString()}円以下。
      </p>
      {error && <Notice level="error">{error}</Notice>}
      {draft && (
        <div className="mb-4 grid gap-3 rounded-sm border border-ink/30 bg-paper p-3 sm:grid-cols-3">
          <Field label="氏名（表示名）">
            <TextInput
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <Field label="続柄">
            <Select
              value={draft.relation}
              onChange={(e) => setDraft({ ...draft, relation: e.target.value as Relation })}
            >
              {(Object.keys(RELATION_LABEL) as Relation[]).map((r) => (
                <option key={r} value={r}>
                  {RELATION_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="生年月日">
            <TextInput
              type="date"
              value={draft.birthDate}
              onChange={(e) => setDraft({ ...draft, birthDate: e.target.value })}
            />
          </Field>
          <Field label={`${year}年の見込み合計所得`}>
            <YenInput
              value={draft.incomeByYear[String(year)] ?? 0}
              onChange={(v) =>
                setDraft({ ...draft, incomeByYear: { ...draft.incomeByYear, [String(year)]: v } })
              }
            />
          </Field>
          <div className="flex flex-col gap-2 pt-6 sm:col-span-2">
            {draft.relation !== 'spouse' && (
              <Checkbox
                label="本人の扶養親族として申告する"
                checked={draft.isDependentOfSelf}
                onChange={(v) => setDraft({ ...draft, isDependentOfSelf: v })}
              />
            )}
            <Checkbox
              label="同居"
              checked={draft.livesTogether}
              onChange={(v) => setDraft({ ...draft, livesTogether: v })}
            />
            {draft.relation === 'parent' && (
              <Checkbox
                label="直系尊属（父母・祖父母）"
                checked={draft.isLinealAscendant}
                onChange={(v) => setDraft({ ...draft, isLinealAscendant: v })}
              />
            )}
          </div>
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
      {records.family.length === 0 ? (
        <EmptyState>家族が未登録です</EmptyState>
      ) : (
        <TableScroll>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TH}>氏名</th>
                <th className={TH}>続柄</th>
                <th className={TH}>{year}年末の年齢</th>
                <th className={TH}>判定</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {records.family.map((m) => {
                const category = classifyDependent(
                  { ...m, totalIncome: m.incomeByYear[String(year)] ?? 0 },
                  year,
                  limit,
                );
                const age = m.birthDate ? ageAtYearEnd(m.birthDate, year) : null;
                return (
                  <tr key={m.id}>
                    <td className={TD}>{m.name}</td>
                    <td className={TD}>{RELATION_LABEL[m.relation]}</td>
                    <td className={`${TD} figures`}>
                      {age === null || age < 0 ? '—' : `${age}歳`}
                    </td>
                    <td className={TD}>
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={category === 'notDependent' ? 'neutral' : 'refund'}>
                          {DEPENDENT_CATEGORY_LABEL[category]}
                        </Badge>
                        {category !== 'notDependent' && age !== null && age < 23 && (
                          <Badge tone="caution">23歳未満（生保特例・所得金額調整控除）</Badge>
                        )}
                      </div>
                    </td>
                    <td className={`${TD} whitespace-nowrap text-right`}>
                      <Button variant="ghost" onClick={() => setDraft(m)}>
                        編集
                      </Button>
                      <Button variant="ghost" onClick={() => void remove(m)}>
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
