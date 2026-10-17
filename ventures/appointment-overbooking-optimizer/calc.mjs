// Appointment overbooking optimizer. Pure functions, no DOM, no network.
// Shows among B booked appointments are Binomial(B, p), or Beta-Binomial when
// whole days go well or badly together (weather, a flu week). Profit for a
// plan is exact: margin on every visit actually done, minus a cost for every
// patient beyond capacity. The best number of extra bookings is found by
// scanning the exact distribution, and with a history the uncertainty in the
// no-show rate is integrated out on a fixed grid, so a result is reproducible
// and there is no random sampling anywhere in the decision.

export const num = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "n/a");
export const money = (v) => (Number.isFinite(v) ? (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "n/a");
export const pct = (v, d = 1) => (Number.isFinite(v) ? (v * 100).toFixed(d) + "%" : "n/a");

const MIN_DAYS = 10;
const MIN_BOOKED = 60;
const GRID = 400;
const RHO_MAX = 0.5;

// ---- distributions ---------------------------------------------------------

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

export function lnGamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

const lnChoose = (n, k) => lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1);
const lnBeta = (a, b) => lnGamma(a) + lnGamma(b) - lnGamma(a + b);

// P(shows = 0..booked) for `booked` appointments, show rate p and day-to-day
// correlation rho (0 = independent patients, the plain binomial).
export function showsPmf(booked, p, rho = 0) {
  const pmf = new Array(booked + 1).fill(0);
  if (p <= 0) { pmf[0] = 1; return pmf; }
  if (p >= 1) { pmf[booked] = 1; return pmf; }
  if (!(rho > 1e-9)) {
    const lp = Math.log(p), lq = Math.log(1 - p);
    for (let s = 0; s <= booked; s++) pmf[s] = Math.exp(lnChoose(booked, s) + s * lp + (booked - s) * lq);
  } else {
    const k = (1 - rho) / rho;
    const a = p * k, b = (1 - p) * k;
    for (let s = 0; s <= booked; s++) pmf[s] = Math.exp(lnChoose(booked, s) + lnBeta(s + a, booked - s + b) - lnBeta(a, b));
  }
  const total = pmf.reduce((x, y) => x + y, 0);
  return pmf.map((v) => v / total);
}

// Expected outcome of booking `booked` into `capacity` slots.
export function evaluatePlan({ capacity, booked, p, rho = 0, margin, overflowCost, mode = "bump" }) {
  const pmf = showsPmf(booked, p, rho);
  let served = 0, over = 0, pOver = 0, pEmpty = 0, shows = 0;
  for (let s = 0; s <= booked; s++) {
    served += Math.min(s, capacity) * pmf[s];
    over += Math.max(s - capacity, 0) * pmf[s];
    shows += s * pmf[s];
    if (s > capacity) pOver += pmf[s];
    if (s < capacity) pEmpty += pmf[s];
  }
  // bump: patients beyond capacity are not seen (no revenue, goodwill cost).
  // overtime: they are seen after hours (revenue earned, extra cost paid).
  const visits = mode === "overtime" ? shows : served;
  return { booked, expectedShows: shows, expectedServed: served, expectedOver: over, pOver, pEmpty, utilization: served / capacity, profit: margin * visits - overflowCost * over };
}

// ---- inputs ----------------------------------------------------------------

export function validateSettings(s) {
  const need = (v, name, lo, hi) => (Number.isFinite(v) && v >= lo && v <= hi ? null : `${name} must be a number from ${lo} to ${hi}.`);
  return (
    need(s.capacity, "Slots per day", 1, 500) ||
    (Number.isInteger(s.capacity) ? null : "Slots per day must be a whole number.") ||
    need(s.revenue, "Revenue per completed visit", 0.01, 1e7) ||
    need(s.variableCost ?? 0, "Variable cost per visit", 0, 1e7) ||
    ((s.variableCost ?? 0) < s.revenue ? null : "Variable cost per visit must be below the revenue, or seeing a patient loses money and overbooking cannot help.") ||
    need(s.overflowCost, "Cost of a patient you cannot fit", 0, 1e7) ||
    need(s.daysPerYear ?? 250, "Working days per year", 1, 366) ||
    null
  );
}

