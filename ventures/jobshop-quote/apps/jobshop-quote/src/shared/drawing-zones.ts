// Drawing zones: the border's zone letters and numbers located on a drawing sheet, so a point on the
// sheet can be named by its zone ("C4"), the value AS9102 Form 3 asks for in "Reference Location".
//
// How it works: a zoned border prints single letters down its left and right edges and single
// numbers along its top and bottom edges (ASME Y14.1 and ISO 5457 both do; ASME letters from the
// bottom up and numbers from the right, ISO letters from the top down and numbers from the left).
// The reader takes the text runs that are one letter or one number within an edge band of the page,
// and keeps, per axis, the longest run of consecutive labels that sit on one line, in order, evenly
// spaced. The direction is read from the labels themselves, never assumed. A zone's edges are the
// midpoints between neighbouring labels, so a point is in the zone of the label nearest it along
// each axis.
//
// What it does not do: a border drawn as lines with no text labels (or labels drawn as geometry),
// fewer than three labels on an axis, or labels that are not evenly spaced give no grid, and every
// characteristic on that sheet keeps a blank zone for the inspector. Nothing is guessed.
import type { PdfLayout, TextRun } from "./pdf-text";

export interface ZoneAxis {
  /** Labels in the order they lie along the axis (increasing x or y in page space). */
  labels: string[];
  /** Each label's centre along the axis, same order. */
  centres: number[];
}

export interface ZoneGrid {
  /** Letters, positioned along the page's y axis. */
  rows: ZoneAxis;
  /** Numbers, positioned along the page's x axis. */
  cols: ZoneAxis;
}

/** How deep the edge bands are, as a share of the page's width or height. */
const BAND = 0.1;
/** At least this many labels on an axis before it counts as a zone border. */
const MIN_LABELS = 3;
/** Letters a zone border uses: I and O are often skipped (they read as 1 and 0). */
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

interface Label {
  text: string;
  /** The label's centre on the page. */
  x: number;
  y: number;
}

function centreOf(run: TextRun): { x: number; y: number } {
  // The run's baseline middle, raised half the glyph height along its "up" direction.
  return {
    x: (run.x0 + run.x1) / 2 + (run.upX * run.size) / 2,
    y: (run.y0 + run.y1) / 2 + (run.upY * run.size) / 2,
  };
}

/** A letter's position in the zone alphabet, counting I and O only when the border uses them. */
function letterIndex(ch: string, skipIO: boolean): number {
  if (skipIO && (ch === "I" || ch === "O")) return -1;
  const all = skipIO ? LETTERS.replace(/[IO]/g, "") : LETTERS;
  return all.indexOf(ch);
}

/**
 * The longest chain of labels that lie on one line (`across` within `tol`), whose values step by
 * one in a single direction as `along` increases, evenly spaced. Returns them sorted by `along`.
 */
function bestChain(
  labels: Label[],
  value: (l: Label) => number,
  along: (l: Label) => number,
  across: (l: Label) => number,
  tol: number,
): Label[] {
  let best: Label[] = [];
  // Group the labels into lines across the axis.
  const sorted = [...labels].sort((a, b) => across(a) - across(b));
  const lines: Label[][] = [];
  for (const l of sorted) {
    const line = lines.find((g) => Math.abs(across(g[0] as Label) - across(l)) <= tol);
    if (line) line.push(l);
    else lines.push([l]);
  }
  for (const line of lines) {
    // One label per value on a line (a repeat, say a title block's "1", is not a border label).
    const byValue = new Map<number, Label[]>();
    for (const l of line) byValue.set(value(l), [...(byValue.get(value(l)) ?? []), l]);
    const unique = [...byValue.values()].filter((g) => g.length === 1).map((g) => g[0] as Label);
    const ordered = unique.sort((a, b) => along(a) - along(b));
    for (const dir of [1, -1]) {
      let chain: Label[] = [];
      for (const l of ordered) {
        const prev = chain.at(-1);
        if (prev && value(l) - value(prev) === dir) chain.push(l);
        else {
          if (chain.length > best.length && evenlySpaced(chain, along)) best = chain;
          chain = [l];
        }
      }
      if (chain.length > best.length && evenlySpaced(chain, along)) best = chain;
    }
  }
  return best.length >= MIN_LABELS ? best : [];
}

/** True when neighbouring labels are about equally far apart (within 25% of the median gap). */
function evenlySpaced(chain: Label[], along: (l: Label) => number): boolean {
  if (chain.length < MIN_LABELS) return false;
  const gaps: number[] = [];
  for (let i = 1; i < chain.length; i++)
    gaps.push(along(chain[i] as Label) - along(chain[i - 1] as Label));
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] as number;
  if (median <= 0) return false;
  return gaps.every((g) => Math.abs(g - median) <= median * 0.25);
}

