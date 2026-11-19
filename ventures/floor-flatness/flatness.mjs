// Floor flatness and levelness (FF / FL) from elevation readings, after the
// method of ASTM E1155 (inch-pound): readings 12 in apart along sample lines.
//
//   q  = 24-in curvature at reading i: (z[i] - z[i-1]) - (z[i-1] - z[i-2])
//   d  = 10-ft elevation difference:     z[i] - z[i-10]
//   FF = 4.57 / (3 * S_q + |mean q|)     (inches)
//   FL = 12.5 / (3 * S_d + |mean d|)     (inches)
//
// The two equations and constants are the ones every secondary source we could
// read agrees on (README, "Sources"); the standard's own text is paywalled and
// was not read. Within a section all lines' q and d values are pooled; across
// sections the overall number is area-weighted, sum(A*F)/sum(A), the reading of
// E1155 section 9.15 that secondary copies give. Check both against your copy
// of the standard before a contract result rests on them.
//
// Everything is plain data in, plain data out: no DOM, no I/O.

export const FF_K = 4.57;
export const FL_K = 12.5;
export const SPACING_IN = 12;
export const FL_STEPS = 10; // 10 ft at 12-in spacing

const TO_IN = { in: 1, ft: 12, mm: 1 / 25.4, cm: 10 / 25.4, m: 1000 / 25.4 };
export const UNITS = Object.keys(TO_IN);

export function toInches(v, unit = 'in') {
  const k = TO_IN[unit];
  if (!k) throw new Error(`Unknown unit "${unit}" (use ${UNITS.join(', ')})`);
  return v * k;
}

function mean(a) { let s = 0; for (const v of a) s += v; return s / a.length; }
function sd(a, m = mean(a)) {
  if (a.length < 2) return NaN;
  let s = 0; for (const v of a) s += (v - m) ** 2;
  return Math.sqrt(s / (a.length - 1));
}

// F-number from a sample of q (or d) values, with the statistics it came from.
export function fNumber(values, k) {
  const n = values.length;
  if (n < 2) return { F: null, n, mean: n ? values[0] : null, sd: null };
  const m = mean(values), s = sd(values, m);
  const denom = 3 * s + Math.abs(m);
  return { F: denom > 0 ? k / denom : Infinity, n, mean: m, sd: s };
}

// Split a line of readings (numbers or null for a missing reading) into runs of
// consecutive readings: a missing reading must not be bridged, or a false
// curvature appears across the gap.
export function runs(values) {
  const out = []; let cur = [];
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) { if (cur.length) out.push(cur); cur = []; }
    else cur.push(v);
  }
  if (cur.length) out.push(cur);
  return out;
}

// q and d values of one line (z in inches at 12-in spacing, nulls allowed).
export function lineSamples(z) {
  const q = [], d = [];
  for (const r of runs(z)) {
    for (let i = 2; i < r.length; i++) q.push((r[i] - r[i - 1]) - (r[i - 1] - r[i - 2]));
    for (let i = FL_STEPS; i < r.length; i++) d.push(r[i] - r[i - FL_STEPS]);
  }
  return { q, d };
}

// Gap under a straightedge of `lengthFt` laid along a line at every reading
// position. A rigid straightedge resting on a profile touches it at two points
// that straddle its middle (its centre of gravity): the edge of the window's
// upper convex hull that spans the window centre. The gap is the largest
// distance between that edge and any reading under the straightedge, the
// overhang beyond a contact included: on a crown the gap a tester sees is at
// the ends. Readings 12 in apart, so
// a gap narrower than a foot is not seen.
export function straightedgeGaps(z, lengthFt = 10) {
  const w = Math.round(lengthFt * 12 / SPACING_IN);
  const out = [];
  for (const r of runsWithStart(z)) {
    for (let s = 0; s + w < r.vals.length; s++) {
      const win = r.vals.slice(s, s + w + 1);
      const hull = upperHull(win);
      const mid = w / 2;
      let a = hull[0], b = hull[hull.length - 1];
      for (let h = 0; h + 1 < hull.length; h++) if (hull[h] <= mid && hull[h + 1] >= mid) { a = hull[h]; b = hull[h + 1]; break; }
      const slope = (win[b] - win[a]) / (b - a);
      let gap = 0, at = s;
      for (let i = 0; i < win.length; i++) {
        const g = win[a] + slope * (i - a) - win[i];
        if (g > gap) { gap = g; at = s + i; }
      }
      out.push({ start: r.start + s, gap, at: r.start + at });
    }
  }
  return out;
}

