// Bid win-rate optimizer. Pure functions, no DOM, no network.
// Model: P(win) = 1 / (1 + exp(-(a + b*x))), x = ln(price / cost) when every bid
// carries a cost (a markup model, comparable across job sizes) or x = ln(price)
// otherwise. Fitted by Newton-Raphson (IRLS) with a tiny ridge so perfectly
// separated data cannot send the slope to infinity. The expected-profit-maximising
// price is searched only inside the range actually quoted, and uncertainty comes
// from a seeded, outcome-stratified bootstrap, so a result is reproducible and
// never extrapolates silently.

export const num = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "n/a");
export const money = (v) => (Number.isFinite(v) ? (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "n/a");
export const pct = (v, d = 1) => (Number.isFinite(v) ? (v * 100).toFixed(d) + "%" : "n/a");

const MIN_BIDS = 30;
const MIN_CLASS = 8; // wins and losses each
const MIN_X_SD = 0.03; // sd of ln(price) or ln(markup): about a 3% typical spread
const BOOT = 300;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const moneyNum = (s) => {
  const t = String(s).trim().replace(/^\((.*)\)$/, "-$1").replace(/[$€£,\s]/g, "");
  if (t === "" || !/^-?\d*\.?\d+$/.test(t)) return NaN;
  return Number(t);
};

const WON = new Set(["1", "won", "win", "yes", "y", "true", "accepted", "accept", "awarded", "booked", "closed won", "hired", "sold"]);
const LOST = new Set(["0", "lost", "loss", "no", "n", "false", "declined", "decline", "rejected", "reject", "not awarded", "passed", "closed lost", "ghosted", "expired"]);
export function parseOutcome(s) {
  const t = String(s).trim().toLowerCase();
  if (WON.has(t)) return 1;
  if (LOST.has(t)) return 0;
  return null;
}

// Rows: price, won[, cost]. A header row may reorder the columns by name.
export function parseRows(text) {
  const warnings = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Paste or upload rows of quote price, won or lost, and (best) your cost for the job." };
  const delim = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  // Quote-aware split: spreadsheet exports write "$1,300" with its comma inside quotes.
  const split = (l) => {
    const cells = [];
    let cur = "", q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === delim && !q) { cells.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  };
  let rows = lines.map(split);
  let ci = { price: 0, won: 1, cost: 2 };
  if (rows[0].some((c) => /[a-z]/i.test(c) && !/^[$€£]?\d/.test(c)) && parseOutcome(rows[0][1] ?? "") === null) {
    const head = rows[0].map((h) => h.toLowerCase());
    const find = (re) => head.findIndex((h) => re.test(h));
    const p = find(/price|quote|bid|amount|proposal|offer/), w = find(/won|win|result|outcome|status|accept|award|closed/), c = find(/cost|estimate|budget|expense/);
    const g = find(/type|segment|category|service|trade|channel|source|customer/);
    ci = { price: p >= 0 ? p : 0, won: w >= 0 ? w : 1, cost: c >= 0 ? c : head.length >= 3 ? 2 : -1, seg: g };
    if (ci.cost === ci.price || ci.cost === ci.won) ci.cost = -1;
    if ([ci.price, ci.won, ci.cost].includes(ci.seg)) ci.seg = -1;
    rows = rows.slice(1);
  } else if ((rows[0]?.length || 0) < 3) ci.cost = -1;
  if ((rows[0]?.length || 0) < 2) return { error: "Each row needs at least a quote price and won/lost (1/0, won/lost, yes/no)." };
  const out = [];
  let bad = 0, badCost = 0;
  for (const r of rows) {
    const price = moneyNum(r[ci.price] ?? "");
    const won = parseOutcome(r[ci.won] ?? "");
    if (!(price > 0) || won === null) { bad++; continue; }
    let cost = null;
    if (ci.cost >= 0) {
      const c = moneyNum(r[ci.cost] ?? "");
      if (c > 0) cost = c; else badCost++;
    }
    const row = { price, won, cost };
    if (ci.seg >= 0) row.segment = (r[ci.seg] ?? "").trim() || "(blank)";
    out.push(row);
  }
  if (bad) warnings.push(`${bad} row(s) were skipped because the price or the won/lost result could not be read.`);
  const withCost = out.filter((r) => r.cost !== null).length;
  const hasCost = out.length > 0 && withCost === out.length;
  if (ci.cost >= 0 && !hasCost) {
    warnings.push(`${out.length - withCost} row(s) had no readable cost, so the cost column was ignored and the model uses raw prices (only comparable if your jobs are similar in size).`);
    for (const r of out) r.cost = null;
  }
  void badCost;
  const hasSegments = ci.seg >= 0 && new Set(out.map((r) => r.segment)).size > 1;
  return { rows: out, hasCost, hasSegments, warnings };
}

// ---------- linear algebra (2x2 is all a one-variable logit needs) ----------
function inv2(H) {
  const det = H[0][0] * H[1][1] - H[0][1] * H[1][0];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-14) return null;
  return [[H[1][1] / det, -H[0][1] / det], [-H[1][0] / det, H[0][0] / det]];
}
const sigmoid = (z) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const quantile = (sorted, q) => { const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };

