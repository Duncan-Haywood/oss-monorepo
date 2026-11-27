// @ts-check
// A plan PDF as the sketch's underlay: the sheet's vector line work drawn at
// its printed scale, so walls traced over it come out at their real lengths,
// with every line end a point the cursor can snap to.
//
// The reading is the free PDF Plan Takeoff's (`geometry.mjs`, `scale.mjs`,
// `pdf-parser.mjs`, `pdf-text.mjs`, vendored byte for byte; `pdfsync.test.mjs`
// checks the copies). This module only turns one read page into what the
// sketch needs: an SVG picture of the page, a size in inches from the scale
// note (checked against the sheet's own dimension strings where it can be),
// and the line ends as points on that picture (0..1 across and down), which
// follow the picture when it is moved, rescaled or straightened.
//
// Nothing renders here and nothing leaves the device: the page reads the
// chosen file into bytes and hands them in.

import { readSheets } from "./geometry.mjs";
import { scaleNotes, sheetVerdict } from "./scale.mjs";
import { traceCorners } from "./sketch.mjs";

/** @typedef {{ x: number, y: number }} Pt */
/** @typedef {{ u: number, v: number }} UV */

const MAX_SNAPS = 120000; // line ends kept for snapping on one page
const MAX_SVG_SEGS = 400000; // segments drawn in the picture

/**
 * Read a PDF's pages for the underlay.
 * @param {Uint8Array} bytes
 * @param {(b: Uint8Array) => Promise<Uint8Array|null>} inflate
 * @param {{ pages?: number[] }} [opts]
 * @returns {Promise<{ pages: any[], pageCount: number, error: string | null }>}
 */
export async function readPlanPdf(bytes, inflate, opts = {}) {
  let r;
  try { r = await readSheets(bytes, inflate, opts); } catch (e) { return { pages: [], pageCount: 0, error: "That PDF could not be read." }; }
  if (r.flags.notPdf) return { pages: [], pageCount: 0, error: "That file is not a PDF." };
  if (r.flags.encrypted) return { pages: [], pageCount: r.flags.pageCount, error: "That PDF is password-protected or encrypted; save an unprotected copy and try again." };
  return { pages: r.pages, pageCount: r.flags.pageCount, error: null };
}

/** The page's display size in points, after its /Rotate. */
export function displaySize(page) {
  const w = page.box[2] - page.box[0], h = page.box[3] - page.box[1];
  return page.rotate % 180 ? [h, w] : [w, h];
}

/** Sheet space (PDF points, y up) to display (points from the top left, y down), with /Rotate. */
export function toDisplay(page, x, y) {
  const [x0, y0, x1, y1] = page.box;
  switch (page.rotate) {
    case 90: return [y - y0, x - x0];
    case 180: return [x1 - x, y - y0];
    case 270: return [y1 - y, x1 - x];
    default: return [x - x0, y1 - y];
  }
}

/**
 * The scale the underlay is sized by. The dimension check wins when it agrees
 * with a note (or finds the set printed at half size); a sheet with one scale
 * note uses it; a sheet with several uses the one the dimensions support, else
 * the note printed most often (the main plan's views usually share it). Ratio
 * is real length over paper length (1/4" = 1'-0" is 48), the same for metric.
 * @returns {{ ratio: number, label: string, how: string } | null}
 */
export function underlayScale(page) {
  const notes = scaleNotes(page.runs || []);
  const usable = notes.filter((n) => n.ratio > 0);
  let v = null;
  try { v = sheetVerdict(page, notes); } catch (e) { v = null; }
  if (v && v.verdict === "confirmed") return { ratio: v.ratio, label: labelOf(usable, v.ratio), how: `the printed scale ${labelOf(usable, v.ratio)}, which ${v.support} of the sheet's ${v.of} dimension strings agree with` };
  if (v && v.verdict === "half size") return { ratio: v.ratio, label: labelOf(usable, v.noteRatio), how: `the dimension strings, which say this sheet was printed at half size (notes say ${labelOf(usable, v.noteRatio)}; the lengths are twice that)` };
  if (v && v.verdict === "inferred") return { ratio: v.ratio, label: v.label, how: `the dimension strings (${v.support} agree with ${v.label}; the sheet prints no scale)` };
  if (!usable.length) return null;
  const count = new Map();
  for (const n of usable) count.set(n.ratio, (count.get(n.ratio) || 0) + 1);
  let best = usable[0].ratio;
  for (const [r, c] of count) if (c > (count.get(best) || 0)) best = r;
  const many = count.size > 1;
  const warn = v && v.verdict === "mismatch" ? "; the dimension strings disagree with it, so check a known length" : "";
  return { ratio: best, label: labelOf(usable, best), how: `the printed scale ${labelOf(usable, best)}${many ? " (the sheet has views at other scales too)" : ""}${warn}` };
}

