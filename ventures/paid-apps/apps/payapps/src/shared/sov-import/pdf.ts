// Rebuilds the table of a printed bid breakdown or continuation sheet from a PDF's positioned text,
// so the same schedule-of-values reader that takes a workbook can take the PDF a GC, an estimating
// program or Excel's "Save as PDF" produced. The text comes from `@shared/pdf/text`; this file only
// decides rows and columns:
//
// - Rows: text on one baseline is a line. Where rules drawn across the table divide its data lines,
//   the lines between two rules are one row, so a top-aligned description that wraps onto a second
//   line a full line below stays with its item. Otherwise lines closer together than a line of text
//   (a cell whose text wraps, with its neighbours centred between the wrapped lines) are one row, so
//   a three-line header or a two-line description stays whole.
// - Columns: from the cell borders, when the table is ruled: vertical rules that cross most of the
//   data lines (two or more numbers on a line) are the column edges, and each word goes to the cell
//   its middle falls in, so a description cut off at its border, or numbers that nearly touch, are
//   read as the sheet shows them. Otherwise from where the data lines' text sits: numbers in a
//   column overlap from line to line, and so does text; where a description runs into an amount,
//   the amount wins. A header word is put in the column it overlaps, or the nearest one.
// - Pages: consecutive pages whose number columns line up are one table; a header repeated on a
//   later page and "Page 2 of 3" lines are left out.
//
// - The application summary (G702): a page outside the continuation sheet's table, read line by line
//   with each phrase in its own cell, so `findSummary` finds lines 5a and 6 by their labels.
//
// - Scans: a scanned page with a text layer (a scanner's "searchable PDF", a scanning app's OCR) is
//   read from that layer. The page is rarely square on the glass, so a line's words climb or fall
//   across it; `deskew` levels the page first, from the slope between neighbouring words. Only
//   a scan's pages (text drawn invisibly over the picture) are levelled or cleaned.
//
// What a PDF cannot say is never guessed: no text (a scan) or fonts with no character map end the
// import with a message that says to export the spreadsheet instead.

import { UNREADABLE } from "@shared/pdf/fonts";
import { PdfUnreadable } from "@shared/pdf/reader";
import {
  extractText,
  type PageText,
  type PdfText,
  type Rule,
  type TextRun,
} from "@shared/pdf/text";
import { describeSwap, MAX_SUSPECTS, misreadsAgainstTotal, scheduledAgrees } from "./misread";
import { findSov, type ImportCheck, type SovImportOk, type SovImportResult } from "./schedule";
import { findSummary, type SummarySheet } from "./summary";
import type { Grid } from "./xlsx";

interface Word {
  x0: number;
  x1: number;
  y: number;
  size: number;
  text: string;
}
interface Line {
  y: number;
  size: number;
  words: Word[];
  /** 1-based number of this line on its page. */
  n: number;
}
interface Band {
  x0: number;
  x1: number;
  numeric: boolean;
}
export interface PdfTable {
  /** "PDF page 1" or "PDF pages 1-3". */
  name: string;
  grid: Grid;
  /** grid row r is `labels[r]` ("page 2, line 14"). */
  labels: string[];
  /** The 1-based pages the table spans. */
  pages: number[];
  /** Whether the columns came from the table's drawn cell borders rather than from where its text sits. */
  ruled: boolean;
  /** Whether the rows came from the rules drawn between them (on at least one page) rather than from line spacing. */
  rowsRuled: boolean;
}

const NUMERIC = /^[($-]*\$?[-(]?\d[\d,.]*%?\)?$/;
const MONEYISH = /\d[,.]\d|\d{3}/;
const PAGE_LINE = /^(page\s*)?\d+\s*(of|\/)\s*\d+$|^page\s+\d+$/i;

/**
 * Joins runs into words: pieces of a word drawn one character at a time, or a run that already holds several words.
 * Never across a ruled table's cell border (`edges`): two cells' text can touch where the first is cut off at it.
 */
function toWords(runs: TextRun[], edges: readonly number[]): Word[] {
  const sorted = [...runs].sort((a, b) => a.x0 - b.x0);
  const words: Word[] = [];
  for (const r of sorted) {
    const prev = words[words.length - 1];
    const gap = prev ? r.x0 - prev.x1 : Number.POSITIVE_INFINITY;
    const tight = 0.12 * Math.min(r.size, prev?.size ?? r.size);
    // Two longer runs that touch are two cells (a clipped description against an amount), not one word,
    // except letters drawn a hair to the left of the letter before them: a kerned pair ("RET" "AINAGE",
    // "CER" "TIFIED") that Chromium draws as two runs.
    const piece = r.text.length <= 2 || (prev?.text.length ?? 0) <= 2;
    // So is a comma or full stop kerned under the letter before it ("power" ", lighting").
    const kerned =
      !!prev &&
      gap < 0 &&
      gap > -0.15 * r.size &&
      /\p{L}$/u.test(prev.text) &&
      /^[\p{L},.;:)]/u.test(r.text);
    const border = !!prev && edges.some((e) => prev.x0 < e - 0.5 && r.x0 >= e - 1.5);
    if (
      prev &&
      !border &&
      (piece || kerned) &&
      gap < tight &&
      gap > -2 * tight &&
      !/\s$/.test(prev.text) &&
      !/^\s/.test(r.text)
    ) {
      prev.text += r.text;
      prev.x1 = Math.max(prev.x1, r.x1);
      continue;
    }
    words.push({ x0: r.x0, x1: r.x1, y: r.y, size: r.size, text: r.text });
  }
  // A lone "$" (accounting format puts it at the cell's left edge) belongs to the amount after it.
  const out: Word[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i] as Word;
    const next = words[i + 1];
    if (w.text.trim() === "$" && next && NUMERIC.test(next.text.trim())) {
      out.push({ ...next, x0: next.x0, text: `$${next.text.trim()}` });
      i++;
    } else out.push(w);
  }
  return out.map((w) => ({ ...w, text: w.text.replace(/\s+/g, " ").trim() })).filter((w) => w.text);
}

