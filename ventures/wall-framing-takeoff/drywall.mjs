// @ts-check
// Drywall: sheet counts for the interior faces of the walls and an optional
// flat ceiling, hung horizontally in 48 in courses.
//
// An exterior wall (one that is sheathed) takes drywall on its inside face
// only; a wall with `sheathed: false` is an interior partition and takes it on
// both faces. Each course (a 48 in band, the last one ripped to the leftover
// height) is a row of runs: a door or window that fills the whole band splits
// the row, one that covers only part of it is a cut-out in a continuous run.
// Runs of one band width are packed into sheets of the chosen length (first-fit
// decreasing, end joints are not forced onto studs), so a short run reuses the
// offcut of a long one. A ripped band's leftover strip is not reused.
// Screws, tape and compound are rates you type, not measured.
import { THICK, DEPTH, formatLength } from "./engine.mjs";

const BAND = 48;
const EPS = 1e-9;

/** @typedef {{ sheetLength?: number, height?: number, ceiling?: { width: number, depth: number }[], faces?: "inside"|"both", screwsPerSqFt?: number, waste?: number, price?: number }} Drywall */

export function sampleDrywall() {
  return { sheetLength: 96, ceiling: [{ width: 480, depth: 336 }] };
}

/** @param {Drywall} d */
export function validateDrywall(d) {
  const e = [];
  if (![96, 108, 120, 144, 192].includes(d.sheetLength ?? 96)) e.push("Drywall sheet length must be 8, 9, 10, 12 or 16 ft (96, 108, 120, 144 or 192 in).");
  if (d.height != null && !(d.height >= 72 && d.height <= 192)) e.push("Drywall hang height must be between 6 and 16 ft.");
  for (const [i, c] of (d.ceiling || []).entries()) if (!(c.width >= 24 && c.depth >= 24)) e.push(`Ceiling ${i + 1} must be at least 2 ft each way.`);
  if (d.waste != null && !(d.waste >= 0 && d.waste <= 0.3)) e.push("Waste must be between 0 and 0.3.");
  if (d.screwsPerSqFt != null && !(d.screwsPerSqFt > 0 && d.screwsPerSqFt <= 4)) e.push("Screws per sq ft must be between 0 and 4.");
  return e;
}

/** First-fit decreasing of run lengths into sheets of `len`; returns the number of sheets. */
function pack(/** @type {number[]} */ runs, /** @type {number} */ len) {
  /** @type {number[]} */
  const left = [];
  for (const r of [...runs].sort((a, b) => b - a)) {
    let k = r > len + EPS ? -1 : left.findIndex((l) => l + EPS >= r);
    if (r > len + EPS) { // longer than a sheet: whole sheets plus the remainder as a run
      const whole = Math.floor(r / len + EPS);
      for (let i = 0; i < whole; i++) left.push(0);
      const rest = r - whole * len;
      if (rest > EPS) { k = left.findIndex((l) => l + EPS >= rest); if (k < 0) left.push(len - rest); else left[k] -= rest; }
      continue;
    }
    if (k < 0) left.push(len - r); else left[k] -= r;
  }
  return left.length;
}

/** Runs of one 48 in-band of a face from `y0` to `y1`: openings that fill the band split it. */
function bandRuns(/** @type {number} */ length, /** @type {{x0:number,x1:number,y0:number,y1:number}[]} */ ops, /** @type {number} */ y0, /** @type {number} */ y1) {
  const cuts = ops.filter((o) => o.y0 <= y0 + EPS && o.y1 >= y1 - EPS).sort((a, b) => a.x0 - b.x0);
  const runs = [];
  let x = 0;
  for (const o of cuts) { if (o.x0 > x + EPS) runs.push(o.x0 - x); x = Math.max(x, o.x1); }
  if (length > x + EPS) runs.push(length - x);
  return runs;
}

/**
 * @param {Drywall} d
 * @param {{ studLength: number, defaultHeaderHeight: number, walls: any[] }} plan
 */
