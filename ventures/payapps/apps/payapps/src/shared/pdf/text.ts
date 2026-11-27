// Pulls the positioned text out of a PDF's pages: each string a page shows, with where it starts
// and ends on the page as the reader sees it (after /Rotate), and its size. Enough to rebuild the
// rows and columns of a table that a spreadsheet or estimating program printed. Runs the text and
// graphics-state operators of the content streams (ISO 32000-1 §8.4, §9.3-9.4) and form XObjects;
// it draws nothing. Also keeps the straight, axis-aligned rules a page paints (cell borders: a
// stroked line, as LibreOffice draws them, or a thin filled rectangle, as Chromium does; §8.5),
// so a ruled table's columns can be read from its borders. Bounded: pages, operators, nesting and text are all capped, so a hostile file
// costs a fixed amount of work.
import { type Font, loadFont, UNREADABLE } from "./fonts";
import { type ImageUnreadable, imageForOcr, type OcrImage } from "./images";
import { isWhite, Lexer, PdfDict, PdfName, PdfStream, PdfString, type PdfValue } from "./objects";
import { decodeStream, PdfReader, PdfUnreadable } from "./reader";

export interface TextRun {
  /** Left and right edge, and baseline, in points from the page's top-left as displayed (y grows down). */
  x0: number;
  x1: number;
  y: number;
  /** Font size as drawn, in points. */
  size: number;
  text: string;
}

/**
 * A straight rule the page paints, as the box it covers on the page as displayed (points, y down):
 * a vertical one is narrow in x, a horizontal one narrow in y. Curves and slanted lines are left out.
 */
export interface Rule {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * A picture the page paints (an image XObject, ISO 32000-1 §8.9.5): the stream, and where its unit
 * square lands on the page as displayed (points, y down): image pixel (px, py) of a W x H image is at
 * `placedAt(m, px / W, 1 - py / H)`. A scan with no text layer is one such picture per page.
 */
export interface PlacedImage {
  m: [number, number, number, number, number, number];
  /** The picture as a file for OCR (decoded on demand; never throws). */
  read: () => Promise<OcrImage | ImageUnreadable>;
}

export interface PageText {
  /** 1-based page number. */
  page: number;
  runs: TextRun[];
  /** Rules (borders) painted in a visible colour, at most `MAX_RULES` per file. */
  rules: Rule[];
  /** Pictures the page paints, at most `MAX_PAGE_IMAGES` per page; left out when there are none. */
  images?: PlacedImage[];
  /**
   * Markup laid over the page (stamps, typed-on text boxes), read only when asked for: the text of
   * each annotation's normal appearance, placed on the page as displayed, its /Contents and the
   * date it was last changed (/M). Left out when not asked for or when there are none.
   */
  annotations?: AnnotationText[];
}

/** One stamp or text-box annotation (ISO 32000-1 §12.5): what it shows and what it says it is. */
export interface AnnotationText {
  /** "Stamp" or "FreeText". */
  subtype: string;
  /** The text drawn by its appearance stream, in page coordinates (y down), like `PageText.runs`. */
  runs: TextRun[];
  /** /Contents: the text a viewer shows for it (a stamp's name, a text box's words). */
  contents: string | null;
  /** /M as YYYY-MM-DD, when it holds a PDF date (§7.9.4). */
  modified: string | null;
}

export interface ExtractOptions {
  /** Also read stamp and text-box annotations (`PageText.annotations`). */
  annotations?: boolean;
  /** Pages read (`MAX_TEXT_PAGES` when not given). */
  maxPages?: number;
}

/** Annotation kinds whose text a reviewer's stamp is made of. */
const STAMP_SUBTYPES = new Set(["Stamp", "FreeText"]);
/** Annotations read per page, so a file with thousands of markups costs a fixed amount. */
export const MAX_PAGE_ANNOTATIONS = 64;
const MAX_ANNOTATION_TEXT = 2_000;

export interface PdfText {
  pages: PageText[];
  /** Characters drawn, and how many of them could not be turned back into text. */
  chars: number;
  unreadable: number;
  /**
   * Characters drawn in an invisible text rendering mode (3 or 7, ISO 32000-1 §9.3.6): the text layer
   * a scanner's or a scanning app's OCR lays over the page picture, so the scan can be searched.
   */
  invisible: number;
  /** Pages in the file, read or not (only the first `maxPages` are read). */
  pageCount?: number;
}

export const MAX_TEXT_PAGES = 40;
const MAX_OPS = 2_000_000;
const MAX_RUNS = 100_000;
const MAX_RULES = 50_000;
/** Path segments kept for one path; a longer path (a drawing, a chart) adds no rules. */
const MAX_PATH_SEGMENTS = 4_000;
/** A filled rectangle at most this thick, in points, is a rule. */
const RULE_THICKNESS = 3;
const MAX_FORM_DEPTH = 8;
/** Pictures kept per page (references to their streams, nothing decoded). */
export const MAX_PAGE_IMAGES = 8;
/** Bytes of decoded content streams one file may take. */
const MAX_CONTENT_BYTES = 32 * 1024 * 1024;

type M = [number, number, number, number, number, number];
const IDENTITY: M = [1, 0, 0, 1, 0, 0];
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
];
/** Where point (x, y) of a placed image's unit square lands on the page as displayed. */
export const placedAt = (m: PlacedImage["m"], x: number, y: number): [number, number] => [
  x * m[0] + y * m[2] + m[4],
  x * m[1] + y * m[3] + m[5],
];
const apply = (m: M, x: number, y: number): [number, number] => [
  x * m[0] + y * m[2] + m[4],
  x * m[1] + y * m[3] + m[5],
];
const finite = (n: number) => (Number.isFinite(n) ? n : 0);

