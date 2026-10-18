// Ad spend saturation: fit a diminishing-returns response curve to each
// channel's own weekly spend and revenue, read the marginal return at today's
// spend, and find the split of the same total budget that earns most (exact
// dynamic programme, so S-shaped curves are handled). Bootstrap intervals and
// a self back-test say how far to trust it. Pure functions, no imports, no
// network. Money is in whatever currency the file uses.

const DAY_MS = 86400000;

// ---------- small helpers ----------

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(u) {
  const a = Math.sqrt(-2 * Math.log(u() || 1e-12));
  return a * Math.cos(2 * Math.PI * u());
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

export function percentile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// ---------- optimiser (Nelder-Mead) ----------

export function nelderMead(f, x0, { iter = 600, step = 0.4, tol = 1e-12 } = {}) {
  const n = x0.length;
  let pts = [x0.slice()];
  for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += step; pts.push(p); }
  let vals = pts.map(f);
  for (let k = 0; k < iter; k++) {
    const order = vals.map((v, i) => i).sort((i, j) => vals[i] - vals[j]);
    pts = order.map((i) => pts[i]); vals = order.map((i) => vals[i]);
    if (Math.abs(vals[n] - vals[0]) < tol * (1 + Math.abs(vals[0]))) break;
    const c = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += pts[i][j] / n;
    const at = (t) => c.map((cj, j) => cj + t * (pts[n][j] - cj));
    const xr = at(-1), fr = f(xr);
    if (fr < vals[0]) {
      const xe = at(-2), fe = f(xe);
      if (fe < fr) { pts[n] = xe; vals[n] = fe; } else { pts[n] = xr; vals[n] = fr; }
    } else if (fr < vals[n - 1]) { pts[n] = xr; vals[n] = fr; }
    else {
      const xc = fr < vals[n] ? at(-0.5) : at(0.5), fc = f(xc);
      if (fc < Math.min(fr, vals[n])) { pts[n] = xc; vals[n] = fc; }
      else for (let i = 1; i <= n; i++) { pts[i] = pts[i].map((v, j) => pts[0][j] + 0.5 * (v - pts[0][j])); vals[i] = f(pts[i]); }
    }
  }
  let b = 0;
  for (let i = 1; i <= n; i++) if (vals[i] < vals[b]) b = i;
  return { x: pts[b], value: vals[b] };
}

// ---------- response curves ----------
// exp:  R(s) = a (1 - exp(-s/k))            concave, saturates at a
// hill: R(s) = a s^h / (k^h + s^h)          S-shaped when h > 1, h in [0.5, 3]

const sig = (z) => 1 / (1 + Math.exp(-z));
const H_LO = 0.5, H_SPAN = 2.5;

export const CURVES = {
  exp: {
    np: 2,
    f: (p, s) => p[0] * (1 - Math.exp(-Math.max(s, 0) / p[1])),
    d: (p, s) => (p[0] / p[1]) * Math.exp(-Math.max(s, 0) / p[1]),
    toP: (z) => [Math.exp(z[0]), Math.exp(z[1])],
    toZ: (p) => [Math.log(p[0]), Math.log(p[1])],
  },
  hill: {
    np: 3,
    f: (p, s) => (s <= 0 ? 0 : (p[0] * Math.pow(s, p[2])) / (Math.pow(p[1], p[2]) + Math.pow(s, p[2]))),
    d: (p, s) => {
      if (s <= 0) return p[2] < 1 ? Infinity : p[2] === 1 ? p[0] / p[1] : 0;
      const kh = Math.pow(p[1], p[2]);
      return (p[0] * p[2] * kh * Math.pow(s, p[2] - 1)) / Math.pow(kh + Math.pow(s, p[2]), 2);
    },
    toP: (z) => [Math.exp(z[0]), Math.exp(z[1]), H_LO + H_SPAN * sig(z[2])],
    toZ: (p) => {
      const q = Math.min(Math.max((p[2] - H_LO) / H_SPAN, 1e-4), 1 - 1e-4);
      return [Math.log(p[0]), Math.log(p[1]), Math.log(q / (1 - q))];
    },
  },
};

export function curveValue(fit, s) { return CURVES[fit.type].f(fit.p, s); }
export function marginal(fit, s) { return CURVES[fit.type].d(fit.p, s); }

