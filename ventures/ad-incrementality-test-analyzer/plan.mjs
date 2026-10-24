// Test-design planner: before spending on a geo holdout, rank which regions to
// run the campaign in. Each candidate split is back-tested on the history you
// already have: pretend a campaign of the planned length ran at many earlier
// points, build the counterfactual from the other regions the way analyze()
// does, and record how far the prediction missed. The spread of those misses is
// the smallest lift the real test could tell from noise (minimum detectable lift).
import { nnls } from "./calc.mjs";

const sum = (a) => a.reduce((s, v) => s + v, 0);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
const pickEvenly = (arr, k) => (arr.length <= k ? arr : Array.from({ length: k }, (_, i) => arr[Math.round((i * (arr.length - 1)) / (k - 1))]));

// Small seeded generator so a sampled search is repeatable.
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
}

function combos(n, k, limit, seed) {
  const total = (() => { let c = 1; for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i; return Math.round(c); })();
  const out = [];
  if (total <= limit) {
    const rec = (start, cur) => {
      if (cur.length === k) { out.push([...cur]); return; }
      for (let i = start; i < n; i++) { cur.push(i); rec(i + 1, cur); cur.pop(); }
    };
    rec(0, []);
    return { list: out, total, sampled: false };
  }
  const r = rng(seed), seen = new Set();
  while (out.length < limit) {
    const idx = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const pick = idx.slice(0, k).sort((a, b) => a - b), key = pick.join(",");
    if (!seen.has(key)) { seen.add(key); out.push(pick); }
  }
  return { list: out, total, sampled: true };
}

// Back-test one split: returns the relative misses of forward placebo windows.
function backtest(panel, testIdx, L, maxWindows) {
  const T = panel.days.length;
  const units = panel.units;
  const ctlIdx = units.map((_, i) => i).filter((i) => !testIdx.includes(i));
  const y = panel.days.map((_, t) => sum(testIdx.map((i) => panel.series[units[i]][t])));
  const X = panel.days.map((_, t) => ctlIdx.map((i) => panel.series[units[i]][t]));
  const minTrain = Math.max(14, Math.ceil(T / 2));
  const starts = [];
  for (let p = minTrain; p + L <= T; p++) starts.push(p);
  const rel = [];
  for (const p of pickEvenly(starts, maxWindows)) {
    const idx = Array.from({ length: p }, (_, i) => i);
    const w = nnls(idx.map((i) => X[i]), idx.map((i) => y[i]), 600);
    let gap = 0, pred = 0;
    for (let i = p; i < p + L; i++) { const c = dot(X[i], w); gap += y[i] - c; pred += c; }
    if (pred > 0) rel.push(gap / pred);
  }
  const trainN = Math.min(T - L, minTrain);
  const tw = nnls(X.slice(0, trainN), y.slice(0, trainN), 600);
  const ym = sum(y.slice(0, trainN)) / trainN;
  const sse = sum(y.slice(0, trainN).map((v, i) => (v - dot(X[i], tw)) ** 2));
  const sst = sum(y.slice(0, trainN).map((v) => (v - ym) ** 2));
  return { rel, r2: sst > 0 ? 1 - sse / sst : 0, share: sum(y) / Math.max(sum(y) + sum(X.map((r) => sum(r))), 1e-9) };
}

function summarize(rel) {
  const s = [...rel].sort((a, b) => a - b);
  return { mde: (quantile(s, 0.95) - quantile(s, 0.05)) / 2, bias: quantile(s, 0.5) };
}

export function planDesign(panel, opts = {}) {
  if (!panel || panel.error) return { error: panel?.error || "No data." };
  const { testSize = 2, length = 14, top = 5, maxCandidates = 120, seed = 7 } = opts;
  const n = panel.units.length, T = panel.days.length;
  const k = Math.round(Number(testSize)), L = Math.round(Number(length));
  if (!Number.isFinite(k) || k < 1) return { error: "Choose how many regions will run the campaign (at least 1)." };
  if (!Number.isFinite(L) || L < 3) return { error: "The campaign must last at least 3 periods." };
  if (n < 3) return { error: "Need at least 3 regions in the history to split into test and comparison groups." };
  if (k > n - 2) return { error: `With ${n} regions you can test in at most ${n - 2}, so at least two stay dark as comparison.` };
  const need = Math.max(28, 2 * L);
  if (T < need) return { error: `Only ${T} periods of history. Planning a ${L}-period campaign needs at least ${need} so that several fake campaigns can be replayed.` };

  const { list, total, sampled } = combos(n, k, maxCandidates, seed);
  const designs = [];
  for (const testIdx of list) {
    const b = backtest(panel, testIdx, L, 12);
    if (b.rel.length < 5) continue;
    const { mde, bias } = summarize(b.rel);
    designs.push({ tests: testIdx.map((i) => panel.units[i]), controls: panel.units.filter((_, i) => !testIdx.includes(i)), mde, bias, r2: b.r2, share: b.share, windows: b.rel.length });
  }
  if (!designs.length) return { error: "Not enough history to replay fake campaigns of that length. Add earlier periods or shorten the campaign." };
  designs.sort((a, b) => a.mde - b.mde);
  const best = designs[0];
  // How the best split's detectable lift shrinks with a longer campaign.
  const lengths = [...new Set([7, 14, 21, 28, 42].filter((l) => l >= 3 && T >= Math.max(28, 2 * l)).concat([L]))].sort((a, b) => a - b);
  const byLength = lengths.map((l) => {
    const b = backtest(panel, best.tests.map((u) => panel.units.indexOf(u)), l, 12);
    return { length: l, mde: b.rel.length >= 5 ? summarize(b.rel).mde : null };
  });
  const warnings = [];
  if (sampled) warnings.push(`${total.toLocaleString("en-US")} possible splits; ${list.length} sampled at random, so a better one may exist.`);
  if (best.windows < 15) warnings.push(`Only ${best.windows} fake campaigns could be replayed, so the detectable-lift figures are rough. More history makes them firmer.`);
  if (best.mde > 0.15) warnings.push("Even the best split can only detect a lift above 15%. Most ad lifts are smaller, so this panel will rarely give a clear answer. Use more regions, steadier regions or a longer campaign.");
  return { testSize: k, length: L, regions: n, periods: T, evaluated: designs.length, total, sampled, designs: designs.slice(0, top), worst: designs[designs.length - 1], byLength, warnings };
}