function labelOf(notes, ratio) {
  const n = notes.find((x) => x.ratio === ratio);
  return n ? n.label : `1:${ratio}`;
}

const xml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] || c);
const r1 = (n) => Math.round(n * 10) / 10;

/**
 * The page as SVG, in display points: strokes darker than fill edges, and the
 * text runs (room names, dimensions) so the picture reads like the sheet.
 * @returns {{ svg: string, segs: number, clipped: boolean }}
 */
export function pageSvg(page) {
  const [W, H] = displaySize(page);
  const segs = page.segs || [], paint = page.paint || [];
  const strokes = [], fills = [];
  let n = 0;
  for (let k = 0, i = 0; k + 3 < segs.length && n < MAX_SVG_SEGS; k += 4, i++, n++) {
    const [ax, ay] = toDisplay(page, segs[k], segs[k + 1]), [bx, by] = toDisplay(page, segs[k + 2], segs[k + 3]);
    if (![ax, ay, bx, by].every(Number.isFinite)) continue;
    (paint[i] === 2 ? fills : strokes).push(`M${r1(ax)} ${r1(ay)}L${r1(bx)} ${r1(by)}`);
  }
  const text = [];
  for (const t of page.runs || []) {
    if (!t || !Number.isFinite(t.x) || !Number.isFinite(t.y) || !(t.size > 0)) continue;
    const [x, y] = toDisplay(page, t.x, t.y);
    const ang = -((t.angle || 0) + (page.rotate === 90 ? -90 : page.rotate === 270 ? 90 : page.rotate === 180 ? 180 : 0));
    const rot = Math.abs(ang % 360) > 0.01 ? ` transform="rotate(${r1(ang)} ${r1(x)} ${r1(y)})"` : "";
    text.push(`<text x="${r1(x)}" y="${r1(y)}" font-size="${r1(t.size)}"${rot}>${xml(t.text)}</text>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r1(W)} ${r1(H)}" width="${r1(W)}" height="${r1(H)}">`
    + `<rect width="100%" height="100%" fill="#fff"/>`
    + (fills.length ? `<path d="${fills.join("")}" stroke="#9a9a9a" stroke-width="0.4" fill="none"/>` : "")
    + (strokes.length ? `<path d="${strokes.join("")}" stroke="#000" stroke-width="0.6" fill="none" stroke-linecap="round"/>` : "")
    + (text.length ? `<g font-family="Helvetica,Arial,sans-serif" fill="#333">${text.join("")}</g>` : "")
    + `</svg>`;
  return { svg, segs: strokes.length + fills.length, clipped: segs.length / 4 > MAX_SVG_SEGS };
}

/**
 * The stroked line ends of a page as points on the picture (u across, v down,
 * 0..1), each once. Fill edges are left out: Revit paints a mask behind every
 * dimension's text, and its corners are not wall corners. Curve chords are left
 * out too (a door swing's dozens of chord ends would crowd the real corners).
 * @returns {UV[]}
 */
export function snapPoints(page) {
  const [W, H] = displaySize(page);
  if (!(W > 0) || !(H > 0)) return [];
  const segs = page.segs || [], paint = page.paint || [], curve = page.curve || [];
  const seen = new Set(), out = [];
  for (let k = 0, i = 0; k + 3 < segs.length && out.length < MAX_SNAPS; k += 4, i++) {
    if (paint[i] === 2 || curve[i]) continue;
    for (const [x, y] of [[segs[k], segs[k + 1]], [segs[k + 2], segs[k + 3]]]) {
      const [dx, dy] = toDisplay(page, x, y);
      if (!Number.isFinite(dx) || !Number.isFinite(dy) || dx < 0 || dy < 0 || dx > W || dy > H) continue;
      const key = `${Math.round(dx * 8)},${Math.round(dy * 8)}`; // 1/8 pt
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ u: dx / W, v: dy / H });
    }
  }
  return out;
}