interface GState {
  ctm: M;
  font: Font | null;
  size: number;
  charSpace: number;
  wordSpace: number;
  scale: number;
  leading: number;
  rise: number;
  /** Text rendering mode (Tr): 3 and 7 draw nothing visible. */
  render: number;
  lineWidth: number;
  /** Whether the stroke and fill colours are white (paint that leaves no visible mark on paper). */
  strokeWhite: boolean;
  fillWhite: boolean;
  /** The clip in force, as a box on the page as displayed, when every clip set so far was a rectangle (or a bound on one). */
  clip: Rule | null;
}

const isOperandStart = (c: number | undefined) =>
  c === 0x2f || c === 0x28 || c === 0x3c || c === 0x5b;
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)$/;

class Budget {
  ops = 0;
  runs = 0;
  rules = 0;
  contentBytes = 0;
  chars = 0;
  unreadable = 0;
  invisible = 0;
}

/**
 * Reads the text of the first `maxPages` pages (`MAX_TEXT_PAGES` unless asked; a spec book asks
 * for more). The op, run and byte budgets hold whatever the page count. Throws PdfUnreadable for a
 * file that is not a readable PDF.
 */
export async function extractText(
  bytes: Uint8Array,
  options: ExtractOptions = {},
): Promise<PdfText> {
  const reader = await PdfReader.open(bytes);
  const all = reader.pages();
  const pages = all.slice(0, options.maxPages ?? MAX_TEXT_PAGES);
  const budget = new Budget();
  const fontCache = new Map<PdfValue, Font>();
  const out: PageText[] = [];
  for (const [i, page] of pages.entries()) {
    const runs: TextRun[] = [];
    const rules: Rule[] = [];
    const images: PlacedImage[] = [];
    const box = page.cropBox ?? page.mediaBox;
    const [bx0, by0, bx1, by1] = [
      Math.min(box[0] ?? 0, box[2] ?? 0),
      Math.min(box[1] ?? 0, box[3] ?? 0),
      Math.max(box[0] ?? 0, box[2] ?? 0),
      Math.max(box[1] ?? 0, box[3] ?? 0),
    ];
    // From user space to the page as displayed, y down from the top-left corner.
    const w = bx1 - bx0;
    const h = by1 - by0;
    const toTopLeft: M = [1, 0, 0, -1, -bx0, by1];
    const rot: Record<number, M> = {
      0: IDENTITY,
      90: [0, 1, -1, 0, h, 0],
      180: [-1, 0, 0, -1, w, h],
      270: [0, -1, 1, 0, 0, w],
    };
    const display = mul(toTopLeft, rot[page.rotate] ?? IDENTITY);
    const contents = reader.resolve(page.dict.get("Contents"));
    const streams = (
      Array.isArray(contents) ? contents.map((c) => reader.resolve(c)) : [contents]
    ).filter((s): s is PdfStream => s instanceof PdfStream);
    const parts: Uint8Array[] = [];
    for (const s of streams) {
      try {
        const data = await decodeStream(s, MAX_CONTENT_BYTES - budget.contentBytes);
        budget.contentBytes += data.length;
        parts.push(data, Uint8Array.of(10));
      } catch {
        // An unsupported filter or a damaged stream: read what the other streams hold.
      }
    }
    const content = concat(parts);
    await run(
      reader,
      content,
      reader.dict(page.resources),
      display,
      { runs, rules, images },
      budget,
      fontCache,
      0,
    );
    const annotations = options.annotations
      ? await readAnnotations(reader, page.dict, display, budget, fontCache)
      : [];
    out.push({
      page: i + 1,
      runs,
      rules,
      ...(images.length ? { images } : {}),
      ...(annotations.length ? { annotations } : {}),
    });
  }
  return {
    pages: out,
    chars: budget.chars,
    unreadable: budget.unreadable,
    invisible: budget.invisible,
    pageCount: all.length,
  };
}