// points: [{s, r}]. Fits on rescaled data so one set of starts suits any currency.
export function fitCurve(points, type, { starts = null, iter = 600 } = {}) {
  const C = CURVES[type];
  const sS = mean(points.map((p) => p.s)) || 1, rS = mean(points.map((p) => p.r)) || 1;
  const pts = points.map((p) => ({ s: p.s / sS, r: p.r / rS }));
  const maxR = Math.max(...pts.map((p) => p.r), 1e-9);
  const sse = (z) => {
    const p = C.toP(z);
    let t = 0;
    for (const q of pts) { const e = q.r - C.f(p, q.s); t += e * e; }
    return Number.isFinite(t) ? t : 1e30;
  };
  let init = starts;
  if (!init) {
    init = [];
    for (const am of [1.3, 2, 4]) for (const km of [0.4, 1.5, 5]) {
      if (type === "exp") init.push([Math.log(am * maxR), Math.log(km)]);
      else for (const h of [1, 2]) init.push(C.toZ([am * maxR, km, h]));
    }
  } else {
    init = init.map((p) => C.toZ([p[0] / rS, p[1] / sS, ...p.slice(2)]));
  }
  let best = null;
  for (const z0 of init) {
    const r = nelderMead(sse, z0, { iter });
    if (!best || r.value < best.value) best = r;
  }
  const pn = C.toP(best.x);
  const p = [pn[0] * rS, pn[1] * sS, ...pn.slice(2)];
  const n = points.length;
  let sseReal = 0, sst = 0;
  const mr = mean(points.map((q) => q.r));
  for (const q of points) { const e = q.r - C.f(p, q.s); sseReal += e * e; sst += (q.r - mr) ** 2; }
  const k = C.np;
  const floor = 1e-12 * (sst + 1);
  const aicc = n > k + 1 ? n * Math.log((sseReal + floor) / n) + 2 * k + (2 * k * (k + 1)) / (n - k - 1) : Infinity;
  return { type, p, sse: sseReal, r2: sst > 0 ? 1 - sseReal / sst : 0, n, aicc, rmse: Math.sqrt(sseReal / n) };
}

// Choose between the two curves by small-sample AIC. The S-shaped curve has to
// earn its extra parameter by more than 2 points.
export function fitBest(points) {
  const e = fitCurve(points, "exp");
  if (points.length < 12) return e;
  const h = fitCurve(points, "hill");
  return h.aicc < e.aicc - 2 ? h : e;
}

// Carry-over (adstock): this week's effect on revenue also comes from earlier
// spend. e_t = (1 - lam) s_t + lam e_(t-1), so a constant spend has e = s and
// the fitted curve stays in steady-state weekly spend. Weeks absent from the
// file count as zero spend.
export const LAMBDAS = [0, 0.2, 0.4, 0.6, 0.8];
export function adstock(pts, lam) {
  if (!lam) return pts.map((p) => ({ ...p }));
  let prev = 0, week = null;
  return pts.map((p) => {
    if (week !== null) for (let w = week + 7; w < p.week; w += 7) prev = lam * prev;
    prev = (1 - lam) * p.s + lam * prev;
    week = p.week;
    return { ...p, s: prev };
  });
}

// Pick the carry-over rate by small-sample AIC on the saturating curve. A
// non-zero rate has to beat the best so far by more than 2 points.
export function fitAdstock(pts, { enabled = true } = {}) {
  if (!enabled || pts.length < 12) return { fit: fitBest(pts), lambda: 0, eff: pts };
  let bestL = 0, bestA = fitCurve(pts, "exp").aicc;
  for (const lam of LAMBDAS.slice(1)) {
    const a = fitCurve(adstock(pts, lam), "exp").aicc;
    if (a < bestA - 2) { bestA = a; bestL = lam; }
  }
  const eff = bestL ? adstock(pts, bestL) : pts;
  return { fit: fitBest(eff), lambda: bestL, eff };
}

// ---------- exact budget allocation (dynamic programme) ----------

