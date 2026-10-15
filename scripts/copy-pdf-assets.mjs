// Copies pdf.js CID cMaps and standard fonts into public/pdfjs so the browser can load them
// offline from the same origin (requirements 6.2: cMapUrl + cMapPacked are mandatory).
import { cpSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.dirname(require.resolve('pdfjs-dist/package.json'));
const target = path.join(process.cwd(), 'public', 'pdfjs');
mkdirSync(target, { recursive: true });
for (const dir of ['cmaps', 'standard_fonts']) {
  cpSync(path.join(root, dir), path.join(target, dir), { recursive: true });
}
console.log(`pdf.js assets copied to ${target}`);
