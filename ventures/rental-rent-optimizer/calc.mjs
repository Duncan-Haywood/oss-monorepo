// Rental rent optimizer. Pure functions, no DOM, no network.
//
// Model: days to lease follow an exponential (constant-hazard) survival model
//   rate per day = exp(a + b * x),   x = ln(asking rent / market rent)
// so the mean time to lease is exp(-(a + b*x)) days. Listings still vacant are
// right-censored: they add exposure days to the likelihood but no event. The
// slope b is fitted by penalised maximum likelihood (Newton-Raphson with step
// halving) with a Gaussian prior centred on a stated elasticity, so a short
// history is shrunk toward the assumption instead of trusted; with fewer than
// MIN_ROWS listings the prior is nearly fixed and only the intercept is learned.
//
// Objective (renewal-reward, exact long-run average): a cycle is one vacancy V
// (mean mu months) followed by one tenancy of L = term / (1 - renewal) months
// (renewals are geometric). Expected net per month
//   (R*L - turnover - carry*mu - problemChance*problemCost) / (mu + L).
// The vacancy cost is charged only while vacant; costs paid either way
// (`fixed`) are subtracted as a constant and cannot move the best rent. Seeded bootstrap gives ranges,
// so a result is reproducible and never extrapolates silently.

export const num = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "n/a");
export const money = (v) => (Number.isFinite(v) ? (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "n/a");
export const pct = (v, d = 1) => (Number.isFinite(v) ? (v * 100).toFixed(d) + "%" : "n/a");

export const DAYS_PER_MONTH = 30.4375;
export const MIN_ROWS = 6; // below this the stated elasticity dominates
const MIN_X_SD = 0.02; // spread of ln(asking / market) below which the slope cannot be learned
const BOOT = 300;
const PRIOR_SD_FULL = 1.5;
const PRIOR_SD_SHORT = 0.3;
const A_PRIOR_MEAN = Math.log(1 / 30);
const A_PRIOR_SD = 30;
const FALLBACK_RANGE = 0.15; // +-15% around market when there is no usable history

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

const mean = (a) => (a.length ? a.reduce((p, q) => p + q, 0) / a.length : NaN);
export function sd(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((p, q) => p + (q - m) ** 2, 0) / (a.length - 1));
}
export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// "+10% rent makes vacancy p% longer" -> slope b of the log hazard on ln(rent ratio).
export function elasticityToSlope(pctLonger) {
  const p = Number(pctLonger);
  if (!(p > -90)) return NaN;
  return -Math.log(1 + p / 100) / Math.log(1.1);
}

const moneyNum = (s) => {
  const t = String(s).trim().replace(/^\((.*)\)$/, "-$1").replace(/[$€£,\s]/g, "");
  if (t === "" || !/^-?\d*\.?\d+$/.test(t)) return NaN;
  return Number(t);
};

const LEASED = new Set(["1", "leased", "rented", "signed", "yes", "y", "true", "filled", "closed", "taken", "let"]);
const VACANT = new Set(["0", "vacant", "open", "active", "listed", "available", "still vacant", "no", "n", "false", "pending", "unleased", "on market"]);
export function parseLeased(s) {
  const t = String(s).trim().toLowerCase();
  if (LEASED.has(t)) return 1;
  if (VACANT.has(t)) return 0;
  return null;
}