function runsWithStart(z) {
  const out = []; let cur = null;
  z.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) { if (cur) out.push(cur); cur = null; }
    else { if (!cur) cur = { start: i, vals: [] }; cur.vals.push(v); }
  });
  if (cur) out.push(cur);
  return out;
}

// Indices of the upper convex hull of points (i, y[i]), left to right.
function upperHull(y) {
  const h = [];
  for (let i = 0; i < y.length; i++) {
    while (h.length >= 2) {
      const a = h[h.length - 2], b = h[h.length - 1];
      // drop b if it lies on or below the chord a-i
      if ((y[b] - y[a]) * (i - a) <= (y[i] - y[a]) * (b - a)) h.pop(); else break;
    }
    h.push(i);
  }
  return h;
}

// A survey is a set of points (elevations in inches) and sample lines that are
// lists of point indices 12 in apart (null for a gap). Points may be shared by
// lines, as on a grid read in both directions; the grind estimate relies on it.
export function lineValues(survey, line) {
  return line.map(i => (i == null ? null : survey.z[i]));
}

export function analyseSection(survey, { straightedgeFt = 10 } = {}) {
  const lines = survey.lines.map((line, k) => {
    const z = lineValues(survey, line);
    const { q, d } = lineSamples(z);
    const gaps = straightedgeGaps(z, straightedgeFt);
    let worst = null;
    for (const g of gaps) if (!worst || g.gap > worst.gap) worst = g;
    return {
      name: survey.lineNames?.[k] ?? `Line ${k + 1}`,
      readings: z.filter(v => v != null).length,
      lengthFt: Math.max(0, line.length - 1),
      ff: fNumber(q, FF_K), fl: fNumber(d, FL_K),
      worstGap: worst ? { gap: worst.gap, atReading: worst.at, start: worst.start } : null,
      q, d,
    };
  });
  const allQ = lines.flatMap(l => l.q), allD = lines.flatMap(l => l.d);
  const warnings = [];
  for (const l of lines) {
    if (l.readings < 3) warnings.push(`${l.name}: fewer than 3 readings, no curvature.`);
    else if (l.d.length === 0) warnings.push(`${l.name}: shorter than 11 readings (10 ft) in one run, so it adds nothing to FL.`);
  }
  if (allQ.length && allQ.length < 30) warnings.push(`Only ${allQ.length} curvature values: an F-number from so few swings widely (our rule of thumb, not a limit from the standard).`);
  if (allD.length && allD.length < 30) warnings.push(`Only ${allD.length} 10-ft differences: FL from so few swings widely.`);
  if (allD.length === 0 && allQ.length) warnings.push('No run of 11 or more consecutive readings: FL cannot be computed.');
  return { lines, ff: fNumber(allQ, FF_K), fl: fNumber(allD, FL_K), warnings };
}

// Overall F-numbers over sections: area-weighted mean of the section values.
export function overall(sections) {
  const ok = k => sections.filter(s => s.result[k].F != null && Number.isFinite(s.result[k].F) && s.areaSqFt > 0);
  const w = k => {
    const s = ok(k);
    const A = s.reduce((t, x) => t + x.areaSqFt, 0);
    return A > 0 ? s.reduce((t, x) => t + x.areaSqFt * x.result[k].F, 0) / A : null;
  };
  return { ff: w('ff'), fl: w('fl') };
}