/** Groups a page's runs into lines by baseline, top to bottom. */
function toLines(runs: TextRun[], edges: readonly number[] = []): Line[] {
  const sorted = [...runs].sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const groups: TextRun[][] = [];
  let cur: TextRun[] = [];
  let y = Number.NEGATIVE_INFINITY;
  for (const r of sorted) {
    if (cur.length && Math.abs(r.y - y) > 0.3 * r.size) {
      groups.push(cur);
      cur = [];
    }
    if (!cur.length) y = r.y;
    cur.push(r);
  }
  if (cur.length) groups.push(cur);
  return groups.map((g, i) => ({
    y: g.reduce((a, r) => a + r.y, 0) / g.length,
    size: Math.max(...g.map((r) => r.size)),
    words: toWords(g, edges),
    n: i + 1,
  }));
}

const isNumeric = (w: Word) => NUMERIC.test(w.text);
const isDataLine = (l: Line) => {
  const nums = l.words.filter(isNumeric);
  return nums.length >= 2 && nums.some((w) => MONEYISH.test(w.text));
};

/**
 * A data line's cells: words a space apart are one cell ("01 10 00", "26,500.00"), and text words
 * a little further apart still are (a description), so a word gap is never taken for a column.
 */
function cellsOf(l: Line, splitAt: number | null): Band[] {
  const cells: Band[] = [];
  for (const [i, w] of l.words.entries()) {
    const prev = cells[cells.length - 1];
    const gap = prev ? w.x0 - prev.x1 : Number.POSITIVE_INFINITY;
    const next = l.words[i + 1];
    // A bare count inside a description ("scope item 1 (branch circuits)"), drawn as a word of its own
    // (a scan's text layer places every word separately), is part of the text, not a column of figures.
    const inText =
      !!prev &&
      !prev.numeric &&
      !!next &&
      !isNumeric(next) &&
      !MONEYISH.test(w.text) &&
      /^\d{1,3}$/.test(w.text) &&
      gap < 0.6 * w.size &&
      next.x0 - w.x1 < 0.6 * w.size;
    const numeric = isNumeric(w) && !inText;
    const split = splitAt !== null && prev?.numeric && !numeric && Math.abs(w.x0 - splitAt) <= 1.5;
    if (
      prev &&
      !split &&
      (gap < 0.35 * w.size || (!numeric && !prev.numeric && gap < 0.6 * w.size))
    ) {
      prev.x1 = Math.max(prev.x1, w.x1);
      prev.numeric = prev.numeric && numeric;
      continue;
    }
    cells.push({ x0: w.x0, x1: w.x1, numeric });
  }
  return cells;
}

/**
 * Where the text after a leading item number starts, when it starts at the same place on most data
 * lines: an item number printed at the right of its cell sits a space away from the description,
 * and only that alignment tells the two columns apart.
 */
function itemSplit(lines: Line[]): number | null {
  const starts: number[] = [];
  for (const l of lines) {
    const i = l.words.findIndex((w) => !isNumeric(w));
    if (i > 0) starts.push((l.words[i] as Word).x0);
  }
  if (starts.length < 2) return null;
  const sorted = [...starts].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] as number;
  const aligned = starts.filter((x) => Math.abs(x - median) <= 1.5).length;
  return aligned >= 0.6 * starts.length ? median : null;
}

const dataCells = (lines: Line[]) => {
  const data = lines.filter(isDataLine);
  const split = itemSplit(data);
  return data.flatMap((l) => cellsOf(l, split));
};

function mergeBands(cells: Band[]): Band[] {
  const merge = (numeric: boolean) => {
    const merged: Band[] = [];
    for (const c of cells.filter((x) => x.numeric === numeric).sort((p, q) => p.x0 - q.x0)) {
      const last = merged[merged.length - 1];
      if (last && c.x0 <= last.x1 + 0.5) last.x1 = Math.max(last.x1, c.x1);
      else merged.push({ ...c });
    }
    return merged;
  };
  const result = merge(true);
  // A text column that starts where a number column does is one mixed column (item numbers 1, 2,
  // CO-1). Where a description runs into a number column (a long description in a narrow cell),
  // the number column keeps its edge.
  const loose: Band[] = [];
  for (const t of merge(false)) {
    const host = result.find((n) => n.numeric && overlap(n, t) > 0 && t.x0 >= n.x0 - 2);
    if (host) {
      host.x0 = Math.min(host.x0, t.x0);
      host.x1 = Math.max(host.x1, t.x1);
      host.numeric = false;
    } else loose.push(t);
  }
  const fixed = [...result];
  for (const t of loose) {
    let pieces: Band[] = [t];
    for (const n of fixed) {
      pieces = pieces.flatMap((p) => {
        if (n.x1 <= p.x0 || n.x0 >= p.x1) return [p];
        const left = { x0: p.x0, x1: n.x0, numeric: false };
        const right = { x0: n.x1, x1: p.x1, numeric: false };
        return [left, right].filter((q) => q.x1 - q.x0 > 2);
      });
    }
    result.push(...pieces);
  }
  return result.sort((p, q) => p.x0 - q.x0);
}

