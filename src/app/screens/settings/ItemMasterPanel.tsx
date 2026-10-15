// F-02: item master — tax category and default forecast method per item.
import { useState } from 'react';
import {
  FORECAST_METHOD_LABEL,
  TAX_CATEGORY_LABEL,
  type ForecastMethod,
  type ItemMaster,
  type TaxCategory,
} from '../../../domain/types';
import { useAppData } from '../../state';
import {
  Badge,
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

const PAY_CATEGORIES: TaxCategory[] = ['taxablePay', 'nonTaxablePay', 'pending'];
const DEDUCTION_CATEGORIES: TaxCategory[] = [
  'socialInsurance',
  'incomeTax',
  'yearEndAdjustment',
  'residentTax',
  'fixedTaxReduction',
  'otherDeduction',
  'pending',
];

export function ItemMasterPanel() {
  const { db, items, lines } = useAppData();
  const [error, setError] = useState<string | null>(null);
  const usage = new Map<string, number>();
  for (const l of lines) usage.set(l.itemId, (usage.get(l.itemId) ?? 0) + 1);
  const sorted = [...items]
    .filter((i) => i.block !== 'attendance')
    .sort((a, b) => a.order - b.order);

  const update = async (item: ItemMaster, patch: Partial<ItemMaster>): Promise<void> => {
    try {
      await db.items.put({ ...item, ...patch });
      setError(null);
    } catch (e: unknown) {
      setError(errorText(e));
    }
  };

  return (
    <Panel
      title="項目マスタ"
      aside={
        <span className="text-xs text-ink-soft">税計算は項目名ではなくこの分類で集計します</span>
      }
    >
      {error && <Notice level="error">{error}</Notice>}
      <TableScroll>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={TH}>項目名</th>
              <th className={TH}>区分</th>
              <th className={TH}>税分類</th>
              <th className={TH}>既定の予測方式</th>
              <th className={TH}>別名（旧名称、カンマ区切り）</th>
              <th className={`${TH} text-right`}>使用</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => (
              <tr key={item.id} className={item.category === 'pending' ? 'bg-caution/10' : ''}>
                <td className={`${TD} whitespace-nowrap font-semibold`}>
                  {item.name}{' '}
                  {item.category === 'pending' && <Badge tone="caution">分類待ち</Badge>}
                </td>
                <td className={TD}>{item.block === 'payment' ? '支給' : '控除'}</td>
                <td className={`${TD} min-w-40`}>
                  <Select
                    value={item.category}
                    onChange={(e) => void update(item, { category: e.target.value as TaxCategory })}
                    aria-label={`${item.name}の税分類`}
                  >
                    {(item.block === 'payment' ? PAY_CATEGORIES : DEDUCTION_CATEGORIES).map((c) => (
                      <option key={c} value={c}>
                        {TAX_CATEGORY_LABEL[c]}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className={`${TD} min-w-44`}>
                  <div className="flex gap-1">
                    <Select
                      value={item.defaultMethod}
                      onChange={(e) =>
                        void update(item, { defaultMethod: e.target.value as ForecastMethod })
                      }
                      aria-label={`${item.name}の予測方式`}
                    >
                      {(Object.keys(FORECAST_METHOD_LABEL) as ForecastMethod[]).map((m) => (
                        <option key={m} value={m}>
                          {FORECAST_METHOD_LABEL[m]}
                        </option>
                      ))}
                    </Select>
                    {item.defaultMethod === 'fixed' && (
                      <span className="w-28">
                        <YenInput
                          value={item.fixedAmount ?? 0}
                          onChange={(v) => void update(item, { fixedAmount: v })}
                          aria-label="固定額"
                        />
                      </span>
                    )}
                  </div>
                </td>
                <td className={`${TD} min-w-40`}>
                  <TextInput
                    defaultValue={item.aliases.join(', ')}
                    onBlur={(e) =>
                      void update(item, {
                        aliases: e.target.value
                          .split(/[,、]/)
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    aria-label={`${item.name}の別名`}
                  />
                </td>
                <td className={`${TD} figures text-right`}>{usage.get(item.id) ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      <p className="mt-2 text-xs text-ink-soft">
        所得税の予測は方式によらず「直近3か月の源泉税率 ×
        予測の課税支給」、12月の年調過不足は年税額から自動で見込みます。
      </p>
    </Panel>
  );
}