export function layoutDrywall(d, plan) {
  const errors = validateDrywall(d);
  if (errors.length) return { ok: false, errors };
  const len = d.sheetLength ?? 96;
  const height = d.height ?? Math.round((plan.studLength + 3 * THICK) / 12) * 12;
  const waste = d.waste ?? 0.1;
  /** @type {Map<number, number[]>} band width -> runs */
  const bands = new Map();
  const addRuns = (/** @type {number} */ w, /** @type {number[]} */ runs) => { bands.set(w, [...(bands.get(w) || []), ...runs]); };
  let netSqIn = 0, hungSqIn = 0;
  const walls = [];
  for (const w of plan.walls) {
    const faces = d.faces === "both" ? 2 : w.sheathed === false ? 2 : 1;
    const ops = (w.openings || []).map((/** @type {any} */ o) => {
      const top = o.headerHeight ?? plan.defaultHeaderHeight;
      return { x0: o.offset, x1: o.offset + o.width, y0: Math.max(0, top - o.height), y1: Math.min(height, top) };
    });
    let sq = 0;
    for (let y = 0; y < height - EPS; y += BAND) {
      const y1 = Math.min(height, y + BAND);
      const runs = bandRuns(w.length, ops, y, y1);
      for (let f = 0; f < faces; f++) addRuns(y1 - y, runs);
    }
    const open = ops.reduce((s, o) => s + (o.x1 - o.x0) * (o.y1 - o.y0), 0);
    sq = (w.length * height - open) * faces;
    netSqIn += sq;
    walls.push({ id: w.id, faces, netSqFt: sq / 144 });
  }
  const ceilings = [];
  for (const c of d.ceiling || []) {
    for (let y = 0; y < c.depth - EPS; y += BAND) addRuns(Math.min(BAND, c.depth - y), [c.width]);
    netSqIn += c.width * c.depth;
    ceilings.push({ width: c.width, depth: c.depth, sqFt: (c.width * c.depth) / 144 });
  }
  let sheets = 0;
  const bandSheets = [];
  for (const [w, runs] of [...bands.entries()].sort((a, b) => b[0] - a[0])) {
    const n = pack(runs, len);
    sheets += n; hungSqIn += n * w * len;
    bandSheets.push({ band: w, runs: runs.length, sheets: n });
  }
  const sheetSqFt = (BAND * len) / 144;
  const netSqFt = netSqIn / 144;
  const screws = Math.ceil(netSqFt * (d.screwsPerSqFt ?? 1) * (1 + waste));
  return {
    ok: true, errors: [], sheetLength: len, hangHeight: height, walls, ceilings, bandSheets,
    sheets: { count: sheets, perSheetSqFt: sheetSqFt, price: d.price ?? null, cost: d.price != null ? sheets * d.price : null },
    netSqFt, boughtSqFt: sheets * sheetSqFt, screws, waste,
    assumptions: { screwsPerSqFt: d.screwsPerSqFt ?? 1, rule: "horizontal 48 in courses, end joints not placed on studs, ripped strips not reused" },
  };
}

/** @param {any} d */
export function drywallText(d) {
  const l = [];
  l.push(`  ${d.sheets.count} sheets of 4 x ${d.sheetLength / 12} ft (${d.boughtSqFt.toFixed(0)} sq ft bought for ${d.netSqFt.toFixed(0)} sq ft of faces, hung ${formatLength(d.hangHeight)} high)`);
  for (const b of d.bandSheets) l.push(`    ${b.band === BAND ? "full 4 ft courses" : `ripped ${formatLength(b.band)} course`}: ${b.runs} runs -> ${b.sheets} sheets`);
  l.push(`  ${d.screws} screws at ${d.assumptions.screwsPerSqFt} per sq ft plus ${(100 * d.waste).toFixed(0)}% (a rate you type, not a schedule)`);
  if (d.sheets.cost != null) l.push(`  sheets at ${d.sheets.price} each: ${d.sheets.cost.toFixed(2)}`);
  l.push("  Joints are not placed on studs or ceiling joists here; taping, mud, corner bead and trim are not counted.");
  return l;
}