/**
 * A PDF text string (§7.9.2.2): UTF-16BE after a byte-order mark, UTF-8 after its mark (PDF 2.0),
 * else PDFDocEncoding, read here as Latin-1 (the two differ only in a few rarely used symbols).
 */
export function textString(bytes: Uint8Array): string {
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let s = "";
    for (let i = 2; i + 1 < bytes.length; i += 2)
      s += String.fromCharCode(((bytes[i] as number) << 8) | (bytes[i + 1] as number));
    return s;
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return new TextDecoder().decode(bytes.subarray(3));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

/** A PDF date (`D:YYYYMMDDHHmmSS...`, §7.9.4) as YYYY-MM-DD, or null when it is not one. */
export function pdfDate(s: string): string | null {
  const m = /^(?:D:)?(\d{4})(\d{2})(\d{2})/.exec(s.trim());
  if (!m) return null;
  const [, y, mo, d] = m as unknown as [string, string, string, string];
  const iso = `${y}-${mo}-${d}`;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === iso ? iso : null;
}

const numbers = (v: PdfValue | undefined, n: number): number[] | null =>
  Array.isArray(v) && v.length === n && v.every((x) => typeof x === "number")
    ? (v as number[]).map(finite)
    : null;

/**
 * The stamp and text-box annotations of one page. Each one's normal appearance (/AP /N, a form
 * XObject) is run as the viewer draws it: its /BBox, transformed by its /Matrix, is fitted to the
 * annotation's /Rect (§12.5.5), so its text lands where it shows on the page.
 */
async function readAnnotations(
  reader: PdfReader,
  pageDict: PdfDict,
  display: M,
  budget: Budget,
  fontCache: Map<PdfValue, Font>,
): Promise<AnnotationText[]> {
  const list = reader.resolve(pageDict.get("Annots"));
  if (!Array.isArray(list)) return [];
  const out: AnnotationText[] = [];
  for (const ref of list.slice(0, MAX_PAGE_ANNOTATIONS)) {
    const annot = reader.dict(ref);
    const sub = annot && reader.resolve(annot.get("Subtype"));
    if (!annot || !(sub instanceof PdfName) || !STAMP_SUBTYPES.has(sub.name)) continue;
    // Hidden (bit 2) and NoView (bit 6) annotations are not on the page as a reader sees it.
    const flags = reader.resolve(annot.get("F"));
    if (typeof flags === "number" && (flags & 0b100010) !== 0) continue;
    const c = reader.resolve(annot.get("Contents"));
    const contents =
      c instanceof PdfString
        ? textString(c.bytes).slice(0, MAX_ANNOTATION_TEXT).trim() || null
        : null;
    const md = reader.resolve(annot.get("M"));
    const modified = md instanceof PdfString ? pdfDate(textString(md.bytes)) : null;
    const runs: TextRun[] = [];
    const ap = reader.dict(annot.get("AP"));
    let normal: PdfValue | undefined = reader.resolve(ap?.get("N"));
    if (normal instanceof PdfDict) {
      // Appearance states (§12.5.5): the one named by /AS.
      const as = reader.resolve(annot.get("AS"));
      normal = as instanceof PdfName ? reader.resolve(normal.get(as.name)) : undefined;
    }
    const rect = numbers(reader.resolve(annot.get("Rect")), 4);
    if (normal instanceof PdfStream && rect) {
      const bbox = numbers(reader.resolve(normal.dict.get("BBox")), 4) ?? [0, 0, 1, 1];
      const matrix = (numbers(reader.resolve(normal.dict.get("Matrix")), 6) ?? IDENTITY) as M;
      const corners = [
        apply(matrix, bbox[0] as number, bbox[1] as number),
        apply(matrix, bbox[2] as number, bbox[1] as number),
        apply(matrix, bbox[0] as number, bbox[3] as number),
        apply(matrix, bbox[2] as number, bbox[3] as number),
      ];
      const xs = corners.map((p) => p[0]);
      const ys = corners.map((p) => p[1]);
      const [tx0, tx1, ty0, ty1] = [
        Math.min(...xs),
        Math.max(...xs),
        Math.min(...ys),
        Math.max(...ys),
      ];
      const [rx0, ry0, rx1, ry1] = [
        Math.min(rect[0] as number, rect[2] as number),
        Math.min(rect[1] as number, rect[3] as number),
        Math.max(rect[0] as number, rect[2] as number),
        Math.max(rect[1] as number, rect[3] as number),
      ];
      if (tx1 > tx0 && ty1 > ty0) {
        const sx = (rx1 - rx0) / (tx1 - tx0);
        const sy = (ry1 - ry0) / (ty1 - ty0);
        const fit: M = [sx, 0, 0, sy, rx0 - tx0 * sx, ry0 - ty0 * sy];
        try {
          const data = await decodeStream(normal, MAX_CONTENT_BYTES - budget.contentBytes);
          budget.contentBytes += data.length;
          await run(
            reader,
            data,
            reader.dict(normal.dict.get("Resources")),
            mul(mul(matrix, fit), display),
            { runs, rules: [], images: [] },
            budget,
            fontCache,
            1,
          );
        } catch (e) {
          if (e instanceof PdfUnreadable) throw e;
          // A damaged appearance: its /Contents may still say what it is.
        }
      }
    }
    if (runs.length || contents) out.push({ subtype: sub.name, runs, contents, modified });
  }
  return out;
}

function concat(parts: Uint8Array[]) {
  let n = 0;
  for (const p of parts) n += p.length;
  const o = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    o.set(p, at);
    at += p.length;
  }
  return o;
}