// One-variable logistic regression. Predictor is standardised for stability; the
// returned a, b are on the original x scale. `ridge` shrinks the standardised
// slope by a hair, which is what keeps perfectly separated data finite.
export function fitLogit(x, y, ridge = 1e-3) {
  const n = x.length;
  const m = mean(x), s = sd(x) || 1;
  const z = x.map((v) => (v - m) / s);
  let a = Math.log((mean(y) + 0.5 / n) / (1 - mean(y) + 0.5 / n)), b = 0;
  const nll = (a_, b_) => {
    let t = 0;
    for (let i = 0; i < n; i++) { const e = a_ + b_ * z[i]; t += Math.log1p(Math.exp(-Math.abs(e))) + Math.max(e, 0) - y[i] * e; }
    return t + 0.5 * ridge * b_ * b_ * n;
  };
  let converged = false, H = null;
  for (let it = 0; it < 100; it++) {
    let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0;
    for (let i = 0; i < n; i++) {
      const p = sigmoid(a + b * z[i]), w = p * (1 - p);
      g0 += p - y[i]; g1 += (p - y[i]) * z[i];
      h00 += w; h01 += w * z[i]; h11 += w * z[i] * z[i];
    }
    g1 += ridge * b * n; h11 += ridge * n;
    H = [[h00, h01], [h01, h11]];
    const Hi = inv2(H);
    if (!Hi) break;
    let d0 = Hi[0][0] * g0 + Hi[0][1] * g1, d1 = Hi[1][0] * g0 + Hi[1][1] * g1;
    const f0 = nll(a, b);
    let step = 1;
    while (step > 1e-6 && !(nll(a - step * d0, b - step * d1) <= f0 + 1e-12)) step /= 2;
    a -= step * d0; b -= step * d1;
    if (Math.abs(step * d0) < 1e-9 && Math.abs(step * d1) < 1e-9) { converged = true; break; }
  }
  const Hi = inv2(H || [[1, 0], [0, 1]]);
  const seZ = Hi ? Math.sqrt(Math.max(0, Hi[1][1])) : NaN;
  return { a: a - (b * m) / s, b: b / s, bz: b, seB: seZ / s, seZ, converged, m, s };
}

const probAt = (f, x) => sigmoid(f.a + f.b * x);

// ---------- analysis ----------
function xOf(r, hasCost) { return hasCost ? Math.log(r.price / r.cost) : Math.log(r.price); }

// Best x in [lo, hi] for expected profit per bid = scale * (e^x - 1) * P(x) in markup mode
// (scale = job cost), or (e^x - cost) * P(x) in price mode.
function bestX(f, lo, hi, hasCost, cost) {
  let best = { x: lo, profit: -Infinity };
  const N = 240;
  for (let i = 0; i <= N; i++) {
    const x = lo + ((hi - lo) * i) / N;
    const profit = (hasCost ? cost * (Math.exp(x) - 1) : Math.exp(x) - cost) * probAt(f, x);
    if (profit > best.profit) best = { x, profit };
  }
  return best;
}

