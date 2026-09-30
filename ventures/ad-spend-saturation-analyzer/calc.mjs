// Ad-spend saturation analysis: fit a diminishing-returns curve to spend vs
// revenue per channel, report marginal ROAS with a bootstrap range, and
// reallocate a budget by equalising marginal returns. Pure functions, no I/O.

export const MIN_OBS = 20;
const DAY = 86400000;
const GRID = 48;

export function num(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  const a = Math.abs(v);
  const d = a >= 100 ? 0 : a >= 10 ? 1 : 2;
  return v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d });
}
export const fx = (v) => (v === null || !Number.isFinite(v) ? "n/a" : `${v.toFixed(2)}x`);
export const pct = (v, d = 0) => (v === null || !Number.isFinite(v) ? "n/a" : `${(v * 100).toFixed(d)}%`);

// ---------- parsing ----------

function splitCsvLine(line, d) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === d) { out.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

export function toNumber(s) {
  if (s === null || s === undefined) return null;
  let t = String(s).trim();
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  t = t.replace(/[$€£\s]/g, "").replace(/,(?=\d{3}(\D|$))/g, "");
  if (t.startsWith("-")) { neg = !neg; t = t.slice(1); }
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const v = parseFloat(t);
  return neg ? -v : v;
}

function utc(y, m, d) {
  const ms = Date.UTC(y, m - 1, d);
  const dt = new Date(ms);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? ms : null;
}

export function parseDate(s) {
  const t = String(s || "").trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/);
  if (m) return utc(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return utc(+m[3], +m[1], +m[2]);
  if (/[a-z]{3}/i.test(t)) {
    const p = Date.parse(`${t} UTC`);
    if (Number.isFinite(p)) return Math.floor(p / DAY) * DAY;
  }
  return null;
}

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const weekStart = (ms) => ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY;

const HEAD = {
  date: /^(date|day|week|period|time|reporting.?starts?)\b/i,
  channel: /(channel|campaign|source|platform|medium|network)/i,
  spend: /(spend|cost|budget)/i,
  revenue: /(revenue|sales|conv.*value|purchase|income|value)/i,
};

export function parseData(text, opts = {}) {
  const warnings = [];
  const lines = String(text || "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { error: "Paste or upload rows first: date, channel, spend, revenue." };
  const first = lines[0];
  const delim = [",", "\t", ";"].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = lines.map((l) => splitCsvLine(l, delim));
  let col = {};
  const head = rows[0];
  const named = head.filter((h) => Object.values(HEAD).some((re) => re.test(h))).length;
  let body = rows;
  if (named >= 2) {
    body = rows.slice(1);
    head.forEach((h, i) => {
      for (const k of ["date", "channel", "spend", "revenue"]) if (col[k] === undefined && HEAD[k].test(h)) { col[k] = i; break; }
    });
  } else {
    const w = head.length;
    if (w === 2) col = { spend: 0, revenue: 1 };
    else if (w === 3) col = parseDate(head[0]) !== null ? { date: 0, spend: 1, revenue: 2 } : { channel: 0, spend: 1, revenue: 2 };
    else col = { date: 0, channel: 1, spend: 2, revenue: 3 };
  }
  if (col.spend === undefined || col.revenue === undefined) return { error: "Could not find a spend column and a revenue column. Name them spend and revenue, or use the order date, channel, spend, revenue." };
  const weekly = opts.period === "weekly";
  if (weekly && col.date === undefined) warnings.push("Weekly grouping needs a date column; each row is treated as one period instead.");
  const byChannel = new Map();
  let skipped = 0, negative = 0, used = 0;
  body.forEach((r, idx) => {
    const s = toNumber(r[col.spend]), v = toNumber(r[col.revenue]);
    if (s === null || v === null) { skipped++; return; }
    if (s < 0) { negative++; return; }
    const name = col.channel !== undefined && r[col.channel] ? r[col.channel] : "All spend";
    let t = idx, key = `row${idx}`;
    if (col.date !== undefined) {
      const d = parseDate(r[col.date]);
      if (d === null) { skipped++; return; }
      t = weekly ? weekStart(d) : d;
      key = isoDay(t);
    }
    if (!byChannel.has(name)) byChannel.set(name, new Map());
    const m = byChannel.get(name);
    const p = m.get(key) || { t, s: 0, r: 0 };
    p.s += s; p.r += v;
    m.set(key, p);
    used++;
  });
  if (skipped) warnings.push(`${skipped} row(s) skipped because spend, revenue or the date could not be read.`);
  if (negative) warnings.push(`${negative} row(s) with negative spend were ignored.`);
  if (!byChannel.size) return { error: "No usable rows. Each row needs a numeric spend and revenue." };
  const channels = [...byChannel].map(([name, m]) => ({ name, points: [...m.values()].sort((a, b) => a.t - b.t) }));
  return { channels, warnings, rowsUsed: used, period: col.date !== undefined ? (weekly ? "week" : "day") : "row" };
}

// ---------- curve fitting ----------

function ols(x, y) {
  const n = x.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; sxx += x[i] * x[i]; sxy += x[i] * y[i]; }
  const den = n * sxx - sx * sx;
  let a = den > 1e-12 ? (n * sxy - sx * sy) / den : 0;
  let c = (sy - a * sx) / n;
  if (c < 0) { c = 0; a = sxx > 0 ? sxy / sxx : 0; }
  if (a < 0) { a = 0; c = sy / n; }
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (y[i] - c - a * x[i]) ** 2;
  return { c, a, sse };
}

export function fitLinear(pts) {
  const f = ols(pts.map((p) => p.s), pts.map((p) => p.r));
  return { type: "linear", c: f.c, a: f.a, k: null, sse: f.sse };
}

export function gridK(smax) {
  const lo = smax * 0.05, hi = smax * 20;
  return Array.from({ length: GRID }, (_, i) => lo * (hi / lo) ** (i / (GRID - 1)));
}

export function fitSaturating(pts) {
  const smax = Math.max(...pts.map((p) => p.s));
  if (!(smax > 0)) return null;
  const y = pts.map((p) => p.r);
  let best = null;
  for (const k of gridK(smax)) {
    const f = ols(pts.map((p) => 1 - Math.exp(-p.s / k)), y);
    if (!best || f.sse < best.sse) best = { type: "saturating", c: f.c, a: f.a, k, sse: f.sse };
  }
  return best;
}

export const revenueAt = (m, s) => (m.type === "linear" ? m.c + m.a * s : m.c + m.a * (1 - Math.exp(-s / m.k)));
export const marginalAt = (m, s) => (m.type === "linear" ? m.a : (m.a / m.k) * Math.exp(-s / m.k));

function cvRmse(pts, fit) {
  const K = Math.min(10, pts.length);
  let sse = 0, n = 0;
  for (let f = 0; f < K; f++) {
    const train = pts.filter((_, i) => i % K !== f), test = pts.filter((_, i) => i % K === f);
    const m = fit(train);
    if (!m) return Infinity;
    for (const p of test) { sse += (p.r - revenueAt(m, p.s)) ** 2; n++; }
  }
  return Math.sqrt(sse / n);
}

function spendVariation(pts) {
  const s = pts.map((p) => p.s);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length);
  const distinct = new Set(s.map((v) => v.toFixed(4))).size;
  return { mean, cv: mean > 0 ? sd / mean : 0, distinct };
}