// curves: [{ f: (spend) => revenue, lo, hi }] in money per week.
// Returns a function frontier.at(units) -> { revenue, units: [...] } plus the
// feasible range of total units. Works for any curve shape, S-curves included.
export function frontier(curves, unit) {
  const M = curves.length;
  const lo = curves.map((c) => Math.max(0, Math.floor(c.lo / unit)));
  const hi = curves.map((c, i) => Math.max(lo[i], Math.ceil(c.hi / unit)));
  const T = hi.reduce((a, b) => a + b, 0);
  const NEG = -Infinity;
  let prev = new Array(T + 1).fill(NEG); prev[0] = 0;
  const choice = [];
  for (let j = 0; j < M; j++) {
    const val = []; for (let u = lo[j]; u <= hi[j]; u++) val.push(curves[j].f(u * unit));
    const cur = new Array(T + 1).fill(NEG), ch = new Int32Array(T + 1).fill(-1);
    for (let b = 0; b <= T; b++) {
      for (let u = lo[j]; u <= Math.min(hi[j], b); u++) {
        const base = prev[b - u];
        if (base === NEG) continue;
        const v = base + val[u - lo[j]];
        if (v > cur[b]) { cur[b] = v; ch[b] = u; }
      }
    }
    choice.push(ch); prev = cur;
  }
  const minUnits = lo.reduce((a, b) => a + b, 0);
  return {
    minUnits, maxUnits: T, lo, hi, unit,
    at(b) {
      if (b < minUnits || b > T || prev[b] === NEG) return null;
      const units = new Array(M); let r = b;
      for (let j = M - 1; j >= 0; j--) { units[j] = choice[j][r]; r -= units[j]; }
      return { revenue: prev[b], units };
    },
    revenueAt: (b) => (b >= minUnits && b <= T ? prev[b] : NaN),
  };
}

export function allocate(curves, budget, { steps = 400 } = {}) {
  const unit = budget / steps;
  const fr = frontier(curves, unit);
  const r = fr.at(steps);
  if (!r) return { error: "The spend limits leave no feasible split of this budget." };
  return { spend: r.units.map((u) => u * unit), revenue: r.revenue, atLow: r.units.map((u, i) => u === fr.lo[i]), atHigh: r.units.map((u, i) => u === fr.hi[i]), frontier: fr };
}

// ---------- reading the export ----------

function splitLine(line, d) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === d) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function parseDay(s) {
  s = String(s ?? "").trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  let y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/))) {
    let a = +m[1], b = +m[2]; y = +m[3]; if (y < 100) y += 2000;
    if (a > 12) { d = a; mo = b; } else { mo = a; d = b; }
  } else return NaN;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return NaN;
  return Math.floor(Date.UTC(y, mo - 1, d) / DAY_MS);
}

export function dayToIso(day) { return new Date(day * DAY_MS).toISOString().slice(0, 10); }

// Monday on or before a day number (day 0 is a Thursday).
export function weekStart(day) { return day - ((day + 3) % 7 + 7) % 7; }

function pickColumn(headers, rules, taken = []) {
  for (const re of rules) { const i = headers.findIndex((h, k) => re.test(h) && !taken.includes(k)); if (i >= 0) return i; }
  return -1;
}

function money2(s) {
  const t = String(s ?? "").trim();
  if (t === "") return NaN;
  return Number(t.replace(/[^0-9.\-()]/g, "").replace(/^\((.*)\)$/, "-$1"));
}

