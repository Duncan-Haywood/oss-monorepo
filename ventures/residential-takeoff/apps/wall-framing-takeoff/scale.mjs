// Reading a drawing sheet's printed scales and dimension strings.
//
// A takeoff is only as good as its scale. Sheets carry it as text: a view title
// with `1/8" = 1'-0"` under it (architectural), `1" = 20'` (engineering),
// `1:100` (metric), or `NTS`. One sheet often has several views at different
// scales, so every note is kept with its position and a measurement takes the
// note of the view it falls in (assignScale). The dimension strings the drafter
// wrote (`12' - 6"`) are read too: a dimension's printed value divided by the
// length of the line it labels is the scale the sheet was actually printed at,
// which catches a set printed at half size (checkScale).

/** A scale as `ratio` = real length / paper length (1/8" = 1'-0" is 96). */
export function parseScale(text) {
  const t = String(text).replace(/[′’]/g, "'").replace(/[″”“]/g, '"').replace(/\s+/g, ' ').trim();
  if (/^(?:scale\s*:?\s*)?(?:n\.?\s*t\.?\s*s\.?|not to scale)$/i.test(t)) return { nts: true, label: 'NTS' };
  if (/^(?:scale\s*:?\s*)?as (?:indicated|noted|shown)$/i.test(t)) return { asIndicated: true, label: t };
  const body = t.replace(/^scale\s*:?\s*/i, '');
  // Architectural: <paper inches>" = 1'-0"  (paper may be 1/8, 3/16, 1 1/2, 12, 1-1/2)
  let m = /^(\d+(?:[ -]\d+\/\d+)?|\d+\/\d+|\d*\.\d+)\s*"\s*=\s*1\s*'\s*(?:-?\s*0\s*"?)?$/.exec(body);
  if (m) {
    const paper = inchesNumber(m[1]);
    if (paper > 0) return { ratio: 12 / paper, system: 'imperial', label: body };
  }
  // Engineering: 1" = 20'  (or 1" = 20'-0")
  m = /^1\s*"\s*=\s*(\d+(?:\.\d+)?)\s*'\s*(?:-?\s*0\s*"?)?$/.exec(body);
  if (m) return { ratio: Number(m[1]) * 12, system: 'imperial', label: body };
  // Full size inches: 1" = 1"; 3" = 1" is a detail enlargement (ratio < 1)
  m = /^(\d+(?:\/\d+)?)\s*"\s*=\s*(\d+(?:\/\d+)?)\s*"$/.exec(body);
  if (m) { const a = inchesNumber(m[1]), b = inchesNumber(m[2]); if (a > 0 && b > 0) return { ratio: b / a, system: 'imperial', label: body }; }
  // Metric: 1:100, 1 : 50
  m = /^1\s*:\s*(\d+(?:[.,]\d+)?)$/.exec(body);
  if (m) { const r = Number(m[1].replace(',', '.')); if (r > 0) return { ratio: r, system: 'metric', label: body }; }
  return null;
}

function inchesNumber(s) {
  s = s.trim();
  let m = /^(\d+)[ -](\d+)\/(\d+)$/.exec(s);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = /^(\d+)\/(\d+)$/.exec(s);
  if (m) return Number(m[2]) ? Number(m[1]) / Number(m[2]) : 0;
  return Number(s);
}

