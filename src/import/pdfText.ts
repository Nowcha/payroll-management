// Coordinate-aware text extraction shared by the browser app and the local Node scripts.
// The caller injects the pdf.js module so this file stays environment-agnostic.

export interface TextItem {
  str: string;
  /** Left edge in PDF user space (origin bottom-left). */
  x: number;
  /** Baseline y in PDF user space (larger = higher on the page). */
  y: number;
  width: number;
  height: number;
}

export interface PdfPageText {
  pageNumber: number;
  width: number;
  height: number;
  items: TextItem[];
}

interface PdfJsTextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

interface PdfJsPageLike {
  getViewport(params: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: unknown[] }>;
}

interface PdfJsDocumentLike {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfJsPageLike>;
}

export interface PdfJsLike {
  getDocument(params: {
    data: Uint8Array;
    cMapUrl: string;
    cMapPacked: boolean;
    standardFontDataUrl?: string;
    isEvalSupported?: boolean;
    useSystemFonts?: boolean;
  }): { promise: Promise<PdfJsDocumentLike>; destroy(): Promise<void> };
}

export interface ExtractOptions {
  /** Directory (Node) or URL (browser) of pdf.js bcmap files, ending with a slash. */
  cMapUrl: string;
  standardFontDataUrl?: string;
}

export class PdfTextError extends Error {}

function isTextItem(value: unknown): value is PdfJsTextItemLike {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.str === 'string' && Array.isArray(v.transform);
}

const JAPANESE = /[぀-ヿ㐀-鿿]/;

/**
 * Extracts positioned text from every page. Throws when no Japanese text is found,
 * which almost always means the CID cMap was not loaded (requirements 6.2).
 */
export async function extractPdfText(
  pdfjs: PdfJsLike,
  data: Uint8Array,
  options: ExtractOptions,
): Promise<PdfPageText[]> {
  const task = pdfjs.getDocument({
    data,
    cMapUrl: options.cMapUrl,
    cMapPacked: true,
    standardFontDataUrl: options.standardFontDataUrl,
    isEvalSupported: false,
  });
  try {
    const doc = await task.promise;
    const pages: PdfPageText[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: TextItem[] = [];
      for (const raw of content.items) {
        if (!isTextItem(raw)) continue;
        const str = raw.str.trim();
        if (str === '') continue;
        items.push({
          str,
          x: raw.transform[4] ?? 0,
          y: raw.transform[5] ?? 0,
          width: raw.width,
          height: raw.height,
        });
      }
      pages.push({ pageNumber: n, width: viewport.width, height: viewport.height, items });
    }
    if (!pages.some((p) => p.items.some((i) => JAPANESE.test(i.str)))) {
      throw new PdfTextError(
        'PDF から日本語の項目名を1件も読めませんでした。cMapUrl / cMapPacked の設定を確認してください',
      );
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

/** Parses a printed amount such as "1,234,567", "△1,200", "-500" into integer yen. */
export function parseAmount(text: string): number | null {
  const normalized = text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[，,円\s]/g, '')
    .replace(/^[△▲−-]/, '-');
  if (!/^-?\d+$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isSafeInteger(value) ? value : null;
}