export function parseSpend(text) {
  const lines = String(text ?? "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { error: "Paste or upload rows with a date, a channel, the spend and the revenue." };
  const first = lines[0];
  const d = [",", "\t", ";"].map((c) => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const head = splitLine(first, d).map((h) => h.toLowerCase());
  const di = pickColumn(head, [/^(date|day|week|week[ _-]?start(ing)?|period)$/, /date|day|week|period/]);
  const si = pickColumn(head, [/^(ad[ _-]?)?(spend|cost)$/, /spend|cost/], [di]);
  const ri = pickColumn(head, [/^(revenue|sales|income)$/, /conversion[ _-]?value|purchase[ _-]?value|revenue|sales|income/], [di, si]);
  const ci = pickColumn(head, [/^(channel|source|platform|network|medium|campaign)$/, /channel|source|platform|network|medium|campaign/], [di, si, ri]);
  if (di < 0 || si < 0 || ri < 0) {
    return { error: `Could not find the columns. Need a date, the ad spend and the revenue, plus a channel column if you have several channels. Found: ${head.join(", ")}.` };
  }
  const rows = []; let skipped = 0;
  for (const line of lines.slice(1)) {
    const c = splitLine(line, d);
    const day = parseDay(c[di]), spend = money2(c[si]), revenue = money2(c[ri]);
    const channel = ci >= 0 ? (c[ci] ?? "").trim() : "All spend";
    if (!channel || Number.isNaN(day) || !Number.isFinite(spend) || !Number.isFinite(revenue) || spend < 0 || revenue < 0) { skipped++; continue; }
    rows.push({ channel, day, spend, revenue });
  }
  if (rows.length < 8) return { error: "Fewer than eight usable rows were found. Check the date, spend and revenue columns." };
  return { rows, skipped, columns: { date: head[di], channel: ci >= 0 ? head[ci] : null, spend: head[si], revenue: head[ri] } };
}

// One point per channel per week (daily rows are summed; weeks with no row are absent).
export function weekly(rows) {
  const m = new Map();
  for (const r of rows) {
    const w = weekStart(r.day), k = `${r.channel}\u0000${w}`;
    const e = m.get(k) || { channel: r.channel, week: w, s: 0, r: 0 };
    e.s += r.spend; e.r += r.revenue; m.set(k, e);
  }
  const by = new Map();
  for (const e of m.values()) { if (!by.has(e.channel)) by.set(e.channel, []); by.get(e.channel).push(e); }
  for (const v of by.values()) v.sort((a, b) => a.week - b.week);
  return by;
}

// ---------- analysis ----------

const MIN_WEEKS = 8;
const CURRENT_WEEKS = 8;

function currentSpend(pts) { return mean(pts.slice(-CURRENT_WEEKS).map((p) => p.s)); }

function bootstrapChannel(pts, fit, B, u) {
  const out = [];
  const n = pts.length;
  for (let b = 0; b < B; b++) {
    const samp = [];
    for (let i = 0; i < n; i++) samp.push(pts[Math.floor(u() * n)]);
    if (new Set(samp.map((p) => p.s)).size < 3) { out.push(null); continue; }
    const f = fitCurve(samp, fit.type, { starts: [fit.p], iter: 400 });
    out.push(f);
  }
  return out;
}

// Refit on weeks before the cutoff, predict revenue in the final weeks from the
// spend that really happened, and compare with a constant-ROAS line.
export function backtestChannel(pts, holdout, { adstock: useAds = true } = {}) {
  const rawTrain = pts.slice(0, pts.length - holdout);
  if (rawTrain.length < MIN_WEEKS + 2 || holdout < 3) return null;
  const { fit, lambda } = fitAdstock(rawTrain, { enabled: useAds });
  const eff = adstock(pts, lambda);
  const train = pts.slice(0, pts.length - holdout), test = pts.slice(-holdout);
  const effTest = eff.slice(-holdout);
  const roas = train.reduce((a, p) => a + p.r, 0) / (train.reduce((a, p) => a + p.s, 0) || 1);
  let actual = 0, pc = 0, pl = 0, ec = 0, el = 0;
  for (let i = 0; i < test.length; i++) {
    const p = test[i], c = curveValue(fit, effTest[i].s), l = roas * p.s;
    actual += p.r; pc += c; pl += l; ec += Math.abs(c - p.r); el += Math.abs(l - p.r);
  }
  return { weeks: test.length, actual, curve: pc, linear: pl, wapeCurve: ec / (actual || 1), wapeLinear: el / (actual || 1), model: fit.type, lambda };
}

export function analyze(rows, opts = {}) {
  const margin = Number.isFinite(opts.margin) && opts.margin > 0 && opts.margin <= 1 ? opts.margin : 0.6;
  const lowMult = opts.lowMult ?? 0.25, highMult = opts.highMult ?? 2;
  const B = opts.boots ?? 100;
  const seed = opts.seed ?? 11;
  const u = rng(seed);
  const by = weekly(rows);
  if (!by.size) return { error: "No usable rows." };

  const allWeeks = [...by.values()].flat().map((p) => p.week);
  const firstWeek = Math.min(...allWeeks), lastWeek = Math.max(...allWeeks);
  const spanWeeks = (lastWeek - firstWeek) / 7 + 1;

  const channels = [];
  for (const [name, pts] of [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const totalS = pts.reduce((a, p) => a + p.s, 0), totalR = pts.reduce((a, p) => a + p.r, 0);
    const cur = currentSpend(pts);
    const maxS = Math.max(...pts.map((p) => p.s));
    const ch = { name, pts, weeks: pts.length, totalSpend: totalS, totalRevenue: totalR, roas: totalS > 0 ? totalR / totalS : NaN, current: cur, maxSpend: maxS, modelled: false, reason: null };
    const spends = pts.map((p) => p.s), ms = mean(spends);
    ch.spendCv = ms > 0 ? Math.sqrt(mean(spends.map((x) => (x - ms) ** 2))) / ms : 0;
    if (pts.length < MIN_WEEKS) ch.reason = `only ${pts.length} weeks of data (need ${MIN_WEEKS})`;
    else if (totalS <= 0 || totalR <= 0) ch.reason = "no spend or no revenue";
    else if (new Set(spends.map((x) => Math.round(x * 100))).size < 4) ch.reason = "spend barely changed, so no curve can be fitted";
    else {
      ch.modelled = true;
      const ad = fitAdstock(pts, { enabled: opts.adstock !== false });
      ch.fit = ad.fit; ch.lambda = ad.lambda; ch.fitPts = ad.eff;
      ch.maxSpend = Math.max(...ad.eff.map((p) => p.s), cur);
      ch.mroas = marginal(ch.fit, cur);
      ch.fitted = curveValue(ch.fit, cur);
      ch.saturation = ch.fit.type === "exp" ? 1 - Math.exp(-cur / ch.fit.p[1]) : Math.pow(cur, ch.fit.p[2]) / (Math.pow(ch.fit.p[1], ch.fit.p[2]) + Math.pow(cur, ch.fit.p[2]));
      ch.boot = bootstrapChannel(ch.fitPts, ch.fit, B, u);
      const ms2 = ch.boot.filter(Boolean).map((f) => marginal(f, cur)).filter(Number.isFinite).sort((a, b) => a - b);
      ch.mroasLo = percentile(ms2, 0.1); ch.mroasHi = percentile(ms2, 0.9);
      ch.lowSpread = ch.spendCv < 0.15;
    }
    channels.push(ch);
  }
  const modelled = channels.filter((c) => c.modelled);
  if (!modelled.length) return { error: `No channel has enough data to fit a curve: ${channels.map((c) => `${c.name} (${c.reason})`).join("; ")}.` };

  const fixedSpend = channels.filter((c) => !c.modelled).reduce((a, c) => a + c.current, 0);
  const budget = modelled.reduce((a, c) => a + c.current, 0);
  const curves = modelled.map((c) => ({
    f: (s) => curveValue(c.fit, s),
    lo: lowMult * c.current,
    hi: Math.max(c.current, Math.min(highMult * c.current, 1.25 * c.maxSpend)),
  }));
  const alloc = allocate(curves, budget);
  if (alloc.error) return { error: alloc.error };
  const curRev = modelled.reduce((a, c) => a + c.fitted, 0);
  modelled.forEach((c, i) => { c.recommended = alloc.spend[i]; c.recRevenue = curveValue(c.fit, alloc.spend[i]); c.atLimit = alloc.atLow[i] ? "lower" : alloc.atHigh[i] ? "upper" : null; c.limits = [curves[i].lo, curves[i].hi]; });
  const gains = [];
  for (let b = 0; b < B; b++) {
    let g = 0, ok = true;
    for (const c of modelled) { const f = c.boot[b]; if (!f) { ok = false; break; } g += curveValue(f, c.recommended) - curveValue(f, c.current); }
    if (ok) gains.push(g);
  }
  gains.sort((a, b) => a - b);
  const gain = alloc.revenue - curRev;

  // Where does adding more budget stop paying? Contribution = margin x revenue - spend.
  const fr = alloc.frontier, unit = fr.unit;
  let bestB = null, bestP = -Infinity;
  for (let b = fr.minUnits; b <= fr.maxUnits; b++) {
    const rv = fr.revenueAt(b);
    if (!Number.isFinite(rv)) continue;
    const p = margin * rv - b * unit;
    if (p > bestP) { bestP = p; bestB = b; }
  }
  const profitAtBudget = margin * alloc.revenue - budget;
  const profitAtCurrent = margin * curRev - budget;
  const optimum = { weeklySpend: bestB * unit, revenue: fr.revenueAt(bestB), contribution: bestP, atUpperLimit: bestB >= fr.maxUnits - 1, atLowerLimit: bestB <= fr.minUnits + 1 };

  // Back-test on the last weeks of the file.
  const holdout = opts.holdoutWeeks ?? Math.max(4, Math.min(12, Math.floor(spanWeeks / 5)));
  const bt = [];
  for (const c of modelled) { const r = backtestChannel(c.pts, holdout, { adstock: opts.adstock !== false }); if (r) bt.push({ name: c.name, ...r }); }
  const btTotal = bt.length ? {
    actual: bt.reduce((a, r) => a + r.actual, 0), curve: bt.reduce((a, r) => a + r.curve, 0), linear: bt.reduce((a, r) => a + r.linear, 0),
    wapeCurve: bt.reduce((a, r) => a + r.wapeCurve * r.actual, 0) / (bt.reduce((a, r) => a + r.actual, 0) || 1),
    wapeLinear: bt.reduce((a, r) => a + r.wapeLinear * r.actual, 0) / (bt.reduce((a, r) => a + r.actual, 0) || 1),
    holdout,
  } : null;

  const summary = {
    channels: channels.length, modelled: modelled.length, weeks: spanWeeks, rows: rows.length,
    firstWeek, lastWeek, margin, budget, fixedSpend, currentRevenue: curRev, recommendedRevenue: alloc.revenue,
    gain, gainLo: percentile(gains, 0.1), gainMid: percentile(gains, 0.5), gainHi: percentile(gains, 0.9),
    pGain: gains.length ? gains.filter((g) => g > 0).length / gains.length : NaN, boots: gains.length,
    profitAtBudget, profitAtCurrent, breakevenRoas: 1 / margin, frontier: fr,
  };
  const res = { channels, modelled, summary, optimum, backtest: bt, backtestTotal: btTotal };
  res.findings = findings(res);
  return res;
}

// Budget what-if: the best split of a different weekly total, read off the
// frontier analyze() already built (no refit). Returns null outside the range the
// per-channel limits allow. `prorata` is the same total spread in proportion to
// today's spend, the "cut or raise every channel by the same percent" baseline.
export function budgetPlan(res, total) {
  if (!res || !res.modelled || !Number.isFinite(total) || total <= 0) return null;
  const fr = res.modelled.length ? res.summary.frontier : null;
  if (!fr) return null;
  const unit = fr.unit, b = Math.round(total / unit);
  const at = fr.at(b);
  if (!at) return null;
  const margin = res.summary.margin;
  const spend = at.units.map((u) => u * unit), spent = b * unit;
  const k = Math.max(1, Math.round(b * 0.02));
  const lo = fr.revenueAt(Math.max(fr.minUnits, b - k)), hi = fr.revenueAt(Math.min(fr.maxUnits, b + k));
  const span = (Math.min(fr.maxUnits, b + k) - Math.max(fr.minUnits, b - k)) * unit;
  const mult = spent / res.summary.budget;
  const prorata = res.modelled.reduce((a, c) => a + curveValue(c.fit, c.current * mult), 0);
  return {
    total: spent, mult, revenue: at.revenue, contribution: margin * at.revenue - spent,
    marginalRoas: span > 0 ? (hi - lo) / span : NaN,
    prorataRevenue: prorata, splitGain: at.revenue - prorata,
    channels: res.modelled.map((c, i) => ({ name: c.name, current: c.current, spend: spend[i], revenue: curveValue(c.fit, spend[i]) })),
  };
}

// A short ladder of budgets from a cut to a raise, for a "what if I spend X%
// more or less" table. Steps outside the feasible range are left out.
export function budgetLadder(res, mults = [0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5]) {
  if (!res || !res.summary) return [];
  return mults.map((m) => budgetPlan(res, res.summary.budget * m)).filter(Boolean);
}

function findings(res) {
  const f = [], s = res.summary;
  const rel = s.currentRevenue > 0 ? s.gain / s.currentRevenue : 0;
  if (s.gain > 0 && rel >= 0.01) {
    f.push({ severity: s.pGain >= 0.8 ? "medium" : "info", title: `Moving the same budget could add about ${money(s.gain)} a week in revenue`, detail: `That is ${pct(rel, 1)} more than the fitted revenue at today's split. Across ${s.boots} resamples of your own weeks the gain ranges from ${money(s.gainLo)} to ${money(s.gainHi)} (10th to 90th percentile), and it is positive in ${pct(s.pGain, 0)} of them. ${s.pGain < 0.8 ? "That is not strong evidence: treat the move as a test on part of the budget, not a switch." : "Move gradually and re-check after a few weeks."}` });
  } else {
    f.push({ severity: "info", title: "Today's split is close to the best split of this budget", detail: `The model finds ${money(Math.max(s.gain, 0))} a week of revenue to gain, under 1% of the total. Your channel mix is not where the money is.` });
  }
  for (const c of res.modelled) {
    const be = s.breakevenRoas;
    if (c.mroasHi < be) f.push({ severity: "medium", title: `${c.name}: the next dollar loses money`, detail: `Marginal return at ${money(c.current)} a week is ${c.mroas.toFixed(2)} per dollar (range ${c.mroasLo.toFixed(2)} to ${c.mroasHi.toFixed(2)}), below the ${be.toFixed(2)} needed to break even at ${pct(s.margin, 0)} margin. The average ROAS of ${c.roas.toFixed(2)} hides this.` });
    else if (c.mroasLo > be * 1.3 && c.saturation < 0.6) f.push({ severity: "info", title: `${c.name}: room to grow`, detail: `Marginal return at ${money(c.current)} a week is ${c.mroas.toFixed(2)} per dollar (range ${c.mroasLo.toFixed(2)} to ${c.mroasHi.toFixed(2)}) and the fitted curve is only ${pct(c.saturation, 0)} of the way to its ceiling. It is fitted on spend up to ${money(c.maxSpend)} a week; beyond that it is extrapolation.` });
    if (c.lambda > 0) f.push({ severity: "info", title: `${c.name}: spend keeps working into later weeks`, detail: `Fitting carry-over improved the fit: about ${pct(c.lambda, 0)} of each week's effect carries into the next (a half-life of ${(Math.log(0.5) / Math.log(c.lambda)).toFixed(1)} weeks). The curve is fitted on that smoothed spend and read at steady spend, so cutting a channel pays back slowly and a short test will understate its effect.` });
    if (c.lowSpread) f.push({ severity: "info", title: `${c.name}: spend barely varied`, detail: `Weekly spend varied by only ${pct(c.spendCv, 0)}, so the data shows one point on the curve and the rest is the model's shape. The marginal-return range above is wide for that reason; vary spend on purpose to learn more.` });
    if (c.atLimit) f.push({ severity: "info", title: `${c.name} hits its ${c.atLimit} limit`, detail: `The best split wants ${c.atLimit === "upper" ? "more" : "less"} here than the limit of ${money(c.atLimit === "upper" ? c.limits[1] : c.limits[0])} a week (the limits keep the advice near spend you have actually tried).` });
  }
  const skipped = res.channels.filter((c) => !c.modelled);
  if (skipped.length) f.push({ severity: "info", title: `Not modelled: ${skipped.map((c) => c.name).join(", ")}`, detail: skipped.map((c) => `${c.name}: ${c.reason}`).join("; ") + `. Their spend is left where it is.` });
  const o = res.optimum;
  f.push({ severity: "info", title: "How much to spend in total", detail: o.atUpperLimit ? `At ${pct(s.margin, 0)} margin the fitted curves are still profitable at the top of the range tested (${money(o.weeklySpend)} a week). Do not read that as a target: it is the edge of what the limits allow.` : `At ${pct(s.margin, 0)} margin the contribution after ad spend peaks near ${money(o.weeklySpend)} a week (today ${money(s.budget)}), about ${money(o.contribution)} a week on attributed revenue. The curve is flat near its peak, so a wide band around it earns almost the same.` });
  const t = res.backtestTotal;
  if (t) {
    const bias = t.actual > 0 ? (t.curve - t.actual) / t.actual : 0;
    const better = t.wapeCurve < t.wapeLinear;
    f.push({ severity: t.wapeCurve > 0.25 ? "medium" : "info", title: `Back-test: last ${t.holdout} weeks predicted ${bias >= 0 ? "+" : ""}${(bias * 100).toFixed(1)}% off in total`, detail: `Fitted on earlier weeks, then asked for revenue in the final ${t.holdout} weeks from the spend that happened. Typical weekly error ${pct(t.wapeCurve, 0)} (a flat ROAS line: ${pct(t.wapeLinear, 0)}). ${better ? "The curve did better than a flat ROAS." : "The curve did no better than a flat ROAS here, so the extra structure is not yet earning its keep."} ${t.wapeCurve > 0.25 ? "An error this size means something else (seasonality, promotions, lag) moves revenue more than spend does; do not act on the split without a live test." : ""}` });
  } else {
    f.push({ severity: "info", title: "No back-test", detail: "Not enough weeks to hold some out after leaving at least ten to fit on." });
  }
  return f;
}

// ---------- output helpers ----------

export function money(v) {
  if (!Number.isFinite(v)) return "n/a";
  const s = v < 0 ? "-" : "";
  v = Math.abs(v);
  return s + "$" + v.toLocaleString("en-US", { maximumFractionDigits: v < 100 ? 2 : 0, minimumFractionDigits: v < 100 ? 2 : 0 });
}
export function pct(v, d = 1) { return `${(v * 100).toFixed(d)}%`; }

function csvCell(v) {
  let s = typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(4)) : String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s) && typeof v !== "number") s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function reportCsv(res) {
  const h = "channel,weeks,current_weekly_spend,average_roas,curve,marginal_roas_now,marginal_roas_p10,marginal_roas_p90,percent_of_ceiling,recommended_weekly_spend,expected_weekly_revenue_now,expected_weekly_revenue_recommended,note";
  const rows = res.channels.map((c) => c.modelled
    ? [c.name, c.weeks, c.current, c.roas, c.fit.type === "hill" ? "S-shaped (Hill)" : "Saturating exponential", c.mroas, c.mroasLo, c.mroasHi, c.saturation * 100, c.recommended, c.fitted, c.recRevenue, c.atLimit ? `${c.atLimit} limit` : ""].map(csvCell).join(",")
    : [c.name, c.weeks, c.current, c.roas, "", "", "", "", "", c.current, "", "", `not modelled: ${c.reason}`].map(csvCell).join(","));
  return [h, ...rows].join("\n") + "\n";
}

// ---------- simulation (sample data, and the tests' ground truth) ----------

// channels: [{ name, type, p, mean, cv, noise }]; weekly rows, revenue = R(spend) * (1 + noise * z).
// An optional lambda gives the channel carry-over: revenue follows the adstocked spend.
export function simulateSpend({ channels = SAMPLE_CHANNELS, weeks = 78, seed = 5 } = {}) {
  const u = rng(seed);
  const start = weekStart(Math.floor(Date.UTC(2025, 0, 6) / DAY_MS));
  const rows = [];
  for (const c of channels) {
    let eff = null;
    for (let w = 0; w < weeks; w++) {
      const wave = 1 + 0.35 * Math.sin((2 * Math.PI * (w + c.mean % 7)) / 17);
      const spend = Math.max(0, c.mean * wave * Math.exp(c.cv * normal(u) - (c.cv * c.cv) / 2));
      const lam = c.lambda || 0;
      eff = eff === null || !lam ? spend : (1 - lam) * spend + lam * eff;
      const rev = Math.max(0, CURVES[c.type].f(c.p, eff) * (1 + c.noise * normal(u)));
      rows.push({ channel: c.name, day: start + 7 * w, spend: Math.round(spend * 100) / 100, revenue: Math.round(rev * 100) / 100 });
    }
  }
  return rows;
}

export const SAMPLE_CHANNELS = [
  { name: "Google Search", type: "exp", p: [42000, 9000], mean: 6500, cv: 0.35, noise: 0.06 },
  { name: "Meta Prospecting", type: "hill", p: [60000, 14000, 1.6], mean: 12000, cv: 0.35, noise: 0.06 },
  { name: "TikTok", type: "exp", p: [14000, 3000], mean: 5500, cv: 0.35, noise: 0.06 },
  { name: "Influencer", type: "exp", p: [30000, 20000], mean: 3500, cv: 0.4, noise: 0.06 },
];

export function sampleText() {
  const rows = simulateSpend({});
  return "week,channel,spend,revenue\n" + rows.map((r) => `${dayToIso(r.day)},${r.channel},${r.spend.toFixed(2)},${r.revenue.toFixed(2)}`).join("\n");
}