function logLoss(f, xs, ys) {
  return mean(xs.map((x, i) => { const p = Math.min(1 - 1e-6, Math.max(1e-6, probAt(f, x))); return -(ys[i] ? Math.log(p) : Math.log(1 - p)); }));
}

export function analyze(rows, o = {}) {
  const warnings = [];
  const n = rows.length;
  const hasCost = o.hasCost ?? rows.every((r) => r.cost > 0);
  const wins = rows.filter((r) => r.won === 1).length, losses = n - wins;
  if (n < MIN_BIDS) return { error: `Need at least ${MIN_BIDS} bids with a result; you have ${n}. A win curve fitted to fewer is mostly noise.` };
  if (wins < MIN_CLASS || losses < MIN_CLASS) return { error: `Need at least ${MIN_CLASS} wins and ${MIN_CLASS} losses; you have ${wins} wins and ${losses} losses. With so few of one outcome the tool cannot tell what moves it.` };
  const xs = rows.map((r) => xOf(r, hasCost)), ys = rows.map((r) => r.won);
  const xsd = sd(xs);
  if (xsd < MIN_X_SD) return { error: `Your ${hasCost ? "markups" : "prices"} barely varied (typical spread ${(xsd * 100).toFixed(1)}%). If you always quote the same ${hasCost ? "markup" : "price"}, nothing in the history can say what would happen at another, so the tool will not guess. Try a few deliberately different quotes first.` };
  const lo = Math.min(...xs), hi = Math.max(...xs);
  const levels = new Set(xs.map((x) => x.toFixed(2))).size;
  if (levels < 4) return { error: `Only ${levels} distinct ${hasCost ? "markup" : "price"} levels; at least 4 are needed to see a curve.` };

  const prices = rows.map((r) => r.price), costs = hasCost ? rows.map((r) => r.cost) : [];
  const med = (a) => { const s = [...a].sort((p, q) => p - q); return quantile(s, 0.5); };
  if (!hasCost) {
    const span = Math.max(...prices) / Math.min(...prices);
    if (span > 4) warnings.push(`Your quotes span ${span.toFixed(1)}x from smallest to largest. Without a cost column a $2,000 job and a $40,000 job look like price differences, not markup differences, so the curve may mostly reflect job size. Add your cost per job for a far better answer.`);
  }
  const jobCost = o.jobCost > 0 ? o.jobCost : hasCost ? med(costs) : null;
  const usualX = Number.isFinite(o.usualMarkup) && hasCost && o.usualMarkup > 1 ? Math.log(o.usualMarkup) : Number.isFinite(o.currentPrice) && !hasCost && o.currentPrice > 0 ? Math.log(o.currentPrice) : med(xs);
  const usualPrice = hasCost ? jobCost * Math.exp(usualX) : Math.exp(usualX);

  const f = fitLogit(xs, ys);
  if (!f.converged || !Number.isFinite(f.b)) warnings.push("The fit did not settle cleanly; read the result with extra caution.");
  const winX = xs.filter((_, i) => ys[i] === 1), lossX = xs.filter((_, i) => ys[i] === 0);
  const separated = Math.max(...winX) < Math.min(...lossX) || Math.max(...lossX) < Math.min(...winX);
  if (separated || Math.abs(f.bz) > 6) warnings.push("Your wins and losses are almost perfectly split by price. The slope is held in check, so the real curve is probably steeper than shown and the exact best price is not reliable.");
  const ci95 = [f.b - 1.96 * f.seB, f.b + 1.96 * f.seB];
  const tenPct = Math.log(1.1);
  const sens = {
    base: probAt(f, usualX), up10: probAt(f, usualX + tenPct), down10: probAt(f, usualX - tenPct),
    // how many points of win chance a 10% higher price costs around the usual quote
    drop10: probAt(f, usualX) - probAt(f, usualX + tenPct),
  };

  // Expected profit per bid at the job cost
  const canOptimise = jobCost !== null && jobCost > 0;
  const profitAt = (ff, x) => (hasCost ? jobCost * (Math.exp(x) - 1) : Math.exp(x) - (jobCost || 0)) * probAt(ff, x);
  let optimum = null;
  if (canOptimise) {
    const b0 = bestX(f, lo, hi, hasCost, jobCost);
    const rng = mulberry32(20260930);
    const winIdx = [], lossIdx = [];
    ys.forEach((yv, i) => (yv ? winIdx : lossIdx).push(i));
    const bx = [], gains = [];
    let better = 0;
    for (let k = 0; k < BOOT; k++) {
      const idx = [];
      for (let i = 0; i < winIdx.length; i++) idx.push(winIdx[Math.floor(rng() * winIdx.length)]);
      for (let i = 0; i < lossIdx.length; i++) idx.push(lossIdx[Math.floor(rng() * lossIdx.length)]);
      const bf = fitLogit(idx.map((i) => xs[i]), idx.map((i) => ys[i]));
      if (!Number.isFinite(bf.b)) continue;
      const bb = bestX(bf, lo, hi, hasCost, jobCost);
      bx.push(bb.x);
      const g = bb.profit - profitAt(bf, usualX);
      gains.push(g);
      if (g > 0) better++;
    }
    bx.sort((p, q) => p - q); gains.sort((p, q) => p - q);
    const toPrice = (x) => (hasCost ? jobCost * Math.exp(x) : Math.exp(x));
    const usualProfit = profitAt(f, usualX);
    optimum = {
      x: b0.x, price: toPrice(b0.x), markup: hasCost ? Math.exp(b0.x) - 1 : null,
      winChance: probAt(f, b0.x), expectedProfit: b0.profit, usualProfit,
      gain: b0.profit - usualProfit,
      priceRange80: bx.length ? [toPrice(quantile(bx, 0.1)), toPrice(quantile(bx, 0.9))] : [NaN, NaN],
      markupRange80: hasCost && bx.length ? [Math.exp(quantile(bx, 0.1)) - 1, Math.exp(quantile(bx, 0.9)) - 1] : null,
      gainRange80: gains.length ? [quantile(gains, 0.1), quantile(gains, 0.9)] : [NaN, NaN],
      pGain: gains.length ? better / gains.length : NaN,
      boundary: b0.x <= lo + 0.01 * (hi - lo) ? "low" : b0.x >= hi - 0.01 * (hi - lo) ? "high" : null,
    };
    if (optimum.boundary) warnings.push(`The best quote sits at the ${optimum.boundary} edge of what you have tried. The data says to keep going ${optimum.boundary === "high" ? "higher" : "lower"}, but it cannot say how far; try a few bids beyond the edge before trusting it.`);
  }

  // Price-change scenarios around the usual quote
  const scenarios = [-0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2].map((c) => {
    const x = usualX + Math.log(1 + c);
    const price = usualPrice * (1 + c);
    return { change: c, price, winChance: probAt(f, x), expectedProfit: canOptimise ? profitAt(f, x) : null, tested: x >= lo - 1e-9 && x <= hi + 1e-9 };
  });

  // Observed vs fitted by quote band (quartiles of x)
  const order = xs.map((x, i) => i).sort((p, q) => xs[p] - xs[q]);
  const bands = [0, 1, 2, 3].map((k) => {
    const idx = order.slice(Math.floor((n * k) / 4), Math.floor((n * (k + 1)) / 4));
    const bx_ = idx.map((i) => xs[i]);
    return {
      n: idx.length,
      from: hasCost ? Math.exp(Math.min(...bx_)) - 1 : Math.exp(Math.min(...bx_)),
      to: hasCost ? Math.exp(Math.max(...bx_)) - 1 : Math.exp(Math.max(...bx_)),
      observed: mean(idx.map((i) => ys[i])), fitted: mean(idx.map((i) => probAt(f, xs[i]))),
    };
  });

  // Hold-out back-test: fit on the first 75% in the order given, score the last 25%
  let holdout = null;
  const cut = Math.floor(n * 0.75);
  const trX = xs.slice(0, cut), trY = ys.slice(0, cut), teX = xs.slice(cut), teY = ys.slice(cut);
  if (teX.length >= 8 && trY.some((v) => v === 1) && trY.some((v) => v === 0) && sd(trX) > 1e-6) {
    const ft = fitLogit(trX, trY);
    const base = mean(trY);
    const flat = { a: Math.log(Math.min(1 - 1e-6, Math.max(1e-6, base)) / (1 - Math.min(1 - 1e-6, Math.max(1e-6, base)))), b: 0 };
    const withModel = logLoss(ft, teX, teY), without = logLoss(flat, teX, teY);
    holdout = { test: teX.length, logLossModel: withModel, logLossBase: without, helps: withModel < without - 0.005 };
  }

  const slopeOk = f.b < 0;
  const ciExcludesZero = ci95[1] < 0;
  let verdict;
  if (!slopeOk) verdict = "unidentified";
  else if (!ciExcludesZero && holdout && !holdout.helps) verdict = "unidentified";
  else if (ciExcludesZero && (!holdout || holdout.helps) && !separated) verdict = "usable";
  else verdict = "weak";
  if (!slopeOk) warnings.push("Higher quotes won as often or more often than lower ones. That usually means you quote higher on jobs that are easier to win (repeat customers, small jobs), not that price does not matter. Do not set prices from this curve.");

  return {
    n, wins, losses, winRate: wins / n, hasCost, levels,
    slope: f.b, intercept: f.a, ci95, sens, usualPrice, usualX, jobCost,
    range: { lo: hasCost ? Math.exp(lo) - 1 : Math.exp(lo), hi: hasCost ? Math.exp(hi) - 1 : Math.exp(hi) },
    optimum, scenarios, bands, holdout, verdict, warnings,
    curve: (price) => probAt(f, hasCost ? Math.log(price / jobCost) : Math.log(price)),
  };
}


