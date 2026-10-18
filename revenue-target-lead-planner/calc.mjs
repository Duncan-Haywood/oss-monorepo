// Revenue target lead planner. Pure functions, no DOM, no network.
// Input: one row per past period (week or month): leads, deals won, optional revenue won.
// Model: next-period wins ~ Binomial(leads, p). p is the pooled conversion, with parameter
// uncertainty from a seeded bootstrap of whole periods and extra period-to-period spread
// (logit-normal, matched to the observed over-dispersion) so a "steady" history is not
// treated as steadier than it was. Revenue = wins x average deal, plus deal-size noise
// estimated from how far each period's average deal sits from the pooled one. Everything
// is seeded, so the same history always gives the same answer.

export const num = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "n/a");
export const money = (v) => (Number.isFinite(v) ? (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "n/a");
export const pct = (v, d = 1) => (Number.isFinite(v) ? (v * 100).toFixed(d) + "%" : "n/a");

const MIN_PERIODS = 6;
const MIN_LEADS = 60;
const MIN_WINS = 10;
const BOOT = 400;
const SIMS = 1500;
const LEAD_CAP = 200000;

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
const gauss = (rand) => Math.sqrt(-2 * Math.log(Math.max(1e-12, rand()))) * Math.cos(2 * Math.PI * rand());
const expit = (x) => 1 / (1 + Math.exp(-x));
const logit = (p) => Math.log(p / (1 - p));
const quantile = (xs, q) => {
  const a = xs.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return NaN;
  const i = (a.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
};

const moneyNum = (s) => {
  const t = String(s).trim().replace(/^\((.*)\)$/, "-$1").replace(/[$€£,\s]/g, "");
  if (t === "" || !/^-?\d*\.?\d+$/.test(t)) return NaN;
  return Number(t);
};
const count = (s) => {
  const t = String(s ?? "").trim().replace(/,/g, "");
  return t !== "" && /^\d+(\.0+)?$/.test(t) ? Number(t) : NaN;
};

// Rows: [period label,] leads, won [, revenue]. A header row may reorder the columns by name.
export function parseRows(text) {
  const warnings = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Paste or upload one row per week or month: leads, deals won, and optionally revenue won." };
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
  const first = rows[0];
  const hasHeader = first.some((c) => /[a-z]/i.test(c)) && first.every((c) => !Number.isFinite(moneyNum(c)));
  let ci;
  if (hasHeader) {
    const head = first.map((h) => h.toLowerCase());
    const find = (re, skip = []) => head.findIndex((h, i) => !skip.includes(i) && re.test(h));
    const leads = find(/lead|inquir|enquir|prospect|opportunit|contact|visit|apply|applic/);
    const won = find(/won|win|close|deal|sale|order|booked|customer|client/, [leads]);
    const rev = find(/revenue|amount|value|\$|sales|income|total/, [leads, won]);
    const label = find(/period|week|month|date|name|label/, [leads, won, rev]);
    if (leads < 0 || won < 0) return { error: "The header needs a leads column and a won column (for example: period, leads, won, revenue)." };
    ci = { label, leads, won, rev };
    rows = rows.slice(1);
  } else {
    const labelled = rows[0].length >= 3 && !Number.isFinite(moneyNum(rows[0][0]));
    ci = labelled ? { label: 0, leads: 1, won: 2, rev: rows[0].length > 3 ? 3 : -1 } : { label: -1, leads: 0, won: 1, rev: rows[0].length > 2 ? 2 : -1 };
  }
  const out = [];
  let skipped = 0;
  rows.forEach((c, i) => {
    const leads = count(c[ci.leads]);
    const won = count(c[ci.won]);
    const revRaw = ci.rev >= 0 && c[ci.rev] !== undefined && c[ci.rev] !== "" ? moneyNum(c[ci.rev]) : NaN;
    if (!Number.isFinite(leads) || !Number.isFinite(won) || leads <= 0 || won > leads) { skipped++; return; }
    const revenue = Number.isFinite(revRaw) && revRaw >= 0 ? revRaw : null;
    out.push({ label: ci.label >= 0 && c[ci.label] ? c[ci.label] : `#${i + 1}`, leads, won, revenue: won === 0 ? (revenue ?? 0) : revenue });
  });
  if (skipped) warnings.push(`${skipped} row${skipped === 1 ? "" : "s"} skipped: leads must be a whole number above 0 and wins cannot exceed leads.`);
  if (!out.length) return { error: "No readable rows. Each row needs a count of leads and a count of deals won." };
  return { rows: out, warnings };
}

function fit(periods) {
  const L = periods.reduce((t, r) => t + r.leads, 0);
  const W = periods.reduce((t, r) => t + r.won, 0);
  const p = W / L;
  const withRev = periods.every((r) => r.revenue !== null);
  const R = withRev ? periods.reduce((t, r) => t + r.revenue, 0) : null;
  const v = withRev && W > 0 ? R / W : null;
  // Over-dispersion of conversion across periods (Pearson), as an intraclass correlation.
  let rho = 0, disp = 1;
  if (p > 0 && p < 1 && periods.length > 1) {
    const chi = periods.reduce((t, r) => t + (r.won - r.leads * p) ** 2 / (r.leads * p * (1 - p)), 0);
    disp = chi / (periods.length - 1);
    const meanL = L / periods.length;
    if (disp > 1 && meanL > 1) rho = Math.min(0.5, (disp - 1) / (meanL - 1));
  }
  // Deal-size noise: per-deal standard deviation implied by period averages.
  let sigma = 0;
  if (withRev && W > 0) {
    const used = periods.filter((r) => r.won > 0);
    const ss = used.reduce((t, r) => t + r.won * (r.revenue / r.won - v) ** 2, 0);
    sigma = Math.sqrt(ss / Math.max(1, used.length - 1));
  }
  return { L, W, p, v, rho, disp, sigma, withRev };
}

function binomial(n, p, rand) {
  if (p <= 0) return 0;
  if (p >= 1) return n;
  if (n <= 40) { let k = 0; for (let i = 0; i < n; i++) if (rand() < p) k++; return k; }
  const k = Math.round(n * p + Math.sqrt(n * p * (1 - p)) * gauss(rand));
  return Math.max(0, Math.min(n, k));
}

// One simulated next period given fitted parameters, using its own seeded stream.
function simulate(f, leads, seed, withRev) {
  const rand = mulberry32(seed);
  let p = f.p;
  if (f.rho > 0 && p > 0 && p < 1) p = expit(logit(p) + gauss(rand) * Math.sqrt(f.rho / (p * (1 - p))));
  const wins = binomial(leads, p, rand);
  if (!withRev) return { wins, revenue: null };
  const revenue = Math.max(0, wins * f.v + Math.sqrt(wins) * f.sigma * gauss(rand));
  return { wins, revenue };
}

// Parameter sets from a bootstrap of whole periods (parameter uncertainty).
function paramSets(periods, seed) {
  const rand = mulberry32(seed);
  const n = periods.length, sets = [];
  for (let b = 0; b < BOOT; b++) {
    const s = Array.from({ length: n }, () => periods[Math.floor(rand() * n)]);
    const f = fit(s);
    if (f.W > 0) sets.push(f);
  }
  return sets;
}

function outcomeDist(sets, leads, baseSeed, withRev) {
  const out = [];
  for (let i = 0; i < SIMS; i++) out.push(simulate(sets[i % sets.length], leads, baseSeed + i * 7919, withRev));
  return out;
}

export function analyze(rowsIn, opts = {}) {
  const warnings = [];
  const periods = rowsIn.map((r) => ({ ...r }));
  const k = periods.length;
  const f = fit(periods);
  if (k < MIN_PERIODS) return { error: `Need at least ${MIN_PERIODS} periods (weeks or months); you gave ${k}. Fewer cannot show how much your results swing from one period to the next.` };
  if (f.L < MIN_LEADS) return { error: `Need at least ${MIN_LEADS} leads in total to learn a conversion rate; you gave ${f.L}.` };
  if (f.W < MIN_WINS) return { error: `Need at least ${MIN_WINS} deals won in total; you gave ${f.W}. With fewer wins the conversion rate is mostly luck.` };
  if (new Set(periods.map((r) => r.leads)).size === 1 && new Set(periods.map((r) => r.won)).size === 1) return { error: "Every period has the same leads and wins, so there is no variation to learn from. Check the export." };

  const metricRevenue = f.withRev;
  const target = Number(opts.target);
  if (!(target > 0)) return { error: metricRevenue ? "Enter the revenue you want to win next period." : "Enter how many deals you want to win next period." };
  if (metricRevenue && !(f.v > 0)) return { error: "Revenue is recorded as zero on every won deal, so dollars cannot be planned. Check the revenue column." };
  const avgLeads = f.L / k;
  const planned = Number(opts.plannedLeads) > 0 ? Math.round(Number(opts.plannedLeads)) : Math.round(avgLeads);

  const seed = 20260930 + k * 97 + f.W;
  const sets = paramSets(periods, seed);
  const metric = (o) => (metricRevenue ? o.revenue : o.wins);
  const hitProb = (leads) => {
    const d = outcomeDist(sets, leads, seed + 1, metricRevenue);
    return d.filter((o) => metric(o) >= target).length / d.length;
  };

  const plan = outcomeDist(sets, planned, seed + 1, metricRevenue);
  const vals = plan.map(metric);
  const probHit = vals.filter((x) => x >= target).length / vals.length;

  // Leads needed for a given chance of reaching the target: smallest lead count that does it.
  const need = {};
  for (const q of [0.5, 0.8, 0.9]) {
    let hi = Math.max(1, planned);
    while (hi < LEAD_CAP && hitProb(hi) < q) hi *= 2;
    if (hi >= LEAD_CAP && hitProb(hi) < q) { need[q] = null; continue; }
    let lo = Math.max(1, Math.floor(hi / 2));
    if (hitProb(lo) >= q) lo = 1;
    while (hi - lo > 1 && hi - lo > hi * 0.005) { const mid = Math.floor((lo + hi) / 2); if (hitProb(mid) >= q) hi = mid; else lo = mid; }
    need[q] = hi;
  }

  const pBoot = sets.map((s) => s.p);
  const vBoot = sets.filter((s) => s.v !== null).map((s) => s.v);

  // Back-test: predict each of the last periods from the ones before it.
  const m = Math.min(4, Math.floor(k / 3));
  const back = [];
  for (let i = k - m; i < k; i++) {
    const train = periods.slice(0, i);
    const ft = fit(train);
    if (train.length < 4 || ft.W < 3) continue;
    const s = paramSets(train, seed + i);
    if (!s.length) continue;
    const d = outcomeDist(s, periods[i].leads, seed + 100 + i, false).map((o) => o.wins);
    back.push({ label: periods[i].label, leads: periods[i].leads, actual: periods[i].won, lo: quantile(d, 0.1), hi: quantile(d, 0.9), median: quantile(d, 0.5) });
  }
  const hits = back.filter((b) => b.actual >= b.lo - 1e-9 && b.actual <= b.hi + 1e-9).length;
  const backOk = back.length >= 2 && hits / back.length >= 0.5;
  if (back.length >= 2 && !backOk) warnings.push(`Back-test missed: the win count fell inside the tool's 80% range for only ${hits} of the last ${back.length} periods, so your results swing more than the history before them suggested. Treat the plan as optimistic.`);

  const recent = periods.slice(-Math.max(3, Math.floor(k / 3)));
  const fr = fit(recent);
  const drift = fr.p - f.p;
  if (Math.abs(drift) > 0.25 * f.p && recent.length >= 3) warnings.push(`Your most recent ${recent.length} periods converted at ${pct(fr.p)} against ${pct(f.p)} overall: ${drift < 0 ? "lower, so the plan may be optimistic" : "higher, so the plan may be cautious"}. The tool uses the whole history.`);

  const width = quantile(pBoot, 0.9) - quantile(pBoot, 0.1);
  const verdict = k >= 9 && f.W >= 30 && width <= 0.5 * f.p && (back.length < 2 || backOk) ? "usable" : "weak";
  if (verdict === "weak" && !warnings.length) warnings.push("Few periods or few wins, so the range on the conversion rate is wide: read the numbers as rough.");

  const pLow = quantile(pBoot, 0.1), pHigh = quantile(pBoot, 0.9);
  return {
    periods: k, leads: f.L, wins: f.W, avgLeads, conversion: f.p, conversionRange80: [pLow, pHigh],
    avgDeal: f.v, avgDealRange80: vBoot.length ? [quantile(vBoot, 0.1), quantile(vBoot, 0.9)] : null,
    dispersion: f.disp, rho: f.rho, metric: metricRevenue ? "revenue" : "wins", target,
    plannedLeads: planned, probHit, median: quantile(vals, 0.5), range80: [quantile(vals, 0.1), quantile(vals, 0.9)],
    leadsFor50: need[0.5], leadsFor80: need[0.8], leadsFor90: need[0.9],
    backtest: back, backtestHits: hits, recentConversion: fr.p, verdict, warnings,
  };
}

export function reportCsv(r) {
  const fmt = (v) => (r.metric === "revenue" ? v.toFixed(0) : v.toFixed(1));
  const rows = [["measure", "value"], ["periods", r.periods], ["conversion_rate", r.conversion.toFixed(4)], ["conversion_p10", r.conversionRange80[0].toFixed(4)], ["conversion_p90", r.conversionRange80[1].toFixed(4)],
    ["target_" + r.metric, r.target], ["planned_leads", r.plannedLeads], ["chance_of_reaching_target", r.probHit.toFixed(3)], ["outcome_p10", fmt(r.range80[0])], ["outcome_median", fmt(r.median)], ["outcome_p90", fmt(r.range80[1])],
    ["leads_for_50pct", r.leadsFor50 ?? ""], ["leads_for_80pct", r.leadsFor80 ?? ""], ["leads_for_90pct", r.leadsFor90 ?? ""]];
  return rows.map((x) => x.join(",")).join("\n") + "\n";
}

// Invented data for the "Load an example" button: about 11% of leads become customers, deals
// average near $2,400, and lead volume drifts between 40 and 70 a month.
export function sampleText() {
  const rand = mulberry32(11);
  const lines = ["period,leads,won,revenue"];
  for (let i = 0; i < 12; i++) {
    const leads = 40 + Math.floor(rand() * 31);
    const won = binomial(leads, 0.11, rand);
    const revenue = Math.round(won * (2100 + rand() * 600) / 10) * 10;
    lines.push(`2025-${String(i + 1).padStart(2, "0")},${leads},${won},${revenue}`);
  }
  return lines.join("\n");
}
