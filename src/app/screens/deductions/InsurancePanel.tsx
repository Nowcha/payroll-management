// F-12: insurance contracts, yearly premiums and certificate status.
import { useState } from 'react';
import { newId } from '../../../domain/repo';
import {
  INSURANCE_KIND_LABEL,
  type InsuranceContract,
  type InsuranceKind,
} from '../../../domain/types';
import { useAppData } from '../../state';
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Field,
  Money,
  Notice,
  Panel,
  Select,
  TableScroll,
  TD,
  TD_NUM,
  TH,
  TextInput,
  YenInput,
  errorText,
} from '../../ui';

const blank = (): InsuranceContract => ({
  id: newId(),
  kind: 'generalLife',
  isOld: false,
  company: '',
  premiumByYear: {},
  certificateReceivedOn: {},
  submittedForYearEnd: {},
});

const HAS_OLD: InsuranceKind[] = ['generalLife', 'pension'];

export function InsurancePanel({
  lifeDeduction,
  earthquakeDeduction,
  residentLife,
  residentEarthquake,
}: {
  lifeDeduction: number;
  earthquakeDeduction: number;
  residentLife: number;
  residentEarthquake: number;
}) {
  const { db, year, records } = useAppData();
  const [draft, setDraft] = useState<InsuranceContract | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = String(year);

  const save = async (c: InsuranceContract): Promise<void> => {
    try {
      await db.insurance.put({ ...c, isOld: HAS_OLD.includes(c.kind) ? c.isOld : false });
      setError(null);
    } catch (e: unknown) {
      setError(errorText(e));
    }
  };

  return (
    <Panel
      title="保険契約"
      aside={
        <Button variant="primary" onClick={() => setDraft(blank())}>
          追加
        </Button>
      }
    >
      <div className="mb-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          生命保険料控除（所得税）
          <div className="text-lg font-bold">
            <Money value={lifeDeduction} />
          </div>
        </div>
        <div>
          地震保険料控除（所得税）
          <div className="text-lg font-bold">
            <Money value={earthquakeDeduction} />
          </div>
        </div>
        <div>
          生命保険料控除（住民税）
          <div className="text-lg font-bold">
            <Money value={residentLife} />
          </div>
        </div>
        <div>
          地震保険料控除（住民税）
          <div className="text-lg font-bold">
            <Money value={residentEarthquake} />
          </div>
        </div>
      </div>
      {error && <Notice level="error">{error}</Notice>}
      {draft && (
        <div className="mb-4 grid gap-3 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-3">
          <Field label="種類">
            <Select
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value as InsuranceKind })}
            >
              {(Object.keys(INSURANCE_KIND_LABEL) as InsuranceKind[]).map((k) => (
                <option key={k} value={k}>
                  {INSURANCE_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="保険会社">
            <TextInput
              value={draft.company}
              onChange={(e) => setDraft({ ...draft, company: e.target.value })}
            />
          </Field>
          <Field label={`${year}年の年間保険料`}>
            <YenInput
              value={draft.premiumByYear[key] ?? 0}
              onChange={(v) =>
                setDraft({ ...draft, premiumByYear: { ...draft.premiumByYear, [key]: v } })
              }
            />
          </Field>
          {HAS_OLD.includes(draft.kind) && (
            <div className="pt-6">
              <Checkbox
                label="旧契約（2011年12月31日以前の締結）"
                checked={draft.isOld}
                onChange={(v) => setDraft({ ...draft, isOld: v })}
              />
            </div>
          )}
          <div className="flex gap-2 sm:col-span-3">
            <Button variant="primary" onClick={() => void save(draft).then(() => setDraft(null))}>
              保存
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              キャンセル
            </Button>
          </div>
        </div>
      )}
      {records.insurance.length === 0 ? (
        <EmptyState>
          保険契約が未登録です（給与天引きの団体保険も控除証明書の金額で登録します）
        </EmptyState>
      ) : (
        <TableScroll>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={TH}>種類</th>
                <th className={TH}>保険会社</th>
                <th className={`${TH} text-right`}>{year}年保険料</th>
                <th className={TH}>控除証明書の受領日</th>
                <th className={TH}>年調提出</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {records.insurance.map((c) => (
                <tr key={c.id}>
                  <td className={TD}>
                    {INSURANCE_KIND_LABEL[c.kind]}{' '}
                    {HAS_OLD.includes(c.kind) && <Badge>{c.isOld ? '旧' : '新'}</Badge>}
                  </td>
                  <td className={TD}>{c.company}</td>
                  <td className={TD_NUM}>{(c.premiumByYear[key] ?? 0).toLocaleString()}</td>
                  <td className={TD}>
                    <TextInput
                      type="date"
                      value={c.certificateReceivedOn[key] ?? ''}
                      onChange={(e) =>
                        void save({
                          ...c,
                          certificateReceivedOn: {
                            ...c.certificateReceivedOn,
                            [key]: e.target.value,
                          },
                        })
                      }
                      aria-label="控除証明書の受領日"
                    />
                  </td>
                  <td className={TD}>
                    <Checkbox
                      label="提出済み"
                      checked={c.submittedForYearEnd[key] ?? false}
                      onChange={(v) =>
                        void save({
                          ...c,
                          submittedForYearEnd: { ...c.submittedForYearEnd, [key]: v },
                        })
                      }
                    />
                  </td>
                  <td className={`${TD} whitespace-nowrap text-right`}>
                    <Button variant="ghost" onClick={() => setDraft(c)}>
                      編集
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm('この契約を削除しますか？'))
                          void db.insurance.delete(c.id);
                      }}
                    >
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