// Text to rows. Two columns are `booked,showed`; three are `date,booked,showed`.
export function parseHistory(text) {
  const warnings = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Paste or upload your history first: one row per day with booked and showed counts." };
  const rows = [];
  let skipped = 0;
  for (const line of lines) {
    const cells = line.split(/[,\t;]/).map((c) => c.trim());
    const nums = cells.map((c) => (/^\d+$/.test(c) ? Number(c) : NaN));
    let booked, showed, date = null;
    if (cells.length === 2) [booked, showed] = nums;
    else if (cells.length >= 3) { date = cells[0]; [booked, showed] = [nums[1], nums[2]]; }
    else { skipped++; continue; }
    if (!Number.isFinite(booked) || !Number.isFinite(showed)) { skipped++; continue; }
    if (showed > booked) return { error: `A day shows ${showed} showed out of ${booked} booked. Showed cannot exceed booked: check the column order (booked first).` };
    if (booked === 0) { skipped++; continue; }
    rows.push({ date, booked, showed });
  }
  if (skipped) warnings.push(`${skipped} line${skipped === 1 ? " was" : "s were"} skipped (header, blank or non-numeric, or zero booked).`);
  if (!rows.length) return { error: "No usable rows. Expected booked and showed counts per day, for example 12,10." };
  return { rows, warnings };
}

// ---- estimation from a history --------------------------------------------

function estimate(rows) {
  const D = rows.length;
  const B = rows.reduce((s, r) => s + r.booked, 0);
  const S = rows.reduce((s, r) => s + r.showed, 0);
  const p = S / B;
  const nbar = B / D;
  let x2 = 0;
  if (p > 0 && p < 1) for (const r of rows) x2 += (r.booked * (r.showed / r.booked - p) ** 2) / (p * (1 - p));
  const rhoRaw = nbar > 1 && D > 1 ? (x2 / (D - 1) - 1) / (nbar - 1) : 0;
  const rho = Math.min(RHO_MAX, Math.max(0, rhoRaw));
  const deff = 1 + (nbar - 1) * rho;
  return { days: D, booked: B, showed: S, p, rho, rhoRaw, deff, nbar };
}

// Fixed-grid posterior for p from Beta(1 + showed/deff, 1 + missed/deff): the
// design effect shrinks the evidence when days move together, which is what
// makes the interval honest about clustered no-shows.
function posteriorGrid(est) {
  const a = 1 + est.showed / est.deff, b = 1 + (est.booked - est.showed) / est.deff;
  const ps = [], ws = [];
  for (let i = 0; i < GRID; i++) {
    const p = (i + 0.5) / GRID;
    ps.push(p);
    ws.push(Math.exp((a - 1) * Math.log(p) + (b - 1) * Math.log(1 - p) - lnBeta(a, b)));
  }
  const tot = ws.reduce((x, y) => x + y, 0);
  const w = ws.map((v) => v / tot);
  const q = (t) => { let c = 0; for (let i = 0; i < GRID; i++) { c += w[i]; if (c >= t) return ps[i]; } return ps[GRID - 1]; };
  // Thin to the mass that matters so the scan over plans stays fast.
  const keep = [];
  for (let i = 0; i < GRID; i++) if (w[i] > 1e-6) keep.push(i);
  const kt = keep.reduce((s, i) => s + w[i], 0);
  return { a, b, ps: keep.map((i) => ps[i]), w: keep.map((i) => w[i] / kt), lo80: q(0.1), hi80: q(0.9), median: q(0.5) };
}

function kMaxFor(capacity) {
  return Math.min(60, Math.max(3, Math.ceil(capacity * 0.75)));
}

function scanPlans(s, pDist, rho) {
  const kmax = kMaxFor(s.capacity);
  const out = [];
  for (let k = 0; k <= kmax; k++) {
    let acc = null;
    for (let i = 0; i < pDist.ps.length; i++) {
      const e = evaluatePlan({ capacity: s.capacity, booked: s.capacity + k, p: pDist.ps[i], rho, margin: s.margin, overflowCost: s.overflowCost, mode: s.mode });
      if (!acc) acc = Object.fromEntries(Object.keys(e).map((key) => [key, 0]));
      for (const key of Object.keys(e)) acc[key] += e[key] * pDist.w[i];
    }
    acc.booked = s.capacity + k;
    acc.extra = k;
    out.push(acc);
  }
  return out;
}