// Rows: asking_rent, days_on_market[, leased][, market_rent]. A header may name and reorder the columns.
// leased is 1/0 or words (leased/rented, vacant/still vacant); a vacant row is censored at its days so far.
export function parseRows(text) {
  const warnings = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Paste or upload rows of asking rent and days on market (optionally leased or still vacant, and the market rent at the time)." };
  const delim = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
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
  let ci = { rent: 0, days: 1, leased: -1, market: -1 };
  const first = rows[0];
  const hasHeader = first.some((c) => /[a-z]/i.test(c) && !/^[$€£]?\d/.test(c)) && parseLeased(first[1] ?? "") === null;
  if (hasHeader) {
    const head = first.map((h) => h.toLowerCase());
    const isDays = (h) => /day|dom|time/.test(h);
    const isMarket = (h) => /market|comp|benchmark/.test(h) && !isDays(h);
    const used = new Set();
    const pick = (test, dflt) => { const i = head.findIndex((h, k) => !used.has(k) && test(h)); if (i >= 0) { used.add(i); return i; } return dflt; };
    const m = pick(isMarket, -1);
    const r = pick((h) => /ask|list|price|rent/.test(h) && !isDays(h), 0);
    const d = pick(isDays, 1);
    const l = pick((h) => /leas|rented|status|result|outcome|signed|filled/.test(h), -1);
    ci = { rent: r, days: d, leased: l, market: m };
    if (ci.leased === ci.rent || ci.leased === ci.days) ci.leased = -1;
    rows = rows.slice(1);
  } else {
    const row = rows.find((r) => r.length >= 3) || rows[0] || [];
    if (row.length >= 3) {
      const t = row[2];
      if (parseLeased(t) !== null) ci.leased = 2;
      else ci.market = 2;
      if (row.length >= 4) ci.market = 3;
    }
  }
  if ((first?.length || 0) < 2) return { error: "Each row needs at least an asking rent and days on market." };
  const out = [];
  let bad = 0;
  for (const r of rows) {
    const rent = moneyNum(r[ci.rent] ?? ""), days = moneyNum(r[ci.days] ?? "");
    if (!(rent > 0) || !(days >= 0) || days > 3650) { bad++; continue; }
    let leased = 1;
    if (ci.leased >= 0) {
      const cell = String(r[ci.leased] ?? "").trim();
      if (cell !== "") { const p = parseLeased(cell); if (p === null) { bad++; continue; } leased = p; }
    }
    let market = null;
    if (ci.market >= 0) { const m = moneyNum(r[ci.market] ?? ""); if (m > 0) market = m; }
    out.push({ rent, days, leased, market });
  }
  if (bad) warnings.push(`${bad} row(s) were skipped because the asking rent, days on market or leased status could not be read.`);
  const withMarket = out.filter((r) => r.market !== null).length;
  const hasMarket = out.length > 0 && withMarket === out.length;
  if (ci.market >= 0 && !hasMarket) {
    warnings.push(`${out.length - withMarket} row(s) had no readable market rent, so the market column was ignored and every listing is compared with today's market rent.`);
    for (const r of out) r.market = null;
  }
  if (!out.length) return { error: "No readable listings. Each row is: asking rent, days on market, and optionally leased (1) or still vacant (0)." };
  return { rows: out, hasMarket, warnings };
}

// ---------- survival fit ----------
function inv2(I) {
  const det = I[0][0] * I[1][1] - I[0][1] * I[1][0];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-300) return null;
  return [[I[1][1] / det, -I[0][1] / det], [-I[1][0] / det, I[0][0] / det]];
}

// Penalised log-likelihood of exponential durations. obs: {x, t (days, >0), d (1 = leased)}.
function penLL(obs, a, b, pr) {
  let ll = 0;
  for (const o of obs) {
    const eta = a + b * o.x;
    ll += o.d * eta - Math.exp(Math.min(eta, 50)) * o.t;
  }
  return ll - (a - pr.aMean) ** 2 / (2 * pr.aSd ** 2) - (b - pr.bMean) ** 2 / (2 * pr.bSd ** 2);
}

function priorOf(n, o = {}) {
  return {
    aMean: A_PRIOR_MEAN, aSd: o.aSd ?? A_PRIOR_SD,
    bMean: o.bMean ?? -4.25,
    bSd: o.priorSd ?? (n < MIN_ROWS ? PRIOR_SD_SHORT : PRIOR_SD_FULL),
  };
}

