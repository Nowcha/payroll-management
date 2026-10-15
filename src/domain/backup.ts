// JSON export/import of every table, optionally encrypted with a passphrase
// (AES-GCM 256, key derived with PBKDF2-SHA256). Uses only the Web Crypto API.
import { OPTIONAL_BACKUP_TABLES, TABLE_NAMES, type PayrollDb, type TableName } from './db';
import { seedItems } from './itemSeeds';

export const BACKUP_FORMAT = 'payroll-management-backup';
const VERSION = 1;
const PBKDF2_ITERATIONS = 310_000;

export interface PlainBackup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  tables: Record<TableName, unknown[]>;
}

export interface EncryptedBackup {
  format: typeof BACKUP_FORMAT;
  version: number;
  encrypted: true;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  data: string;
}

export class BackupError extends Error {}

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptBackup(
  plain: PlainBackup,
  passphrase: string,
): Promise<EncryptedBackup> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(plain)),
  );
  return {
    format: BACKUP_FORMAT,
    version: VERSION,
    encrypted: true,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: toBase64(salt) },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    data: toBase64(new Uint8Array(cipher)),
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asPlain(v: unknown): PlainBackup {
  if (!isRecord(v) || v.format !== BACKUP_FORMAT || !isRecord(v.tables)) {
    throw new BackupError('このアプリのバックアップファイルではありません');
  }
  const tables: Record<string, unknown> = { ...v.tables };
  for (const name of TABLE_NAMES) {
    if (tables[name] === undefined && OPTIONAL_BACKUP_TABLES.includes(name)) tables[name] = [];
    if (!Array.isArray(tables[name])) throw new BackupError(`バックアップに ${name} がありません`);
  }
  return { ...(v as unknown as PlainBackup), tables: tables as PlainBackup['tables'] };
}

export function isEncrypted(v: unknown): v is EncryptedBackup {
  return isRecord(v) && v.format === BACKUP_FORMAT && v.encrypted === true;
}

export async function decryptBackup(
  file: EncryptedBackup,
  passphrase: string,
): Promise<PlainBackup> {
  try {
    const key = await deriveKey(passphrase, fromBase64(file.kdf.salt), file.kdf.iterations);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(file.cipher.iv) },
      key,
      fromBase64(file.data),
    );
    return asPlain(JSON.parse(new TextDecoder().decode(plain)));
  } catch (error: unknown) {
    if (error instanceof BackupError) throw error;
    throw new BackupError('復号できません。パスフレーズを確認してください', { cause: error });
  }
}

/** Parses an uploaded backup; encrypted files need the passphrase. */
export async function readBackup(text: string, passphrase: string): Promise<PlainBackup> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error: unknown) {
    throw new BackupError('JSON として読めません', { cause: error });
  }
  if (isEncrypted(parsed)) {
    if (!passphrase)
      throw new BackupError('暗号化されたバックアップです。パスフレーズを入力してください');
    return decryptBackup(parsed, passphrase);
  }
  return asPlain(parsed);
}

export async function exportDb(db: PayrollDb, now: string): Promise<PlainBackup> {
  const entries = await Promise.all(
    TABLE_NAMES.map(async (name) => [name, await db.table(name).toArray()] as const),
  );
  return {
    format: BACKUP_FORMAT,
    version: VERSION,
    exportedAt: now,
    tables: Object.fromEntries(entries) as Record<TableName, unknown[]>,
  };
}

/** Replaces all data with the backup contents (single transaction). */
export async function importDb(db: PayrollDb, backup: PlainBackup): Promise<void> {
  await db.transaction(
    'rw',
    TABLE_NAMES.map((n) => db.table(n)),
    async () => {
      for (const name of TABLE_NAMES) {
        await db.table(name).clear();
        await db.table(name).bulkAdd(backup.tables[name]);
      }
    },
  );
}

/** Deletes all data and restores the default item master. */
export async function clearDb(db: PayrollDb): Promise<void> {
  await db.transaction(
    'rw',
    TABLE_NAMES.map((n) => db.table(n)),
    async () => {
      for (const name of TABLE_NAMES) await db.table(name).clear();
      await db.items.bulkAdd(seedItems());
    },
  );
}
