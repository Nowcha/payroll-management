import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { clearDb, encryptBackup, exportDb, importDb, readBackup } from './backup';
import { PayrollDb } from './db';

describe('backup', () => {
  it('round-trips all tables through an encrypted file', async () => {
    const db = new PayrollDb(`test-${Math.random()}`);
    await db.open();
    await db.donations.add({
      id: 'd1',
      date: '2026-05-01',
      municipality: '町',
      amount: 10_000,
      portal: '',
      gift: '',
      receiptReceived: false,
      oneStop: 'none',
    });
    const plain = await exportDb(db, '2026-10-15T00:00:00Z');
    expect(plain.tables.items.length).toBeGreaterThan(0);

    const encrypted = await encryptBackup(plain, 'correct horse');
    expect(JSON.stringify(encrypted)).not.toContain('町');
    await expect(readBackup(JSON.stringify(encrypted), 'wrong')).rejects.toThrow(/パスフレーズ/);

    await clearDb(db);
    expect(await db.donations.count()).toBe(0);
    expect(await db.items.count()).toBe(plain.tables.items.length);
    await importDb(db, await readBackup(JSON.stringify(encrypted), 'correct horse'));
    expect(await db.donations.get('d1')).toMatchObject({ amount: 10_000 });
    expect(await db.items.count()).toBe(plain.tables.items.length);
    db.close();
  });
  it('rejects foreign files', async () => {
    await expect(readBackup('{"hello":1}', '')).rejects.toThrow(
      /バックアップファイルではありません/,
    );
    await expect(readBackup('not json', '')).rejects.toThrow(/JSON/);
  });
});
