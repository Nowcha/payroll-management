// Local-only: parses every payslip under private/payslips and prints items, checks and
// cumulative issues. Output contains personal data — never commit it.
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_PAYSLIP_LAYOUT, parsePayslip } from '../src/import/payslip';
import { checkPayslip } from '../src/import/payslipChecks';
import { readPdfText } from './lib/node-pdf';

const ROOT = path.resolve(import.meta.dirname, '..', 'private', 'payslips');
const social = new Set(DEFAULT_PAYSLIP_LAYOUT.socialInsuranceItems);
const names = new Map<string, Set<string>>();

for (const year of readdirSync(ROOT).sort()) {
  for (const file of readdirSync(path.join(ROOT, year)).sort()) {
    const slip = parsePayslip(await readPdfText(path.join(ROOT, year, file)));
    const failed = checkPayslip(slip, (n) => social.has(n)).filter((c) => !c.ok);
    const items = slip.lines.map(
      (l) => `${l.block === 'payment' ? '+' : '-'}${l.name}=${l.amount}`,
    );
    console.log(
      `${failed.length ? '✗' : '✓'} ${file} ${slip.kind} ${slip.year}-${slip.month} ${items.join(' ')}` +
        ` | cum ${JSON.stringify(slip.cumulative)}` +
        (slip.remarks.length ? ` | 記事 ${slip.remarks.join(' ')}` : '') +
        (slip.warnings.length ? ` | WARN ${slip.warnings.join('; ')}` : '') +
        (failed.length
          ? ` | NG ${failed.map((c) => `${c.name} 票${c.expected}/計${c.actual}`).join('; ')}`
          : ''),
    );
    for (const l of slip.lines) {
      const key = `${l.block}:${l.name}`;
      if (!names.has(key)) names.set(key, new Set());
      names
        .get(key)!
        .add(
          `${slip.year}-${String(slip.month).padStart(2, '0')}${slip.kind === 'bonus' ? 'B' : ''}`,
        );
    }
  }
}
console.log('\n== 項目名一覧 ==');
for (const [k, v] of [...names].sort()) console.log(k, [...v].length, [...v].slice(0, 4).join(','));