export function fitHazard(obs, o = {}) {
  const pr = priorOf(obs.length, o);
  const events = obs.reduce((p, q) => p + q.d, 0);
  const exposure = obs.reduce((p, q) => p + q.t, 0);
  let a = Math.log((events + 0.5) / Math.max(exposure, 1e-9)), b = pr.bMean;
  let cur = penLL(obs, a, b, pr);
  let converged = false, I = null;
  for (let it = 0; it < 100; it++) {
    let sa = -(a - pr.aMean) / pr.aSd ** 2, sb = -(b - pr.bMean) / pr.bSd ** 2;
    let i00 = 1 / pr.aSd ** 2, i01 = 0, i11 = 1 / pr.bSd ** 2;
    for (const r of obs) {
      const lam = Math.exp(Math.min(a + b * r.x, 50)) * r.t;
      sa += r.d - lam; sb += (r.d - lam) * r.x;
      i00 += lam; i01 += lam * r.x; i11 += lam * r.x * r.x;
    }
    I = [[i00, i01], [i01, i11]];
    const V = inv2(I);
    if (!V) break;
    let da = V[0][0] * sa + V[0][1] * sb, db = V[1][0] * sa + V[1][1] * sb;
    let step = 1, next = cur, na = a, nb = b;
    for (let h = 0; h < 40; h++) {
      na = a + step * da; nb = b + step * db;
      next = penLL(obs, na, nb, pr);
      if (Number.isFinite(next) && next >= cur - 1e-12) break;
      step /= 2;
    }
    const move = Math.abs(na - a) + Math.abs(nb - b);
    a = na; b = nb; cur = next;
    if (move < 1e-10) { converged = true; break; }
  }
  const V = I ? inv2(I) : null;
  return {
    a, b, converged, priorSd: pr.bSd, priorMean: pr.bMean,
    seA: V ? Math.sqrt(Math.max(V[0][0], 0)) : NaN, seB: V ? Math.sqrt(Math.max(V[1][1], 0)) : NaN,
    // share of the slope's information that comes from the data rather than the prior
    dataWeight: V ? Math.min(1, Math.max(0, 1 - V[1][1] / pr.bSd ** 2)) : NaN,
    events, exposure,
  };
}

// Slope held at b; the intercept is the closed-form censored exponential MLE (weak prior only).
export function fitFixedB(obs, b) {
  const events = obs.reduce((p, q) => p + q.d, 0);
  const denom = obs.reduce((p, q) => p + Math.exp(b * q.x) * q.t, 0);
  return { a: Math.log(Math.max(events, 0.5) / Math.max(denom, 1e-9)), b };
}

export const meanVacancyMonths = (fit, x) => Math.exp(-(fit.a + fit.b * x)) / DAYS_PER_MONTH;

// Expected net income per month in steady state at premium x (rent = market * e^x).
export function netRate(econ, fit, x) {
  const L = econ.leaseMonths / (1 - econ.renewal);
  const mu = meanVacancyMonths(fit, x);
  const R = econ.market * Math.exp(x);
  // `fixed` (mortgage, taxes: paid occupied or not) is a constant per month, so it shifts the level and never the best rent.
  return (R * L - econ.turnover - econ.carry * mu - econ.problemChance * econ.problemCost) / (mu + L) - (econ.fixed || 0);
}

// Best premium in [lo, hi]: coarse grid, then golden-section refinement around the winner.
export function bestPremium(econ, fit, lo, hi) {
  const N = 400;
  let bx = lo, bv = -Infinity;
  for (let i = 0; i <= N; i++) {
    const x = lo + ((hi - lo) * i) / N, v = netRate(econ, fit, x);
    if (v > bv) { bv = v; bx = x; }
  }
  let l = Math.max(lo, bx - (hi - lo) / N), h = Math.min(hi, bx + (hi - lo) / N);
  const g = (Math.sqrt(5) - 1) / 2;
  let c = h - g * (h - l), d = l + g * (h - l);
  for (let i = 0; i < 60; i++) {
    if (netRate(econ, fit, c) > netRate(econ, fit, d)) h = d; else l = c;
    c = h - g * (h - l); d = l + g * (h - l);
  }
  const xm = (l + h) / 2;
  return netRate(econ, fit, xm) >= bv ? { x: xm, value: netRate(econ, fit, xm) } : { x: bx, value: bv };
}

function toObs(rows, marketNow) {
  return rows.map((r) => ({ x: Math.log(r.rent / (r.market ?? marketNow)), t: Math.max(r.days, 0.5), d: r.leased }));
}

function nllOf(fit, obs) {
  let s = 0;
  for (const o of obs) { const eta = fit.a + fit.b * o.x; s += -o.d * eta + Math.exp(Math.min(eta, 50)) * o.t; }
  return s / obs.length;
}

