// Appointment overbooking optimizer. Pure functions, no DOM, no network.
// Model: in a slot where n people are booked, the number who show up is
// beta-binomial(n, alpha, beta) -- a binomial whose show-up probability itself
// varies from slot to slot (bad weather, a flu week, a Monday), which is what
// makes no-shows cluster and what a plain "12% no-show rate" cannot see. It is
// fitted by maximum likelihood on the (booked, showed) count of each past slot.
// The booking level is chosen to maximise expected profit, where every person
// served earns a margin and every person beyond capacity costs an overflow
// penalty. Uncertainty comes from a seeded bootstrap over slots, so a result
// is reproducible, and the search never goes beyond a stated booking ceiling.

export const num = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "n/a");
export const money = (v) => (Number.isFinite(v) ? (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "n/a");
export const pct = (v, d = 1) => (Number.isFinite(v) ? (v * 100).toFixed(d) + "%" : "n/a");

const MIN_APPTS = 40;
const MIN_NOSHOWS = 5;
const MIN_GROUPS = 15;
const BOOT = 200;
const RHO_MIN = 1e-5;
const RHO_MAX = 0.9;

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

// Lanczos approximation of ln Gamma(x) for x > 0.
const LG = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
export function lgamma(x) {
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += LG[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

const lbeta = (a, b) => lgamma(a) + lgamma(b) - lgamma(a + b);
const lchoose = (n, k) => lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);

// p = mean show-up probability, rho = intraclass correlation (0 = plain binomial).
export function toAlphaBeta(p, rho) {
  const s = 1 / rho - 1;
  return { alpha: p * s, beta: (1 - p) * s };
}

export function bbLogPmf(k, n, alpha, beta) {
  return lchoose(n, k) + lbeta(k + alpha, n - k + beta) - lbeta(alpha, beta);
}

export function bbPmf(n, p, rho) {
  const { alpha, beta } = toAlphaBeta(p, rho);
  const out = new Array(n + 1);
  for (let k = 0; k <= n; k++) out[k] = Math.exp(bbLogPmf(k, n, alpha, beta));
  return out;
}

// pairs: [{n, k, w}] unique (booked, showed) counts with weights.
function logLik(pairs, p, rho) {
  const { alpha, beta } = toAlphaBeta(p, rho);
  const lb = lbeta(alpha, beta);
  let s = 0;
  for (const g of pairs) s += g.w * (lbeta(g.k + alpha, g.n - g.k + beta) - lb + g.lc);
  return s;
}

function collapse(groups) {
  const m = new Map();
  for (const g of groups) {
    const key = g.n + ":" + g.k;
    const e = m.get(key);
    if (e) e.w += 1;
    else m.set(key, { n: g.n, k: g.k, w: 1, lc: lchoose(g.n, g.k) });
  }
  return [...m.values()];
}

// Maximum likelihood over (p, log10 rho) by repeated, shrinking grid search:
// deterministic and needs no derivative. Mean show-up rate is searched around
// the pooled rate, so it cannot wander far from the data.
export function fitBetaBinomial(groups) {
  const pairs = collapse(groups);
  let N = 0, K = 0;
  for (const g of groups) { N += g.n; K += g.k; }
  const pHat = K / N;
  let pLo = Math.max(1e-4, pHat - 0.3), pHi = Math.min(1 - 1e-4, pHat + 0.3);
  let rLo = Math.log10(RHO_MIN), rHi = Math.log10(RHO_MAX);
  let best = { p: pHat, lr: rLo, ll: -Infinity };
  const G = 13;
  for (let round = 0; round < 5; round++) {
    for (let i = 0; i < G; i++) {
      const p = pLo + ((pHi - pLo) * i) / (G - 1);
      for (let j = 0; j < G; j++) {
        const lr = rLo + ((rHi - rLo) * j) / (G - 1);
        const ll = logLik(pairs, p, 10 ** lr);
        if (ll > best.ll) best = { p, lr, ll };
      }
    }
    const dp = (pHi - pLo) * 0.25, dr = (rHi - rLo) * 0.25;
    pLo = Math.max(1e-4, best.p - dp); pHi = Math.min(1 - 1e-4, best.p + dp);
    rLo = Math.max(Math.log10(RHO_MIN), best.lr - dr); rHi = Math.min(Math.log10(RHO_MAX), best.lr + dr);
  }
  return { p: best.p, rho: 10 ** best.lr, ll: best.ll, pooled: pHat, llBinomial: logLik(pairs, pHat, RHO_MIN) };
}

// Expected outcome of booking n people into a slot with `capacity` seats.
export function evaluateBooking(n, capacity, p, rho, margin, overflowCost) {
  const pmf = bbPmf(n, p, rho);
  let served = 0, over = 0, pOver = 0;
  for (let s = 0; s <= n; s++) {
    served += Math.min(s, capacity) * pmf[s];
    if (s > capacity) { over += (s - capacity) * pmf[s]; pOver += pmf[s]; }
  }
  return { booked: n, served, empty: capacity - served, overflow: over, pOverflow: pOver, profit: margin * served - overflowCost * over };
}

export function bookingTable(capacity, extra, p, rho, margin, overflowCost) {
  const rows = [];
  for (let n = capacity; n <= capacity + extra; n++) rows.push(evaluateBooking(n, capacity, p, rho, margin, overflowCost));
  return rows;
}

function pickBest(rows, maxOverflow) {
  let best = rows[0];
  for (const r of rows) if (r.pOverflow <= maxOverflow + 1e-12 && r.profit > best.profit + 1e-12) best = r;
  return best;
}

const SHOW = new Set(["showed", "show", "shown", "attended", "arrived", "kept", "completed", "complete", "checked in", "came", "present", "seen", "1", "yes", "y", "true"]);
const NOSHOW = new Set(["no-show", "noshow", "no show", "no_show", "missed", "dna", "did not attend", "didn't attend", "late cancel", "late cancellation", "late-cancel", "late_cancel", "same-day cancel", "0", "no", "n", "false", "absent"]);
const CANCELLED = new Set(["cancelled", "canceled", "cancel", "cancelled early", "rescheduled", "moved"]);
export function parseStatus(s) {
  const t = String(s).trim().toLowerCase();
  if (SHOW.has(t)) return "show";
  if (NOSHOW.has(t)) return "noshow";
  if (CANCELLED.has(t)) return "cancelled";
  return null;
}

const count = (s) => {
  const t = String(s).trim();
  return /^\d+$/.test(t) ? Number(t) : NaN;
};

// Either one row per appointment (slot, status) or one row per slot (slot, booked, showed).
export function parseRows(text) {
  const warnings = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Paste or upload your booking history: one row per appointment (slot, status) or one row per slot (slot, booked, showed)." };
  const delim = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const split = (l) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
  let first = split(lines[0]);
  let cols = { slot: 0, a: 1, b: 2 };
  let start = 0;
  const HEADER_WORD = /^(slot|date|day|session|time|id|appointment|appointments|booked|scheduled|count|n|status|outcome|result|showed|shows|attended|arrived|kept)$/i;
  const looksHeader = lines.length > 1 && first.every((c) => Number.isNaN(Number(c))) && first.some((c) => HEADER_WORD.test(c));
  if (looksHeader) {
    start = 1;
    const low = first.map((c) => c.toLowerCase());
    const idx = (re) => low.findIndex((c) => re.test(c));
    const slot = idx(/slot|date|day|session|time|appointment|id/);
    const booked = idx(/book|sched|appts|appointments|count|^n$/);
    const showed = idx(/show|attend|arriv|kept|came|seen/);
    const status = idx(/status|outcome|result/);
    if (booked >= 0 && showed >= 0 && booked !== showed) cols = { slot: slot >= 0 && slot !== booked && slot !== showed ? slot : 0, a: booked, b: showed };
    else if (status >= 0) cols = { slot: slot >= 0 && slot !== status ? slot : 0, a: status, b: -1 };
  }
  const probe = split(lines[start] || "");
  const aggregated = cols.b >= 0 && probe.length > Math.max(cols.a, cols.b) && Number.isFinite(count(probe[cols.a])) && Number.isFinite(count(probe[cols.b]));
  const bySlot = new Map();
  let skipped = 0, cancelled = 0;
  for (let i = start; i < lines.length; i++) {
    const c = split(lines[i]);
    if (aggregated) {
      const n = count(c[cols.a]), k = count(c[cols.b]);
      if (!Number.isFinite(n) || !Number.isFinite(k) || n < 1 || k > n) { skipped++; continue; }
      const key = c[cols.slot] || `row ${i + 1}`;
      const e = bySlot.get(key) || { n: 0, k: 0 };
      e.n += n; e.k += k; bySlot.set(key, e);
    } else {
      const st = parseStatus(c[cols.a] ?? c[1] ?? "");
      if (st === "cancelled") { cancelled++; continue; }
      if (st === null) { skipped++; continue; }
      const key = c[cols.slot] || `row ${i + 1}`;
      const e = bySlot.get(key) || { n: 0, k: 0 };
      e.n += 1; if (st === "show") e.k += 1; bySlot.set(key, e);
    }
  }
  if (skipped) warnings.push(`${skipped} row${skipped === 1 ? " was" : "s were"} skipped because the status or counts could not be read.`);
  if (cancelled) warnings.push(`${cancelled} cancelled or rescheduled row${cancelled === 1 ? " was" : "s were"} left out: a cancellation made early enough to refill the slot is not a no-show. Relabel late cancellations as "late cancel" to count them.`);
  const groups = [...bySlot.entries()].map(([key, v]) => ({ key, n: v.n, k: v.k }));
  if (!groups.length) return { error: "No usable rows. Expected slot, booked, showed (numbers) or slot, status (showed / no-show)." };
  const sizes = groups.map((g) => g.n).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)];
  if (median > 6) warnings.push(`Your groups are large (median ${median} people). Group by the unit you would overbook -- one provider's session or one time slot -- not a whole day, or the clustering is overstated.`);
  return { groups, warnings, aggregated };
}

