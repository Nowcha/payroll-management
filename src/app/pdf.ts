// Browser-side PDF reading. pdf.js is loaded lazily so the first paint stays small.
import { extractPdfText, type PdfJsLike, type PdfPageText } from '../import/pdfText';
import { parsePayslip, PayslipParseError, type ParsedPayslip } from '../import/payslip';
import { parseWithholdingSlip, type WithholdingSlipData } from '../import/withholding';

const assetBase = `${import.meta.env.BASE_URL}pdfjs/`;

let pdfjsPromise: Promise<PdfJsLike> | null = null;

async function loadPdfJs(): Promise<PdfJsLike> {
  pdfjsPromise ??= (async () => {
    const [pdfjs, worker] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs as unknown as PdfJsLike;
  })();
  return pdfjsPromise;
}

export async function readPdfFile(file: File): Promise<PdfPageText[]> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  return extractPdfText(pdfjs, data, {
    cMapUrl: `${assetBase}cmaps/`,
    standardFontDataUrl: `${assetBase}standard_fonts/`,
  });
}

export type ReadResult =
  | { kind: 'payslip'; fileName: string; slip: ParsedPayslip }
  | { kind: 'withholding'; fileName: string; slip: WithholdingSlipData }
  | { kind: 'error'; fileName: string; message: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Detects the document type from its title and parses it. */
export async function readDocument(file: File): Promise<ReadResult> {
  try {
    const pages = await readPdfFile(file);
    const isWithholding = pages[0]?.items.some((i) => i.str.includes('源泉徴収票')) ?? false;
    if (isWithholding)
      return { kind: 'withholding', fileName: file.name, slip: parseWithholdingSlip(pages) };
    return { kind: 'payslip', fileName: file.name, slip: parsePayslip(pages) };
  } catch (error: unknown) {
    const prefix = error instanceof PayslipParseError ? '明細の読取ルールに合いません: ' : '';
    return { kind: 'error', fileName: file.name, message: prefix + errorMessage(error) };
  }
}