// ---------- segments: one shared price slope, one intercept per job type ----------
// P(win) = sigmoid(a_segment + b * x). Job type shifts how easy a job is to win;
// price sensitivity is assumed shared, because each type alone rarely has enough
// bids to fit its own slope. A likelihood-ratio test says whether the types
// differ at all, and each type gets its own best markup.
const MIN_SEG = 10;

function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}

// Upper regularised incomplete gamma Q(a, x), for the chi-square survival function.
function gammaQ(a, x) {
  if (x <= 0) return 1;
  const lg = (z) => { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.001208650973866179, -0.000005395239384953]; let y = z, t = z + 5.5; t -= (z + 0.5) * Math.log(t); let s = 1.000000000190015; for (const k of c) s += k / ++y; return -t + Math.log((2.5066282746310005 * s) / z); };
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 0; n < 300; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-12) break; }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - lg(a));
  }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 300; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return Math.exp(-x + a * Math.log(x) - lg(a)) * h;
}
export const chi2Sf = (x, df) => gammaQ(df / 2, x / 2);

// Group indices g[i] in 0..k-1. Returns { a: [k], b, ll } with x centred internally.
export function fitGrouped(x, y, g, k, ridge = 1e-3) {
  const n = x.length, m = mean(x), s = sd(x) || 1, z = x.map((v) => (v - m) / s);
  const th = new Array(k + 1).fill(0); // k intercepts, then slope
  const rate = Array.from({ length: k }, (_, j) => { const ix = g.map((v, i) => (v === j ? i : -1)).filter((i) => i >= 0); return ix.length ? mean(ix.map((i) => y[i])) : 0.5; });
  for (let j = 0; j < k; j++) th[j] = Math.log((rate[j] + 0.02) / (1.02 - rate[j]));
  const nll = (t) => { let v = 0; for (let i = 0; i < n; i++) { const e = t[g[i]] + t[k] * z[i]; v += Math.log1p(Math.exp(-Math.abs(e))) + Math.max(e, 0) - y[i] * e; } return v + 0.5 * ridge * t[k] * t[k] * n; };
  for (let it = 0; it < 100; it++) {
    const grad = new Array(k + 1).fill(0), H = Array.from({ length: k + 1 }, () => new Array(k + 1).fill(0));
    for (let i = 0; i < n; i++) {
      const p = sigmoid(th[g[i]] + th[k] * z[i]), w = p * (1 - p), j = g[i];
      grad[j] += p - y[i]; grad[k] += (p - y[i]) * z[i];
      H[j][j] += w; H[j][k] += w * z[i]; H[k][j] += w * z[i]; H[k][k] += w * z[i] * z[i];
    }
    grad[k] += ridge * th[k] * n; H[k][k] += ridge * n;
    for (let j = 0; j < k; j++) H[j][j] += 1e-9; // an empty group stays finite
    const d = solve(H, grad);
    if (!d) break;
    const f0 = nll(th);
    let step = 1;
    while (step > 1e-6 && !(nll(th.map((v, i) => v - step * d[i])) <= f0 + 1e-12)) step /= 2;
    for (let i = 0; i <= k; i++) th[i] -= step * d[i];
    if (d.every((v) => Math.abs(step * v) < 1e-9)) break;
  }
  const b = th[k] / s;
  return { a: th.slice(0, k).map((v) => v - (th[k] * m) / s), b, ll: -nll(th) + 0.5 * ridge * th[k] * th[k] * n };
}