async function run(
  reader: PdfReader,
  content: Uint8Array,
  resources: PdfDict | undefined,
  base: M,
  sink: { runs: TextRun[]; rules: Rule[]; images: PlacedImage[] },
  budget: Budget,
  fontCache: Map<PdfValue, Font>,
  depth: number,
  clip: Rule | null = null,
) {
  const fonts = reader.dict(resources?.get("Font"));
  const xobjects = reader.dict(resources?.get("XObject"));
  const { runs, rules } = sink;
  const stack: GState[] = [];
  let gs: GState = {
    ctm: base,
    font: null,
    size: 0,
    charSpace: 0,
    wordSpace: 0,
    scale: 1,
    leading: 0,
    rise: 0,
    render: 0,
    lineWidth: 1,
    strokeWhite: false,
    fillWhite: false,
    clip,
  };
  let tm: M = IDENTITY;
  let tlm: M = IDENTITY;
  const lx = new Lexer(content, 0);
  const operands: PdfValue[] = [];
  const n = (i: number) => {
    const v = operands[operands.length - i];
    return typeof v === "number" ? finite(v) : 0;
  };

  /** Draws one string; "space" when it held only blanks (a space drawn as its own piece). */
  const show = (s: PdfString): TextRun | "space" | null => {
    const font = gs.font;
    if (!font || budget.runs >= MAX_RUNS) return null;
    const trm = mul([gs.size * gs.scale, 0, 0, gs.size, 0, gs.rise], mul(tm, gs.ctm));
    const [x, y] = apply(trm, 0, 0);
    let advance = 0; // in text space units
    let text = "";
    // Each glyph's text and where it starts and ends along the run, for the clip below.
    const glyphs: { text: string; a0: number; a1: number }[] = [];
    for (const g of font.decode(s.bytes)) {
      // A glyph with no text that still moves the pen a space's width is a space (subset fonts
      // often leave the space out of their ToUnicode map).
      const t = g.text === "" && g.width >= 150 ? " " : g.text;
      text += t;
      budget.chars++;
      if (g.text === UNREADABLE) budget.unreadable++;
      if (gs.render === 3 || gs.render === 7) budget.invisible++;
      const a0 = advance;
      advance +=
        ((g.width / 1000) * gs.size + gs.charSpace + (g.isSpace ? gs.wordSpace : 0)) * gs.scale;
      glyphs.push({ text: t, a0, a1: a0 + (g.width / 1000) * gs.size * gs.scale });
    }
    const moved = mul([1, 0, 0, 1, advance, 0], tm);
    const [ex, ey] = apply(mul(moved, gs.ctm), 0, gs.rise);
    tm = moved;
    // Only text that runs left to right on the page as displayed: rotated labels are not table cells.
    const dx = ex - x;
    const dy = ey - y;
    if (text.trim() === "") return text === "" ? null : "space";
    if (dx <= 0 || Math.abs(dy) > Math.abs(dx) * 0.1) return null;
    const size = Math.hypot(trm[2], trm[3]);
    if (!(size > 0.5)) return null;
    let [x0, x1] = [x, ex];
    const clip = gs.clip;
    if (clip) {
      // A spreadsheet prints a cell's text whole and clips it at the cell's border: only the glyphs
      // whose middle the clip shows are on the page as a reader sees it.
      if (y < clip.y0 - 0.5 || y > clip.y1 + 0.5) return null;
      const at = (a: number) => x + (advance > 0 ? (dx * a) / advance : 0);
      const shown = glyphs.filter((g) => {
        const mid = at((g.a0 + g.a1) / 2);
        return mid >= clip.x0 - 0.5 && mid <= clip.x1 + 0.5;
      });
      if (shown.length < glyphs.length) {
        text = shown.map((g) => g.text).join("");
        if (text.trim() === "") return null;
        x0 = at((shown[0] as (typeof glyphs)[number]).a0);
        x1 = at((shown[shown.length - 1] as (typeof glyphs)[number]).a1);
      }
    }
    const r = { x0, x1, y, size, text };
    runs.push(r);
    budget.runs++;
    return r;
  };
  // The pieces of one TJ array are one run (kerning between letters) unless an adjustment opens a
  // gap of an eighth of the font size or more (a space is about a quarter).
  const showArray = (arr: PdfValue[]) => {
    let prev: TextRun | null = null;
    let gap = 0;
    let space = false;
    for (const item of arr) {
      if (item instanceof PdfString) {
        const r = show(item);
        if (r === "space") {
          space = true;
          continue;
        }
        if (r && prev && gap < 0.12 && runs[runs.length - 1] === r) {
          runs.pop();
          budget.runs--;
          prev.text += (space ? " " : "") + r.text;
          prev.x1 = Math.max(prev.x1, r.x1);
        } else if (r) prev = r;
        gap = 0;
        space = false;
      } else if (typeof item === "number") {
        const tx = (-finite(item) / 1000) * gs.size * gs.scale;
        gap += -finite(item) / 1000;
        tm = mul([1, 0, 0, 1, tx, 0], tm);
      }
    }
  };
  const nextLine = () => {
    tlm = mul([1, 0, 0, 1, 0, -gs.leading], tlm);
    tm = tlm;
  };

  // The current path, in page coordinates as displayed (the CTM applies when a point is added,
  // ISO 32000-1 §8.5.2): its straight segments, and the rectangles `re` added, for fills.
  let segments: [number, number, number, number][] = [];
  let boxes: Rule[] = [];
  let at: [number, number] | null = null;
  let start: [number, number] | null = null;
  let overflow = false;
  let clipping = false;
  /** Every point the path names, control points included: the curve lies inside them, so their box bounds a clip. */
  let extent: [number, number][] = [];
  const point = (x: number, y: number) => apply(gs.ctm, x, y);
  const segment = (a: [number, number], b: [number, number]) => {
    if (segments.length >= MAX_PATH_SEGMENTS) overflow = true;
    else segments.push([a[0], a[1], b[0], b[1]]);
  };
  const clearPath = () => {
    // W or W* marks the path as a clip, which takes effect when the path is painted or ended
    // (ISO 32000-1 §8.5.4). Kept as the box the path covers: exact for a rectangle (a cell), and
    // never smaller than the true clip for any other shape, so no text the page shows is dropped.
    if (clipping && extent.length && !overflow) {
      const xs = extent.map((q) => q[0]);
      const ys = extent.map((q) => q[1]);
      const box = {
        x0: Math.min(...xs),
        x1: Math.max(...xs),
        y0: Math.min(...ys),
        y1: Math.max(...ys),
      };
      const c = gs.clip;
      gs.clip = c
        ? {
            x0: Math.max(c.x0, box.x0),
            x1: Math.min(c.x1, box.x1),
            y0: Math.max(c.y0, box.y0),
            y1: Math.min(c.y1, box.y1),
          }
        : box;
    }
    clipping = false;
    extent = [];
    segments = [];
    boxes = [];
    at = null;
    start = null;
    overflow = false;
  };
  const keep = (r: Rule) => {
    if (budget.rules >= MAX_RULES) return;
    const w = r.x1 - r.x0;
    const h = r.y1 - r.y0;
    if (!(Math.min(w, h) <= RULE_THICKNESS && Math.max(w, h) >= 2)) return;
    rules.push(r);
    budget.rules++;
  };
  /** Strokes: each axis-aligned segment, widened by the line width as drawn. */
  const stroke = () => {
    if (overflow || gs.strokeWhite) return;
    const scale = Math.sqrt(Math.abs(gs.ctm[0] * gs.ctm[3] - gs.ctm[1] * gs.ctm[2]));
    const half = Math.max(gs.lineWidth * scale, 0.1) / 2;
    for (const [ax, ay, bx, by] of segments) {
      if (Math.abs(ax - bx) > 0.5 && Math.abs(ay - by) > 0.5) continue;
      keep({
        x0: Math.min(ax, bx) - half,
        x1: Math.max(ax, bx) + half,
        y0: Math.min(ay, by) - half,
        y1: Math.max(ay, by) + half,
      });
    }
  };
  /** Fills: each thin rectangle the path holds (from `re`, under a CTM without rotation or shear). */
  const fill = () => {
    if (overflow || gs.fillWhite) return;
    for (const b of boxes) keep(b);
  };
  const whitePaint = (values: number[], kind: "gray" | "rgb" | "cmyk") =>
    kind === "cmyk" ? values.every((v) => v <= 0.02) : values.every((v) => v >= 0.98);

  for (;;) {
    if (++budget.ops > MAX_OPS) return;
    lx.skipWhite();
    if (lx.pos >= content.length) return;
    const c = content[lx.pos];
    try {
      if (isOperandStart(c)) {
        operands.push(lx.value());
        if (operands.length > 64) operands.shift();
        continue;
      }
      const w = lx.word();
      if (w === "") {
        lx.pos++;
        continue;
      }
      if (NUMBER.test(w)) {
        operands.push(Number(w));
        if (operands.length > 64) operands.shift();
        continue;
      }
      if (w === "true" || w === "false" || w === "null") {
        operands.push(w === "true");
        continue;
      }
      switch (w) {
        case "q":
          if (stack.length < 64) stack.push({ ...gs });
          break;
        case "Q":
          gs = stack.pop() ?? gs;
          break;
        case "cm":
          gs.ctm = mul([n(6), n(5), n(4), n(3), n(2), n(1)], gs.ctm);
          break;
        case "w":
          gs.lineWidth = Math.abs(n(1));
          break;
        case "G":
          gs.strokeWhite = whitePaint([n(1)], "gray");
          break;
        case "g":
          gs.fillWhite = whitePaint([n(1)], "gray");
          break;
        case "RG":
          gs.strokeWhite = whitePaint([n(3), n(2), n(1)], "rgb");
          break;
        case "rg":
          gs.fillWhite = whitePaint([n(3), n(2), n(1)], "rgb");
          break;
        case "K":
          gs.strokeWhite = whitePaint([n(4), n(3), n(2), n(1)], "cmyk");
          break;
        case "k":
          gs.fillWhite = whitePaint([n(4), n(3), n(2), n(1)], "cmyk");
          break;
        case "m":
          at = point(n(2), n(1));
          start = at;
          if (extent.length < MAX_PATH_SEGMENTS) extent.push(at);
          else overflow = true;
          break;
        case "l": {
          const to = point(n(2), n(1));
          if (at) segment(at, to);
          at = to;
          if (extent.length < MAX_PATH_SEGMENTS) extent.push(to);
          else overflow = true;
          break;
        }
        case "c":
        case "v":
        case "y": {
          // A curve is no rule; the pen ends at the last point given.
          const pts = w === "c" ? 3 : 2;
          for (let k = pts; k >= 1; k--) {
            if (extent.length < MAX_PATH_SEGMENTS) extent.push(point(n(2 * k), n(2 * k - 1)));
            else overflow = true;
          }
          at = point(n(2), n(1));
          break;
        }
        case "h":
          if (at && start) segment(at, start);
          at = start;
          break;
        case "re": {
          const [x, y, w, h] = [n(4), n(3), n(2), n(1)];
          const c = [point(x, y), point(x + w, y), point(x + w, y + h), point(x, y + h)];
          for (let k = 0; k < 4; k++)
            segment(c[k] as [number, number], c[(k + 1) % 4] as [number, number]);
          if (extent.length + 4 <= MAX_PATH_SEGMENTS) extent.push(...(c as [number, number][]));
          else overflow = true;
          const xs = c.map((p) => p[0]);
          const ys = c.map((p) => p[1]);
          // Only a rectangle that stays axis-aligned on the page is a box (no rotation or shear).
          const straight = Math.abs(gs.ctm[1]) < 1e-9 && Math.abs(gs.ctm[2]) < 1e-9;
          const swapped = Math.abs(gs.ctm[0]) < 1e-9 && Math.abs(gs.ctm[3]) < 1e-9;
          if (straight || swapped)
            boxes.push({
              x0: Math.min(...xs),
              x1: Math.max(...xs),
              y0: Math.min(...ys),
              y1: Math.max(...ys),
            });
          at = c[0] as [number, number];
          start = at;
          break;
        }
        case "S":
          stroke();
          clearPath();
          break;
        case "s":
          if (at && start) segment(at, start);
          stroke();
          clearPath();
          break;
        case "f":
        case "F":
        case "f*":
          fill();
          clearPath();
          break;
        case "B":
        case "B*":
        case "b":
        case "b*":
          if ((w === "b" || w === "b*") && at && start) segment(at, start);
          fill();
          stroke();
          clearPath();
          break;
        case "n":
          clearPath();
          break;
        case "W":
        case "W*":
          clipping = true;
          break;
        case "BT":
          tm = IDENTITY;
          tlm = IDENTITY;
          break;
        case "Tf": {
          const name = operands[operands.length - 2];
          gs.size = n(1);
          const ref = name instanceof PdfName ? fonts?.get(name.name) : undefined;
          if (ref === undefined) gs.font = null;
          else {
            let f = fontCache.get(ref);
            if (!f) {
              f = await loadFont(reader, ref);
              fontCache.set(ref, f);
            }
            gs.font = f;
          }
          break;
        }
        case "Tc":
          gs.charSpace = n(1);
          break;
        case "Tw":
          gs.wordSpace = n(1);
          break;
        case "Tz":
          gs.scale = n(1) / 100;
          break;
        case "TL":
          gs.leading = n(1);
          break;
        case "Ts":
          gs.rise = n(1);
          break;
        case "Tr":
          gs.render = n(1);
          break;
        case "Td":
          tlm = mul([1, 0, 0, 1, n(2), n(1)], tlm);
          tm = tlm;
          break;
        case "TD":
          gs.leading = -n(1);
          tlm = mul([1, 0, 0, 1, n(2), n(1)], tlm);
          tm = tlm;
          break;
        case "Tm":
          tlm = [n(6), n(5), n(4), n(3), n(2), n(1)];
          tm = tlm;
          break;
        case "T*":
          nextLine();
          break;
        case "Tj": {
          const s = operands[operands.length - 1];
          if (s instanceof PdfString) show(s);
          break;
        }
        case "'": {
          nextLine();
          const s = operands[operands.length - 1];
          if (s instanceof PdfString) show(s);
          break;
        }
        case '"': {
          gs.wordSpace = n(3);
          gs.charSpace = n(2);
          nextLine();
          const s = operands[operands.length - 1];
          if (s instanceof PdfString) show(s);
          break;
        }
        case "TJ": {
          const a = operands[operands.length - 1];
          if (Array.isArray(a)) showArray(a);
          break;
        }
        case "Do": {
          const name = operands[operands.length - 1];
          if (!(name instanceof PdfName) || depth >= MAX_FORM_DEPTH) break;
          const xo = reader.resolve(xobjects?.get(name.name));
          if (!(xo instanceof PdfStream)) break;
          const sub = xo.dict.get("Subtype");
          if (sub instanceof PdfName && sub.name === "Image") {
            // A picture: kept by reference for OCR of a scan with no text layer. A stencil mask
            // (ImageMask) paints a colour through a shape and is not a page picture.
            if (
              reader.resolve(xo.dict.get("ImageMask")) !== true &&
              sink.images.length < MAX_PAGE_IMAGES
            )
              sink.images.push({ m: gs.ctm, read: () => imageForOcr(reader, xo) });
            break;
          }
          if (!(sub instanceof PdfName) || sub.name !== "Form") break;
          let data: Uint8Array;
          try {
            data = await decodeStream(xo, MAX_CONTENT_BYTES - budget.contentBytes);
          } catch {
            break;
          }
          budget.contentBytes += data.length;
          const mx = reader.resolve(xo.dict.get("Matrix"));
          const matrix: M =
            Array.isArray(mx) && mx.length === 6 && mx.every((v) => typeof v === "number")
              ? (mx.map((v) => finite(v as number)) as M)
              : IDENTITY;
          await run(
            reader,
            data,
            reader.dict(xo.dict.get("Resources")) ?? resources,
            mul(matrix, gs.ctm),
            sink,
            budget,
            fontCache,
            depth + 1,
            gs.clip,
          );
          break;
        }
        case "BI": {
          // Inline image: skip its dictionary and data, up to the EI that ends it.
          const id = indexOfWord(content, "ID", lx.pos);
          if (id < 0) return;
          const ei = findInlineImageEnd(content, id + 3);
          if (ei < 0) return;
          lx.pos = ei + 2;
          break;
        }
        default:
          break;
      }
      operands.length = 0;
    } catch (e) {
      if (e instanceof PdfUnreadable) throw e;
      // A damaged operator: keep what this stream has given so far.
      return;
    }
  }
}

function indexOfWord(b: Uint8Array, word: string, from: number) {
  const w0 = word.charCodeAt(0);
  const w1 = word.charCodeAt(1);
  for (let i = from; i + 1 < b.length; i++) {
    if (
      b[i] === w0 &&
      b[i + 1] === w1 &&
      (i === 0 || isWhite(b[i - 1])) &&
      (isWhite(b[i + 2]) || i + 2 >= b.length)
    )
      return i;
  }
  return -1;
}

function findInlineImageEnd(b: Uint8Array, from: number) {
  for (let i = from; i + 1 < b.length; i++) {
    if (
      b[i] === 0x45 &&
      b[i + 1] === 0x49 &&
      isWhite(b[i - 1]) &&
      (i + 2 >= b.length || isWhite(b[i + 2]))
    )
      return i;
  }
  return -1;
}