function fitAndPolicy(groups, o) {
  const f = fitBetaBinomial(groups);
  const rows = bookingTable(o.capacity, o.maxExtra, f.p, f.rho, o.margin, o.overflowCost);
  return { f, rows, best: pickBest(rows, o.maxOverflow) };
}

const quantile = (arr, q) => {
  const a = [...arr].sort((x, y) => x - y);
  const i = (a.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
};

export function analyze(groups, opts = {}) {
  const o = {
    capacity: Math.max(1, Math.round(Number(opts.capacity) || 1)),
    margin: Number(opts.margin),
    overflowCost: Number(opts.overflowCost),
    maxOverflow: Number.isFinite(Number(opts.maxOverflow)) && opts.maxOverflow !== "" && opts.maxOverflow != null ? Number(opts.maxOverflow) : 1,
    maxExtra: Math.min(8, Math.max(1, Math.round(Number(opts.maxExtra) || 4))),
  };
  if (!(o.margin > 0)) return { error: "Enter what one completed appointment earns you (greater than zero)." };
  if (!(o.overflowCost >= 0)) return { error: "Enter what it costs you when someone extra turns up and cannot be seen (zero or more)." };
  const N = groups.reduce((s, g) => s + g.n, 0);
  const K = groups.reduce((s, g) => s + g.k, 0);
  const noShows = N - K;
  if (N < MIN_APPTS) return { error: `Only ${N} appointments. At least ${MIN_APPTS} are needed before a no-show rate means anything.` };
  if (noShows < MIN_NOSHOWS) return { error: `Only ${noShows} no-show${noShows === 1 ? "" : "s"}. Fewer than ${MIN_NOSHOWS} cannot tell a real rate from luck, so the tool will not recommend overbooking from this.` };
  if (groups.length < MIN_GROUPS) return { error: `Only ${groups.length} slots. At least ${MIN_GROUPS} are needed to see whether no-shows cluster.` };
  const warnings = [];
  const { f, rows, best } = fitAndPolicy(groups, o);
  const base = rows[0];
  const multi = groups.filter((g) => g.n >= 2).length;
  if (multi < 10) warnings.push("Fewer than 10 slots hold two or more bookings, so clustering cannot be measured; the plain binomial is the honest reading and the ranges below are wide.");
  if (f.rho < 0.005) warnings.push("No clustering found: no-shows look independent from slot to slot.");
  const nMax = Math.max(...groups.map((g) => g.n));
  if (best.booked - o.capacity > 0 && nMax < best.booked) warnings.push(`You have never booked ${best.booked} into one slot (most: ${nMax}), so the ${best.booked}-person row is an extrapolation of the fitted pattern. Try it on a few slots first.`);
  if (noShows / N > 0.4) warnings.push("A no-show rate above 40% usually means something other than habit (reminders not sent, wrong export status). Check the data first.");

  // Bootstrap over slots.
  const rnd = mulberry32(20260930);
  const bestCount = new Map();
  const gains = [], rates = [], pOvers = [];
  for (let b = 0; b < BOOT; b++) {
    const samp = [];
    for (let i = 0; i < groups.length; i++) samp.push(groups[Math.floor(rnd() * groups.length)]);
    const r = fitAndPolicy(samp, o);
    bestCount.set(r.best.booked, (bestCount.get(r.best.booked) || 0) + 1);
    // Judge the resample's choice against the fitted model, not its own.
    const chosen = rows[r.best.booked - o.capacity];
    gains.push(chosen.profit - base.profit);
    rates.push(1 - r.f.p);
    pOvers.push(chosen.pOverflow);
  }
  const share = [...bestCount.entries()].sort((a, b) => a[0] - b[0]).map(([booked, c]) => ({ booked, share: c / BOOT }));
  const agree = (bestCount.get(best.booked) || 0) / BOOT;

  // Hold-out: fit on the first 75% of slots in the order given, score the rest.
  let holdout = null;
  const cut = Math.floor(groups.length * 0.75);
  const train = groups.slice(0, cut), test = groups.slice(cut);
  const tN = train.reduce((s, g) => s + g.n, 0), tNo = tN - train.reduce((s, g) => s + g.k, 0);
  if (train.length >= MIN_GROUPS && test.length >= 5 && tN >= MIN_APPTS && tNo >= MIN_NOSHOWS) {
    const tf = fitBetaBinomial(train);
    const a = toAlphaBeta(tf.p, tf.rho), bin = toAlphaBeta(tf.pooled, RHO_MIN);
    let llBB = 0, llBin = 0, pred = 0, varr = 0, obs = 0, testN = 0;
    for (const g of test) {
      llBB += bbLogPmf(g.k, g.n, a.alpha, a.beta);
      llBin += bbLogPmf(g.k, g.n, bin.alpha, bin.beta);
      pred += g.n * (1 - tf.p);
      varr += g.n * tf.p * (1 - tf.p) * (1 + (g.n - 1) * tf.rho);
      obs += g.n - g.k; testN += g.n;
    }
    const z = varr > 0 ? (obs - pred) / Math.sqrt(varr) : 0;
    holdout = { train: train.length, test: test.length, testAppts: testN, predictedNoShows: pred, observedNoShows: obs, z, stable: Math.abs(z) < 2, llModel: llBB / test.length, llBinomial: llBin / test.length, clusteringHelps: llBB > llBin + 1e-9 };
  }
  let verdict;
  if (holdout && !holdout.stable) verdict = "drifting";
  else if (!holdout || agree < 0.6 || groups.length < 30 || noShows < 10) verdict = "weak";
  else verdict = "usable";
  if (verdict === "drifting") warnings.push(`Your most recent ${holdout.test} slots had ${num(holdout.observedNoShows)} no-shows where the earlier pattern predicted ${num(holdout.predictedNoShows, 1)}. The rate seems to have moved; weigh recent weeks more than this all-history fit.`);

  return {
    ...o, appts: N, shows: K, noShows, slots: groups.length, noShowRate: 1 - f.p, pooledNoShowRate: 1 - f.pooled,
    rho: f.rho, clustering: f.ll - f.llBinomial, rows, best, base,
    gain: best.profit - base.profit, share, agree,
    gainRange80: [quantile(gains, 0.1), quantile(gains, 0.9)],
    rateRange80: [quantile(rates, 0.1), quantile(rates, 0.9)],
    pOverflowRange80: [quantile(pOvers, 0.1), quantile(pOvers, 0.9)],
    holdout, verdict, warnings,
  };
}

export function reportCsv(r) {
  const head = "booked,expected_served,expected_empty_seats,expected_overflow_people,chance_someone_is_turned_away,expected_profit,gain_vs_no_overbooking";
  const lines = r.rows.map((x) => [x.booked, x.served.toFixed(3), x.empty.toFixed(3), x.overflow.toFixed(3), x.pOverflow.toFixed(4), x.profit.toFixed(2), (x.profit - r.base.profit).toFixed(2)].join(","));
  return [head, ...lines].join("\n") + "\n";
}

// 120 invented morning sessions for a 3-chair clinic: most have ~10% no-shows,
// about three in ten are bad sessions (weather, a flu week) with ~50%.
export function sampleText() {
  const rnd = mulberry32(11);
  const out = ["slot,booked,showed"];
  for (let d = 1; d <= 120; d++) {
    const n = 3 + Math.floor(rnd() * 3);
    const pShow = rnd() < 0.3 ? 0.5 : 0.9;
    let k = 0;
    for (let i = 0; i < n; i++) if (rnd() < pShow) k++;
    out.push(`session-${String(d).padStart(3, "0")},${n},${k}`);
  }
  return out.join("\n");
}