const overlap = (a: { x0: number; x1: number }, b: { x0: number; x1: number }) =>
  Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
const distance = (a: { x0: number; x1: number }, b: { x0: number; x1: number }) =>
  a.x1 < b.x0 ? b.x0 - a.x1 : b.x1 < a.x0 ? a.x0 - b.x1 : 0;

/**
 * The columns of a table: the bands its data lines fill, plus a column for header or title text
 * well clear of them to the left or right (a "Check" column nobody filled in).
 */
function columnsOf(lines: Line[]): Band[] {
  const bands = mergeBands(dataCells(lines));
  if (!bands.length) return bands;
  const left = Math.min(...bands.map((b) => b.x0));
  const right = Math.max(...bands.map((b) => b.x1));
  const extra: Band[] = [];
  for (const l of lines) {
    if (isDataLine(l)) continue;
    for (const p of phrasesOf(l, true)) {
      const span = spanOf(p);
      const size = p[0]?.size ?? 10;
      if (span.x0 < right + 1.5 * size && span.x1 > left - 1.5 * size) continue;
      const near = extra.find((b) => distance(span, b) <= 0.5 * size);
      if (near) {
        near.x0 = Math.min(near.x0, span.x0);
        near.x1 = Math.max(near.x1, span.x1);
      } else extra.push({ ...span, numeric: false });
    }
  }
  return [...bands, ...extra].sort((a, b) => a.x0 - b.x0);
}

/**
 * A line's words in phrases: words a space apart. In a table (`loose`), words of text a little further
 * apart still (as in `cellsOf`): a scan's text layer places each word on its own, so "Cost" and "Code"
 * arrive as two words with the gap the scanner saw between them. A summary page keeps the tight rule:
 * its labels and notes sit closer together than a table's columns.
 */
function phrasesOf(l: Line, loose = false): Word[][] {
  const phrases: Word[][] = [];
  for (const w of l.words) {
    const p = phrases[phrases.length - 1];
    const last = p?.[p.length - 1];
    const gap = last ? w.x0 - last.x1 : Number.POSITIVE_INFINITY;
    const text = !!last && !isNumeric(last) && !isNumeric(w);
    if (p && (gap < 0.35 * w.size || (loose && text && gap < 0.6 * w.size))) p.push(w);
    else phrases.push([w]);
  }
  return phrases;
}
const spanOf = (p: Word[]) => ({
  x0: Math.min(...p.map((w) => w.x0)),
  x1: Math.max(...p.map((w) => w.x1)),
});

/**
 * Where one column ends and the next begins. Numbers sit at the right of their cell, so a number
 * column's cell ends just after its numbers; text sits at the left, so a text column's cell starts
 * just before its text; between a text column and a number column, halfway.
 */
function boundaries(bands: Band[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < bands.length; i++) {
    const a = bands[i] as Band;
    const b = bands[i + 1] as Band;
    let edge: number;
    if (a.numeric) edge = a.x1 + 1.5;
    else if (!b.numeric) edge = b.x0 - 1.5;
    else edge = (a.x1 + b.x0) / 2;
    out.push(Math.min(Math.max(edge, a.x1), b.x0));
  }
  return out;
}

const columnAt = (x: number, edges: number[]) => {
  let i = 0;
  while (i < edges.length && x >= (edges[i] as number)) i++;
  return i;
};

/**
 * A line's text by column. A phrase that touches one column goes there whole (a centred header
 * wider than the numbers under it); one that runs across columns is split, each word to the
 * column its middle falls in.
 */
function placeLine(l: Line, bands: Band[], edges: number[]): string[] {
  const row: string[][] = bands.map(() => []);
  for (const p of phrasesOf(l, true)) {
    const span = spanOf(p);
    const touched = bands.map((b, i) => (overlap(span, b) > 0 ? i : -1)).filter((i) => i >= 0);
    if (touched.length > 1) {
      for (const w of p) row[columnAt((w.x0 + w.x1) / 2, edges)]?.push(w.text);
    } else {
      const col = touched[0] ?? columnAt((span.x0 + span.x1) / 2, edges);
      row[col]?.push(p.map((w) => w.text).join(" "));
    }
  }
  return row.map((cell) => cell.join(" "));
}