/** A feet-and-inches string (`12' - 6 1/2"`, `6"`, `12'`) in inches, else null. */
export function parseFeetInches(text) {
  const t = String(text).replace(/[′’]/g, "'").replace(/[″”“]/g, '"').replace(/\s+/g, ' ').trim();
  let m = /^(-?\d+)\s*'\s*(?:-?\s*(\d+(?:\.\d+)?)?(?:\s*(\d+)\/(\d+))?\s*")?$/.exec(t);
  if (m && (m[2] !== undefined || m[3] !== undefined || !/"/.test(t))) {
    const ft = Number(m[1]);
    const inch = (m[2] ? Number(m[2]) : 0) + (m[3] ? Number(m[3]) / Number(m[4]) : 0);
    if (inch >= 12) return null;
    return ft * 12 + inch;
  }
  m = /^(\d+(?:\.\d+)?)?(?:\s*(\d+)\/(\d+))?\s*"$/.exec(t);
  if (m && (m[1] || m[2])) return (m[1] ? Number(m[1]) : 0) + (m[2] ? Number(m[2]) / Number(m[3]) : 0);
  return null;
}

/**
 * Join text runs that sit on one baseline into phrases (`1/8" = 1'-0"` is often
 * three or four runs). Works for text at any angle.
 */
export function phrases(runs) {
  const items = runs.map((r) => {
    const a = ((r.angle || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return { ...r, c, s, along: r.x * c + r.y * s, across: -r.x * s + r.y * c, end: r.x * c + r.y * s + (r.width || r.size * 0.5 * r.text.length) };
  });
  items.sort((p, q) => (p.angle || 0) - (q.angle || 0) || p.across - q.across || p.along - q.along);
  const out = [];
  let cur = null;
  for (const it of items) {
    const tol = Math.max(0.6, it.size * 0.2);
    if (cur && (cur.angle || 0) === (it.angle || 0) && Math.abs(cur.across - it.across) <= tol && Math.abs(cur.size - it.size) <= cur.size * 0.25
      && it.along >= cur.end - it.size * 0.6 && it.along - cur.end <= it.size * 0.6) {
      cur.text += (it.along - cur.end > it.size * 0.15 && !/\s$/.test(cur.text) && !/^\s/.test(it.text) ? ' ' : '') + it.text;
      cur.end = Math.max(cur.end, it.end);
      continue;
    }
    cur = { text: it.text, x: it.x, y: it.y, size: it.size, angle: it.angle || 0, c: it.c, s: it.s, along: it.along, across: it.across, end: it.end };
    out.push(cur);
  }
  for (const p of out) {
    p.text = p.text.replace(/\s+/g, ' ').trim();
    p.length = p.end - p.along;
    // centre of the phrase on its baseline, lifted half a cap height
    p.cx = p.x + p.c * p.length / 2 - p.s * p.size * 0.35;
    p.cy = p.y + p.s * p.length / 2 + p.c * p.size * 0.35;
  }
  return out.filter((p) => p.text);
}

/** Every scale note on a page: {ratio|nts, label, x, y, cx, cy, size}. */
export function scaleNotes(runs) {
  const notes = [];
  for (const p of phrases(runs)) {
    // a note may share its line with a label: "SCALE: 1/4" = 1'-0"", "1:100 @ A1"
    const cands = [p.text, p.text.replace(/\s*@.*$/, ''), ...(p.text.match(/(?:\d+(?:[ -]\d+\/\d+)?|\d+\/\d+)\s*"\s*=\s*1\s*'\s*-?\s*0\s*"|1\s*"\s*=\s*\d+\s*'(?:\s*-?\s*0\s*")?|\b1\s*:\s*\d+\b|\bN\.?T\.?S\.?\b/gi) || [])];
    for (const c of cands) {
      const s = parseScale(c);
      if (s && (s.ratio || s.nts)) { notes.push({ ...s, x: p.x, y: p.y, cx: p.cx, cy: p.cy, size: p.size, angle: p.angle }); break; }
    }
  }
  return notes;
}

/**
 * The scale note that governs a point on the sheet. Drafting convention (and
 * every Revit, ArchiCAD and AutoCAD sheet in the evaluation set) puts a view's
 * title and scale below the view, at its left. So the note chosen is the one
 * below the point (and not far to its right) with the smallest drop; with no
 * such note, the nearest one. A sheet with one scale needs none of this.
 * @param {{x:number,y:number}[]} pts  points of the measurement (page space)
 */
export function assignScale(notes, pts, rule = 'below-left') {
  const usable = notes.filter((n) => n.ratio);
  if (!usable.length) return null;
  const ratios = new Set(usable.map((n) => n.ratio));
  if (ratios.size === 1) return usable[0];
  const minY = Math.min(...pts.map((p) => p.y)), minX = Math.min(...pts.map((p) => p.x));
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length, cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  if (rule === 'below-left') {
    let best = null, bestD = Infinity;
    for (const n of usable) {
      if (n.cy > minY + n.size) continue; // must be below the measurement
      if (n.x > minX + n.size * 2) continue; // and start at or left of it
      const d = (minY - n.cy) + 0.25 * Math.max(0, minX - n.x);
      if (d < bestD) { bestD = d; best = n; }
    }
    if (best) return best;
  }
  let best = null, bestD = Infinity;
  for (const n of usable) {
    const d = Math.hypot(n.cx - cx, n.cy - cy);
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

/** Paper points to real length: inches (imperial) or millimetres (metric). */
export function realLength(points, scale) {
  const paperInches = points / 72;
  return scale.system === 'metric' ? paperInches * 25.4 * scale.ratio : paperInches * scale.ratio;
}

/** Format inches as 12' - 6 1/2" (to the nearest 1/8"). */
export function formatFeetInches(inches) {
  const neg = inches < 0; let x = Math.abs(inches);
  let eighths = Math.round(x * 8);
  const ft = Math.floor(eighths / 96); eighths -= ft * 96;
  const whole = Math.floor(eighths / 8); let frac = eighths - whole * 8;
  let f = '';
  if (frac) { let n = frac, d = 8; while (n % 2 === 0) { n /= 2; d /= 2; } f = ` ${n}/${d}`; }
  return `${neg ? '-' : ''}${ft}' - ${whole}${f}"`;
}

/**
 * Dimension strings matched to the line they label. For each phrase that
 * reads as feet and inches, the candidate is a painted segment parallel to the
 * text whose middle third the text's centre projects onto, lying just below it
 * (within 2.5 text heights). The implied ratio is value / segment length.
 * @returns {{text, inches, cx, cy, segLen, implied}[]}
 */
export function dimensionMatches(page, opts = {}) {
  const { segs, paint } = page;
  const dims = phrases(page.runs).map((p) => ({ ...p, inches: parseFeetInches(p.text) })).filter((p) => p.inches && p.inches >= 6);
  if (!dims.length) return [];
  // bucket segments by grid cell for the search
  const cell = 64, grid = new Map();
  const key = (i, j) => i * 100003 + j;
  for (let k = 0; k < segs.length; k += 4) {
    const x1 = segs[k], y1 = segs[k + 1], x2 = segs[k + 2], y2 = segs[k + 3];
    if (Math.hypot(x2 - x1, y2 - y1) < 1) continue;
    if (paint && paint[k / 4] !== 1) continue; // a fill's edge (an opaque text mask, a hatch) labels nothing
    const i0 = Math.floor(Math.min(x1, x2) / cell), i1 = Math.floor(Math.max(x1, x2) / cell);
    const j0 = Math.floor(Math.min(y1, y2) / cell), j1 = Math.floor(Math.max(y1, y2) / cell);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 400) continue;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const kk = key(i, j); let a = grid.get(kk); if (!a) grid.set(kk, (a = [])); a.push(k); }
  }
  const out = [];
  for (const d of dims) {
    const i = Math.floor(d.cx / cell), j = Math.floor(d.cy / cell);
    const seen = new Set();
    let best = null;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (const k of grid.get(key(i + di, j + dj)) || []) {
      if (seen.has(k)) continue; seen.add(k);
      const x1 = segs[k], y1 = segs[k + 1], x2 = segs[k + 2], y2 = segs[k + 3];
      const L = Math.hypot(x2 - x1, y2 - y1);
      const ux = (x2 - x1) / L, uy = (y2 - y1) / L;
      if (Math.abs(ux * d.c + uy * d.s) < 0.999) continue; // parallel to the text
      const t = (d.cx - x1) * ux + (d.cy - y1) * uy;
      if (t < L / 3 || t > (2 * L) / 3) continue;
      const off = (d.cx - x1) * -uy + (d.cy - y1) * ux; // signed distance from the line
      const across = Math.abs(off);
      if (across > d.size * 2.5) continue;
      // the line sits below the text: the text's own "up" direction points away from it
      const up = (d.cx - (x1 + ux * t)) * -d.s + (d.cy - (y1 + uy * t)) * d.c;
      if (up <= 0) continue;
      if (!best || across < best.across) best = { across, L, x1, y1, ux, uy, t, k };
    }
    if (!best) continue;
    // The measured span runs between the witness (extension) lines that cross
    // the dimension line on either side of the text, not to the line's ends,
    // which most programs carry a little past the witness lines.
    const { x1, y1, ux, uy, L, t: t0 } = best;
    let lo = 0, hi = L, crossings = 0;
    const tol = d.size * 0.065; // about 0.6 pt at a 3/32" (9 pt) text height
    const seen2 = new Set();
    const ci0 = Math.floor((Math.min(x1, x1 + ux * L) - tol) / cell), ci1 = Math.floor((Math.max(x1, x1 + ux * L) + tol) / cell);
    const cj0 = Math.floor((Math.min(y1, y1 + uy * L) - tol) / cell), cj1 = Math.floor((Math.max(y1, y1 + uy * L) + tol) / cell);
    for (let ci = ci0; ci <= ci1; ci++) for (let cj = cj0; cj <= cj1; cj++) for (const k of grid.get(key(ci, cj)) || []) {
      if (seen2.has(k)) continue; seen2.add(k);
      const ax = segs[k], ay = segs[k + 1], bx = segs[k + 2], by = segs[k + 3];
      const l2 = Math.hypot(bx - ax, by - ay);
      const vx = (bx - ax) / l2, vy = (by - ay) / l2;
      if (Math.abs(vx * ux + vy * uy) > 0.02) continue; // perpendicular only
      // where it meets the dimension line, and whether it reaches it
      const sa = (ax - x1) * -uy + (ay - y1) * ux, sb = (bx - x1) * -uy + (by - y1) * ux;
      if (Math.min(sa, sb) > tol || Math.max(sa, sb) < -tol) continue;
      const t = (ax - x1) * ux + (ay - y1) * uy;
      if (t < -tol || t > L + tol) continue;
      crossings++;
      if (t < t0 - tol && t > lo) lo = t;
      if (t > t0 + tol && t < hi) hi = t;
    }
    const span = crossings ? hi - lo : L;
    out.push({ text: d.text, inches: d.inches, cx: d.cx, cy: d.cy, size: d.size, segLen: span, lineLen: L, witnessed: crossings > 0, implied: d.inches / (span / 72), seg: best.k / 4 });
  }
  return out;
}

/**
 * Whether a matched dimension agrees with a scale ratio: within 1%, or within
 * the half inch a drafter's rounding to the inch can hide on a short dimension.
 */
export function dimensionAgrees(d, ratio) {
  const realFromLine = (d.segLen / 72) * ratio; // inches
  return Math.abs(realFromLine - d.inches) <= Math.max(0.01 * d.inches, 0.5 + 1e-6);
}

/**
 * Check a page's scale notes against its dimension strings. A dimension
 * "agrees" with a note when its implied ratio is within 1% of the note's; when
 * most matched dimensions instead agree with twice (or half) the notes, the
 * sheet was printed at another size than drawn.
 */
export function checkScale(page, notes = scaleNotes(page.runs), opts = {}) {
  const dims = dimensionMatches(page, opts);
  const ratios = [...new Set(notes.filter((n) => n.ratio).map((n) => n.ratio))];
  let agree = 0, assignedAgree = 0, half = 0, double = 0;
  const rows = [];
  for (const d of dims) {
    const near = (a, b) => dimensionAgrees(d, b);
    const pt = { x: d.cx, y: d.cy };
    const a = assignScale(notes, [pt]);
    const any = ratios.find((r) => near(d.implied, r));
    if (any) agree++;
    if (a && near(d.implied, a.ratio)) assignedAgree++;
    // printed at half size, a line is half as long, so value / length doubles
    if (!any && ratios.some((r) => dimensionAgrees(d, r * 2))) half++;
    if (!any && ratios.some((r) => dimensionAgrees(d, r / 2))) double++;
    rows.push({ ...d, assigned: a ? a.ratio : null, agrees: Boolean(any) });
  }
  let printed = 'as drawn';
  if (half >= 3 && half > agree * 2) printed = 'half size';
  else if (double >= 3 && double > agree * 2) printed = 'double size';
  return { dims: rows, matched: dims.length, agree, assignedAgree, half, double, printed };
}

/** The printed scales a US sheet uses, as ratios (architectural, then engineering). */
export const STANDARD_IMPERIAL = [
  ...[1 / 32, 1 / 16, 3 / 32, 1 / 8, 3 / 16, 1 / 4, 3 / 8, 1 / 2, 3 / 4, 1, 1.5, 3, 6, 12].map((x) => ({ ratio: 12 / x, label: `${fracLabel(x)}" = 1'-0"` })),
  ...[10, 20, 30, 40, 50, 60, 100, 200].map((f) => ({ ratio: f * 12, label: `1" = ${f}'` })),
];
function fracLabel(x) {
  const whole = Math.floor(x), f = x - whole;
  if (!f) return String(whole);
  for (const d of [2, 4, 8, 16, 32]) { const n = Math.round(f * d); if (Math.abs(n / d - f) < 1e-9) return (whole ? whole + ' ' : '') + `${n}/${d}`; }
  return String(x);
}

/**
 * The scale the dimension strings themselves vouch for: the standard scale the
 * most matched dimensions agree with, when at least `min` (default 3) do and
 * they are at least a quarter of the matches. Null otherwise.
 */
export function inferScale(dims, { min = 3 } = {}) {
  if (!dims.length) return null;
  let best = null;
  for (const s of STANDARD_IMPERIAL) {
    const n = dims.filter((d) => dimensionAgrees(d, s.ratio)).length;
    if (!best || n > best.n) best = { ...s, n };
  }
  if (!best || best.n < min || best.n < dims.length / 4) return null;
  return { ratio: best.ratio, label: best.label, system: 'imperial', support: best.n, of: dims.length };
}

/**
 * One verdict for a page, from its notes and its dimensions:
 *  'confirmed'  the dimensions agree with a printed note
 *  'half size'  they agree with twice a note's ratio: printed at half the drawn
 *               size (an 11x17 of a 22x34 set); every note is off by two
 *  'inferred'   no usable note, but the dimensions name a standard scale
 *  'mismatch'   they name a scale no note gives (check before measuring)
 *  'unchecked'  too few dimensions to say
 */
export function sheetVerdict(page, notes = scaleNotes(page.runs)) {
  const dims = dimensionMatches(page);
  const ratios = [...new Set(notes.filter((n) => n.ratio).map((n) => n.ratio))];
  const support = (r) => dims.filter((d) => dimensionAgrees(d, r)).length;
  const ok = (n) => n >= 3 && n >= dims.length / 4;
  let bestNote = null;
  for (const r of ratios) { const n = support(r); if (!bestNote || n > bestNote.n) bestNote = { ratio: r, n }; }
  let bestHalf = null;
  for (const r of ratios) { const n = support(r * 2); if (!bestHalf || n > bestHalf.n) bestHalf = { ratio: r, n }; }
  if (bestNote && ok(bestNote.n) && !(bestHalf && bestHalf.n > bestNote.n * 2)) {
    return { verdict: 'confirmed', ratio: bestNote.ratio, support: bestNote.n, of: dims.length, factor: 1 };
  }
  if (bestHalf && ok(bestHalf.n)) {
    return { verdict: 'half size', ratio: bestHalf.ratio * 2, noteRatio: bestHalf.ratio, support: bestHalf.n, of: dims.length, factor: 2 };
  }
  const inf = inferScale(dims);
  if (inf && !ratios.length) return { verdict: 'inferred', ratio: inf.ratio, label: inf.label, support: inf.support, of: dims.length, factor: 1 };
  if (inf) return { verdict: 'mismatch', ratio: inf.ratio, label: inf.label, support: inf.support, of: dims.length, factor: inf.ratio / ratios[0] };
  return { verdict: 'unchecked', support: 0, of: dims.length };
}
