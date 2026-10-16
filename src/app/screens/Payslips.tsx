import { slipComparison, type AnnualSummary } from '../../domain/annual';
import type { WithholdingSlipRecord } from '../../domain/types';
import { useAppData } from '../state';
import { useAnnual } from '../useAnnual';
import { EmptyState, Notice, Page, Panel, TableScroll, TD, TD_NUM, TH, yen } from '../ui';
import { ImportPanel } from './payslips/ImportPanel';
import { PayslipEditor } from './payslips/PayslipEditor';
import { PayslipGrid } from './payslips/PayslipGrid';
import { SocialPlanPanel } from './payslips/SocialPlanPanel';

function WithholdingComparison({
  slip,
  summary,
}: {
  slip: WithholdingSlipRecord;
  summary: AnnualSummary;
}) {
  const rows = slipComparison(slip, summary);
  const causes = rows.filter((r) => r.label !== '源泉徴収税額' && r.slip !== r.calc);
  return (
    <>
      <TableScroll>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={TH}>項目</th>
              <th className={`${TH} text-right`}>源泉徴収票（確定値）</th>
              <th className={`${TH} text-right`}>試算</th>
              <th className={`${TH} text-right`}>差異</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td className={TD}>
                  {r.slip !== r.calc ? (
                    <a href={r.href} className="text-accent hover:underline">
                      {r.label}
                    </a>
                  ) : (
                    r.label
                  )}
                </td>
                <td className={TD_NUM}>{yen(r.slip)}</td>
                <td className={TD_NUM}>{yen(r.calc)}</td>
                <td
                  className={`${TD_NUM} ${r.calc === r.slip ? 'text-refund' : 'font-bold text-owed'}`}
                >
                  {yen(r.calc - r.slip)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      {causes.some((c) => c.href === '#/deductions') && (
        <div className="mt-3">
          <Notice level="info">
            控除額の差は、控除画面に保険契約・家族・住宅ローン控除が未登録のときに出ます。
            源泉徴収票と同じ内容を登録すると年税額も一致します。
          </Notice>
        </div>
      )}
    </>
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
      {summary && <SocialPlanPanel plan={summary.plan} />}
      <PayslipEditor />
      <Panel title="源泉徴収票との突合">
        {slip && summary ? (
          <WithholdingComparison slip={slip} summary={summary} />
        ) : (
          <EmptyState>{year}年分の源泉徴収票は未登録です（PDF取込から登録できます）</EmptyState>
        )}
      </Panel>
    </Page>
  );
}