export function chooseModel(pts) {
  const lin = fitLinear(pts), sat = fitSaturating(pts);
  const smax = Math.max(...pts.map((p) => p.s));
  const cvLin = cvRmse(pts, fitLinear);
  const cvSat = sat ? cvRmse(pts, fitSaturating) : Infinity;
  const atEdge = sat && sat.k >= smax * 20 * 0.9;
  const useSat = Boolean(sat && sat.a > 0 && !atEdge && cvSat < cvLin * 0.98);
  const model = useSat ? sat : lin;
  const mean = pts.reduce((a, p) => a + p.r, 0) / pts.length;
  const sst = pts.reduce((a, p) => a + (p.r - mean) ** 2, 0);
  return { model, linear: lin, saturating: sat, cvLinear: cvLin, cvSaturating: cvSat, r2: sst > 0 ? 1 - model.sse / sst : 0, saturationDetected: useSat };
}

// ---------- randomness ----------

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function quantile(arr, q) {
  const s = [...arr].sort((a, b) => a - b);
  if (!s.length) return null;
  const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ---------- analysis ----------

function recentSpend(pts) {
  const m = Math.max(3, Math.ceil(pts.length * 0.25));
  const tail = pts.slice(-m);
  return tail.reduce((a, p) => a + p.s, 0) / tail.length;
}

function breakevenSpend(m, be) {
  if (m.type === "linear") return m.a >= be ? Infinity : 0;
  if (m.a / m.k <= be) return 0;
  return m.k * Math.log(m.a / (m.k * be));
}

function bootstrapChannel(ch, reps) {
  const pts = ch.points, n = pts.length;
  const rng = mulberry32(hash(ch.name) ^ 0x9e3779b9);
  const out = [];
  for (let b = 0; b < reps; b++) {
    const sample = Array.from({ length: n }, () => pts[Math.floor(rng() * n)]);
    if (new Set(sample.map((p) => p.s)).size < 3) { out.push(null); continue; }
    out.push(ch.model.type === "linear" ? fitLinear(sample) : fitSaturating(sample));
  }
  return out;
}

function allocate(chs, budget, be) {
  const movable = chs.filter((c) => c.movable);
  const fixedSpend = chs.filter((c) => !c.movable).reduce((a, c) => a + c.current, 0);
  let pool = budget - fixedSpend;
  const floorScale = pool >= movable.reduce((a, c) => a + c.current * 0.5, 0) ? 0.5 : 0;
  const alloc = new Map(chs.map((c) => [c.name, c.movable ? c.current * floorScale : c.current]));
  pool -= movable.reduce((a, c) => a + alloc.get(c.name), 0);
  const inc = Math.max(pool / 400, 1e-9);
  let guard = 0;
  while (pool > 1e-9 && guard++ < 5000) {
    let best = null;
    for (const c of movable) {
      const s = alloc.get(c.name), step = Math.min(inc, c.hi - s, pool);
      if (step <= 1e-12) continue;
      const g = (revenueAt(c.model, s + step) - revenueAt(c.model, s)) / step;
      if (!best || g > best.g) best = { c, step, g };
    }
    if (!best || best.g < be) break;
    alloc.set(best.c.name, alloc.get(best.c.name) + best.step);
    pool -= best.step;
  }
  return { alloc, unspent: Math.max(0, pool) };
}

export function analyze(parsed, opts = {}) {
  const margin = opts.margin > 0 ? Math.min(opts.margin, 100) / 100 : 1;
  const be = 1 / margin;
  const warnings = [];
  const chs = parsed.channels.map((ch) => {
    const pts = ch.points, n = pts.length;
    const totalS = pts.reduce((a, p) => a + p.s, 0), totalR = pts.reduce((a, p) => a + p.r, 0);
    const base = { name: ch.name, n, points: pts, avgRoas: totalS > 0 ? totalR / totalS : null, current: recentSpend(pts), smax: Math.max(...pts.map((p) => p.s)), smin: Math.min(...pts.map((p) => p.s)) };
    if (n < MIN_OBS) return { ...base, status: "too-few", note: `Only ${n} periods of data; at least ${MIN_OBS} are needed to fit a curve.`, movable: false };
    const v = spendVariation(pts);
    if (v.distinct < 5 || v.cv < 0.15) return { ...base, status: "flat-spend", note: "Spend barely changes in this data, so there is nothing to learn a curve from. Vary the budget (even 20-30% up and down) and come back.", movable: false };
    const fit = chooseModel(pts);
    const hi = Math.max(base.current, Math.min(base.current * 1.5, base.smax * 1.25));
    return { ...base, ...fit, status: fit.model.a <= 0 ? "no-response" : "fitted", movable: true, hi, marginalNow: marginalAt(fit.model, base.current), breakevenSpend: breakevenSpend(fit.model, be) };
  });
  if (!chs.length) return { error: "No channels to analyse." };

  const fitted = chs.filter((c) => c.movable);
  const reps = Math.max(...chs.map((c) => c.n)) > 500 ? 100 : 200;
  const budgetIn = opts.budget > 0 ? opts.budget : chs.reduce((a, c) => a + c.current, 0);
  const { alloc, unspent } = fitted.length ? allocate(chs, budgetIn, be) : { alloc: new Map(chs.map((c) => [c.name, c.current])), unspent: 0 };

  const boots = new Map(fitted.map((c) => [c.name, bootstrapChannel(c, reps)]));
  const uplifts = [];
  for (let b = 0; b < reps; b++) {
    let u = 0, ok = true;
    for (const c of fitted) {
      const m = boots.get(c.name)[b];
      if (!m) { ok = false; break; }
      u += margin * (revenueAt(m, alloc.get(c.name)) - revenueAt(m, c.current)) - (alloc.get(c.name) - c.current);
    }
    if (ok) uplifts.push(u);
  }

  const rows = chs.map((c) => {
    const rec = alloc.get(c.name);
    const row = { name: c.name, n: c.n, status: c.status, note: c.note || null, avgRoas: c.avgRoas, currentSpend: c.current, recommendedSpend: rec, change: c.current > 0 ? rec / c.current - 1 : null, observedMin: c.smin, observedMax: c.smax, model: c.model || null, r2: c.r2 ?? null, saturationDetected: c.saturationDetected ?? false, marginalNow: c.marginalNow ?? null, marginalLo: null, marginalHi: null, probAboveBreakeven: null, breakevenSpend: c.breakevenSpend ?? null, verdict: "no verdict" };
    if (c.movable) {
      const marg = boots.get(c.name).filter(Boolean).map((m) => marginalAt(m, c.current));
      row.marginalLo = quantile(marg, 0.1);
      row.marginalHi = quantile(marg, 0.9);
      row.probAboveBreakeven = marg.length ? marg.filter((x) => x >= be).length / marg.length : null;
      const p = row.probAboveBreakeven;
      row.verdict = p === null ? "unclear" : p >= 0.8 ? "scale up" : p <= 0.2 ? "pull back" : "unclear";
      row.beyondTested = row.breakevenSpend !== null && Number.isFinite(row.breakevenSpend) && row.breakevenSpend > c.smax * 1.25;
    }
    return row;
  });

  // Spend that moves together cannot be told apart.
  let maxCorr = null;
  const series = chs.filter((c) => c.points.length >= 10);
  for (let i = 0; i < series.length; i++) for (let j = i + 1; j < series.length; j++) {
    const bm = new Map(series[j].points.map((p) => [p.t, p.s]));
    const pairs = series[i].points.filter((p) => bm.has(p.t)).map((p) => [p.s, bm.get(p.t)]);
    if (pairs.length < 10) continue;
    const mx = pairs.reduce((a, p) => a + p[0], 0) / pairs.length, my = pairs.reduce((a, p) => a + p[1], 0) / pairs.length;
    let sxy = 0, sxx = 0, syy = 0;
    for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
    const r = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
    if (maxCorr === null || Math.abs(r) > Math.abs(maxCorr.r)) maxCorr = { r, a: series[i].name, b: series[j].name };
  }
  if (maxCorr && Math.abs(maxCorr.r) > 0.8) warnings.push(`Spend on ${maxCorr.a} and ${maxCorr.b} moves together (correlation ${maxCorr.r.toFixed(2)}), so the data cannot tell which of them drives revenue. Treat their curves as a pair, not separately.`);
  if (chs.some((c) => c.status === "flat-spend")) warnings.push("One or more channels have almost constant spend and were held at their current level.");
  if (!fitted.length) warnings.push("No channel had enough varied data to fit a curve, so there is no reallocation.");

  const predCur = fitted.reduce((a, c) => a + revenueAt(c.model, c.current), 0);
  const predRec = fitted.reduce((a, c) => a + revenueAt(c.model, alloc.get(c.name)), 0);
  const spendCur = fitted.reduce((a, c) => a + c.current, 0);
  const spendRec = fitted.reduce((a, c) => a + alloc.get(c.name), 0);
  const uplift = fitted.length
    ? { revenueChange: predRec - predCur, revenueChangePct: predCur > 0 ? (predRec - predCur) / predCur : null, spendChange: spendRec - spendCur, profit: margin * (predRec - predCur) - (spendRec - spendCur), lo: quantile(uplifts, 0.1), hi: quantile(uplifts, 0.9), probPositive: uplifts.length ? uplifts.filter((u) => u > 0).length / uplifts.length : null, reps: uplifts.length }
    : null;
  if (uplift && uplift.probPositive !== null && uplift.probPositive < 0.8 && Math.abs(uplift.profit) > 0) warnings.push(`The suggested reallocation improves profit after ad spend in only ${pct(uplift.probPositive)} of bootstrap resamples, so the data does not clearly support moving money. Test a smaller shift first.`);

  return { rows, uplift, budget: budgetIn, unspent, breakevenRoas: be, margin, period: parsed.period, warnings, reps };
}

export function resultCsv(r) {
  const head = ["channel", "periods", "avg_roas", "current_spend", "marginal_roas", "marginal_roas_lo80", "marginal_roas_hi80", "verdict", "recommended_spend", "change"];
  const f = (v) => (v === null || v === undefined ? "" : typeof v === "number" ? String(Math.round(v * 1e4) / 1e4) : v);
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  return [head.join(","), ...r.rows.map((x) => [q(x.name), x.n, f(x.avgRoas), f(x.currentSpend), f(x.marginalNow), f(x.marginalLo), f(x.marginalHi), x.verdict, f(x.recommendedSpend), f(x.change)].join(","))].join("\n") + "\n";
}

// ---------- sample data ----------

export function sampleText() {
  const rng = mulberry32(20260930);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const truth = {
    "Google Search": { c: 900, a: 7000, k: 1400, lo: 300, hi: 2600 },
    "Meta Ads": { c: 500, a: 11000, k: 4500, lo: 400, hi: 3200 },
    "Display": { c: 0, a: 1800, k: 600, lo: 100, hi: 1500 },
  };
  const out = ["date,channel,spend,revenue"];
  const start = Date.UTC(2026, 3, 1);
  for (let d = 0; d < 120; d++) {
    for (const [name, t] of Object.entries(truth)) {
      const s = Math.round(t.lo + rng() * (t.hi - t.lo));
      const rev = Math.max(0, (t.c + t.a * (1 - Math.exp(-s / t.k))) * (1 + 0.12 * gauss()));
      out.push(`${isoDay(start + d * DAY)},${name},${s},${Math.round(rev)}`);
    }
  }
  return out.join("\n");
}
