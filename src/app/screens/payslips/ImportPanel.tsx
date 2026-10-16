import { Icon } from '../../icon';
import { useState, type DragEvent } from 'react';
import { planImport, type ImportPlan } from '../../../domain/importer';
import { newId, saveImportPlan, saveWithholdingSlip } from '../../../domain/repo';
import type { WithholdingSlipData } from '../../../import/withholding';
import { readDocument } from '../../pdf';
import { useAppData } from '../../state';
import { Badge, Button, Notice, Panel, TableScroll, TD, TH, errorText } from '../../ui';

interface Pending {
  plan: ImportPlan;
  withholding: { fileName: string; slip: WithholdingSlipData }[];
  errors: { fileName: string; message: string }[];
}

export function ImportPanel() {
  const { db, items, payslips, lines } = useAppData();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [dragging, setDragging] = useState(false);

  const onFiles = async (list: FileList | null): Promise<void> => {
    const files = [...(list ?? [])].filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
    );
    if (files.length === 0) return;
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const read = await Promise.all(files.map(readDocument));
      const slips = read.flatMap((r) =>
        r.kind === 'payslip' ? [{ fileName: r.fileName, slip: r.slip }] : [],
      );
      const plan = planImport(slips, items, payslips, lines, newId, new Date().toISOString());
      setPending({
        plan,
        withholding: read.flatMap((r) =>
          r.kind === 'withholding' ? [{ fileName: r.fileName, slip: r.slip }] : [],
        ),
        errors: read.flatMap((r) =>
          r.kind === 'error' ? [{ fileName: r.fileName, message: r.message }] : [],
        ),
      });
    } catch (err: unknown) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const commit = async (): Promise<void> => {
    if (!pending) return;
    setBusy(true);
    try {
      const saved = await saveImportPlan(db, pending.plan);
      for (const w of pending.withholding) {
        await saveWithholdingSlip(db, { ...w.slip, sourceFile: w.fileName });
      }
      setResult(`明細${saved}件・源泉徴収票${pending.withholding.length}件を登録しました`);
      setPending(null);
    } catch (err: unknown) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const rejected = pending?.plan.slips.filter((s) => !s.ok) ?? [];
  const accepted = pending?.plan.slips.filter((s) => s.ok) ?? [];

  return (
    <Panel title="PDF取込">
      <label
        onDragOver={(e: DragEvent) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) void onFiles(e.dataTransfer.files);
        }}
        className={`flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-sm transition-colors duration-200 ${
          dragging
            ? 'border-accent bg-accent-soft text-accent'
            : 'border-rule bg-paper text-ink-soft hover:border-accent hover:bg-accent-soft hover:text-accent'
        }`}
      >
        <input
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="sr-only"
          onChange={(e) => {
            void onFiles(e.target.files);
            e.target.value = '';
          }}
          disabled={busy}
        />
        {busy ? (
          <Icon name="progress_activity" className="size-7 animate-spin" />
        ) : (
          <Icon name="upload_file" className="size-7" />
        )}
        <span className="font-medium">
          {busy ? '読み取り中…' : 'PDFをドロップ、またはクリックして選択'}
        </span>
        <span className="text-xs text-ink-faint">
          給与・賞与明細と源泉徴収票をまとめて取り込めます
        </span>
      </label>
      <p className="mt-2 text-xs text-ink-soft">
        PDFはブラウザ内で読み取ります（外部に送信しません）。検算5本と累計照合を通らない明細は登録しません。
      </p>
      {error && (
        <div className="mt-3">
          <Notice level="error">{error}</Notice>
        </div>
      )}
      {result && (
        <div className="mt-3">
          <Notice level="info">{result}</Notice>
        </div>
      )}
      {pending && (
        <div className="mt-4 space-y-3">
          <TableScroll>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={TH}>ファイル</th>
                  <th className={TH}>対象</th>
                  <th className={TH}>結果</th>
                </tr>
              </thead>
              <tbody>
                {pending.plan.slips.map((s) => (
                  <tr key={s.fileName}>
                    <td className={TD}>{s.fileName}</td>
                    <td className={TD}>
                      {s.payslip.year}年{s.payslip.month}月
                      {s.payslip.kind === 'bonus' ? '賞与' : '給与'}
                    </td>
                    <td className={TD}>
                      {s.ok ? (
                        <Badge tone="refund">OK</Badge>
                      ) : (
                        <Badge tone="owed">登録しない</Badge>
                      )}
                      {[
                        ...s.checks
                          .filter((c) => !c.ok)
                          .map(
                            (c) =>
                              `${c.name}（明細 ${c.expected.toLocaleString()} / 計算 ${c.actual.toLocaleString()}）`,
                          ),
                        ...s.cumulativeIssues,
                        ...s.warnings,
                      ].map((m) => (
                        <div key={m} className="mt-1 text-xs text-owed">
                          {m}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
                {pending.withholding.map((w) => (
                  <tr key={w.fileName}>
                    <td className={TD}>{w.fileName}</td>
                    <td className={TD}>{w.slip.year}年分 源泉徴収票</td>
                    <td className={TD}>
                      <Badge tone="refund">OK</Badge>
                    </td>
                  </tr>
                ))}
                {pending.errors.map((e) => (
                  <tr key={e.fileName}>
                    <td className={TD}>{e.fileName}</td>
                    <td className={TD}>—</td>
                    <td className={TD}>
                      <Badge tone="owed">読めません</Badge>
                      <div className="mt-1 text-xs text-owed">{e.message}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
          {pending.plan.newItems.length > 0 && (
            <Notice level="warn">
              新しい項目名：{pending.plan.newItems.map((i) => i.name).join('、')}
              。取込は止めず「分類待ち」で登録します。設定画面で税分類を決めてください。
            </Notice>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={busy || (accepted.length === 0 && pending.withholding.length === 0)}
              onClick={() => void commit()}
            >
              {accepted.length + pending.withholding.length}件を登録
            </Button>
            <Button variant="ghost" onClick={() => setPending(null)}>
              取り消す
            </Button>
            {rejected.length > 0 && (
              <span className="self-center text-xs text-owed">
                {rejected.length}件は検算エラーのため登録しません
              </span>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