export function analyze(rows, o = {}) {
  const warnings = [];
  const n = rows.length;
  if (!n) return { error: "Add at least one listing (asking rent and days on market)." };
  const market = Number(o.market);
  if (!(market > 0)) return { error: "Enter the current market rent for the unit you are pricing (what comparable units are asking today)." };
  const econ = {
    market,
    leaseMonths: o.leaseMonths > 0 ? Number(o.leaseMonths) : 12,
    renewal: Number.isFinite(o.renewal) ? Math.min(0.95, Math.max(0, Number(o.renewal))) : 0,
    turnover: o.turnover >= 0 ? Number(o.turnover) : 0,
    carry: o.carry >= 0 ? Number(o.carry) : 0,
    fixed: o.fixed >= 0 ? Number(o.fixed) : 0,
    problemChance: Number.isFinite(o.problemChance) ? Math.min(1, Math.max(0, Number(o.problemChance))) : 0,
    problemCost: o.problemCost >= 0 ? Number(o.problemCost) : 0,
  };
  const horizon = o.horizonMonths > 0 ? Number(o.horizonMonths) : econ.leaseMonths;
  const priorPct = Number.isFinite(o.priorElasticity) ? Number(o.priorElasticity) : 50;
  const bPrior = elasticityToSlope(priorPct);
  if (!Number.isFinite(bPrior)) return { error: "The assumed elasticity must be greater than -90 (percent longer vacancy for 10% more rent)." };

  const hasMarket = rows.every((r) => r.market > 0);
  const obs = toObs(rows, market);
  const events = obs.reduce((p, q) => p + q.d, 0), censored = n - events;
  const xs = obs.map((r) => r.x);
  const spread = sd(xs);
  const fopts = { bMean: bPrior };
  const fit = fitHazard(obs, fopts);
  const dataOnly = n >= MIN_ROWS ? fitHazard(obs, { bMean: bPrior, priorSd: 50 }) : null;
  if (!fit.converged) warnings.push("The fit did not settle cleanly; read the result with extra caution.");
  if (n < MIN_ROWS) warnings.push(`Only ${n} listing${n === 1 ? "" : "s"}: fewer than ${MIN_ROWS} cannot show how rent moves vacancy, so the slope is your stated assumption (+10% rent = ${priorPct}% longer vacancy) and only the typical time to lease comes from your data.`);
  else if (spread < MIN_X_SD) warnings.push(`Your asking rents barely differed from market (typical spread ${(spread * 100).toFixed(1)}%), so your history cannot say what a different rent would do. The slope is mostly your stated assumption.`);
  if (events === 0) warnings.push("None of your listings has leased yet, so the typical time to lease is only a lower bound and is shrunk toward about 30 days. Expect the real wait to be longer.");
  else if (events < 3 && n >= MIN_ROWS) warnings.push(`Only ${events} listing${events === 1 ? "" : "s"} leased; most of the information is in the still-vacant ones. Treat the times as rough.`);
  if (!hasMarket && n >= MIN_ROWS) warnings.push("No market rent per listing, so each past asking rent is compared with today's market rent. If rents have moved since, add a market column (comparable rent at the time) for a cleaner slope.");

  const identified = n >= MIN_ROWS && spread >= MIN_X_SD;
  const lo = identified ? Math.min(...xs) : -FALLBACK_RANGE;
  const hi = identified ? Math.max(...xs) : FALLBACK_RANGE;
  const toRent = (x) => market * Math.exp(x);
  const plannedRent = o.plannedRent > 0 ? Number(o.plannedRent) : market;
  const plannedX = Math.log(plannedRent / market);
  const inRange = (x) => x >= lo - 1e-9 && x <= hi + 1e-9;

  const best = bestPremium(econ, fit, lo, hi);
  const boundary = best.x <= lo + 0.01 * (hi - lo) ? "low" : best.x >= hi - 0.01 * (hi - lo) ? "high" : null;
  if (boundary) warnings.push(`The best rent sits at the ${boundary} edge of ${identified ? "the rents you have tried" : "the +/-15% band searched around market"}. The model says to keep going ${boundary === "high" ? "higher" : "lower"} but cannot say how far; test it with a real listing before trusting it.`);
  if (fit.b >= 0) warnings.push("Higher asking rents leased as fast or faster in your history. That usually means you ask more for units that are easier to rent (better location, season), not that price does not matter. Do not set rents from this curve.");
  const L = econ.leaseMonths / (1 - econ.renewal);
  if (fit.b > -1 && econ.carry === 0 && econ.problemChance === 0) warnings.push("With a slope this flat and no vacancy carrying cost, extra rent always outweighs the extra wait, so the model keeps pushing the rent up. Enter your monthly vacant costs for a realistic answer.");

  // Bootstrap: resample listings (seeded), refit, re-optimise in the same range.
  const rng = mulberry32(20260930);
  const bestXs = [], slopes = [], gains = [];
  let better = 0;
  const f0 = (ff, x) => netRate(econ, ff, x);
  for (let k = 0; k < BOOT; k++) {
    const sample = [];
    for (let i = 0; i < n; i++) sample.push(obs[Math.floor(rng() * n)]);
    const bf = fitHazard(sample, fopts);
    if (!Number.isFinite(bf.b)) continue;
    const bb = bestPremium(econ, bf, lo, hi);
    bestXs.push(bb.x); slopes.push(bf.b);
    const g = bb.value - f0(bf, plannedX);
    gains.push(g * horizon);
    if (g > 0) better++;
  }
  bestXs.sort((p, q) => p - q); slopes.sort((p, q) => p - q); gains.sort((p, q) => p - q);
  const plannedRate = netRate(econ, fit, plannedX);
  const optimum = {
    x: best.x, rent: toRent(best.x), premium: Math.exp(best.x) - 1,
    meanDays: Math.exp(-(fit.a + fit.b * best.x)), monthly: best.value, overHorizon: best.value * horizon,
    plannedRent, plannedMonthly: plannedRate, gain: (best.value - plannedRate) * horizon,
    rentRange80: bestXs.length ? [toRent(quantile(bestXs, 0.1)), toRent(quantile(bestXs, 0.9))] : [NaN, NaN],
    gainRange80: gains.length ? [quantile(gains, 0.1), quantile(gains, 0.9)] : [NaN, NaN],
    pGain: gains.length ? better / gains.length : NaN,
    boundary,
  };

  // Posterior interval (data plus the stated assumption) drives the sensitivity rows; the verdict asks
  // the data alone (a very weak prior), so an assumption cannot certify itself.
  const b95 = [fit.b - 1.96 * fit.seB, fit.b + 1.96 * fit.seB];
  const dataCi95 = dataOnly ? [dataOnly.b - 1.96 * dataOnly.seB, dataOnly.b + 1.96 * dataOnly.seB] : null;
  const slope80 = slopes.length ? [quantile(slopes, 0.1), quantile(slopes, 0.9)] : [NaN, NaN];

  // Cost of asking too high / too low, relative to the best rent.
  const off = (c) => {
    const x = best.x + Math.log(1 + c);
    const v = netRate(econ, fit, x);
    return { change: c, rent: toRent(x), meanDays: Math.exp(-(fit.a + fit.b * x)), monthly: v, overHorizon: v * horizon, cost: (best.value - v) * horizon, tested: inRange(x) };
  };
  const offBest = [-0.1, -0.05, 0.05, 0.1].map(off);
  const costTooHigh5 = off(0.05).cost;

  // Profit curve over the searched range (and a little beyond, flagged).
  const span = hi - lo, pad = span * 0.15 + 0.02;
  const curve = [];
  for (let i = 0; i <= 60; i++) {
    const x = lo - pad + ((hi - lo + 2 * pad) * i) / 60;
    curve.push({ x, rent: toRent(x), meanDays: Math.exp(-(fit.a + fit.b * x)), monthly: netRate(econ, fit, x), overHorizon: netRate(econ, fit, x) * horizon, tested: inRange(x) });
  }

  // Sensitivity: best rent when one assumption moves.
  const sens = [];
  const addSens = (label, e2, f2) => {
    const bb = bestPremium(e2, f2, lo, hi);
    sens.push({ label, rent: toRent(bb.x), change: toRent(bb.x) - optimum.rent, meanDays: Math.exp(-(f2.a + f2.b * bb.x)) });
  };
  addSens("As entered", econ, fit);
  const steep = { ...fitFixedB(obs, b95[0]) }, flat = { ...fitFixedB(obs, Math.min(b95[1], -0.05)) };
  addSens(`Rent matters more (slope ${b95[0].toFixed(1)})`, econ, steep);
  addSens(`Rent matters less (slope ${Math.min(b95[1], -0.05).toFixed(1)})`, econ, flat);
  addSens("Turnover cost +50%", { ...econ, turnover: econ.turnover * 1.5 }, fit);
  addSens("Turnover cost -50%", { ...econ, turnover: econ.turnover * 0.5 }, fit);
  addSens("Vacant monthly cost x2", { ...econ, carry: econ.carry * 2 }, fit);
  addSens("No vacant monthly cost", { ...econ, carry: 0 }, fit);
  addSens("Tenant never renews", { ...econ, renewal: 0 }, fit);
  addSens("Tenant renews 75% of the time", { ...econ, renewal: 0.75 }, fit);

  // Hold-out back-test on listing order: fit on the first 75%, score the rest.
  let holdout = null;
  const cut = Math.floor(n * 0.75);
  const train = obs.slice(0, cut), test = obs.slice(cut);
  if (n >= 8 && train.length >= 4 && test.length >= 2) {
    const ft = fitHazard(train, fopts);
    const fb = { ...fitFixedB(train, 0) }; // intercept-only: rent ignored
    const withModel = nllOf(ft, test), without = nllOf(fb, test);
    const leasedTest = test.filter((t) => t.d === 1);
    const predicted = leasedTest.map((t) => Math.exp(-(ft.a + ft.b * t.x)));
    const actual = leasedTest.map((t) => t.t);
    const mae = leasedTest.length ? mean(predicted.map((p, i) => Math.abs(p - actual[i]))) : NaN;
    const maeBase = leasedTest.length ? mean(actual.map((t) => Math.abs(Math.exp(-fb.a) - t))) : NaN;
    holdout = { train: train.length, test: test.length, nllModel: withModel, nllBase: without, helps: withModel < without - 0.005, maeDays: mae, maeDaysBase: maeBase, leasedTest: leasedTest.length };
  } else if (n < 8) {
    warnings.push("Fewer than 8 listings, so there is no hold-out back-test.");
  }

  let verdict;
  if (n < MIN_ROWS) verdict = "assumption";
  else if (spread < MIN_X_SD || fit.b >= 0) verdict = "unidentified";
  else if (dataCi95 && dataCi95[1] < 0 && holdout?.helps) verdict = "usable";
  else verdict = "weak";

  return {
    n, events, censored, hasMarket, spread, identified, verdict, warnings,
    econ, horizon, priorPct, priorSlope: bPrior,
    fit: { a: fit.a, b: fit.b, seB: fit.seB, dataWeight: fit.dataWeight, dataSlope: dataOnly ? dataOnly.b : null, priorSd: fit.priorSd },
    slope: fit.b, ci95: b95, dataCi95, slope80,
    range: { lo: toRent(lo), hi: toRent(hi), loX: lo, hiX: hi },
    marketDays: Math.exp(-(fit.a)), typicalDays: Math.exp(-(fit.a + fit.b * plannedX)),
    optimum, offBest, costTooHigh5, curve, sens, holdout, L,
    daysAt: (rent) => Math.exp(-(fit.a + fit.b * Math.log(rent / market))),
    netAt: (rent) => netRate(econ, fit, Math.log(rent / market)),
  };
}