/** Lines closer than a line of text are one table row (wrapped cell text). */
function bySpacing(lines: Line[]): Line[][] {
  const rows: Line[][] = [];
  for (const l of lines) {
    const row = rows[rows.length - 1];
    const last = row?.[row.length - 1];
    if (row && last && l.y - last.y < 0.85 * Math.max(l.size, last.size)) row.push(l);
    else rows.push([l]);
  }
  return rows;
}

/** Which band between a page's row rules (sorted y) a line's text sits in: 0 above the first rule. */
const bandOf = (l: Line, rows: readonly number[]) => {
  const middle = l.y - 0.35 * l.size;
  let i = 0;
  while (i < rows.length && (rows[i] as number) < middle) i++;
  return i;
};

/**
 * A page's lines as table rows. With row rules (`rowRules`), the lines between two rules are one row,
 * however far apart: a top-aligned cell's wrapped text sits a full line below the first line, as far
 * as the next item does. A band holding two data lines (a rule left out), and the lines above the
 * first rule or below the last, are split by spacing as an unruled table is.
 */
function toRows(lines: Line[], rows: readonly number[] | null = null): Line[][] {
  if (!rows) return bySpacing(lines);
  const out: Line[][] = [];
  let band: Line[] = [];
  let at = -1;
  const flush = () => {
    if (!band.length) return;
    const inside = at > 0 && at < rows.length;
    if (inside && band.filter(isDataLine).length <= 1) out.push(band);
    else out.push(...bySpacing(band));
    band = [];
  };
  for (const l of lines) {
    const b = bandOf(l, rows);
    if (b !== at) flush();
    at = b;
    band.push(l);
  }
  flush();
  return out;
}

/**
 * Joins neighbouring columns that are never both filled on one row: an item number printed at the
 * right of its cell and "CO-1" or the "Item" header at the left are one column, and so is a band
 * nobody filled. Real columns share at least the header row.
 */
function mergeComplementary(grid: Grid) {
  const width = Math.max(0, ...grid.map((r) => r.length));
  for (let c = width - 2; c >= 0; c--) {
    if (grid.some((r) => (r[c] ?? "") !== "" && (r[c + 1] ?? "") !== "")) continue;
    for (const r of grid) {
      r[c] = (r[c] ?? "") || (r[c + 1] ?? "");
      r.splice(c + 1, 1);
    }
  }
}

/** A vertical rule: an x and the stretch of the page it runs down. */
interface VRule {
  x: number;
  y0: number;
  y1: number;
}

/**
 * A page's vertical rules, joined where one continues another (Chromium paints each cell's border
 * as its own short rectangle, so one column edge arrives as a rectangle per row).
 */
function verticalRules(rules: Rule[]): VRule[] {
  const v = rules
    .filter((r) => r.x1 - r.x0 <= 3 && r.y1 - r.y0 >= 2 * (r.x1 - r.x0))
    .map((r) => ({ x: (r.x0 + r.x1) / 2, y0: r.y0, y1: r.y1 }))
    .sort((a, b) => a.x - b.x || a.y0 - b.y0);
  const out: VRule[] = [];
  for (const r of v) {
    const near = out.find((o) => Math.abs(o.x - r.x) <= 1 && r.y0 <= o.y1 + 2 && r.y1 >= o.y0 - 2);
    if (near) {
      near.y0 = Math.min(near.y0, r.y0);
      near.y1 = Math.max(near.y1, r.y1);
    } else out.push({ ...r });
  }
  return out;
}

const RULED_SHARE = 0.6;

/** A horizontal rule: a y and the stretch of the page it runs across. */
interface HRule {
  y: number;
  x0: number;
  x1: number;
}

/** A page's horizontal rules, joined end to end (Chromium paints a row's border a cell at a time). */
function horizontalRules(rules: Rule[]): HRule[] {
  const h = rules
    .filter((r) => r.y1 - r.y0 <= 3 && r.x1 - r.x0 >= 2 * (r.y1 - r.y0))
    .map((r) => ({ y: (r.y0 + r.y1) / 2, x0: r.x0, x1: r.x1 }))
    .sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const out: HRule[] = [];
  for (const r of h) {
    const near = out.find((o) => Math.abs(o.y - r.y) <= 1 && r.x0 <= o.x1 + 2 && r.x1 >= o.x0 - 2);
    if (near) {
      near.x0 = Math.min(near.x0, r.x0);
      near.x1 = Math.max(near.x1, r.x1);
    } else out.push({ ...r });
  }
  return out;
}

/**
 * The rules that divide a page's table into rows: the y of every horizontal rule running across at
 * least 80% of the data lines' width (not an underline under a total or a signature line), or null
 * when they do not divide the data lines: fewer than 60% of neighbouring data lines have a rule
 * between them (a rule under the header and above the total only), so the spacing says where rows end.
 */
function rowRules(lines: Line[], rules: HRule[]): number[] | null {
  const data = lines.filter(isDataLine);
  if (data.length < 2) return null;
  const words = data.flatMap((l) => l.words);
  const left = Math.min(...words.map((w) => w.x0));
  const right = Math.max(...words.map((w) => w.x1));
  const ys = rules
    .filter((r) => overlap(r, { x0: left, x1: right }) >= 0.8 * (right - left))
    .map((r) => r.y)
    .sort((a, b) => a - b)
    // A double border (the bottom of one cell and the top of the next) is one rule.
    .filter((y, i, all) => i === 0 || y - (all[i - 1] as number) > 2);
  if (ys.length < 2) return null;
  let divided = 0;
  for (let i = 0; i + 1 < data.length; i++) {
    if (bandOf(data[i] as Line, ys) !== bandOf(data[i + 1] as Line, ys)) divided++;
  }
  return divided >= RULED_SHARE * (data.length - 1) ? ys : null;
}