// Pass/fail against a specification: specified overall values (SOV) for the
// floor and minimum local values (MLV) for each section. E1155 itself only
// measures; the limits come from the contract (ACI 117 and ACI 302.1R give
// typical classes). Leave a limit null to skip it.
export function checkSpec(sections, total, spec = {}) {
  const out = [];
  const add = (what, got, limit) => {
    if (limit == null || got == null) return;
    out.push({ what, got, limit, pass: got >= limit });
  };
  add('Overall FF', total.ff, spec.ffOverall);
  add('Overall FL', total.fl, spec.flOverall);
  for (const s of sections) {
    add(`${s.name} FF (local)`, s.result.ff.F, spec.ffLocal);
    add(`${s.name} FL (local)`, s.result.fl.F, spec.flLocal);
  }
  return out;
}

// ---- Grind estimate ------------------------------------------------------
//
// Grinding can only lower concrete. Repeatedly take the reading that stands
// highest above the mean of its neighbours along every line through it, lower
// it to that mean, and recompute, until the section's FF reaches the target or
// no high point is left above `minHumpIn`. The result is a rough lower bound on
// where and how deep a grinder would work, read on a 12-in lattice; it is not a
// grind plan, ignores the FL a grind can lose and cannot see what lies between
// readings.
export function grindEstimate(survey, { targetFF, maxSteps = 5000, minHumpIn = 0.005 } = {}) {
  if (!(targetFF > 0)) throw new Error('A target FF is needed.');
  const z = Float64Array.from(survey.z);
  const removed = new Float64Array(z.length);
  const nbrs = Array.from({ length: z.length }, () => []);
  for (const line of survey.lines) {
    for (let k = 1; k + 1 < line.length; k++) {
      const [a, b, c] = [line[k - 1], line[k], line[k + 1]];
      if (a != null && b != null && c != null) nbrs[b].push([a, c]);
    }
  }
  const work = { ...survey, z };
  const ffNow = () => analyseSection(work).ff.F;
  const start = ffNow();
  let ff = start, steps = 0;
  const hump = i => {
    if (!nbrs[i].length) return -Infinity;
    let s = 0; for (const [a, c] of nbrs[i]) s += (z[a] + z[c]) / 2;
    return z[i] - s / nbrs[i].length;
  };
  while (ff != null && ff < targetFF && steps < maxSteps) {
    let best = -1, bh = minHumpIn;
    for (let i = 0; i < z.length; i++) { const h = hump(i); if (h > bh) { bh = h; best = i; } }
    if (best < 0) break;
    z[best] -= bh; removed[best] += bh; steps++;
    if (steps % 5 === 0 || steps < 20) ff = ffNow();
  }
  ff = ffNow();
  const ground = [];
  removed.forEach((r, i) => { if (r > 0) ground.push({ point: i, depthIn: r }); });
  ground.sort((a, b) => b.depthIn - a.depthIn);
  const after = analyseSection(work);
  return {
    targetFF, startFF: start, endFF: ff, endFL: after.fl.F, startFL: analyseSection(survey).fl.F,
    reached: ff != null && ff >= targetFF, points: ground.length,
    maxDepthIn: ground.length ? ground[0].depthIn : 0,
    // each reading stands for about one square foot on a 12-in lattice
    volumeCuFt: ground.reduce((t, g) => t + g.depthIn / 12, 0),
    ground, z: Array.from(z),
  };
}

// ---- Building surveys ----------------------------------------------------

// Split one row of readings. A row with spaces or tabs between values is split
// on those, and a token like "1,523.4" (an absolute elevation in mm with a
// thousands comma) stays one number; a row with no spaces is split on commas
// or semicolons. "1, 2, 3" (comma then space) is a list either way.
const GROUPED = /^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
export function tokens(row) {
  const t = row.trim();
  if (/[^,;\s][ \t]+[^,;\s]/.test(t)) {
    return t.split(/[ \t]+/).flatMap(w => (GROUPED.test(w) ? [w.replace(/,/g, '')] : w.split(/[,;]/))).filter(Boolean);
  }
  return t.split(/\s*[,;]\s*|\s+/).filter(Boolean);
}

