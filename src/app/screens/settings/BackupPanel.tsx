// Export / import of all data, optionally encrypted (AES-GCM). Files never leave the device
// unless the user moves them.
import { useState, type ChangeEvent } from 'react';
import { clearDb, encryptBackup, exportDb, importDb, readBackup } from '../../../domain/backup';
import { useAppData } from '../../state';
import { Button, Field, Notice, Panel, TextInput, errorText } from '../../ui';

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function BackupPanel() {
  const { db } = useAppData();
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ level: 'error' | 'info'; text: string } | null>(null);

  const run = async (task: () => Promise<string>): Promise<void> => {
    setBusy(true);
    try {
      setMessage({ level: 'info', text: await task() });
    } catch (e: unknown) {
      setMessage({ level: 'error', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const onExport = (): Promise<void> =>
    run(async () => {
      const now = new Date().toISOString();
      const plain = await exportDb(db, now);
      const body = passphrase ? await encryptBackup(plain, passphrase) : plain;
      download(
        `payroll-backup-${now.slice(0, 10)}${passphrase ? '.enc' : ''}.export.json`,
        JSON.stringify(body),
      );
      return passphrase
        ? '暗号化してエクスポートしました。パスフレーズを失うと復元できません'
        : '暗号化せずにエクスポートしました（給与データが平文で含まれます）';
    });

  const onImport = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!window.confirm('現在のデータをすべて置き換えます。よろしいですか？')) return;
    await run(async () => {
      const backup = await readBackup(await file.text(), passphrase);
      await importDb(db, backup);
      return `${backup.exportedAt} 時点のバックアップを復元しました`;
    });
  };

  const onClear = async (): Promise<void> => {
    if (
      !window.confirm(
        'このブラウザ内の全データを削除します。元に戻せません。先にエクスポートしましたか？',
      )
    )
      return;
    await run(async () => {
      await clearDb(db);
      return '全データを削除しました（項目マスタは初期状態に戻しました）';
    });
  };

  return (
    <Panel
      title="バックアップ"
      aside={<span className="text-xs text-ink-soft">PCとiPhoneの間の移行にも使えます</span>}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <Field
          label="パスフレーズ（任意）"
          hint="入力するとAES-GCMで暗号化します。復元時にも同じものを入力してください"
        >
          <TextInput
            type="password"
            autoComplete="new-password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        </Field>
        <Button variant="primary" disabled={busy} onClick={() => void onExport()}>
          エクスポート
        </Button>
        <label className="inline-flex min-h-9 cursor-pointer items-center rounded-sm border border-ink bg-white px-3 text-sm font-semibold hover:bg-paper-deep">
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => void onImport(e)}
            disabled={busy}
          />
          インポート
        </label>
      </div>
      {message && (
        <div className="mt-3">
          <Notice level={message.level}>{message.text}</Notice>
        </div>
      )}
      <div className="mt-6 border-t border-rule pt-3">
        <Button variant="danger" disabled={busy} onClick={() => void onClear()}>
          全データを削除
        </Button>
      </div>
    </Panel>
  );
}
