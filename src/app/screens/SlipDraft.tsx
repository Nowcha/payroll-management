// F-23: 源泉徴収票のドラフト（画面表示のみ）. Names and addresses stay blank by design.
import type { ReactNode } from 'react';
import { buildSlipDraft, draftChecks, type SlipDraft } from '../../domain/slipDraft';
import { useAppData } from '../state';
import { useAnnual } from '../useAnnual';
import { Badge, EmptyState, Notice, Page, Panel, TableScroll, TD, TD_NUM, TH, yen } from '../ui';

const REIWA_OFFSET = 2018;

/** Grid spans on sm+ (12 columns); every cell is full width on phones except `half`. */
const SPAN: Record<number, string> = {
  1: 'sm:col-span-1',
  2: 'sm:col-span-2',
  3: 'sm:col-span-3',
  4: 'sm:col-span-4',
  6: 'sm:col-span-6',
  8: 'sm:col-span-8',
  12: 'sm:col-span-12',
};

function Cell({
  label,
  span,
  half = false,
  estimated = false,
  mismatch = false,
  children,
}: {
  label: ReactNode;
  span: keyof typeof SPAN;
  half?: boolean;
  estimated?: boolean;
  mismatch?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={`relative flex min-h-16 flex-col justify-between gap-1 border-r border-b border-ink/25 px-2.5 py-1.5 ${half ? 'col-span-1' : 'col-span-2'} ${SPAN[span]} ${estimated ? 'forecast-cell' : ''} ${mismatch ? 'z-[1] outline-2 -outline-offset-2 outline-owed' : ''}`}
    >
      <span
        className={`self-start text-[10px] leading-tight text-ink-soft ${estimated ? '-mx-1 rounded bg-surface/90 px-1' : ''}`}
      >
        {label}
      </span>
      {children !== undefined && (
        <span
          className={`figures self-end text-[15px] font-semibold ${estimated ? '-mx-1 rounded bg-surface/90 px-1' : ''}`}
        >
          {children}
        </span>
      )}
    </div>
  );
}

const amount = (v: number | null, showZero = false): string =>
  v === null || (v === 0 && !showZero) ? '' : yen(v);
const people = (n: number): string => (n === 0 ? '' : `${n}人`);

function SlipForm({ draft, mismatched }: { draft: SlipDraft; mismatched: Set<string> }) {
  const est = draft.hasForecast;
  const d = draft.dependents;
  const p = draft.lifePremiums;
  const m = (label: string): boolean => mismatched.has(label);
  return (
    <div className="overflow-hidden rounded-xl border border-ink/40 bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink/40 px-3 py-2">
        <h2 className="text-sm font-semibold tracking-wide">
          令和{draft.year - REIWA_OFFSET}年分 給与所得の源泉徴収票
        </h2>
        <span className="text-[11px] text-ink-soft">{draft.year}年分・ドラフト</span>
      </div>
      <div className="grid grid-cols-2 border-l border-ink/25 sm:grid-cols-12 [&>*]:-ml-px">
        <Cell label="支払を受ける者　住所又は居所" span={8} />
        <Cell label="氏名" span={4} />

        <Cell label="種別" span={2}>
          <span className="font-normal">給料・賞与</span>
        </Cell>
        <Cell label="支払金額" span={3} estimated={est} mismatch={m('支払金額')}>
          {yen(draft.paymentAmount)}
        </Cell>
        <Cell
          label="給与所得控除後の金額（調整控除後）"
          span={3}
          estimated={est}
          mismatch={m('給与所得控除後の金額')}
        >
          {yen(draft.employmentIncome)}
        </Cell>
        <Cell
          label="所得控除の額の合計額"
          span={2}
          estimated={est}
          mismatch={m('所得控除の額の合計額')}
        >
          {yen(draft.totalDeductions)}
        </Cell>
        <Cell label="源泉徴収税額" span={2} estimated={est} mismatch={m('源泉徴収税額')}>
          {yen(draft.withheldTax)}
        </Cell>

        <Cell label="（源泉）控除対象配偶者の有無等" span={2} half>
          <span className="font-normal">無</span>
        </Cell>
        <Cell label="配偶者（特別）控除の額" span={2} half />
        <Cell label="控除対象扶養親族の数　特定" span={2} half>
          {people(d.specific)}
        </Cell>
        <Cell label="老人（内 同居老親等）" span={2} half>
          {d.elderly > 0 ? `${d.elderly}人（内${d.elderlyCohabiting}人）` : ''}
        </Cell>
        <Cell label="その他" span={1} half>
          {people(d.general)}
        </Cell>
        <Cell label="16歳未満扶養親族の数" span={1} half>
          {people(d.under16)}
        </Cell>
        <Cell label="障害者の数（本人を除く）" span={1} half />
        <Cell label="非居住者である親族の数" span={1} half />

        <Cell
          label="社会保険料等の金額"
          span={3}
          estimated={est}
          mismatch={m('社会保険料等の金額')}
        >
          {yen(draft.socialInsurance)}
        </Cell>
        <Cell label="生命保険料の控除額" span={3} mismatch={m('生命保険料の控除額')}>
          {amount(draft.lifeInsuranceDeduction)}
        </Cell>
        <Cell label="地震保険料の控除額" span={3} mismatch={m('地震保険料の控除額')}>
          {amount(draft.earthquakeInsuranceDeduction)}
        </Cell>
        <Cell label="住宅借入金等特別控除の額" span={3} mismatch={m('住宅借入金等特別控除の額')}>
          {amount(draft.housingLoanCredit)}
        </Cell>

        <div
          className={`col-span-2 -ml-px min-h-16 border-r border-b border-ink/25 px-2.5 py-1.5 sm:col-span-12 ${m('定額減税の控除済額（摘要）') ? 'outline-2 -outline-offset-2 outline-owed' : ''}`}
        >
          <span className="text-[10px] text-ink-soft">（摘要）</span>
          <p className="mt-1 text-sm">{draft.remarks.join('　')}</p>
        </div>

        <Cell label="新生命保険料の金額" span={2} half mismatch={m('新生命保険料の金額')}>
          {amount(p.generalNew)}
        </Cell>
        <Cell label="旧生命保険料の金額" span={2} half mismatch={m('旧生命保険料の金額')}>
          {amount(p.generalOld)}
        </Cell>
        <Cell label="介護医療保険料の金額" span={2} half mismatch={m('介護医療保険料の金額')}>
          {amount(p.careMedical)}
        </Cell>
        <Cell label="新個人年金保険料の金額" span={3} half mismatch={m('新個人年金保険料の金額')}>
          {amount(p.pensionNew)}
        </Cell>
        <Cell label="旧個人年金保険料の金額" span={3} half mismatch={m('旧個人年金保険料の金額')}>
          {amount(p.pensionOld)}
        </Cell>

        <Cell label="配偶者の合計所得" span={3} half />
        <Cell label="国民年金保険料等の金額" span={3} half />
        <Cell label="旧長期損害保険料の金額" span={2} half>
          {amount(draft.oldLongTermPremium)}
        </Cell>
        <Cell label="基礎控除の額" span={2} half estimated={est} mismatch={m('基礎控除の額')}>
          {amount(draft.basicDeduction)}
        </Cell>
        <Cell label="所得金額調整控除額" span={2} estimated={est}>
          {amount(draft.incomeAdjustment)}
        </Cell>

        <Cell label="支払者　住所（居所）又は所在地・氏名又は名称" span={12} />
      </div>
    </div>
  );
}

