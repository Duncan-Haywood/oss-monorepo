// Changes across several columns measured at the same points (a sensor's temperature,
// humidity, light and CO2; a stock's price and volume).
//
// Two ways, both built from the univariate engine:
//
// joint:   one segmentation for all columns. The cost of a segment is the sum of the
//          engine's own per-column costs (makeCost), each column scaled by its own robust
//          noise sd, and the BIC penalty counts the parameters one change adds: its location
//          plus one level per column (mean), or a level and a volatility per column
//          (meanvar). With one column this is exactly pelt() in engine.mjs. A change spread
//          thinly over many columns can pass jointly when no single column would.
//
// columns: the six-setting consensus (consensus.mjs) run on each column alone, keeping the
//          changes every setting agrees on, then merged across columns: each merged change
//          says which columns found it. Inherits the univariate default that scored best on
//          held-out labelled series (TCPD_HELDOUT in consensus.mjs).
//
// Missing cells are carried forward from the last value in that column so every column keeps
// the same indexes; a column whose first cell is missing is an error.
import { makeCost, penaltyValue, robustSd, splitLine, numCell } from './engine.mjs';
import { consensus } from './consensus.mjs';

function check(cols) {
  if (!Array.isArray(cols) || cols.length < 1) throw new Error('Give one or more columns.');
  const n = cols[0].length;
  for (const c of cols) if (c.length !== n) throw new Error('Every column needs the same number of points.');
  if (n < 4) throw new Error(`Need at least 4 points; got ${n}.`);
  if (n > 100000) throw new Error('More than 100,000 points: aggregate the series first.');
  return n;
}

/** Penalty per change for d columns: location plus one (mean) or two (meanvar) parameters per column. */
export function multiPenalty(penalty, n, model, d) {
  if (typeof penalty === 'number' || /^\d+(\.\d+)?$/.test(String(penalty).trim())) return penaltyValue(penalty, n, model);
  const per = model === 'meanvar' ? 2 : 1;
  // penaltyValue's k for one column is 1 + per; scale the log term to 1 + per * d.
  return (penaltyValue(penalty, n, model) / (1 + per)) * (1 + per * d);
}

/**
 * PELT over several aligned columns with a summed cost. cols: array of equal-length number arrays.
 * Returns { changepoints (segment-start indexes), penalty, sigmas, cost }.
 */
export function multiPelt(cols, { model = 'mean', penalty = 'bic', minSegment } = {}) {
  const n = check(cols);
  if (model !== 'mean' && model !== 'meanvar') throw new Error('The joint fit takes model "mean" or "meanvar".');
  const d = cols.length;
  const minSeg = Math.max(1, Math.floor(Number(minSegment) || (model === 'meanvar' ? 10 : 2)));
  const sigmas = cols.map((c) => robustSd(c));
  const costs = cols.map((c, i) => makeCost(c, model, sigmas[i]));
  const cost = (s, t) => { let v = 0; for (const f of costs) v += f(s, t); return v; };
  const beta = multiPenalty(penalty, n, model, d);
  if (n < 2 * minSeg) return { changepoints: [], penalty: beta, sigmas, cost: cost(0, n) };
  const F = new Float64Array(n + 1).fill(Infinity);
  const last = new Int32Array(n + 1).fill(-1);
  F[0] = -beta;
  let R = [0];
  for (let t = minSeg; t <= n; t++) {
    let best = Infinity, arg = -1;
    const vals = R.map((s) => {
      if (t - s < minSeg) return null;
      const v = F[s] + cost(s, t) + beta;
      if (v < best) { best = v; arg = s; }
      return v;
    });
    F[t] = best;
    last[t] = arg;
    const next = R.filter((s, i) => vals[i] === null || vals[i] - beta <= best);
    if (Number.isFinite(F[t])) next.push(t);
    R = next;
  }
  const cps = [];
  for (let t = n; last[t] > 0; t = last[t]) cps.push(last[t]);
  cps.reverse();
  return { changepoints: cps, penalty: beta, sigmas, cost: F[n] };
}

/**
 * Per-column consensus, merged across columns. Returns { changes: [{ index, label, columns, support, of }], perColumn }.
 * tier: 'every' keeps each column's every-setting changes (the default), 'most' adds half-or-more.
 */
