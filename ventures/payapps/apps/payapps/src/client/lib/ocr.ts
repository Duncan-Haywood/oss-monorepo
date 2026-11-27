// OCR for a scanned schedule of values with no text layer, in the browser: Tesseract 5 compiled to
// WebAssembly (tesseract.js, Apache-2.0) with the English LSTM model (tessdata_best, integer, from
// @tesseract.js-data/eng). The engine, its worker and the model are served by this app under /ocr/
// (vite.config.ts copies them in at build time), so the scan is never uploaded and no third-party
// CDN is fetched. Loaded only when a scan with no text is chosen: about 3.9 MB of engine and
// 2.9 MB of model (gzipped); the model is kept in the browser's IndexedDB after the first scan.
import type { Ocr, OcrLine } from "@shared/sov-import";

/** Where vite.config.ts puts the engine's files in the built app. */
export const OCR_BASE = "/ocr";

const MIME = { jpeg: "image/jpeg", tiff: "image/tiff", pnm: "image/x-portable-anymap" } as const;

/** The shape of Tesseract's block output this reads (tesseract.js `Block`, trimmed). */
export interface TesseractBlock {
  paragraphs: {
    lines: {
      baseline: { x0: number; y0: number; x1: number; y1: number };
      rowAttributes: { row_height?: number; rowHeight?: number };
      bbox: { y0: number; y1: number };
      words: {
        text: string;
        confidence?: number;
        bbox: { x0: number; y0: number; x1: number; y1: number };
      }[];
    }[];
  }[];
}

/** Tesseract's blocks as the import's lines (pixels, y down). */
export function linesFromTesseract(
  blocks: readonly TesseractBlock[] | null | undefined,
): OcrLine[] {
  const out: OcrLine[] = [];
  for (const b of blocks ?? [])
    for (const p of b.paragraphs)
      for (const l of p.lines)
        out.push({
          baseline: l.baseline,
          rowHeight:
            l.rowAttributes.rowHeight ?? l.rowAttributes.row_height ?? l.bbox.y1 - l.bbox.y0,
          words: l.words.map((w) => ({
            text: w.text,
            ...w.bbox,
            ...(w.confidence === undefined ? {} : { confidence: w.confidence }),
          })),
        });
  return out;
}

type TesseractWorker = Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>>;
let worker: Promise<TesseractWorker> | null = null;

function engine(): Promise<TesseractWorker> {
  worker ??= (async () => {
    const { createWorker, OEM } = await import("tesseract.js");
    const base = new URL(OCR_BASE, window.location.origin).href;
    return createWorker("eng", OEM.LSTM_ONLY, {
      workerPath: `${base}/worker.min.js`,
      corePath: `${base}/core`,
      langPath: `${base}/lang`,
      workerBlobURL: false,
      gzip: true,
    });
  })().catch((e) => {
    worker = null; // a failed load (offline) is tried again on the next scan
    throw e;
  });
  return worker;
}

/** The app's OCR engine for `importSovFile`. */
export const browserOcr: Ocr = async ({ image, dpi, upsideDown }) => {
  const [w, { PSM }] = await Promise.all([engine(), import("tesseract.js")]);
  // Automatic page segmentation (3): a sheet of columns, not one block of text (tesseract.js's
  // default, 6, runs a ruled table's rows together).
  await w.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
    user_defined_dpi: String(dpi),
    preserve_interword_spaces: "1",
  });
  const blob = new Blob([image.bytes as BlobPart], { type: MIME[image.format] });
  // Half a turn, when asked, inside the engine (any picture format, same size, boxes in the turned
  // picture's pixels).
  const r = await w.recognize(blob, upsideDown ? { rotateRadians: Math.PI } : {}, {
    blocks: true,
    text: false,
  });
  return linesFromTesseract(r.data.blocks as unknown as TesseractBlock[]);
};
