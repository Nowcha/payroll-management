import type { YearTotals } from '../../domain/forecast';
import type { WithholdingSlipRecord } from '../../domain/types';
import { useAppData } from '../state';
import { useAnnual } from '../useAnnual';
import { EmptyState, Notice, Page, Panel, TableScroll, TD, TD_NUM, TH } from '../ui';
import { ImportPanel } from './payslips/ImportPanel';
import { PayslipEditor } from './payslips/PayslipEditor';
import { PayslipGrid } from './payslips/PayslipGrid';

function WithholdingComparison({
  slip,
  totals,
  annualTax,
}: {
  slip: WithholdingSlipRecord;
  totals: YearTotals;
  annualTax: number;
}) {
  const rows: [string, number, number][] = [
    ['支払金額', slip.paymentAmount, totals.taxablePay],
    ['社会保険料等の金額', slip.socialInsurance, totals.socialInsurance],
    ['源泉徴収税額', slip.withheldTax, annualTax],
  ];
  return (
    <TableScroll>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className={TH}>項目</th>
            <th className={`${TH} text-right`}>源泉徴収票（確定値）</th>
            <th className={`${TH} text-right`}>明細の実績＋予測</th>
            <th className={`${TH} text-right`}>差異</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, fixed, calc]) => (
            <tr key={label}>
              <td className={TD}>{label}</td>
              <td className={TD_NUM}>{fixed.toLocaleString()}</td>
              <td className={TD_NUM}>{calc.toLocaleString()}</td>
              <td className={`${TD_NUM} ${calc === fixed ? 'text-refund' : 'text-owed font-bold'}`}>
                {(calc - fixed).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

export function PayslipsScreen() {
  const { year, withholding } = useAppData();
  const { summary, error } = useAnnual();
  const slip = withholding.find((w) => w.year === year);
  return (
    <Page
      title={`${year}年の給与明細`}
      lead="実績は白、予測は網掛け。年合計は常に12か月分（＋賞与）で計算します。"
    >
      {error && <Notice level="error">{error}</Notice>}
      <ImportPanel />
      {summary && <PayslipGrid table={summary.table} />}
      <PayslipEditor />
      <Panel title="源泉徴収票との突合">
        {slip && summary ? (
          <WithholdingComparison
            slip={slip}
            totals={summary.totals}
            annualTax={summary.estimate.yearEnd.annualTax}
          />
        ) : (
          <EmptyState>{year}年分の源泉徴収票は未登録です（PDF取込から登録できます）</EmptyState>
        )}
      </Panel>
    </Page>
  );
}
