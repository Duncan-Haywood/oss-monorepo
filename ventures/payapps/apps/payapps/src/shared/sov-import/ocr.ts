// A scan with no text layer, read by OCR: each page's picture goes to an OCR engine the caller
// supplies (in the app, Tesseract compiled to WebAssembly and run in the browser:
// src/client/lib/ocr.ts), and the words it returns are laid on the page where the picture puts them,
// as the same positioned text runs a searchable scan's invisible text layer gives. From there the
// import reads the page exactly as it reads a searchable scan (levelled, OCR'd borders dropped,
// misread figures pointed at). Pure: the engine is a function argument, so tests use a fake.
import type { ImageUnreadable, OcrImage } from "../pdf/images";
import { type PageText, type PdfText, placedAt, type TextRun } from "../pdf/text";

/** A word the engine read, as a box in the picture's pixels (y down from the top-left). */
export interface OcrWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** How sure the engine is of the word, 0 to 100, when it says (Tesseract does). */
  confidence?: number;
}

/** A line of words, with its baseline (pixels) and the height of its row of text (pixels). */
export interface OcrLine {
  words: OcrWord[];
  baseline: { x0: number; y0: number; x1: number; y1: number };
  rowHeight: number;
}

/** What the engine is asked to read: the picture as a file, and its resolution on the page. */
export interface OcrRequest {
  image: OcrImage;
  /** Pixels per inch as the picture is placed on the page (Tesseract reads small text by it). */
  dpi: number;
  /**
   * Read the picture turned half round (180 degrees), with the boxes in the turned picture's pixels.
   * Asked for when a first read is mostly unsure: Tesseract reads text running down the picture (a
   * sheet turned a quarter clockwise) by itself, but not text running up it or upside down, which
   * half a turn makes into the two it reads.
   */
  upsideDown?: boolean;
}

/** An OCR engine: reads one picture, returns its lines. May throw (an engine that failed to load). */
export type Ocr = (request: OcrRequest) => Promise<OcrLine[]>;

/** Called before each page is read, so a screen can say which page it is on. */
export type OcrProgress = (page: number, pages: number) => void;

/**
 * "9.200.00": OCR read the thousands comma as a full stop. No locale writes an amount that way (a
 * German one is 9.200,00), so the figure is unambiguous; the import says how many it put right.
 */
const DOTTED_THOUSANDS = /^(\$?)(\d{1,3}(?:\.\d{3})+)\.(\d{2})$/;

/** A word with "9.200.00" put right as "9,200.00", or null when it is not one. */
export function fixDottedThousands(word: string): string | null {
  const m = DOTTED_THOUSANDS.exec(word);
  return m ? `${m[1]}${(m[2] ?? "").replaceAll(".", ",")}.${m[3]}` : null;
}

/** Pages read by OCR, at a few seconds a page in a browser. */
export const MAX_OCR_PAGES = 10;
/** A picture smaller than this on the page (points, each side) is a logo or a stamp, not the sheet. */
const MIN_PICTURE_POINTS = 144;

type M = [number, number, number, number, number, number];
type P = [number, number];

/** How much of the page a placed picture covers, in square points. */
const area = (m: M) => Math.abs(m[0] * m[3] - m[1] * m[2]);

/** Point p turned q quarter turns anticlockwise (y down: +y to +x is one), and back. */
const turn = (q: number, [x, y]: P): P =>
  q === 1 ? [y, -x] : q === 2 ? [-x, -y] : q === 3 ? [-y, x] : [x, y];
const unturn = (q: number, p: P): P => turn((4 - q) % 4, p);
/** Which way a vector points, in quarter turns from +x (y down): 0 right, 1 down, 2 left, 3 up. */
const quarter = ([dx, dy]: P) =>
  Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 0 : 2) : dy >= 0 ? 1 : 3;

/** What the words on a page said beyond their text: fixes made, and pages read turned. */
export interface OcrFixes {
  dottedThousands: string[];
  /** Pages whose text, as displayed, ran down, up or upside down, and was read turned. */
  turnedPages?: number[];
}