/**
 * The column edges of a ruled table: the x of every vertical rule that crosses at least 60% of the
 * data lines (a border runs through the line's text height), or null when the table is not ruled,
 * or ruled only in part. In part means two amounts on one data line fall between the same two
 * edges (a border left out), or an amount runs across an edge: then the borders do not say where
 * the columns are, and the text does.
 */
function ruledEdges(pages: { lines: Line[]; rules: VRule[] }[]): number[] | null {
  const crossings: { x: number; lines: number }[] = [];
  let data = 0;
  for (const p of pages) {
    for (const l of p.lines.filter(isDataLine)) {
      data++;
      const top = l.y - 0.7 * l.size;
      const xs = new Set<number>();
      for (const r of p.rules) {
        if (r.y0 > top || r.y1 < l.y) continue;
        let c = crossings.find((k) => Math.abs(k.x - r.x) <= 1.5);
        if (!c) {
          c = { x: r.x, lines: 0 };
          crossings.push(c);
        }
        xs.add(crossings.indexOf(c));
      }
      for (const i of xs) (crossings[i] as { lines: number }).lines++;
    }
  }
  if (data < 2) return null;
  const edges = crossings
    .filter((c) => c.lines >= RULED_SHARE * data)
    .map((c) => c.x)
    .sort((a, b) => a - b)
    // A double border (two rules a hair apart) is one edge.
    .filter((x, i, all) => i === 0 || x - (all[i - 1] as number) > 3);
  if (edges.length < 3) return null;
  let partial = 0;
  for (const p of pages) {
    for (const l of p.lines.filter(isDataLine)) {
      const amounts = l.words.filter((w) => isNumeric(w) && MONEYISH.test(w.text));
      const across = amounts.some((w) => edges.some((e) => w.x0 < e - 0.5 && w.x1 > e + 0.5));
      const cells = amounts.map((w) => columnAt((w.x0 + w.x1) / 2, edges));
      if (across || new Set(cells).size < cells.length) partial++;
    }
  }
  return partial > 0.1 * data ? null : edges;
}

/** A line's text by ruled cell: each word to the cell its middle falls in; words a space apart in one cell stay a phrase. */
function placeRuled(l: Line, edges: number[]): string[] {
  const row: string[][] = Array.from({ length: edges.length + 1 }, () => []);
  for (const p of phrasesOf(l)) {
    let col = -1;
    let words: string[] = [];
    for (const w of p) {
      const c = columnAt((w.x0 + w.x1) / 2, edges);
      if (c !== col && words.length) {
        row[col]?.push(words.join(" "));
        words = [];
      }
      col = c;
      words.push(w.text);
    }
    if (words.length) row[col]?.push(words.join(" "));
  }
  return row.map((cell) => cell.join(" "));
}

/** A tilt steeper than this (about 5 degrees) is not a scan's: rotated or slanted text, left alone. */
const MAX_SKEW = 0.09;
/** Fewer word pairs than this say nothing about a tilt. */
const MIN_SKEW_PAIRS = 8;

/**
 * How far a page's lines climb or fall per point across (y grows down), from the slope between
 * each word and the next word on its line: the nearest one starting within three spaces after it,
 * at most half a line higher or lower. The median, weighted by the distance between the pair, so
 * two words drawn a point apart decide little. 0 for a printed page, whose words share a baseline.
 */
export function skewOf(runs: readonly TextRun[]): number {
  const byY = [...runs].sort((a, b) => a.y - b.y);
  const pairs: { slope: number; weight: number }[] = [];
  for (const [i, a] of byY.entries()) {
    const reach = 0.6 * a.size;
    let best: TextRun | null = null;
    for (const dir of [-1, 1]) {
      for (let j = i + dir; j >= 0 && j < byY.length; j += dir) {
        const b = byY[j] as TextRun;
        if (Math.abs(b.y - a.y) > reach) break;
        const gap = b.x0 - a.x1;
        if (gap < -0.2 * a.size || gap > 3 * a.size || b.x0 <= a.x0) continue;
        if (!best || b.x0 < best.x0) best = b;
      }
    }
    if (best) pairs.push({ slope: (best.y - a.y) / (best.x0 - a.x0), weight: best.x0 - a.x0 });
  }
  if (pairs.length < MIN_SKEW_PAIRS) return 0;
  pairs.sort((p, q) => p.slope - q.slope);
  const half = pairs.reduce((t, p) => t + p.weight, 0) / 2;
  let seen = 0;
  for (const p of pairs) {
    seen += p.weight;
    if (seen >= half) return Math.abs(p.slope) <= MAX_SKEW ? p.slope : 0;
  }
  return 0;
}

/**
 * Levels a tilted page (a scan): every word and rule moved up or down by the tilt times its distance
 * from the middle of the text, so a line's words share a baseline again. A page that is level, or
 * whose tilt moves no word by a tenth of a line across the text, comes back as it is.
 */