// Sample lines typed one per row: "A1: 0.12, 0.10, -, 0.08" (label optional,
// "-" or "x" for a missing reading). "## Name, area 2500" starts a section.
export function parseLines(text, unit = 'in') {
  const sections = []; let cur = null;
  const start = (name, area) => { cur = { name, areaSqFt: area, survey: { z: [], lines: [], lineNames: [] } }; sections.push(cur); };
  const errors = [];
  text.split(/\r?\n/).forEach((raw, n) => {
    const row = raw.trim();
    if (!row || row.startsWith('#') && !row.startsWith('##')) return;
    if (row.startsWith('##')) {
      const body = row.slice(2).trim();
      const AREA = /,?\s*area\s*[=:]?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\b.*$/i;
      const m = AREA.exec(body);
      start(body.replace(AREA, '').trim() || `Section ${sections.length + 1}`, m ? Number(m[1].replace(/,/g, '')) : null);
      return;
    }
    if (!cur) start('Section 1', null);
    let label = null, body = row;
    const m = /^([^:]{1,40}):(.*)$/.exec(row);
    if (m) { label = m[1].trim(); body = m[2]; }
    const toks = tokens(body);
    const vals = [];
    for (const t of toks) {
      if (/^(-|x|na|n\/a)$/i.test(t)) { vals.push(null); continue; }
      const v = Number(t);
      if (!Number.isFinite(v)) { errors.push(`Row ${n + 1}: "${t}" is not a number.`); return; }
      vals.push(toInches(v, unit));
    }
    if (!vals.length) return;
    const idx = vals.map(v => (v == null ? null : cur.survey.z.push(v) - 1));
    cur.survey.lines.push(idx);
    cur.survey.lineNames.push(label ?? `Line ${cur.survey.lines.length}`);
  });
  return { sections: sections.filter(s => s.survey.lines.length), errors };
}

// A grid of elevations on a 12-in lattice (rows of a CSV, blanks for holes).
// Lines run along every row and every column, both orthogonal directions as
// E1155 asks; `edgeFt` drops readings that close to the grid's edge (specs
// often exclude a band along joints and walls; set it from yours).
export function gridSurvey(grid, { edgeFt = 0, every = 1 } = {}) {
  const rows = grid.length, cols = Math.max(0, ...grid.map(r => r.length));
  const id = Array.from({ length: rows }, () => new Array(cols).fill(null));
  const z = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const v = grid[r][c];
    const inside = r >= edgeFt && c >= edgeFt && r < rows - edgeFt && c < cols - edgeFt;
    if (inside && v != null && Number.isFinite(v)) id[r][c] = z.push(v) - 1;
  }
  const lines = [], lineNames = [];
  for (let r = 0; r < rows; r += every) { lines.push(id[r].slice()); lineNames.push(`Row ${r + 1}`); }
  for (let c = 0; c < cols; c += every) { lines.push(id.map(row => row[c])); lineNames.push(`Column ${c + 1}`); }
  const keep = lines.map((l, k) => [l, lineNames[k]]).filter(([l]) => l.filter(v => v != null).length >= 3);
  return { z, lines: keep.map(k => k[0]), lineNames: keep.map(k => k[1]), grid: { rows, cols, id } };
}

export function parseGrid(text, unit = 'in') {
  const errors = [];
  const grid = text.split(/\r?\n/).filter(r => r.trim() && !r.trim().startsWith('#')).map((row, n) =>
    // comma, semicolon or tab separated keeps empty cells as holes; otherwise split on spaces
    (/[,;\t]/.test(row) ? row.split(/[,;\t]/) : row.trim().split(/\s+/)).map(t => t.trim()).map(t => {
      if (t === '' || /^(-|x|na|n\/a)$/i.test(t)) return null;
      const v = Number(t);
      if (!Number.isFinite(v)) { errors.push(`Row ${n + 1}: "${t}" is not a number.`); return null; }
      return toInches(v, unit);
    }));
  return { grid, errors };
}