export function columnConsensus(cols, { names = null, labels = null, tolerance = null, tier = 'every', base = {} } = {}) {
  const n = check(cols);
  const nm = names || cols.map((_, i) => `column ${i + 1}`);
  const tol = tolerance != null ? Number(tolerance) : Math.max(2, Math.round(n * 0.02));
  const keep = tier === 'most' ? (c) => c.tier !== 'few' : (c) => c.tier === 'all';
  const perColumn = cols.map((values, i) => {
    const c = consensus({ ...base, values }, { tolerance: tol });
    return { column: nm[i], changes: c.changes.filter(keep).map((x) => x.index).sort((a, z) => a - z) };
  });
  const all = [];
  perColumn.forEach((p, ci) => p.changes.forEach((index) => all.push({ index, col: ci })));
  all.sort((a, z) => a.index - z.index);
  // Anchored grouping as in consensus(): within tol of the group's first change; a column counts once.
  const groups = [];
  for (const c of all) {
    const g = groups[groups.length - 1];
    if (g && c.index - g.first <= tol) g.members.push(c); else groups.push({ first: c.index, members: [c] });
  }
  const lab = labels || Array.from({ length: n }, (_, i) => String(i + 1));
  const changes = groups.map((g) => {
    const idx = g.members.map((m) => m.index).sort((a, z) => a - z);
    const index = idx[Math.floor(idx.length / 2)];
    const colsIn = [...new Set(g.members.map((m) => m.col))].sort((a, z) => a - z);
    return { index, label: lab[index], columns: colsIn.map((i) => nm[i]), support: colsIn.length, of: cols.length };
  });
  return { n, tolerance: tol, changes, perColumn };
}