export function analyzeSegments(rows, o = {}) {
  if (!rows.every((r) => r.cost > 0)) return { error: "Job-type results need a cost on every row, so every type is compared at its own markup." };
  if (!rows.some((r) => r.segment !== undefined)) return { error: "No job-type column found. Add a column named type, segment, service or trade." };
  if (rows.length < MIN_BIDS) return { error: `Need at least ${MIN_BIDS} bids; you have ${rows.length}.` };
  const counts = new Map();
  for (const r of rows) counts.set(r.segment, (counts.get(r.segment) || 0) + 1);
  const named = [...counts].filter(([, c]) => c >= MIN_SEG).sort((p, q) => q[1] - p[1]).map(([nm]) => nm);
  const small = [...counts].filter(([, c]) => c < MIN_SEG);
  const names = [...named];
  const smallN = small.reduce((t, [, c]) => t + c, 0);
  if (smallN > 0) names.push("Other (small groups)");
  if (named.length < 2) return { error: `Need at least 2 job types with ${MIN_SEG}+ bids each; found ${named.length}. Types with fewer bids are pooled into "Other".` };
  const idx = new Map(names.map((nm, i) => [nm, i]));
  const g = rows.map((r) => (idx.has(r.segment) ? idx.get(r.segment) : names.length - 1));
  const xs = rows.map((r) => Math.log(r.price / r.cost)), ys = rows.map((r) => r.won);
  const k = names.length;
  if (sd(xs) < MIN_X_SD) return { error: "Your markups barely varied, so price sensitivity cannot be estimated." };
  const full = fitGrouped(xs, ys, g, k), flat = fitGrouped(xs, ys, g.map(() => 0), 1);
  const lr = Math.max(0, 2 * (full.ll - flat.ll)), df = k - 1, p = chi2Sf(lr, df);
  const lo = Math.min(...xs), hi = Math.max(...xs);
  const rng = mulberry32(20261015);
  const boots = [];
  const bySeg = names.map((_, j) => g.map((v, i) => (v === j ? i : -1)).filter((i) => i >= 0));
  const medOf = (a) => quantile([...a].sort((u, v) => u - v), 0.5);
  const seg = names.map((nm, j) => {
    const ix = bySeg[j], cost = medOf(ix.map((i) => rows[i].cost));
    const wins = ix.filter((i) => ys[i] === 1).length;
    const fit = { a: full.a[j], b: full.b };
    const best = bestX(fit, lo, hi, true, cost);
    const usualX = medOf(ix.map((i) => xs[i]));
    const usualProfit = cost * (Math.exp(usualX) - 1) * probAt(fit, usualX);
    return { name: nm, n: ix.length, wins, winRate: wins / ix.length, medianCost: cost, intercept: full.a[j], usualMarkup: Math.exp(usualX) - 1, usualWinChance: probAt(fit, usualX), usualProfit, bestMarkup: Math.exp(best.x) - 1, bestWinChance: probAt(fit, best.x), bestProfit: best.profit, gain: best.profit - usualProfit, boundary: best.x <= lo + 0.01 * (hi - lo) ? "low" : best.x >= hi - 0.01 * (hi - lo) ? "high" : null };
  });
  for (let r = 0; r < 120; r++) {
    const pick = [];
    for (const ix of bySeg) { const w = ix.filter((i) => ys[i] === 1), l = ix.filter((i) => ys[i] === 0); for (let t = 0; t < w.length; t++) pick.push(w[Math.floor(rng() * w.length)]); for (let t = 0; t < l.length; t++) pick.push(l[Math.floor(rng() * l.length)]); }
    const pg = pick.map((i) => g[i]);
    const bf = fitGrouped(pick.map((i) => xs[i]), pick.map((i) => ys[i]), pg, k);
    if (Number.isFinite(bf.b)) boots.push(seg.map((s, j) => Math.exp(bestX({ a: bf.a[j], b: bf.b }, lo, hi, true, s.medianCost).x) - 1));
  }
  seg.forEach((s, j) => { const v = boots.map((b) => b[j]).sort((u, w) => u - w); s.markupRange80 = v.length ? [quantile(v, 0.1), quantile(v, 0.9)] : [NaN, NaN]; });
  const warnings = [];
  if (!(full.b < 0)) warnings.push("Across all types, higher quotes did not win less often, so the per-type best markups are not reliable.");
  if (p >= 0.05) warnings.push(`The job types do not differ clearly in how often you win (p = ${p.toFixed(2)}), so one overall markup may serve them all.`);
  if (smallN) warnings.push(`${small.length} job type(s) with fewer than ${MIN_SEG} bids (${smallN} bids) were pooled into "Other".`);
  return { segments: seg, slope: full.b, lr, df, pValue: p, differ: p < 0.05, warnings };
}

