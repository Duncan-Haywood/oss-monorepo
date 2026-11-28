// First article balloons: the drawing PDF with a numbered balloon beside each characteristic the
// Form 3 draft lists (fai-characteristics.ts), so the inspector's balloon numbers and the Form 3
// rows are the same numbers without ballooning the drawing by hand.
//
// How it works: the characteristic list is drafted from the drawing's text exactly as the CSV is
// (same text, same numbering). Each characteristic's requirement is then looked up in the PDF's text
// layer, with positions (pdf-text.ts readPdfLayout), in reading order: the k-th characteristic with
// a given requirement takes the k-th place that text appears. A balloon is drawn just before the
// text, along the text's own direction, nudged clear of earlier balloons.
//
// The original file is not rewritten. The balloons are an incremental update appended after the
// original bytes (PDF 32000-1, 7.5.6): each ballooned page gets a new revision whose /Contents is
// the original streams wrapped in q ... Q, then one stream that draws the balloons. Nothing else in
// the file changes, so the drawing itself, its fonts and any earlier signature data stay as they
// were. The digits are drawn as strokes (no font is added, so no page resources are touched).
//
// What it does not do: a characteristic whose text is not found in the text layer (a dimension
// drawn as geometry, a note that wraps differently) gets no balloon and is reported in `unplaced`,
// never guessed at a position. A repeated feature ("4X", rows 4.1 ... 4.4) gets one balloon, "4", at
// the callout, the usual practice. Encrypted files and files the reader cannot parse are refused.

import { zoneReader } from "./drawing-zones";
import { type CharacteristicDraft, draftCharacteristics } from "./fai-characteristics";
import { latin1 } from "./pdf-pages";
import { balanced, type PdfLayout, type PdfPage, readPdfLayout, type TextRun } from "./pdf-text";

export interface BalloonPlacement {
  /** The balloon's number: the characteristic's number, or its base for a repeat ("4" for 4.1). */
  label: string;
  /** 0-based page index. */
  page: number;
  /** Balloon centre and radius in the page's user space (points). */
  x: number;
  y: number;
  r: number;
  /**
   * The drawing zone the characteristic's text lies in ("C4", "SH2 C4" on a multi-sheet file), read
   * from the border's zone labels (drawing-zones.ts); null when the sheet has no readable zoned border.
   */
  zone: string | null;
}

export interface BalloonResult {
  placements: BalloonPlacement[];
  /** Balloon numbers whose text was not found on any page. */
  unplaced: string[];
}

/**
 * Each characteristic's drawing zone, by its number (the rows of a repeat share the callout's zone),
 * for Form 3's Reference Location. Characteristics not found, or on a sheet with no zoned border, are
 * left out.
 */
export function zonesByNo(
  draft: CharacteristicDraft,
  result: BalloonResult,
): Record<string, string> {
  const byLabel = new Map(result.placements.map((p) => [p.label, p.zone]));
  const out: Record<string, string> = {};
  for (const c of draft.characteristics) {
    const zone = byLabel.get(c.no.split(".")[0] ?? c.no);
    if (zone) out[c.no] = zone;
  }
  return out;
}

/** Balloon colour (a dark red that prints legibly in greyscale). */
const STROKE = "0.75 0.05 0.05";
const MAX_BALLOONS = 500;

/** One normalised character with where it came from. */
interface Glyph {
  ch: string;
  run: TextRun;
  /** Index of the character in the run's text. */
  at: number;
}

interface Line {
  page: number;
  text: string;
  glyphs: Glyph[];
}

const DASHES = /[−‒–—]/g;

/**
 * Lowercase-insensitive, space-free text with the same sign rules as the characteristic reader:
 * dashes to "-", "+/-" and "+-" before a number to "±", ⌀ to Ø.
 */
export function matchKey(s: string): string {
  return s
    .replace(DASHES, "-")
    .replace(/\+\s*\/\s*-|\+\s*-(?=\s*[\d.,])/g, "±")
    .replace(/⌀/g, "Ø")
    .replace(/\s+/g, "")
    .toUpperCase();
}