const bestOf = (plans) => plans.reduce((b, x) => (x.profit > b.profit + 1e-9 ? x : b), plans[0]);

function bestFor(s, p, rho) {
  return bestOf(scanPlans(s, { ps: [p], w: [1] }, rho)).extra;
}

// ---- hold-out check of the predictive distribution --------------------------

function holdOut(rows) {
  const cut = Math.floor(rows.length * 0.75);
  if (cut < MIN_DAYS || rows.length - cut < 5) return null;
  const train = rows.slice(0, cut), test = rows.slice(cut);
  const est = estimate(train);
  let inside = 0, llBb = 0, llBin = 0;
  for (const r of test) {
    const bb = showsPmf(r.booked, est.p, est.rho), bin = showsPmf(r.booked, est.p, 0);
    llBb += Math.log(Math.max(bb[r.showed], 1e-12));
    llBin += Math.log(Math.max(bin[r.showed], 1e-12));
    let lo = 0, hi = r.booked, c = 0;
    for (let x = 0; x <= r.booked; x++) { c += bb[x]; if (c >= 0.1) { lo = x; break; } }
    c = 0;
    for (let x = 0; x <= r.booked; x++) { c += bb[x]; if (c >= 0.9) { hi = x; break; } }
    if (r.showed >= lo && r.showed <= hi) inside++;
  }
  return {
    trainDays: train.length, testDays: test.length, pTrain: est.p, rhoTrain: est.rho,
    coverage80: inside / test.length,
    meanLogScoreClustered: llBb / test.length, meanLogScoreIndependent: llBin / test.length,
    clusteringHelps: llBb > llBin + 1e-9,
  };
}

// ---- entry points ------------------------------------------------------------

function finish(s, plans, extra) {
  const best = bestOf(plans), base = plans[0];
  const capped = s.maxOverflowProb == null ? null : [...plans].reverse().find((x) => x.pOver <= s.maxOverflowProb) || base;
  const days = s.daysPerYear ?? 250;
  return {
    settings: s, plans, best, base,
    gainPerDay: best.profit - base.profit,
    gainPerYear: (best.profit - base.profit) * days,
    capped: capped ? { ...capped, gainPerDay: capped.profit - base.profit } : null,
    hitScanLimit: best.extra === kMaxFor(s.capacity),
    ...extra,
  };
}

function normalise(input) {
  const s = {
    capacity: Number(input.capacity), revenue: Number(input.revenue), variableCost: Number(input.variableCost ?? 0),
    overflowCost: Number(input.overflowCost), daysPerYear: Number(input.daysPerYear ?? 250),
    mode: input.mode === "overtime" ? "overtime" : "bump",
    maxOverflowProb: input.maxOverflowProb == null || input.maxOverflowProb === "" ? null : Number(input.maxOverflowProb),
  };
  s.margin = s.revenue - s.variableCost;
  return s;
}

// Known no-show rate (no history).
export function analyzeRate(input) {
  const s = normalise(input);
  const err = validateSettings(s);
  if (err) return { error: err };
  const noShow = Number(input.noShowRate);
  if (!(noShow >= 0 && noShow < 1)) return { error: "No-show rate must be from 0% up to, but not including, 100%." };
  const rho = Math.min(RHO_MAX, Math.max(0, Number(input.rho ?? 0)));
  if (!Number.isFinite(rho)) return { error: "Day-to-day correlation must be a number from 0 to 0.5." };
  const p = 1 - noShow;
  const plans = scanPlans(s, { ps: [p], w: [1] }, rho);
  const sensitivity = [0, 0.02, 0.05, 0.1].map((r) => ({ rho: r, bestExtra: bestFor(s, p, r) }));
  const noShows = [-0.05, -0.02, 0, 0.02, 0.05].map((d) => Math.min(0.95, Math.max(0, noShow + d))).filter((v, i, a) => a.indexOf(v) === i).map((v) => ({ noShow: v, bestExtra: bestFor(s, 1 - v, rho) }));
  const warnings = [];
  if (rho === 0) warnings.push("Day-to-day correlation is set to 0, which assumes every patient decides independently. Real days cluster (weather, illness, holidays), which makes bad days worse than this predicts: see the sensitivity row, and prefer the history mode.");
  return finish(s, plans, { mode: "rate", p, rho, sensitivity, noShows, warnings });
}