// Same idea with a job-type column: repeat customers are easier to win than tenders.
export function sampleTextTyped() {
  const rng = mulberry32(9);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const types = [["repeat customer", 1.0], ["walk-in", -0.2], ["competitive tender", -1.1]];
  const lines = ["type,quote,won,cost"];
  for (let i = 0; i < 150; i++) {
    const [t, a] = types[i % 3];
    const cost = Math.round((2500 + rng() * 22000) / 50) * 50;
    const markup = Math.exp(Math.log(1.3) + 0.14 * gauss());
    const quote = Math.round((cost * markup) / 10) * 10;
    const pWin = sigmoid(a - 9 * (Math.log(quote / cost) - Math.log(1.3)));
    lines.push(`${t},${quote},${rng() < pWin ? 1 : 0},${cost}`);
  }
  return lines.join("\n");
}

export function sampleText() {
  const rng = mulberry32(3);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const lines = ["quote,won,cost"];
  for (let i = 0; i < 90; i++) {
    const cost = Math.round((2500 + rng() * 22000) / 50) * 50;
    const markup = Math.exp(Math.log(1.3) + 0.14 * gauss());
    const quote = Math.round((cost * markup) / 10) * 10;
    const pWin = sigmoid(-0.4 - 9 * (Math.log(quote / cost) - Math.log(1.3)));
    lines.push(`${quote},${rng() < pWin ? 1 : 0},${cost}`);
  }
  return lines.join("\n");
}

export function reportCsv(r) {
  const head = "price_change,price,win_chance,expected_profit_per_bid,inside_tested_range";
  return [head, ...r.scenarios.map((s) => [s.change, s.price.toFixed(2), s.winChance.toFixed(4), s.expectedProfit === null ? "" : s.expectedProfit.toFixed(2), s.tested].join(","))].join("\n");
}