/** Two chains of the same labels (both edges of the border) merged: each label's mean position. */
function axisOf(chains: Label[][], along: (l: Label) => number): ZoneAxis | null {
  const usable = chains.filter((c) => c.length >= MIN_LABELS);
  if (!usable.length) return null;
  const longest = Math.max(...usable.map((c) => c.length));
  const pos = new Map<string, number[]>();
  for (const c of usable.filter((c) => c.length === longest))
    for (const l of c) pos.set(l.text, [...(pos.get(l.text) ?? []), along(l)]);
  const entries = [...pos.entries()].map(([text, ps]) => ({
    text,
    centre: ps.reduce((a, b) => a + b, 0) / ps.length,
  }));
  entries.sort((a, b) => a.centre - b.centre);
  return { labels: entries.map((e) => e.text), centres: entries.map((e) => e.centre) };
}

/**
 * The zone grid of one page, or null when the page has no readable zoned border. Only upright
 * single-character letter labels and one- or two-digit number labels in the edge bands count.
 */
export function zoneGrid(layout: PdfLayout, pageIndex: number): ZoneGrid | null {
  const page = layout.pages[pageIndex];
  if (!page) return null;
  const [bx0, by0, bx1, by1] = page.mediaBox;
  const left = Math.min(bx0, bx1);
  const right = Math.max(bx0, bx1);
  const bottom = Math.min(by0, by1);
  const top = Math.max(by0, by1);
  const w = right - left;
  const h = top - bottom;
  if (w <= 0 || h <= 0) return null;
  const bandX = w * BAND;
  const bandY = h * BAND;

  const letters: { left: Label[]; right: Label[] } = { left: [], right: [] };
  const numbers: { top: Label[]; bottom: Label[] } = { top: [], bottom: [] };
  for (const run of layout.runs) {
    if (run.page !== pageIndex) continue;
    const text = run.text.trim();
    if (!/^(?:[A-Z]|[1-9]\d?)$/.test(text)) continue;
    const c = centreOf(run);
    const label = { text, x: c.x, y: c.y };
    if (/^[A-Z]$/.test(text)) {
      if (c.x - left <= bandX) letters.left.push(label);
      else if (right - c.x <= bandX) letters.right.push(label);
    } else {
      if (c.y - bottom <= bandY) numbers.bottom.push(label);
      else if (top - c.y <= bandY) numbers.top.push(label);
    }
  }

  const tolX = w * 0.02;
  const tolY = h * 0.02;
  const byY = (l: Label) => l.y;
  const byX = (l: Label) => l.x;
  // Try the alphabet both with and without I and O; keep the longer reading.
  const letterChains = (side: Label[]) => {
    const withIO = bestChain(side, (l) => letterIndex(l.text, false), byY, byX, tolX);
    const noIO = bestChain(
      side.filter((l) => letterIndex(l.text, true) >= 0),
      (l) => letterIndex(l.text, true),
      byY,
      byX,
      tolX,
    );
    return noIO.length > withIO.length ? noIO : withIO;
  };
  const rows = axisOf([letterChains(letters.left), letterChains(letters.right)], byY);
  const numberChain = (side: Label[]) => bestChain(side, (l) => Number(l.text), byX, byY, tolY);
  const cols = axisOf([numberChain(numbers.bottom), numberChain(numbers.top)], byX);
  if (!rows || !cols) return null;
  return { rows, cols };
}

/** The label of the zone a coordinate falls in along one axis: the nearest label's. */
function nearest(axis: ZoneAxis, v: number): string {
  let best = 0;
  for (let i = 1; i < axis.centres.length; i++) {
    if (Math.abs((axis.centres[i] as number) - v) < Math.abs((axis.centres[best] as number) - v))
      best = i;
  }
  return axis.labels[best] as string;
}

/** The zone a point on the page lies in, letter first ("C4"), the way Form 3 is usually filled. */
export function zoneAt(grid: ZoneGrid, x: number, y: number): string {
  return `${nearest(grid.rows, y)}${nearest(grid.cols, x)}`;
}

/** Grids per page, read once per page on first use. */
export function zoneReader(
  layout: PdfLayout,
): (page: number, x: number, y: number) => string | null {
  const grids = new Map<number, ZoneGrid | null>();
  const multi = layout.pages.length > 1;
  return (page, x, y) => {
    if (!grids.has(page)) grids.set(page, zoneGrid(layout, page));
    const grid = grids.get(page);
    if (!grid) return null;
    const zone = zoneAt(grid, x, y);
    return multi ? `SH${page + 1} ${zone}` : zone;
  };
}