export function deskew(page: PageText): PageText {
  const { runs } = page;
  if (!runs.length) return page;
  const slope = skewOf(runs);
  const left = Math.min(...runs.map((r) => r.x0));
  const right = Math.max(...runs.map((r) => r.x1));
  const sizes = runs.map((r) => r.size).sort((a, b) => a - b);
  const size = sizes[Math.floor(sizes.length / 2)] as number;
  if (Math.abs(slope) * (right - left) < 0.1 * size) return page;
  const middle = (left + right) / 2;
  const shift = (x: number) => slope * (x - middle);
  return {
    ...page,
    runs: runs.map((r) => ({ ...r, y: r.y - shift(r.x0) })),
    rules: page.rules.map((r) => {
      const a = shift(r.x0);
      const b = shift(r.x1);
      return { ...r, y0: r.y0 - Math.max(a, b), y1: r.y1 - Math.min(a, b) };
    }),
  };
}

/**
 * Whether `cells` repeats one of `rows`: at least two of that row's filled cells, and all but one, are
 * found in the same column here (a scan's OCR may add a smudge to a cell, or misread one of them).
 */
const repeats = (cells: string[], rows: readonly string[][]) =>
  rows.some((r) => {
    const filled = r.map((c, i) => [c.trim().toLowerCase(), i] as const).filter(([c]) => c);
    const found = filled.filter(([c, i]) => {
      const here = (cells[i] ?? "").trim().toLowerCase();
      return here !== "" && (here.includes(c) || c.includes(here));
    }).length;
    return filled.length >= 2 && found >= 2 && found >= filled.length - 1;
  });

/**
 * What a scan's OCR reads from a table's printed borders: a "|" or bracket on its own, or stuck to the
 * front or back of a word ("| Description", "$33,000.00 |"), and a lone ")" or "_". Left out of a
 * scan's text layer only; a printed PDF's text is what its program wrote.
 */
const OCR_BORDER = /^[|[\]{}()_~]+$/;
export function dropOcrBorders(page: PageText): PageText {
  const runs: TextRun[] = [];
  for (const r of page.runs) {
    const text = r.text.replace(/^\s*[|[\]]+\s*/, "").replace(/\s*[|[\]]+\s*$/, " ");
    if (!text.trim() || OCR_BORDER.test(text.trim())) continue;
    runs.push(text === r.text ? r : { ...r, text });
  }
  return { ...page, runs };
}

const signature = (row: string[]) => row.map((c) => c.toLowerCase()).join("|");

/** Rebuilds the tables of a PDF's pages: one per run of pages whose number columns line up. */
export function tablesFromText(text: PdfText): PdfTable[] {
  const pages = text.pages.map((p) => ({
    page: p.page,
    runs: p.runs,
    lines: toLines(p.runs),
    rules: verticalRules(p.rules),
    hrules: horizontalRules(p.rules),
  }));
  const groups: { pages: typeof pages; numeric: Band[] }[] = [];
  for (const p of pages) {
    const cells = dataCells(p.lines);
    const numeric = mergeBands(cells).filter((b) => b.numeric);
    const g = groups[groups.length - 1];
    const lined =
      g &&
      numeric.length > 0 &&
      g.numeric.length > 0 &&
      numeric.filter((b) => g.numeric.some((c) => overlap(b, c) > 0)).length >=
        0.6 * Math.min(numeric.length, g.numeric.length);
    if (g && lined) {
      g.pages.push(p);
      g.numeric = mergeBands([...g.numeric, ...numeric]).filter((b) => b.numeric);
    } else groups.push({ pages: [p], numeric });
  }
  const tables: PdfTable[] = [];
  for (const g of groups) {
    const all = g.pages.flatMap((p) => p.lines);
    // No data lines (a page of notes): each row is its text in one cell.
    const ruled = ruledEdges(g.pages);
    // With the borders known, the lines are rebuilt so no word joins two cells.
    if (ruled) for (const p of g.pages) p.lines = toLines(p.runs, ruled);
    const bands = columnsOf(ruled ? g.pages.flatMap((p) => p.lines) : all);
    const edges = boundaries(bands);
    const grid: Grid = [];
    const labels: string[] = [];
    const seen = new Set<string>();
    const seenRows: string[][] = [];
    let rowsRuled = false;
    for (const [pi, p] of g.pages.entries()) {
      const rows = rowRules(p.lines, p.hrules);
      if (rows) rowsRuled = true;
      for (const row of toRows(p.lines, rows)) {
        const cells = ruled
          ? (() => {
              const merged: string[] = Array.from({ length: ruled.length + 1 }, () => "");
              for (const l of row) {
                placeRuled(l, ruled).forEach((c, i) => {
                  if (c) merged[i] = merged[i] ? `${merged[i]} ${c}` : c;
                });
              }
              return merged;
            })()
          : bands.length
            ? (() => {
                const merged: string[] = bands.map(() => "");
                for (const l of row) {
                  placeLine(l, bands, edges).forEach((c, i) => {
                    if (c) merged[i] = merged[i] ? `${merged[i]} ${c}` : c;
                  });
                }
                return merged;
              })()
            : [row.flatMap((l) => l.words.map((w) => w.text)).join(" ")];
        const joined = cells.join(" ").trim();
        if (!joined || PAGE_LINE.test(joined)) continue;
        const sig = signature(cells);
        const hasNumber = cells.some((c) => MONEYISH.test(c) && NUMERIC.test(c.replace(/\s/g, "")));
        // A title block or column header printed again at the top of a later page, also when a scan's
        // OCR read a smudge beside it ("Seyi Bid Amount"): every cell of an earlier row, in its place.
        if (pi > 0 && !hasNumber && (seen.has(sig) || repeats(cells, seenRows))) continue;
        if (pi === 0 || !hasNumber) {
          seen.add(sig);
          seenRows.push(cells);
        }
        grid.push(cells);
        const first = row[0] as Line;
        labels.push(`page ${p.page}, line ${first.n}`);
      }
    }
    mergeComplementary(grid);
    const first = g.pages[0]?.page ?? 1;
    const last = g.pages[g.pages.length - 1]?.page ?? first;
    tables.push({
      name: first === last ? `PDF page ${first}` : `PDF pages ${first}-${last}`,
      grid,
      labels,
      pages: g.pages.map((p) => p.page),
      ruled: ruled !== null,
      rowsRuled,
    });
  }
  return tables;
}