/**
 * Text runs for one page from the lines the engine read in its picture. A word's run starts and
 * ends where its box meets the line's baseline, as a text layer draws it. A line may run any of the
 * four ways in the picture (Tesseract reads a sheet turned a quarter, and `ocrText` turns an
 * upside-down one), and the picture may be placed on its side; what counts is which way the words
 * run on the page as displayed. When most of them run down, up or right to left there (a sheet
 * scanned on its side), the page is read turned so they run left to right, as a person would turn
 * the paper. A word that runs another way than most (a stamp on its side) is left out, as the text
 * reader leaves out rotated text.
 */
export function runsFromOcr(
  lines: readonly OcrLine[],
  m: M,
  width: number,
  height: number,
  fixed: OcrFixes = { dottedThousands: [] },
  page?: number,
): TextRun[] {
  const at = ([px, py]: P) => placedAt(m, px / width, 1 - py / height);
  const words: { from: P; to: P; size: number; text: string }[] = [];
  for (const line of lines) {
    const b = line.baseline;
    // Read the line in a frame turned so it runs left to right in the picture; the old, level case
    // (q = 0) is the frame itself.
    const q = quarter([b.x1 - b.x0, b.y1 - b.y0]);
    const [bx0, by0] = turn(q, [b.x0, b.y0]);
    const [bx1, by1] = turn(q, [b.x1, b.y1]);
    const slope = bx1 !== bx0 ? (by1 - by0) / (bx1 - bx0) : 0;
    const baseY = (x: number) => by0 + slope * (x - bx0);
    // Points per pixel across the line: the size a row of text this many pixels tall is drawn at.
    const [ux, uy] = unturn(q, [0, 1]);
    const across = Math.hypot(
      (ux * m[0]) / width - (uy * m[2]) / height,
      (ux * m[1]) / width - (uy * m[3]) / height,
    );
    const size = Math.max(1, line.rowHeight * across);
    for (const w of line.words) {
      let text = w.text.trim();
      if (!text) continue;
      const dotted = fixDottedThousands(text);
      if (dotted) {
        fixed.dottedThousands.push(text);
        text = dotted;
      }
      const xs = [turn(q, [w.x0, w.y0])[0], turn(q, [w.x1, w.y1])[0]];
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      words.push({
        from: at(unturn(q, [x0, baseY(x0)])),
        to: at(unturn(q, [x1, baseY(x1)])),
        size,
        text,
      });
    }
  }
  // The way most of the page's text runs as displayed (by characters), and the page turned to it.
  const weight = [0, 0, 0, 0];
  for (const w of words) {
    const k = quarter([w.to[0] - w.from[0], w.to[1] - w.from[1]]);
    weight[k] = (weight[k] ?? 0) + w.text.length;
  }
  const q = weight.indexOf(Math.max(...weight));
  if (q && page !== undefined) {
    fixed.turnedPages ??= [];
    fixed.turnedPages.push(page);
  }
  // Turned, the picture's corners would sit at negative points; move them back to the page's corner.
  const corners = (
    [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as P[]
  ).map(([x, y]) => turn(q, placedAt(m, x, y)));
  const dx = q ? -Math.min(...corners.map((c) => c[0])) : 0;
  const dy = q ? -Math.min(...corners.map((c) => c[1])) : 0;
  const runs: TextRun[] = [];
  for (const w of words) {
    const [x0, y0] = turn(q, w.from);
    const [x1, y1] = turn(q, w.to);
    const run = x1 - x0;
    if (!(run > 0) || Math.abs(y1 - y0) > run * 0.1) continue;
    // A word ends in a space, as in the text layer Tesseract writes into a searchable PDF, so words
    // the table reader joins into one cell ("01 10 00") keep their spaces.
    runs.push({ x0: x0 + dx, x1: x1 + dx, y: y0 + dy, size: w.size, text: `${w.text} ` });
  }
  return runs;
}

/** Characters in words the engine is sure of, and in all its words (null: it gave no confidence). */
function sureness(lines: readonly OcrLine[]): { sure: number; all: number } | null {
  let sure = 0;
  let all = 0;
  for (const l of lines)
    for (const w of l.words) {
      if (w.confidence === undefined) return null;
      const n = w.text.trim().length;
      all += n;
      if (w.confidence >= SURE) sure += n;
    }
  return { sure, all };
}
/** Tesseract's confidence above which a word is taken as read (an upright page: 99% of its words). */
const SURE = 60;
/** A read with fewer sure characters than this share is tried again turned half round. */
const UNSURE_READ = 0.6;

/** Lines read in the picture turned half round, put back in the picture's own pixels. */
export function unturnHalf(lines: readonly OcrLine[], width: number, height: number): OcrLine[] {
  return lines.map((l) => ({
    ...l,
    baseline: {
      x0: width - l.baseline.x0,
      y0: height - l.baseline.y0,
      x1: width - l.baseline.x1,
      y1: height - l.baseline.y1,
    },
    words: l.words.map((w) => ({
      ...w,
      x0: width - w.x1,
      y0: height - w.y1,
      x1: width - w.x0,
      y1: height - w.y0,
    })),
  }));
}

/** The scan's text, read by OCR from each page's picture, or why it could not be. */
export async function ocrText(
  text: PdfText,
  ocr: Ocr,
  onProgress?: OcrProgress,
): Promise<
  | { ok: true; text: PdfText; dottedThousands: string[]; turnedPages: number[] }
  | { ok: false; error: string }
> {
  const pages = text.pages.filter((p) => p.images?.length).slice(0, MAX_OCR_PAGES);
  if (!pages.length)
    return { ok: false, error: "This PDF has no text and no picture of a page to read." };
  const out: PageText[] = [];
  const reasons = new Set<string>();
  const fixed: OcrFixes = { dottedThousands: [], turnedPages: [] };
  let chars = 0;
  for (const [i, page] of pages.entries()) {
    onProgress?.(i + 1, pages.length);
    // The largest picture on the page is the sheet; the rest are logos, stamps and signatures.
    const placed = [...(page.images ?? [])]
      .filter(
        (p) =>
          Math.min(Math.hypot(p.m[0], p.m[1]), Math.hypot(p.m[2], p.m[3])) >= MIN_PICTURE_POINTS,
      )
      .sort((a, b) => area(b.m) - area(a.m));
    let read: { image: OcrImage; m: M } | null = null;
    for (const p of placed) {
      const image: OcrImage | ImageUnreadable = await p.read();
      if ("unreadable" in image) {
        reasons.add(image.unreadable);
        continue;
      }
      read = { image, m: p.m };
      break;
    }
    if (!read) continue;
    const { image, m } = read;
    const dpi = Math.round(image.width / (Math.hypot(m[0], m[1]) / 72));
    const request = { image, dpi: Math.max(70, Math.min(1200, dpi)) };
    let lines: OcrLine[];
    try {
      lines = await ocr(request);
      // Mostly unsure: the sheet may run up the picture or be upside down. Read it half turned and
      // keep whichever read the engine is surer of.
      const first = sureness(lines);
      if (first && first.sure < UNSURE_READ * first.all) {
        const turned = unturnHalf(
          await ocr({ ...request, upsideDown: true }),
          image.width,
          image.height,
        );
        if ((sureness(turned)?.sure ?? 0) > first.sure) lines = turned;
      }
    } catch {
      return {
        ok: false,
        error:
          "The text reader for scans did not load (it is downloaded the first time a scan is read, about 7 MB). Check the connection and choose the file again, or choose the .xlsx or CSV the schedule was made in.",
      };
    }
    const runs = runsFromOcr(lines, m, image.width, image.height, fixed, page.page);
    for (const r of runs) chars += r.text.length;
    out.push({ page: page.page, runs, rules: [] });
  }
  if (!out.length)
    return {
      ok: false,
      error: `This scan's pages could not be read: ${[...reasons].join("; ") || "no picture of the sheet was found"}. Scan it again as a searchable PDF (most office scanners and scanning apps, such as Adobe Scan or Microsoft Lens, have that setting, sometimes called OCR), or choose the .xlsx or CSV the schedule was made in.`,
    };
  if (chars < 20)
    return {
      ok: false,
      error:
        "No text could be read from this scan. Scan it again straight at 300 dpi, or choose the .xlsx or CSV the schedule was made in.",
    };
  // Every character came from OCR: to the import this is a scan, read as one.
  return {
    ok: true,
    text: { pages: out, chars, unreadable: 0, invisible: chars },
    dottedThousands: fixed.dottedThousands,
    turnedPages: fixed.turnedPages ?? [],
  };
}