// From a history of booked/showed counts per day.
export function analyzeHistory(rows, input) {
  const s = normalise(input);
  const err = validateSettings(s);
  if (err) return { error: err };
  const est = estimate(rows);
  if (rows.length < MIN_DAYS || est.booked < MIN_BOOKED) {
    return { error: `Need at least ${MIN_DAYS} days and ${MIN_BOOKED} booked appointments to estimate a no-show rate; this history has ${rows.length} days and ${est.booked} appointments. Use the known-rate mode with your best guess instead.` };
  }
  if (est.showed === 0) return { error: "Nobody showed in this history, so there is no show rate to work from. Check the column order (booked first, then showed)." };
  const post = posteriorGrid(est);
  const plans = scanPlans(s, post, est.rho);
  const atPoint = bestFor(s, est.p, est.rho);
  const atLow = bestFor(s, post.lo80, est.rho), atHigh = bestFor(s, post.hi80, est.rho);
  const warnings = [];
  const noShow = 1 - est.p;
  if (est.rhoRaw < -0.02) warnings.push("Days vary less than chance alone would produce, which can happen when a front desk already fills cancellations. The plan treats days as independent.");
  if (est.rho >= 0.1) warnings.push(`Days are strongly clustered (correlation ${est.rho.toFixed(2)}): a bad day loses many patients together. Overbook with more caution than the average suggests.`);
  if (rows.length < 30) warnings.push(`Only ${rows.length} days of history: the no-show rate is uncertain (80% range ${pct(1 - post.hi80)} to ${pct(1 - post.lo80)}). The plan already accounts for that, but it will tighten with more days.`);
  if (noShow < 0.03) warnings.push("Your no-show rate is very low, so overbooking is unlikely to pay.");
  const holdout = holdOut(rows);
  return finish(s, plans, {
    mode: "history", est, p: est.p, rho: est.rho,
    noShowRate: noShow, noShowRange80: [1 - post.hi80, 1 - post.lo80],
    bestAtPoint: atPoint, bestAtLowShow: atLow, bestAtHighShow: atHigh,
    holdout, warnings,
    verdict: holdout && holdout.coverage80 >= 0.6 ? "usable" : "weak",
  });
}

// ---- outputs ---------------------------------------------------------------

export function reportCsv(r) {
  const head = "extra_bookings,booked,expected_visits_done,expected_patients_over_capacity,prob_anyone_over_capacity,prob_empty_slot,utilization,expected_profit_per_day";
  const lines = r.plans.map((x) => [x.extra, x.booked, x.expectedServed.toFixed(3), x.expectedOver.toFixed(3), x.pOver.toFixed(4), x.pEmpty.toFixed(4), x.utilization.toFixed(4), x.profit.toFixed(2)].join(","));
  return [head, ...lines].join("\n") + "\n";
}

// Deterministic invented history: 60 weekdays, 12 slots, ~14% no-shows with
// day-to-day clustering. Not a real practice.
export function sampleText() {
  let a = 20260930;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const lines = ["date,booked,showed"];
  const d = new Date(Date.UTC(2026, 0, 5));
  let n = 0;
  while (n < 60) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      const pDay = Math.min(0.97, Math.max(0.6, 0.86 + (rnd() - 0.5) * 0.16 - (dow === 1 ? 0.03 : 0)));
      let showed = 0;
      for (let i = 0; i < 12; i++) if (rnd() < pDay) showed++;
      lines.push(`${d.toISOString().slice(0, 10)},12,${showed}`);
      n++;
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return lines.join("\n");
}
