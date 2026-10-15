// Node-side adapter for src/import/pdfText.ts (local scripts only, never bundled).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPdfText, type PdfJsLike, type PdfPageText } from '../../src/import/pdfText';

const require = createRequire(import.meta.url);
const pdfjsRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));
// pdf.js requires URL-style separators and a trailing slash even for local paths.
const toDirUrl = (dir: string): string => path.join(pdfjsRoot, dir).split(path.sep).join('/') + '/';

export async function readPdfText(file: string): Promise<PdfPageText[]> {
  const data = new Uint8Array(await readFile(file));
  return extractPdfText(pdfjs as unknown as PdfJsLike, data, {
    cMapUrl: toDirUrl('cmaps'),
    standardFontDataUrl: toDirUrl('standard_fonts'),
  });
}