// Leader dots or a fill-in rule between a label and its amount ("6. TOTAL EARNED LESS RETAINAGE ....... $71,865.00").
const LEADER = /\s*(?:[.…_]\s?){3,}\s*/;

/** A dollar figure is a cell of its own, even when a note starts right after it (amounts right-aligned, notes left). */
function splitAmounts(p: Word[]): Word[][] {
  const out: Word[][] = [];
  for (const w of p) {
    const amount = isNumeric(w) && MONEYISH.test(w.text);
    const last = out[out.length - 1];
    const lastAmount =
      last?.length === 1 && isNumeric(last[0] as Word) && MONEYISH.test((last[0] as Word).text);
    if (last && !amount && !lastAmount) last.push(w);
    else out.push([w]);
  }
  return out;
}

/**
 * The pages other than `skip`, each as a sheet of its lines, a cell per phrase (words a space apart, split again at
 * leader dots). A summary page has one amount per line beside its label, which the table rebuilder (made for
 * columns of figures) would fold into one cell; this keeps the label and the amount apart for `findSummary`.
 */
export function summaryPages(
  text: PdfText,
  skip: ReadonlySet<number>,
): (SummarySheet & { page: number })[] {
  const sheets: (SummarySheet & { page: number })[] = [];
  for (const p of text.pages) {
    if (skip.has(p.page)) continue;
    const lines = toLines(p.runs);
    const grid: Grid = lines.map((l) =>
      phrasesOf(l)
        .flatMap(splitAmounts)
        .flatMap((ph) =>
          ph
            .map((w) => w.text)
            .join(" ")
            .split(LEADER),
        )
        .map((c) => c.trim())
        .filter((c) => c !== ""),
    );
    sheets.push({
      page: p.page,
      name: `PDF page ${p.page}`,
      grid,
      where: (r) => `page ${p.page}, line ${lines[r]?.n ?? r + 1}`,
      printed: true,
    });
  }
  return sheets;
}

/** What the import note says the table's drawn borders decided. */
const drawn = (t: PdfTable) =>
  t.ruled && t.rowsRuled
    ? ", rows and columns from its cell borders"
    : t.ruled
      ? ", columns from its cell borders"
      : t.rowsRuled
        ? ", rows from the rules between them"
        : "";

/**
 * A scan whose lines do not add up to its own totals row: the line (or the totals row) one look-alike digit would put
 * right, named so the contractor checks that figure on the paper first. Null when the lines agree, or when no swap,
 * or too many, explain the gap. The check that the lines disagree is already in `r.checks`; this adds where.
 */
export function totalMisreadCheck(r: SovImportOk): ImportCheck | null {
  if (r.sheetTotalCents === null || !r.sheetTotalSource) return null;
  const total = { source: r.sheetTotalSource, cents: r.sheetTotalCents };
  const slack = r.lines.length + r.skipped.length;
  const named = (ls: SovImportOk["lines"]) =>
    ls.map((l) => ({
      label: [l.itemNumber, l.description].filter(Boolean).join(" "),
      source: l.source,
      cents: l.originalCents,
    }));
  const lines = named(r.lines);
  const sum = r.lines.reduce((a, l) => a + l.originalCents, 0);
  const coSum = r.changeOrderLines.reduce((a, l) => a + l.originalCents, 0);
  // The total check accepts a totals row with or without the change orders under it: so does the pointer.
  if (Math.abs(sum - total.cents) <= slack || Math.abs(sum + coSum - total.cents) <= slack)
    return null;
  const found = misreadsAgainstTotal(lines, total, slack);
  if (r.changeOrderLines.length)
    for (const m of misreadsAgainstTotal([...lines, ...named(r.changeOrderLines)], total, slack))
      if (!found.some((f) => f.source === m.source && f.swap.cents === m.swap.cents)) found.push(m);
  // A continuation sheet's own row pins it further: a line's scheduled value that, swapped, would no longer agree with
  // the row's balance to finish (C - G = H) or its % (G / C) is not the misread.
  const rowOf = new Map([...r.lines, ...r.changeOrderLines].map((l) => [l.source, l]));
  const pinned = found.filter((m) => {
    const b = m.label === "the totals row" ? undefined : rowOf.get(m.source)?.billing;
    return !b || scheduledAgrees(b, m.swap.cents);
  });
  if (!pinned.length || pinned.length > MAX_SUSPECTS) return null;
  const said = pinned.map((m) =>
    describeSwap(
      m.label === "the totals row" ? `The totals row (${m.source})` : `${m.label} (${m.source})`,
      m.readCents,
      m.swap,
    ),
  );
  return {
    severity: "high",
    message:
      pinned.length === 1
        ? `The scan probably misread one figure: ${said[0]}, which makes the lines add up to the sheet's total. Check it on the paper and correct it before you import.`
        : `One digit read as a look-alike in any of these ${pinned.length} figures would make the lines add up to the sheet's total: ${said.join("; ")}. Check them on the paper and correct the one that is wrong before you import.`,
  };
}