export function sampleText() {
  const rng = mulberry32(16);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const lines = ["asking_rent,days_on_market,leased"];
  const OBS_CAP = 75; // a listing still open after this many days is recorded as vacant
  for (let i = 0; i < 60; i++) {
    const x = 0.10 * gauss();
    const rent = Math.round((1800 * Math.exp(x)) / 5) * 5;
    const days = -Math.log(1 - rng()) / Math.exp(Math.log(1 / 26) - 7 * x);
    if (days > OBS_CAP) lines.push(`${rent},${OBS_CAP},0`);
    else lines.push(`${rent},${Math.max(1, Math.round(days))},1`);
  }
  return lines.join("\n");
}

export function reportCsv(r) {
  const o = r.optimum;
  const sum = [
    "metric,value",
    `listings,${r.n}`, `leased,${r.events}`, `still_vacant,${r.censored}`,
    `market_rent,${r.econ.market}`,
    `best_asking_rent,${o.rent.toFixed(2)}`,
    `best_rent_80pct_low,${o.rentRange80[0].toFixed(2)}`, `best_rent_80pct_high,${o.rentRange80[1].toFixed(2)}`,
    `expected_days_to_lease_at_best,${o.meanDays.toFixed(1)}`,
    `expected_monthly_net_at_best,${o.monthly.toFixed(2)}`,
    `gain_vs_planned_rent_over_horizon,${o.gain.toFixed(2)}`,
    `cost_of_asking_5pct_too_high_over_horizon,${r.costTooHigh5.toFixed(2)}`,
    `slope,${r.slope.toFixed(3)}`, `verdict,${r.verdict}`, "",
  ];
  const head = "asking_rent,premium_over_market,expected_days_to_lease,expected_monthly_net,expected_net_over_horizon,inside_tested_range";
  return [...sum, head, ...r.curve.map((c) => [c.rent.toFixed(2), (Math.exp(c.x) - 1).toFixed(4), c.meanDays.toFixed(1), c.monthly.toFixed(2), c.overHorizon.toFixed(2), c.tested].join(","))].join("\n");
}