/** Read several numeric columns of a CSV, aligned by row. columns: names or 0-based indexes (default: every numeric column but the label). */
export function parseColumns(csv, columns = null, labelColumn = null) {
  const lines = String(csv ?? '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) throw new Error('No data: paste a CSV with two or more numeric columns.');
  const semi = lines.some((l) => l.replace(/"[^"]*"/g, '').includes(';'));
  const rows = lines.map((l) => splitLine(l, semi));
  const num = (s) => numCell(s, semi);
  const width = Math.max(...rows.map((r) => r.length));
  const header = rows[0].some((c) => c !== '' && Number.isNaN(num(c))) ? rows[0] : null;
  const body = header ? rows.slice(1) : rows;
  const resolve = (ref) => {
    if (typeof ref === 'number' || /^\d+$/.test(String(ref))) {
      const i = Number(ref);
      if (i < 0 || i >= width) throw new Error(`Column ${i} does not exist (the data has ${width}).`);
      return i;
    }
    const i = header ? header.findIndex((h) => h.toLowerCase() === String(ref).trim().toLowerCase()) : -1;
    if (i < 0) throw new Error(`No column named "${ref}".`);
    return i;
  };
  const numeric = (c) => body.filter((r) => Number.isFinite(num(r[c]))).length >= Math.max(1, body.length / 2);
  let li = labelColumn != null && labelColumn !== '' ? resolve(labelColumn) : null;
  let vis;
  if (columns && columns.length) vis = columns.map(resolve);
  else {
    if (li == null && width > 1 && !numeric(0)) li = 0;
    if (li == null && width > 2 && header && /^(date|time|day|month|year|week|period|label|t)$/i.test(String(header[0]).trim())) li = 0;
    vis = [];
    for (let c = 0; c < width; c++) if (c !== li && numeric(c)) vis.push(c);
  }
  if (li == null && width > vis.length && !vis.includes(0)) li = 0;
  if (!vis.length) throw new Error('No numeric column found.');
  let filled = 0;
  const cols = vis.map((c, k) => {
    let last = null;
    return body.map((r, i) => {
      const v = num(r[c]);
      if (Number.isFinite(v)) { last = v; return v; }
      if (last == null) throw new Error(`Column ${header ? `"${header[c]}"` : c} has no number in its first row${i ? 's' : ''}: trim the leading blank rows.`);
      filled++;
      return last;
    });
  });
  const labels = body.map((r, i) => (li == null ? String(i + 1) : (r[li] ?? String(i + 1))));
  return { cols, names: vis.map((c) => (header ? header[c] : `column ${c}`)), labels, filled };
}

/**
 * When the joint fit has more than one change per JOINT_OVERCUT_EVERY points (and more than 3), call it over-cut.
 * Set from eval/tcpd-multi.out.txt and eval/multi-sim.out.txt: on white-noise columns the joint fit made
 * at most 1.5 cuts per 200 points on average (step plus other cuts, every cell); on the three real TCPD series the
 * level fit made one per 4 to 7 points and the level-and-volatility fit one per 13 to 21.
 */
export const JOINT_OVERCUT_EVERY = 50;
export function jointOvercut(cuts, n) { return cuts > Math.max(3, n / JOINT_OVERCUT_EVERY); }

/** Both ways on one input. input: { csv, columns, labelColumn } or { cols, names, labels }. */
export function analyzeMulti(input = {}) {
  let { cols, names, labels } = input, filled = 0;
  if (!cols) ({ cols, names, labels, filled } = parseColumns(input.csv, input.columns, input.labelColumn));
  const n = check(cols);
  names = names || cols.map((_, i) => `column ${i + 1}`);
  labels = labels || Array.from({ length: n }, (_, i) => String(i + 1));
  const model = input.model === 'meanvar' ? 'meanvar' : 'mean';
  const j = multiPelt(cols, { model, penalty: input.penalty ?? 'bic', minSegment: input.minSegment });
  const segs = [0, ...j.changepoints, n];
  // For each joint change: the shift in each column, in that column's noise sds, so a reader sees which columns moved.
  const meanOf = (c, s, t) => { let a = 0; for (let i = s; i < t; i++) a += c[i]; return a / (t - s); };
  const joint = j.changepoints.map((cp, k) => ({
    index: cp, label: labels[cp],
    shifts: cols.map((c, i) => ({ column: names[i], shift: meanOf(c, cp, segs[k + 2]) - meanOf(c, segs[k], cp), sds: (meanOf(c, cp, segs[k + 2]) - meanOf(c, segs[k], cp)) / j.sigmas[i] })),
  }));
  const cc = columnConsensus(cols, { names, labels, tolerance: input.tolerance });
  const overcutWarning = jointOvercut(joint.length, n)
    ? `The one segmentation for all columns has ${joint.length} changes in ${n} points (more than one per ${JOINT_OVERCUT_EVERY}): it is probably cutting smooth, trending or autocorrelated columns into steps, as it did on all three labelled multi-column TCPD series (level: 95 to 132 cuts on 509 to 622 points). Read the column-by-column list instead.`
    : null;
  return { n, columns: names, filled, model, penalty: j.penalty, joint, agreed: cc.changes, perColumn: cc.perColumn, tolerance: cc.tolerance, ...(overcutWarning ? { overcutWarning } : {}) };
}

export function multiText(r) {
  const L = [`${r.columns.length} columns, ${r.n} points${r.filled ? ` (${r.filled} missing cells carried forward)` : ''}: ${r.columns.join(', ')}.`, ''];
  L.push(`Changes every setting agrees on, column by column (changes within ${r.tolerance} points are one):`);
  if (!r.agreed.length) L.push('  none');
  for (const c of r.agreed) L.push(`  ${c.label}  ${c.support}/${c.of} columns: ${c.columns.join(', ')}`);
  L.push('', `One segmentation for all columns (${r.model === 'meanvar' ? 'level and volatility' : 'level'}, penalty ${r.penalty.toFixed(1)} per change):`);
  if (!r.joint.length) L.push('  none');
  for (const c of r.joint) {
    const moved = c.shifts.filter((s) => Math.abs(s.sds) >= 1).sort((a, z) => Math.abs(z.sds) - Math.abs(a.sds));
    L.push(`  ${c.label}  ${moved.length ? moved.map((s) => `${s.column} ${s.shift >= 0 ? '+' : ''}${+s.shift.toPrecision(3)} (${s.sds.toFixed(1)} sd)`).join(', ') : 'every column moved under 1 noise sd'}`);
  }
  if (r.overcutWarning) L.push('', `Read with care: ${r.overcutWarning}`);
  L.push('', '(The joint fit over-cuts a smooth or trending column as the level model does on one column; the column-by-column list inherits the consensus default measured on held-out labelled series. Estimates, not advice.)');
  return L.join('\n');
}