/** Added to a failed import of a scan: what usually goes wrong, and what to do instead. */
const SCAN_HINT =
  " This PDF is a scan read through OCR: a sheet scanned at an angle or at a low resolution reads poorly. Scan it again straight at 300 dpi, or choose the .xlsx or CSV the schedule was made in.";

const fail = (error: string): SovImportResult => ({ ok: false, error, errors: [error] });

/** Reads a PDF schedule of values or continuation sheet into an import preview. Never throws. */
export async function importSovPdf(bytes: Uint8Array): Promise<SovImportResult> {
  let text: PdfText;
  try {
    text = await extractText(bytes);
  } catch (e) {
    if (e instanceof PdfUnreadable)
      return fail(
        `This PDF ${e.message}. Save the schedule of values from Excel as .xlsx or CSV, or print an unprotected PDF, and choose that.`,
      );
    return fail(
      "This PDF could not be read. Save the schedule of values from Excel as .xlsx or CSV and choose that.",
    );
  }
  if (text.unreadable > 0.2 * text.chars)
    return fail(
      `Most of this PDF's text cannot be read back (${text.unreadable} of ${text.chars} characters use fonts with no character map). Choose the .xlsx or CSV the schedule was made in.`,
    );
  if (text.chars - text.unreadable < 20)
    return fail(
      "This PDF has no text to read: it is a scan or a picture of the sheet with no text layer. Choose the .xlsx or CSV the schedule was made in, or ask the GC for one. If you scan it yourself, save it as a searchable PDF (most office scanners and scanning apps, such as Adobe Scan or Microsoft Lens, have that setting, sometimes called OCR) and choose that.",
    );
  // Mostly invisible text over the page picture: a scan read through OCR, which can misread a figure.
  const scanned = text.invisible > 0.5 * text.chars;
  text = {
    ...text,
    // Only a scan is levelled: a printed page is never tilted, and a sparse one (a summary page, its
    // labels and amounts on different lines) can pair words across lines into a false tilt.
    pages: scanned ? text.pages.map((p) => deskew(dropOcrBorders(p))) : text.pages,
  };
  // A summary page whose 5a and 5b lines (a rate and an amount) line up with the continuation sheet's
  // columns would join its table; it is left out of the tables unless nothing else is left.
  const summaries = new Set(
    summaryPages(text, new Set())
      .filter((s) => findSummary([s]) !== null)
      .map((s) => s.page),
  );
  const rest = text.pages.filter((p) => !summaries.has(p.page));
  const tables = tablesFromText(rest.length ? { ...text, pages: rest } : text);
  let firstError: string | null = null;
  for (const t of tables) {
    const r = findSov(t.grid, { rowLabel: (i) => t.labels[i] ?? `row ${i + 1}`, origin: "PDF" });
    if (r.ok) {
      const unreadable = text.unreadable
        ? [
            `${text.unreadable} character(s) in the PDF could not be read and show as ${UNREADABLE}. Check the descriptions.`,
          ]
        : [];
      const misread = scanned ? totalMisreadCheck(r) : null;
      return {
        ...r,
        ...(scanned ? { scanned: true } : {}),
        checks: misread ? [...r.checks, misread] : r.checks,
        summary: findSummary(summaryPages(text, new Set(t.pages))),
        notes: [
          scanned
            ? `Read from the scan's text layer (${t.name}${drawn(t)}), which the scanner or scanning app made by OCR: it can misread a letter or a digit (a 5 as an S, an 8 as a 3). Check every amount and description against the paper before you import.`
            : `Read from the PDF's text (${t.name}${drawn(t)}). Check every line against the PDF: a printed sheet holds no formulas, so a figure cut off or merged in printing reads as printed.`,
          ...unreadable,
          ...r.notes,
        ],
      };
    }
    if (tables.length === 1) return scanned ? fail(`${r.error}${SCAN_HINT}`) : r;
    firstError ??= `${t.name}: ${r.error}`;
  }
  return fail(`${firstError ?? "No table was found in this PDF."}${scanned ? SCAN_HINT : ""}`);
}
