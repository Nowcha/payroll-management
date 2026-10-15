// Tax parameter provenance per year (requirements 4: 根拠URLと確認状態).
import { getParams, SUPPORTED_YEARS } from '../../../engine';
import { useAppData } from '../../state';
import { Badge, Panel, TableScroll, TD, TH } from '../../ui';

interface Leaf {
  path: string;
  status: string;
  sourceUrl: string;
  checkedOn: string;
  note?: string;
}

const LABELS: Record<string, string> = {
  employmentIncomeDeduction: '給与所得控除',
  appendix5: '所得税法別表第五',
  basicDeduction: '基礎控除',
  incomeAdjustmentDeduction: '所得金額調整控除',
  rateTable: '所得税率',
  reconstructionRate: '復興特別所得税',
  lifeInsurance: '生命保険料控除',
  earthquakeInsurance: '地震保険料控除',
  dependents: '扶養控除',
  fixedTaxReduction: '定額減税',
  medical: '医療費控除',
  rounding: '端数処理',
  incomeLevyRate: '所得割税率',
  adjustmentDeduction: '調整控除',
  donation: '寄附金控除・ふるさと納税',
  incomeTax: '所得税',
  residentTax: '住民税',
};

function leaves(node: unknown, path: string[] = []): Leaf[] {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return [];
  const record = node as Record<string, unknown>;
  if ('sourceUrl' in record && 'status' in record) {
    return [
      {
        path: path.map((p) => LABELS[p] ?? p).join(' / '),
        status: String(record.status),
        sourceUrl: String(record.sourceUrl),
        checkedOn: String(record.checkedOn),
        note: typeof record.note === 'string' ? record.note : undefined,
      },
    ];
  }
  return Object.entries(record).flatMap(([k, v]) => leaves(v, [...path, k]));
}

export function ParamsPanel() {
  const { year } = useAppData();
  const params = getParams(year);
  const rows = leaves(params);
  const pending = rows.filter((r) => r.status !== '確認済').length;
  return (
    <Panel
      title={`税制パラメータ（${year}年分・住民税は${params.residentTax.fiscalYearLabel}）`}
      aside={
        <span className="text-xs text-ink-soft">
          対応年分：{SUPPORTED_YEARS.join('・')}。追加は params/&lt;年&gt;.json
        </span>
      }
    >
      <p className="mb-2 text-sm">
        {pending === 0 ? 'すべて確認済みです。' : `要確認が${pending}件あります。`}
      </p>
      <TableScroll>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={TH}>パラメータ</th>
              <th className={TH}>状態</th>
              <th className={TH}>根拠</th>
              <th className={TH}>備考</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.path}>
                <td className={`${TD} whitespace-nowrap`}>{r.path}</td>
                <td className={TD}>
                  <Badge tone={r.status === '確認済' ? 'refund' : 'caution'}>{r.status}</Badge>
                </td>
                <td className={`${TD} text-xs`}>
                  <a
                    href={r.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="break-all underline decoration-rule hover:decoration-ink"
                  >
                    {new URL(r.sourceUrl).hostname}
                  </a>
                  <div className="text-ink-soft">{r.checkedOn}</div>
                </td>
                <td className={`${TD} text-xs text-ink-soft`}>{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </Panel>
  );
}