export function SlipDraftScreen() {
  const { year, withholding } = useAppData();
  const { summary, error } = useAnnual();
  if (error) return <Notice level="error">{error}</Notice>;
  if (!summary) return null;
  const draft = buildSlipDraft(summary);
  const slip = withholding.find((w) => w.year === year);
  const checks = slip ? draftChecks(draft, slip) : [];
  const mismatched = new Set(checks.filter((c) => c.draft !== c.slip).map((c) => c.label));

  return (
    <Page
      title={`${year}年分の源泉徴収票（ドラフト）`}
      eyebrow={
        draft.hasForecast ? (
          <Badge tone="caution">予測を含む見込み</Badge>
        ) : (
          <Badge tone="refund">全月実績</Badge>
        )
      }
      lead="登録済みの明細・控除から、年末調整後の源泉徴収票の記載内容を組み立てます。斜線は予測を含む欄。確定した源泉徴収票は届いてから給与明細画面で取り込んでください。"
    >
      <SlipForm draft={draft} mismatched={mismatched} />
      <Notice level="info">
        氏名・住所・支払者は空欄です。配偶者控除（対象外の前提）、障害者・寡婦などの区分、中途就・退職、特定親族特別控除はこのツールでは扱いません。
      </Notice>
      <Panel
        title="確定した源泉徴収票との照合"
        description={slip ? `差のある欄は枠で強調（${mismatched.size}件）` : undefined}
      >
        {slip ? (
          <TableScroll>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={TH}>欄</th>
                  <th className={`${TH} text-right`}>ドラフト</th>
                  <th className={`${TH} text-right`}>源泉徴収票</th>
                  <th className={`${TH} text-right`}>差異</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c) => (
                  <tr key={c.label}>
                    <td className={`${TD} whitespace-nowrap`}>{c.label}</td>
                    <td className={TD_NUM}>{yen(c.draft)}</td>
                    <td className={TD_NUM}>{yen(c.slip)}</td>
                    <td
                      className={`${TD_NUM} ${c.draft === c.slip ? 'text-refund' : 'font-bold text-owed'}`}
                    >
                      {yen(c.draft - c.slip)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        ) : (
          <EmptyState>
            {year}
            年分の源泉徴収票は未登録です。確定後に給与明細画面から取り込むと、ここで照合できます
          </EmptyState>
        )}
      </Panel>
    </Page>
  );
}