// A point cloud (x y z per row, e.g. a scanner export as text) resampled onto a
// 12-in lattice: each lattice node takes the median z of the points within
// `radiusIn` of it, or stays empty. x, y and z share `unit`.
export function parseXyz(text, unit = 'm') {
  const pts = []; const errors = [];
  for (const [n, row] of text.split(/\r?\n/).entries()) {
    const t = row.trim();
    if (!t || /^[#/A-Za-z]/.test(t)) continue;
    const v = tokens(t).slice(0, 3).map(Number);
    if (v.length < 3 || v.some(x => !Number.isFinite(x))) { if (errors.length < 5) errors.push(`Row ${n + 1}: needs x y z numbers.`); continue; }
    pts.push(v.map(x => toInches(x, unit)));
  }
  return { points: pts, errors };
}

export function latticeFromPoints(points, { radiusIn = 3, maxNodes = 250000 } = {}) {
  if (!points.length) return { grid: [], origin: [0, 0] };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  const cols = Math.floor((x1 - x0) / SPACING_IN) + 1, rows = Math.floor((y1 - y0) / SPACING_IN) + 1;
  if (rows * cols > maxNodes) throw new Error(`The cloud spans ${rows} x ${cols} ft; the limit is ${maxNodes} lattice nodes. Crop it to one test section.`);
  const buckets = new Map();
  const reach = Math.ceil(radiusIn / SPACING_IN);
  for (const [x, y, zz] of points) {
    const cx = (x - x0) / SPACING_IN, cy = (y - y0) / SPACING_IN;
    for (let r = Math.max(0, Math.round(cy) - reach); r <= Math.min(rows - 1, Math.round(cy) + reach); r++)
      for (let c = Math.max(0, Math.round(cx) - reach); c <= Math.min(cols - 1, Math.round(cx) + reach); c++) {
        const dx = (cx - c) * SPACING_IN, dy = (cy - r) * SPACING_IN;
        if (dx * dx + dy * dy <= radiusIn * radiusIn) {
          const k = r * cols + c;
          let b = buckets.get(k); if (!b) buckets.set(k, b = []); b.push(zz);
        }
      }
  }
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(null));
  for (const [k, b] of buckets) {
    b.sort((a, c) => a - c);
    const m = b.length >> 1;
    grid[Math.floor(k / cols)][k % cols] = b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  }
  return { grid, origin: [x0, y0] };
}

// ---- Example -------------------------------------------------------------

// A made-up 40 x 30 ft bay, for trying the page: a gentle 1/4 in sag, a few
// trowel ridges and one high spot, read on a 12-in grid. Seeded, so the same
// every time. Not a measured floor.
export function exampleGrid(seed = 7) {
  let s = seed >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const rows = 31, cols = 41, g = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const sag = -0.25 * Math.sin(Math.PI * c / (cols - 1)) * Math.sin(Math.PI * r / (rows - 1));
      const ridge = 0.03 * Math.sin(2 * Math.PI * c / 7);
      const bump = 0.12 * Math.exp(-((r - 8) ** 2 + (c - 29) ** 2) / 4);
      row.push(+(sag + ridge + bump + 0.02 * gauss()).toFixed(3));
    }
    g.push(row);
  }
  return g;
}

// One CSV cell, safe to open in a spreadsheet: text starting =, +, -, @, tab
// or CR is prefixed with an apostrophe so it cannot run as a formula; a plain
// number such as -0.125 passes through as a number.
export function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function gridToCsv(grid) {
  return grid.map(r => r.map(v => (v == null ? '' : csvCell(v))).join(',')).join('\n');
}