/** The layout's runs as lines of normalised glyphs, in reading order. */
function linesOf(runs: TextRun[]): Line[] {
  const out: Line[] = [];
  let cur: { page: number; line: number; raw: Glyph[] } | null = null;
  const flush = () => {
    if (!cur) return;
    // Normalise glyph by glyph so every normalised character still points at its run.
    const raw = cur.raw;
    const glyphs: Glyph[] = [];
    for (let i = 0; i < raw.length; i++) {
      const g = raw[i] as Glyph;
      if (/\s/.test(g.ch)) continue;
      const rest = raw
        .slice(i, i + 6)
        .map((x) => x.ch)
        .join("");
      const pm = /^\+\s*\/\s*-|^\+\s*-(?=\s*[\d.,])/.exec(rest);
      if (pm) {
        glyphs.push({ ...g, ch: "±" });
        i += pm[0].length - 1;
        continue;
      }
      const ch = g.ch.replace(DASHES, "-").replace("⌀", "Ø").toUpperCase();
      glyphs.push({ ...g, ch });
    }
    out.push({ page: cur.page, text: glyphs.map((g) => g.ch).join(""), glyphs });
    cur = null;
  };
  for (const run of runs) {
    if (!cur || cur.page !== run.page || cur.line !== run.line) {
      flush();
      cur = { page: run.page, line: run.line, raw: [] };
    }
    for (const [at, ch] of [...run.text].entries()) cur.raw.push({ ch, run, at });
  }
  flush();
  return out;
}

/** The search text for a characteristic: its requirement, a note without its "Note N:" prefix. */
function searchKey(requirement: string, kind: string): string {
  const text = kind === "note" ? requirement.replace(/^Note\s+\d+:\s*/, "") : requirement;
  return matchKey(text);
}

/** Where to draw each balloon; a pure function of the layout and the draft (tested directly). */
export function placeBalloons(layout: PdfLayout, draft: CharacteristicDraft): BalloonResult {
  const lines = linesOf(layout.runs);
  const zoneOf = zoneReader(layout);
  // Used match starts per line, so two characteristics with the same text take different places.
  const used = new Map<number, Set<number>>();
  const placements: BalloonPlacement[] = [];
  const unplaced: string[] = [];
  const seen = new Set<string>();

  for (const c of draft.characteristics) {
    const label = c.no.split(".")[0] ?? c.no;
    if (seen.has(label)) continue; // a repeat's later rows share the first row's balloon
    seen.add(label);
    if (placements.length >= MAX_BALLOONS) {
      unplaced.push(label);
      continue;
    }
    const key = searchKey(c.requirement, c.kind);
    let hit: { line: Line; at: number; li: number } | null = null;
    if (key) {
      for (let li = 0; li < lines.length && !hit; li++) {
        const line = lines[li] as Line;
        const taken = used.get(li) ?? new Set<number>();
        for (let at = line.text.indexOf(key); at >= 0; at = line.text.indexOf(key, at + 1)) {
          if (!taken.has(at)) {
            hit = { line, at, li };
            break;
          }
        }
      }
    }
    if (!hit) {
      unplaced.push(label);
      continue;
    }
    const taken = used.get(hit.li) ?? new Set<number>();
    taken.add(hit.at);
    used.set(hit.li, taken);
    // A note's balloon goes before its number ("3."), not on top of it.
    let anchor = hit.at;
    if (c.kind === "note") {
      const lead = /\d{1,2}[.)]$/.exec(hit.line.text.slice(Math.max(0, hit.at - 3), hit.at));
      if (lead) anchor = hit.at - lead[0].length;
    }
    const page = layout.pages[hit.line.page];
    if (!page) {
      unplaced.push(label);
      continue;
    }
    // The zone is where the text itself lies: the middle of the matched text's first and last glyph.
    const first = glyphPoint(hit.line.glyphs[hit.at] as Glyph);
    const last = glyphPoint(
      (hit.line.glyphs[hit.at + key.length - 1] ?? hit.line.glyphs[hit.at]) as Glyph,
    );
    const zone = zoneOf(hit.line.page, (first.x + last.x) / 2, (first.y + last.y) / 2);
    placements.push({
      ...place(label, hit.line.glyphs[anchor] as Glyph, page, hit.line.page, placements),
      zone,
    });
  }
  return { placements, unplaced };
}