/**
 * The picture's placement for a page at a scale: top left at the origin,
 * `ratio / 72` inches per point. With no scale, 40 ft across, as a photo is.
 * @param {any} page @param {{ ratio: number } | null} scale
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
export function underlayTrace(page, scale) {
  const [W, H] = displaySize(page);
  const k = scale && scale.ratio > 0 ? scale.ratio / 72 : 480 / W;
  return { x: 0, y: 0, w: W * k, h: H * k };
}

/** A point on the picture (u, v) to the grid, through the trace's placement and turn. */
export function uvToGrid(t, u, v) {
  const [tl, tr, , bl] = traceCorners(t);
  return { x: tl.x + u * (tr.x - tl.x) + v * (bl.x - tl.x), y: tl.y + u * (tr.y - tl.y) + v * (bl.y - tl.y) };
}

/**
 * Line ends placed on the grid, bucketed so the nearest one to the cursor is
 * found without a scan of all of them.
 */
export class GridSnaps {
  /** @param {any} t the trace @param {UV[]} uv */
  constructor(t, uv, cell = 24) {
    this.cell = cell; this.grid = new Map(); this.count = 0;
    for (const p of uv) {
      const g = uvToGrid(t, p.u, p.v);
      const key = `${Math.floor(g.x / cell)},${Math.floor(g.y / cell)}`;
      let a = this.grid.get(key); if (!a) this.grid.set(key, (a = [])); a.push(g);
      this.count++;
    }
  }
  /**
   * The nearest line end within `tol` inches of `p`, else null. With `line`
   * (`{ axis: "h" | "v", at }`) only points within `tol` of that line count,
   * and the answer is put on it, so a square wall stays square.
   * @param {Pt} p @param {number} tol @param {{ axis: "h" | "v", at: number } | null} [line]
   * @returns {Pt | null}
   */
  near(p, tol, line = null) {
    if (!(tol > 0)) return null;
    const c = this.cell, r = Math.ceil(tol / c), i0 = Math.floor(p.x / c), j0 = Math.floor(p.y / c);
    let best = null, bestD = tol;
    for (let i = i0 - r; i <= i0 + r; i++) for (let j = j0 - r; j <= j0 + r; j++) {
      for (const g of this.grid.get(`${i},${j}`) || []) {
        if (line && Math.abs((line.axis === "h" ? g.y : g.x) - line.at) > tol) continue;
        const d = Math.hypot(g.x - p.x, g.y - p.y);
        if (d <= bestD) { bestD = d; best = g; }
      }
    }
    if (!best) return null;
    if (line) return line.axis === "h" ? { x: best.x, y: line.at } : { x: line.at, y: best.y };
    return { x: best.x, y: best.y };
  }
}

/**
 * Everything the sketch needs from one page of a plan PDF.
 * @returns {{ ok: true, svg: string, trace: { x: number, y: number, w: number, h: number }, uv: UV[], scale: { ratio: number, label: string, how: string } | null, scanned: boolean, clipped: boolean } | { ok: false, error: string }}
 */
export function planUnderlay(page) {
  if (!page) return { ok: false, error: "That page is not in the PDF." };
  const [W, H] = displaySize(page);
  if (!(W > 0) || !(H > 0)) return { ok: false, error: "That page has no size." };
  const lines = (page.segs || []).length / 4;
  if (!lines) {
    const pictures = (page.images || []).length;
    return { ok: false, error: pictures ? "That page is a scanned picture, not line work. Save the page as a PNG or JPEG and trace over it as a picture (then set its scale with two clicks)." : "That page has no line work to trace." };
  }
  const scale = underlayScale(page);
  const { svg, clipped } = pageSvg(page);
  return { ok: true, svg, trace: underlayTrace(page, scale), uv: snapPoints(page), scale, scanned: false, clipped };
}
