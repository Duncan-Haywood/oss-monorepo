// Renewal rent optimizer. Pure functions, no DOM, no network.
// Model: P(renew) = 1 / (1 + exp(-(a + b*x))), x = ln(1 + increase) where increase is
// the offered rent over the current rent. Fitted by Newton-Raphson (IRLS) with a tiny
// ridge so perfectly separated data cannot send the slope to infinity. The economics
// come from the landlord: a tenant who renews pays the offered rent for the term, a
// tenant who leaves costs vacancy, turnover work and a re-let at market rent. The best
// offer is searched only inside the range of increases actually offered, and uncertainty
// comes from a seeded, outcome-stratified bootstrap, so a result is reproducible and
// never extrapolates silently.

export const num = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "n/a");
export const money = (v) => (Number.isFinite(v) ? (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "n/a");
export const pct = (v, d = 1) => (Number.isFinite(v) ? (v * 100).toFixed(d) + "%" : "n/a");

const MIN_RENEWALS = 25;
const MIN_CLASS = 6; // tenants who stayed and tenants who left, each
const MIN_X_SD = 0.01; // sd of ln(1 + increase): about a one-point spread in the increase
const BOOT = 300;
const DAYS_PER_MONTH = 30.4;

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

const STAYED = new Set(["1", "renewed", "renew", "stayed", "stay", "yes", "y", "true", "signed", "accepted", "accept", "re-signed", "resigned", "kept"]);
const LEFT = new Set(["0", "left", "leave", "moved", "moved out", "vacated", "no", "n", "false", "declined", "decline", "gave notice", "notice", "non-renewed", "did not renew", "not renewed", "terminated"]);
export function parseOutcome(s) {
  const t = String(s).trim().toLowerCase();
  if (STAYED.has(t)) return 1;
  if (LEFT.has(t)) return 0;
  return null;
}

// Rows: current rent, offered rent, renewed. A header row may reorder the columns by name.
export function parseRows(text) {
  const warnings = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Paste or upload one row per lease renewal: the rent before, the rent you offered, and whether the tenant renewed." };
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
  let ci = { cur: 0, off: 1, res: 2 };
  if (rows[0].some((c) => /[a-z]/i.test(c) && !/^[$€£]?\d/.test(c)) && parseOutcome(rows[0][2] ?? "") === null) {
    const head = rows[0].map((h) => h.toLowerCase());
    const find = (re, skip = -1) => head.findIndex((h, i) => i !== skip && re.test(h));
    const res = find(/renew|result|outcome|status|stay|stayed|left|signed|accept/);
    const cur = find(/current|old|prior|previous|before|existing|rent now|expiring/);
    const off = find(/offer|new|proposed|asking|increase to|renewal rent|after/, cur);
    let c = cur, o = off;
    if (c < 0 && o < 0) { c = 0; o = 1; }
    else if (c < 0) c = head.findIndex((_, i) => i !== o && i !== res);
    else if (o < 0) o = head.findIndex((_, i) => i !== c && i !== res);
    ci = { cur: c >= 0 ? c : 0, off: o >= 0 ? o : 1, res: res >= 0 ? res : 2 };
    rows = rows.slice(1);
  }
  if ((rows[0]?.length || 0) < 3) return { error: "Each row needs three values: current rent, offered rent, and renewed or left (1/0, renewed/left, yes/no)." };
  const out = [];
  let bad = 0;
  for (const r of rows) {
    const current = moneyNum(r[ci.cur] ?? ""), offered = moneyNum(r[ci.off] ?? "");
    const renewed = parseOutcome(r[ci.res] ?? "");
    if (!(current > 0) || !(offered > 0) || renewed === null) { bad++; continue; }
    const ratio = offered / current;
    if (ratio < 0.5 || ratio > 2) { bad++; continue; }
    out.push({ current, offered, renewed });
  }
  if (bad) warnings.push(`${bad} row(s) were skipped because a rent or the renewed/left result could not be read, or the offer was less than half or more than double the current rent (probably a typo).`);
  return { rows: out, warnings };
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
const median = (a) => quantile([...a].sort((p, q) => p - q), 0.5);

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
    const d0 = Hi[0][0] * g0 + Hi[0][1] * g1, d1 = Hi[1][0] * g0 + Hi[1][1] * g1;
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

// What the landlord is worth at the end of one lease term, per unit.
//   renews:  offered rent for every month of the term
//   leaves:  market rent for the months after the vacancy, less the turnover bill
export function leaveValue(eco) {
  const vacMonths = Math.min(eco.termMonths, eco.vacancyDays / DAYS_PER_MONTH);
  return eco.marketRent * (eco.termMonths - vacMonths) - eco.turnoverCost;
}
export function expectedValue(f, x, eco) {
  const p = probAt(f, x);
  return p * eco.rentNow * Math.exp(x) * eco.termMonths + (1 - p) * leaveValue(eco);
}

function bestX(f, lo, hi, eco) {
  let best = { x: lo, value: -Infinity };
  const N = 240;
  for (let i = 0; i <= N; i++) {
    const x = lo + ((hi - lo) * i) / N;
    const value = expectedValue(f, x, eco);
    if (value > best.value) best = { x, value };
  }
  return best;
}

function logLoss(f, xs, ys) {
  return mean(xs.map((x, i) => { const p = Math.min(1 - 1e-6, Math.max(1e-6, probAt(f, x))); return -(ys[i] ? Math.log(p) : Math.log(1 - p)); }));
}

export function analyze(rows, o = {}) {
  const warnings = [];
  const n = rows.length;
  const stayed = rows.filter((r) => r.renewed === 1).length, left = n - stayed;
  if (n < MIN_RENEWALS) return { error: `Need at least ${MIN_RENEWALS} past renewal offers with a result; you have ${n}. A renewal curve fitted to fewer is mostly noise. Pool every unit you have managed, not just one building.` };
  if (stayed < MIN_CLASS || left < MIN_CLASS) return { error: `Need at least ${MIN_CLASS} tenants who renewed and ${MIN_CLASS} who left; you have ${stayed} and ${left}. With so few of one outcome the tool cannot tell what moves it.` };
  const xs = rows.map((r) => Math.log(r.offered / r.current)), ys = rows.map((r) => r.renewed);
  // x is ln(1 + increase); a rent cut gives a negative x
  const xsd = sd(xs);
  if (xsd < MIN_X_SD) return { error: `Your offered increases barely varied (typical spread ${(xsd * 100).toFixed(1)} points). If you always offer the same increase, nothing in the history can say what a different one would do, so the tool will not guess. Try a few deliberately different increases on upcoming renewals first.` };
  const lo = Math.min(...xs), hi = Math.max(...xs);
  const levels = new Set(xs.map((x) => x.toFixed(3))).size;
  if (levels < 4) return { error: `Only ${levels} distinct increase levels; at least 4 are needed to see a curve.` };

  const eco = {
    rentNow: o.rentNow > 0 ? o.rentNow : median(rows.map((r) => r.current)),
    termMonths: o.termMonths > 0 ? o.termMonths : 12,
    vacancyDays: Number.isFinite(o.vacancyDays) && o.vacancyDays >= 0 ? o.vacancyDays : 30,
    turnoverCost: Number.isFinite(o.turnoverCost) && o.turnoverCost >= 0 ? o.turnoverCost : 1000,
    marketRent: 0,
  };
  eco.marketRent = o.marketRent > 0 ? o.marketRent : eco.rentNow;
  if (!(o.marketRent > 0)) warnings.push("No market rent entered, so a new tenant is assumed to pay today's rent. If the market is above it, leaving costs you less than shown and the best increase is higher; if below, the reverse.");
  if (eco.rentNow > 0 && o.rentNow > 0 && (eco.rentNow < 0.5 * median(rows.map((r) => r.current)) || eco.rentNow > 2 * median(rows.map((r) => r.current)))) warnings.push("The unit you are pricing has a rent far from the units in your history. Increases are compared as percentages, which travels across rents, but tenants at very different rent levels may behave differently.");

  const usualInc = Number.isFinite(o.usualIncrease) ? o.usualIncrease : median(xs.map((x) => Math.exp(x) - 1));
  const usualX = Math.log(1 + usualInc);
  const f = fitLogit(xs, ys);
  if (!f.converged || !Number.isFinite(f.b)) warnings.push("The fit did not settle cleanly; read the result with extra caution.");
  const stayX = xs.filter((_, i) => ys[i] === 1), leftX = xs.filter((_, i) => ys[i] === 0);
  const separated = Math.max(...stayX) < Math.min(...leftX) || Math.max(...leftX) < Math.min(...stayX);
  if (separated || Math.abs(f.bz) > 6) warnings.push("Your tenants who stayed and left are almost perfectly split by the size of the increase. The slope is held in check, so the real curve is probably steeper than shown and the exact best increase is not reliable.");
  const ci95 = [f.b - 1.96 * f.seB, f.b + 1.96 * f.seB];

  const leave = leaveValue(eco);
  const flatRenew = eco.rentNow * eco.termMonths;
  const turnoverCost = flatRenew - leave; // what one move-out costs against a tenant who stays at today's rent
  const valueAt = (ff, x) => { const p = probAt(ff, x); return p * eco.rentNow * Math.exp(x) * eco.termMonths + (1 - p) * leave; };

  const b0 = bestX(f, lo, hi, eco);
  const rng = mulberry32(20260930);
  const stayIdx = [], leftIdx = [];
  ys.forEach((yv, i) => (yv ? stayIdx : leftIdx).push(i));
  const bx = [], gains = [];
  let better = 0;
  for (let k = 0; k < BOOT; k++) {
    const idx = [];
    for (let i = 0; i < stayIdx.length; i++) idx.push(stayIdx[Math.floor(rng() * stayIdx.length)]);
    for (let i = 0; i < leftIdx.length; i++) idx.push(leftIdx[Math.floor(rng() * leftIdx.length)]);
    const bf = fitLogit(idx.map((i) => xs[i]), idx.map((i) => ys[i]));
    if (!Number.isFinite(bf.b)) continue;
    const bb = bestX(bf, lo, hi, eco);
    bx.push(bb.x);
    const g = bb.value - valueAt(bf, usualX);
    gains.push(g);
    if (g > 0) better++;
  }
  bx.sort((p, q) => p - q); gains.sort((p, q) => p - q);
  const inc = (x) => Math.exp(x) - 1;
  const usualValue = valueAt(f, usualX);
  const optimum = {
    x: b0.x, increase: inc(b0.x), offer: eco.rentNow * Math.exp(b0.x), renewChance: probAt(f, b0.x),
    expectedValue: b0.value, usualValue, gain: b0.value - usualValue,
    increaseRange80: bx.length ? [inc(quantile(bx, 0.1)), inc(quantile(bx, 0.9))] : [NaN, NaN],
    gainRange80: gains.length ? [quantile(gains, 0.1), quantile(gains, 0.9)] : [NaN, NaN],
    pGain: gains.length ? better / gains.length : NaN,
    boundary: b0.x <= lo + 0.01 * (hi - lo) ? "low" : b0.x >= hi - 0.01 * (hi - lo) ? "high" : null,
  };
  if (optimum.boundary) warnings.push(`The best increase sits at the ${optimum.boundary} edge of what you have offered. The data says to keep going ${optimum.boundary === "high" ? "higher" : "lower"}, but it cannot say how far; try a few offers beyond the edge before trusting it.`);

  const scenarios = [-0.04, -0.02, -0.01, 0, 0.01, 0.02, 0.04, 0.06].filter((d) => 1 + usualInc + d > 0.5).map((d) => {
    const x = Math.log(1 + usualInc + d);
    return { increase: usualInc + d, offer: eco.rentNow * (1 + usualInc + d), renewChance: probAt(f, x), expectedValue: valueAt(f, x), tested: x >= lo - 1e-9 && x <= hi + 1e-9 };
  });

  // Observed vs fitted by quarter of the offered increase
  const order = xs.map((_, i) => i).sort((p, q) => xs[p] - xs[q]);
  const bands = [0, 1, 2, 3].map((k) => {
    const idx = order.slice(Math.floor((n * k) / 4), Math.floor((n * (k + 1)) / 4));
    const bxs = idx.map((i) => xs[i]);
    return { n: idx.length, from: inc(Math.min(...bxs)), to: inc(Math.max(...bxs)), observed: mean(idx.map((i) => ys[i])), fitted: mean(idx.map((i) => probAt(f, xs[i]))) };
  });

  // Hold-out back-test: fit on the first 75% in the order given, score the last 25%
  let holdout = null;
  const cut = Math.floor(n * 0.75);
  const trX = xs.slice(0, cut), trY = ys.slice(0, cut), teX = xs.slice(cut), teY = ys.slice(cut);
  if (teX.length >= 8 && trY.some((v) => v === 1) && trY.some((v) => v === 0) && sd(trX) > 1e-6) {
    const ft = fitLogit(trX, trY);
    const base = Math.min(1 - 1e-6, Math.max(1e-6, mean(trY)));
    const flat = { a: Math.log(base / (1 - base)), b: 0 };
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
  if (!slopeOk) warnings.push("Tenants offered bigger increases stayed as often or more often than those offered smaller ones. That usually means you offered bigger increases to units or tenants who were already likelier to stay (a hot building, a long tenancy), not that rent does not matter. Do not set offers from this curve.");

  return {
    n, stayed, left, renewRate: stayed / n, levels, eco, turnoverCost, leave,
    slope: f.b, intercept: f.a, ci95, usualInc, usualX,
    sens: { base: probAt(f, usualX), plus1: probAt(f, Math.log(1 + usualInc + 0.01)), drop1: probAt(f, usualX) - probAt(f, Math.log(1 + usualInc + 0.01)) },
    range: { lo: inc(lo), hi: inc(hi) },
    optimum, scenarios, bands, holdout, verdict, warnings,
    curve: (increase) => probAt(f, Math.log(1 + increase)),
  };
}

export function sampleText() {
  const rng = mulberry32(11);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const lines = ["current_rent,offered_rent,renewed"];
  for (let i = 0; i < 80; i++) {
    const cur = Math.round((1050 + rng() * 1600) / 5) * 5;
    const inc = Math.max(-0.01, 0.035 + 0.03 * gauss());
    const offer = Math.round((cur * (1 + inc)) / 5) * 5;
    const pStay = sigmoid(2.6 - 26 * (offer / cur - 1.03));
    lines.push(`${cur},${offer},${rng() < pStay ? 1 : 0}`);
  }
  return lines.join("\n");
}

export function reportCsv(r) {
  const head = "rent_increase,offered_rent,renew_chance,expected_value_over_term,inside_tested_range";
  return [head, ...r.scenarios.map((s) => [s.increase.toFixed(4), s.offer.toFixed(2), s.renewChance.toFixed(4), s.expectedValue.toFixed(2), s.tested].join(","))].join("\n");
}