/** Where a glyph starts on the page, raised to half its height (the text's middle line). */
function glyphPoint(g: Glyph): { x: number; y: number } {
  const run = g.run;
  const t = g.at / Math.max(1, [...run.text].length);
  return {
    x: run.x0 + (run.x1 - run.x0) * t + (run.upX * run.size) / 2,
    y: run.y0 + (run.y1 - run.y0) * t + (run.upY * run.size) / 2,
  };
}

/** The balloon's centre: before the text's first glyph, along the text direction, clear of others. */
function place(
  label: string,
  g: Glyph,
  page: PdfPage,
  pageIndex: number,
  others: BalloonPlacement[],
): Omit<BalloonPlacement, "zone"> {
  const run = g.run;
  const n = Math.max(1, [...run.text].length);
  const t = g.at / n;
  const ox = run.x0 + (run.x1 - run.x0) * t;
  const oy = run.y0 + (run.y1 - run.y0) * t;
  const len = Math.hypot(run.x1 - run.x0, run.y1 - run.y0);
  // The text's reading direction; for an empty advance, perpendicular to "up".
  const dx = len > 0 ? (run.x1 - run.x0) / len : run.upY;
  const dy = len > 0 ? (run.y1 - run.y0) / len : -run.upX;
  const digitH = clamp(run.size * 0.9, 5, 10);
  const r = Math.max(digitH * 1.05, (label.length * digitH * 0.75) / 2 + digitH * 0.45);
  const gap = Math.max(1.5, run.size * 0.2);
  let x = ox - dx * (r + gap) + run.upX * run.size * 0.35;
  let y = oy - dy * (r + gap) + run.upY * run.size * 0.35;
  // Step back along the text's line (away from the text) until clear of the balloons already on
  // this page: stacked title-block lines then stagger instead of landing on the line above.
  for (let i = 0; i < 8; i++) {
    const clash = others.some(
      (o) => o.page === pageIndex && Math.hypot(o.x - x, o.y - y) < o.r + r + 0.5,
    );
    if (!clash) break;
    x -= dx * (2 * r + 1);
    y -= dy * (2 * r + 1);
  }
  const [bx0, by0, bx1, by1] = page.mediaBox;
  const lox = Math.min(bx0, bx1) + r + 1;
  const hix = Math.max(bx0, bx1) - r - 1;
  const loy = Math.min(by0, by1) + r + 1;
  const hiy = Math.max(by0, by1) - r - 1;
  return {
    label,
    page: pageIndex,
    x: round2(lox < hix ? clamp(x, lox, hix) : x),
    y: round2(loy < hiy ? clamp(y, loy, hiy) : y),
    r: round2(r),
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round2 = (v: number) => Math.round(v * 100) / 100;
const f = (v: number) => {
  const s = (Math.round(v * 1000) / 1000).toFixed(3).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
};

/** Stroke digits in a 0.6 x 1 box: polylines of [x, y] points. */
const DIGITS: Record<string, [number, number][][]> = {
  "0": [
    [
      [0, 0],
      [0.6, 0],
      [0.6, 1],
      [0, 1],
      [0, 0],
    ],
  ],
  "1": [
    [
      [0.12, 0.78],
      [0.32, 1],
      [0.32, 0],
    ],
    [
      [0.1, 0],
      [0.54, 0],
    ],
  ],
  "2": [
    [
      [0, 1],
      [0.6, 1],
      [0.6, 0.5],
      [0, 0.5],
      [0, 0],
      [0.6, 0],
    ],
  ],
  "3": [
    [
      [0, 1],
      [0.6, 1],
      [0.6, 0],
      [0, 0],
    ],
    [
      [0.12, 0.5],
      [0.6, 0.5],
    ],
  ],
  "4": [
    [
      [0.45, 0],
      [0.45, 1],
      [0, 0.35],
      [0.6, 0.35],
    ],
  ],
  "5": [
    [
      [0.6, 1],
      [0, 1],
      [0, 0.55],
      [0.6, 0.55],
      [0.6, 0],
      [0, 0],
    ],
  ],
  "6": [
    [
      [0.6, 1],
      [0, 1],
      [0, 0],
      [0.6, 0],
      [0.6, 0.5],
      [0, 0.5],
    ],
  ],
  "7": [
    [
      [0, 1],
      [0.6, 1],
      [0.18, 0],
    ],
  ],
  "8": [
    [
      [0, 0],
      [0.6, 0],
      [0.6, 1],
      [0, 1],
      [0, 0],
    ],
    [
      [0, 0.5],
      [0.6, 0.5],
    ],
  ],
  "9": [
    [
      [0, 0],
      [0.6, 0],
      [0.6, 1],
      [0, 1],
      [0, 0.5],
      [0.6, 0.5],
    ],
  ],
};

/** The content stream that draws one page's balloons, upright as the page is displayed. */
export function balloonStream(placements: BalloonPlacement[], rotate: number): string {
  const rad = (rotate * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Four Bézier arcs make the circle (k = 0.5523 of the radius for the control points).
  const out: string[] = [];
  for (const p of placements) {
    const r = p.r;
    const k = 0.5523 * r;
    // Digit height: as tall as the circle allows, narrower labels first (0.6 wide, 0.75 apart).
    const h = Math.min(r, (1.5 * r) / (0.6 + 0.75 * (p.label.length - 1)));
    out.push(`q ${f(cos)} ${f(sin)} ${f(-sin)} ${f(cos)} ${f(p.x)} ${f(p.y)} cm`);
    out.push(`1 1 1 rg ${STROKE} RG ${f(Math.max(0.4, r * 0.11))} w`);
    out.push(
      `${f(r)} 0 m ${f(r)} ${f(k)} ${f(k)} ${f(r)} 0 ${f(r)} c ${f(-k)} ${f(r)} ${f(-r)} ${f(k)} ${f(-r)} 0 c ` +
        `${f(-r)} ${f(-k)} ${f(-k)} ${f(-r)} 0 ${f(-r)} c ${f(k)} ${f(-r)} ${f(r)} ${f(-k)} ${f(r)} 0 c B`,
    );
    const digitW = 0.6 * h;
    const advance = 0.75 * h;
    const total = digitW + advance * (p.label.length - 1);
    let x0 = -total / 2;
    const y0 = -h / 2;
    out.push(`${STROKE} RG ${f(Math.max(0.35, h * 0.13))} w 1 J 1 j`);
    for (const ch of p.label) {
      for (const poly of DIGITS[ch] ?? []) {
        out.push(
          poly
            .map(([px, py], i) => `${f(x0 + px * h)} ${f(y0 + py * h)} ${i === 0 ? "m" : "l"}`)
            .join(" "),
        );
      }
      x0 += advance;
    }
    out.push("S Q");
  }
  return out.join("\n");
}

/** The value span of `/Key` at the top level of a dictionary body: [start of key, end of value]. */
function keySpan(body: string, key: string): [number, number] | null {
  const re = new RegExp(`/${key}(?![A-Za-z0-9#])\\s*`, "g");
  for (let m = re.exec(body); m; m = re.exec(body)) {
    let d = 0;
    for (let i = 0; i < m.index; i++) {
      if (body[i] === "<" && body[i + 1] === "<") {
        d++;
        i++;
      } else if (body[i] === ">" && body[i + 1] === ">") {
        d--;
        i++;
      }
    }
    if (d !== 1) continue;
    const at = m.index + m[0].length;
    const ref = /^\d+\s+\d+\s+R(?![A-Za-z])/.exec(body.slice(at, at + 32));
    if (ref) return [m.index, at + ref[0].length];
    if (body[at] === "[") return [m.index, at + balanced(body, at, "[", "]").length];
    return null;
  }
  return null;
}

/** "n g R" references in a string, kept as written (generation included). */
const refStrings = (s: string) => [...s.matchAll(/\d+\s+\d+\s+R(?![A-Za-z])/g)].map((m) => m[0]);

interface TrailerInfo {
  /** Offset of the last cross-reference section (startxref). */
  prev: number;
  /** True when that section is a cross-reference stream (PDF 1.5+). */
  stream: boolean;
  size: number;
  root: string;
  info: string | null;
  id: string | null;
}

/** The latest trailer: classic `trailer << >>` or the dictionary of a cross-reference stream. */
function trailerOf(text: string, head: number): TrailerInfo | null {
  const sx = [...text.matchAll(/startxref\s+(\d+)/g)].at(-1);
  if (!sx?.[1]) return null;
  const prev = Number(sx[1]);
  const at = head + prev;
  const here = text.slice(at, at + 64);
  let dict: string;
  let stream = false;
  if (/^\s*xref\b/.test(here)) {
    const t = text.indexOf("trailer", at);
    if (t < 0) return null;
    const open = text.indexOf("<<", t);
    if (open < 0) return null;
    dict = balanced(text, open, "<<", ">>");
  } else if (/^\s*\d+\s+\d+\s+obj\b/.test(here)) {
    const open = text.indexOf("<<", at);
    if (open < 0) return null;
    dict = balanced(text, open, "<<", ">>");
    if (!/\/Type\s*\/XRef(?![A-Za-z0-9#])/.test(dict)) return null;
    stream = true;
  } else return null;
  const size = Number(/\/Size\s+(\d+)/.exec(dict)?.[1] ?? 0);
  const root = /\/Root\s+(\d+\s+\d+\s+R)/.exec(dict)?.[1];
  if (!size || !root) return null;
  const info = /\/Info\s+(\d+\s+\d+\s+R)/.exec(dict)?.[1] ?? null;
  const idAt = keySpan(dict, "ID");
  const id = idAt ? dict.slice(idAt[0], idAt[1]).replace(/^\/ID\s*/, "") : null;
  return { prev, stream, size, root, info, id };
}

const encodeLatin1 = (s: string) => {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
};

/** The generation number a plain object was written with (0 for one in an object stream). */
function generationOf(text: string, num: number): number {
  const all = [...text.matchAll(new RegExp(`(?:^|[\\s>\\]])${num}\\s+(\\d+)\\s+obj\\b`, "g"))];
  return Number(all.at(-1)?.[1] ?? 0);
}

export interface BalloonedPdf extends BalloonResult {
  pdf: Uint8Array;
}

/**
 * The drawing with balloons appended as an incremental update. Null when the file is not a PDF the
 * reader can parse or update (encrypted, no trailer); `placements` empty when nothing was found.
 */
export async function balloonPdf(
  bytes: Uint8Array,
  draft: CharacteristicDraft,
): Promise<BalloonedPdf | null> {
  const layout = await readPdfLayout(bytes);
  if (!layout) return null;
  const text = latin1(bytes);
  const head = text.indexOf("%PDF-");
  const trailer = trailerOf(text, head);
  if (!trailer) return null;
  const result = placeBalloons(layout, draft);
  if (result.placements.length === 0) return { pdf: bytes, ...result };

  const byPage = new Map<number, BalloonPlacement[]>();
  for (const p of result.placements) byPage.set(p.page, [...(byPage.get(p.page) ?? []), p]);

  let next = trailer.size;
  const chunks: string[] = [];
  // Offsets are from %PDF- (the file's own offsets are, too, when bytes precede it).
  let pos = bytes.length - head;
  const lead = /[\r\n]$/.test(text.slice(-1)) ? "" : "\n";
  chunks.push(lead);
  pos += lead.length;
  const entries: { num: number; gen: number; off: number }[] = [];
  const write = (num: number, gen: number, body: string) => {
    entries.push({ num, gen, off: pos });
    const s = `${num} ${gen} obj\n${body}\nendobj\n`;
    chunks.push(s);
    pos += s.length;
  };
  const stream = (num: number, content: string) =>
    write(num, 0, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);

  const open = next++;
  stream(open, "q");
  for (const [pageIndex, placements] of byPage) {
    const page = layout.pages[pageIndex];
    if (!page) continue;
    const body = layout.objects.get(page.num)?.body?.trim();
    if (!body?.startsWith("<<")) continue;
    const span = keySpan(body, "Contents");
    if (!span) continue;
    const value = body.slice(span[0], span[1]).replace(/^\/Contents\s*/, "");
    let refs = refStrings(value);
    if (!value.startsWith("[")) {
      // A reference: to the one stream, or to an array of streams.
      const target = layout.objects.get(Number(/^\d+/.exec(value)?.[0]));
      if (target && !target.stream) refs = refStrings(target.body);
    }
    const draw = next++;
    stream(draw, `Q\n${balloonStream(placements, page.rotate)}`);
    const contents = `/Contents [${open} 0 R ${refs.join(" ")} ${draw} 0 R]`;
    write(
      page.num,
      generationOf(text, page.num),
      body.slice(0, span[0]) + contents + body.slice(span[1]),
    );
  }

  const xrefAt = pos;
  const extra = `${trailer.info ? ` /Info ${trailer.info}` : ""}${trailer.id ? ` /ID ${trailer.id}` : ""}`;
  if (trailer.stream) {
    // A cross-reference stream for an update to a file that uses them (PDF 32000-1, 7.5.8):
    // W [1 4 2], uncompressed, its own entry included.
    const self = next++;
    entries.push({ num: self, gen: 0, off: xrefAt });
    const sorted = [...entries].sort((a, b) => a.num - b.num);
    const index: string[] = [];
    const data: number[] = [];
    for (const e of sorted) {
      index.push(`${e.num} 1`);
      data.push(
        1,
        (e.off >>> 24) & 0xff,
        (e.off >>> 16) & 0xff,
        (e.off >>> 8) & 0xff,
        e.off & 0xff,
      );
      data.push((e.gen >>> 8) & 0xff, e.gen & 0xff);
    }
    const raw = String.fromCharCode(...data);
    const s =
      `${self} 0 obj\n<< /Type /XRef /Size ${next} /Root ${trailer.root}${extra} /Prev ${trailer.prev} ` +
      `/Index [${index.join(" ")}] /W [1 4 2] /Length ${raw.length} >>\nstream\n${raw}\nendstream\nendobj\n` +
      `startxref\n${xrefAt}\n%%EOF\n`;
    chunks.push(s);
  } else {
    const sorted = [...entries].sort((a, b) => a.num - b.num);
    const rows = sorted
      .map(
        (e) =>
          `${e.num} 1\n${String(e.off).padStart(10, "0")} ${String(e.gen).padStart(5, "0")} n\r\n`,
      )
      .join("");
    chunks.push(
      `xref\n${rows}trailer\n<< /Size ${next} /Root ${trailer.root}${extra} /Prev ${trailer.prev} >>\n` +
        `startxref\n${xrefAt}\n%%EOF\n`,
    );
  }
  const tail = encodeLatin1(chunks.join(""));
  const pdf = new Uint8Array(bytes.length + tail.length);
  pdf.set(bytes, 0);
  pdf.set(tail, bytes.length);
  return { pdf, ...result };
}

/** Drafts the list from the drawing's text (as the CSV does) and balloons the PDF to match it. */
export async function balloonDrawing(bytes: Uint8Array, drawingText: string) {
  return balloonPdf(bytes, draftCharacteristics(drawingText));
}
