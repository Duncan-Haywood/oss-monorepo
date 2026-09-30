// Client rebooking predictor. Pure functions, no DOM, no network.
// Model (a "cure" mixture on each client's own rhythm):
//   gap between visits ~ lognormal(mu_c, sigma_c); mu_c is the client's mean log-gap shrunk toward
//   the shop-wide mean in proportion to how many gaps we have seen (empirical-Bayes weight).
//   After every visit a client comes back at some point with probability pi, or has silently gone
//   with probability 1 - pi. A client who has not been back for t days is still active with probability
//   pi*S(t) / (pi*S(t) + 1 - pi), S(t) = 1 - F_c(t). pi is found by maximum likelihood over every
//   client's history: each past visit that was followed by another, plus the open spell.
//   P(back within h days | t days quiet) = P(active) * (F(t+h) - F(t)) / S(t).
// A hold-out back-test re-fits at an earlier cut-off and scores who really came back.

export const num = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "n/a");
export const money = (v) => (Number.isFinite(v) ? (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "n/a");
export const pct = (v, d = 0) => (Number.isFinite(v) ? (v * 100).toFixed(d) + "%" : "n/a");

const MIN_CLIENTS = 30;
const MIN_GAPS = 40;
const MIN_SPAN_DAYS = 180;
const DAY = 86400000;

const moneyNum = (s) => {
  const t = String(s).trim().replace(/^\((.*)\)$/, "-$1").replace(/[$€£,\s]/g, "");
  if (t === "" || !/^-?\d*\.?\d+$/.test(t)) return NaN;
  return Number(t);
};

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
// Day number since 1970-01-01 (UTC), or NaN. Accepts 2026-03-07, 3/7/2026, 3/7/26, 7 Mar 2026, optional time.
export function parseDay(s) {
  const t = String(s).trim();
  let y, m, d, x;
  if ((x = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/))) { y = +x[1]; m = +x[2]; d = +x[3]; }
  else if ((x = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?:[T\s,].*)?$/))) {
    let a = +x[1], b = +x[2]; y = +x[3]; if (y < 100) y += 2000;
    if (a > 12 && b <= 12) { d = a; m = b; } else { m = a; d = b; }
  } else if ((x = t.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[a-z]*[\s-,]+(\d{4}|\d{2})/))) { d = +x[1]; m = MONTHS[x[2].toLowerCase()]; y = +x[3]; if (y < 100) y += 2000; }
  else if ((x = t.match(/^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{4})/))) { m = MONTHS[x[1].toLowerCase()]; d = +x[2]; y = +x[3]; }
  else return NaN;
  if (!m || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return NaN;
  const ms = Date.UTC(y, m - 1, d);
  const back = new Date(ms);
  if (back.getUTCMonth() !== m - 1) return NaN;
  return Math.round(ms / DAY);
}
export const dayToIso = (n) => new Date(n * DAY).toISOString().slice(0, 10);

// Rows: client, date[, amount]. A header row may reorder the columns by name.
export function parseRows(text) {
  const warnings = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Paste or upload rows of client, visit date and (optional) amount spent." };
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
  let ci = { client: 0, date: 1, amount: rows[0].length >= 3 ? 2 : -1 };
  const first = rows[0];
  if (Number.isNaN(parseDay(first[1] ?? "")) && Number.isNaN(parseDay(first[0] ?? "")) && Number.isNaN(parseDay(first[2] ?? ""))) {
    const head = first.map((h) => h.toLowerCase());
    const find = (re) => head.findIndex((h) => re.test(h));
    const dIdx = find(/date|day|visit|appointment|appt|when|time|service/);
    const cIdx = find(/client|customer|name|patient|member|email|phone|guest|id/);
    const aIdx = find(/amount|total|spend|spent|price|revenue|sales|paid|charge|\$|fee/);
    ci = { client: cIdx >= 0 ? cIdx : 0, date: dIdx >= 0 ? dIdx : 1, amount: aIdx >= 0 ? aIdx : head.length >= 3 ? 2 : -1 };
    if (ci.date === ci.client) ci.date = ci.client === 0 ? 1 : 0;
    if (ci.amount === ci.client || ci.amount === ci.date) ci.amount = -1;
    rows = rows.slice(1);
  }
  if ((rows[0]?.length || 0) < 2) return { error: "Each row needs at least a client (name, email or id) and a visit date." };
  const out = [];
  let bad = 0;
  for (const r of rows) {
    const client = String(r[ci.client] ?? "").trim().toLowerCase();
    const day = parseDay(r[ci.date] ?? "");
    if (!client || Number.isNaN(day)) { bad++; continue; }
    let amount = null;
    if (ci.amount >= 0) { const a = moneyNum(r[ci.amount] ?? ""); if (a >= 0) amount = a; }
    out.push({ client, day, amount });
  }
  if (bad) warnings.push(`${bad} row(s) were skipped because the client or the date could not be read.`);
  return { rows: out, hasAmount: out.length > 0 && out.every((r) => r.amount !== null) && ci.amount >= 0, warnings };
}

// ---------- maths ----------
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const erf = (x) => {
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
};
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
const cdf = (t, mu, sigma) => (t <= 0 ? 0 : Phi((Math.log(t) - mu) / sigma));

// Group rows by client; one visit per client per day (amounts summed).
export function groupVisits(rows) {
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.client)) by.set(r.client, new Map());
    const m = by.get(r.client);
    const cur = m.get(r.day);
    if (cur) cur.amount = cur.amount === null || r.amount === null ? (cur.amount ?? r.amount) : cur.amount + r.amount;
    else m.set(r.day, { day: r.day, amount: r.amount });
  }
  const out = new Map();
  for (const [c, m] of by) out.set(c, [...m.values()].sort((a, b) => a.day - b.day));
  return out;
}

// Fit the rhythm model using only visits on or before `asOf`.
export function fitModel(visitsByClient, asOf) {
  const clients = [];
  for (const [client, all] of visitsByClient) {
    const v = all.filter((x) => x.day <= asOf);
    if (!v.length) continue;
    const gaps = [];
    for (let i = 1; i < v.length; i++) gaps.push(Math.log(v[i].day - v[i - 1].day));
    clients.push({ client, visits: v, gaps, last: v[v.length - 1].day });
  }
  const allGaps = clients.flatMap((c) => c.gaps);
  if (allGaps.length < MIN_GAPS) return { error: `Need at least ${MIN_GAPS} return gaps (a client coming back) to learn your rhythm; found ${allGaps.length}.` };
  const mu0 = mean(allGaps);
  const varT = allGaps.reduce((s, g) => s + (g - mu0) ** 2, 0) / Math.max(1, allGaps.length - 1);
  // pooled within-client variance from clients with 2+ gaps
  let ss = 0, df = 0;
  for (const c of clients) if (c.gaps.length >= 2) { const m = mean(c.gaps); ss += c.gaps.reduce((s, g) => s + (g - m) ** 2, 0); df += c.gaps.length - 1; }
  let varW = df >= 10 ? ss / df : varT;
  varW = Math.max(varW, 0.01);
  const tau2 = Math.max(varT - varW, 0.01);
  const params = (c) => {
    const k = c.gaps.length;
    if (!k) return { mu: mu0, sigma: Math.sqrt(varW + tau2), k };
    const ybar = mean(c.gaps);
    const w = tau2 / (tau2 + varW / k);
    return { mu: w * ybar + (1 - w) * mu0, sigma: Math.sqrt(varW + (1 - w) * tau2), k };
  };
  for (const c of clients) { Object.assign(c, params(c)); c.quiet = Math.max(0, asOf - c.last); c.S = 1 - cdf(Math.max(c.quiet, 0.5), c.mu, c.sigma); }
  let bestPi = 0.5, bestLl = -Infinity;
  for (let p = 0.02; p <= 0.995; p += 0.005) {
    let ll = 0;
    for (const c of clients) ll += (c.visits.length - 1) * Math.log(p) + Math.log(p * c.S + (1 - p));
    if (ll > bestLl) { bestLl = ll; bestPi = p; }
  }
  return { clients, mu0, sigmaW: Math.sqrt(varW), sigmaT: Math.sqrt(varT), tau: Math.sqrt(tau2), pi: bestPi, asOf, medianGapDays: Math.exp(mu0), nGaps: allGaps.length };
}

// Probabilities for one fitted client at the model's as-of date.
export function predict(model, c, horizon) {
  const t = c.quiet;
  const S = Math.max(1 - cdf(Math.max(t, 0.5), c.mu, c.sigma), 1e-12);
  const pActive = (model.pi * S) / (model.pi * S + (1 - model.pi));
  const within = (cdf(t + horizon, c.mu, c.sigma) - cdf(Math.max(t, 0.5), c.mu, c.sigma)) / S;
  return { pActive, pBack: pActive * Math.min(1, Math.max(0, within)), expectedDay: c.last + Math.exp(c.mu), typicalGap: Math.exp(c.mu) };
}

function auc(scores, labels) {
  const pos = [], neg = [];
  scores.forEach((s, i) => (labels[i] ? pos : neg).push(s));
  if (!pos.length || !neg.length) return NaN;
  let wins = 0;
  for (const p of pos) for (const q of neg) wins += p > q ? 1 : p === q ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

function backtest(by, asOf, horizon) {
  const cut = asOf - horizon;
  const m = fitModel(by, cut);
  if (m.error) return null;
  const y = [], p = [], rec = [], freq = [];
  for (const c of m.clients) {
    const later = by.get(c.client).some((v) => v.day > cut && v.day <= asOf);
    y.push(later ? 1 : 0);
    p.push(predict(m, c, horizon).pBack);
    rec.push(-c.quiet);
    freq.push(-(c.quiet / Math.exp(c.mu)));
  }
  const n = y.length, base = mean(y);
  if (n < 30 || y.every((v) => v === y[0])) return null;
  const brier = mean(p.map((v, i) => (v - y[i]) ** 2));
  const brierBase = mean(y.map((v) => (base - v) ** 2));
  const order = p.map((_, i) => i).sort((a, b) => p[a] - p[b]);
  const groups = [0, 1, 2].map((k) => {
    const idx = order.slice(Math.floor((n * k) / 3), Math.floor((n * (k + 1)) / 3));
    return { n: idx.length, predicted: mean(idx.map((i) => p[i])), observed: mean(idx.map((i) => y[i])) };
  });
  const aucModel = auc(p, y), aucRecency = auc(rec, y);
  return { cutoff: cut, n, backRate: base, auc: aucModel, aucRecency, aucRelative: auc(freq, y), brier, brierBase, groups, pi: m.pi,
    helps: aucModel >= 0.6 && brier < brierBase - 0.002 };
}

export function analyze(rows, o = {}) {
  const warnings = [];
  const by = groupVisits(rows);
  const days = rows.map((r) => r.day);
  const first = Math.min(...days), lastDay = Math.max(...days);
  const asOf = Number.isFinite(o.asOf) ? o.asOf : lastDay;
  const span = asOf - first;
  if (by.size < MIN_CLIENTS) return { error: `Need at least ${MIN_CLIENTS} different clients; found ${by.size}. A rebooking rhythm learned from fewer is mostly noise.` };
  if (span < MIN_SPAN_DAYS) return { error: `The history only covers ${span} days. At least ${MIN_SPAN_DAYS} days are needed to see who has stopped coming back rather than who simply has not been due yet.` };
  const horizon = Number.isFinite(o.horizon) && o.horizon >= 7 ? Math.round(o.horizon) : 45;
  const model = fitModel(by, asOf);
  if (model.error) return { error: model.error };
  const hasAmount = o.hasAmount ?? rows.every((r) => r.amount !== null);
  const repeat = model.clients.filter((c) => c.visits.length >= 2).length;
  if (repeat / model.clients.length < 0.15) warnings.push(`Only ${pct(repeat / model.clients.length)} of clients have come back even once, so the model leans heavily on the shop-wide rhythm. Read individual rows as rough.`);
  if (model.sigmaW > 1.0) warnings.push("Gaps between visits are very irregular (a client's own intervals vary more than 2.7x). That is typical for one-off or seasonal services; 'overdue' will be a soft signal.");
  if (lastDay < asOf - 1) { /* as-of later than data: fine */ }
  const staleDays = Math.max(0, Math.round(Date.now() / DAY) - asOf);
  if (!Number.isFinite(o.asOf) && staleDays > 60) warnings.push(`Your newest visit is ${staleDays} days old. "Overdue" is measured from ${dayToIso(asOf)}, the latest date in the file, not from today. Export fresh data, or set the as-of date.`);

  const list = model.clients.map((c) => {
    const pr = predict(model, c, horizon);
    const amounts = c.visits.map((v) => v.amount).filter((a) => a !== null);
    const avg = amounts.length ? mean(amounts) : null;
    const lifetime = amounts.length ? amounts.reduce((s, a) => s + a, 0) : null;
    const ratio = c.quiet / pr.typicalGap;
    let segment;
    if (pr.pActive < 0.2) segment = "lost";
    else if (ratio >= 1.25 && c.visits.length >= 2) segment = "overdue";
    else if (ratio >= 0.85 || (c.visits.length === 1 && ratio >= 1)) segment = "due";
    else segment = "on track";
    const perYear = avg !== null ? avg * Math.min(365 / pr.typicalGap, 52) : null;
    return { client: c.client, visits: c.visits.length, last: c.last, quiet: c.quiet, typicalGap: pr.typicalGap, ratio, pActive: pr.pActive, pBack: pr.pBack,
      expectedDay: pr.expectedDay, avg, lifetime, perYear, segment, oneVisit: c.visits.length === 1 };
  });
  const seg = (s) => list.filter((r) => r.segment === s);
  const sum = (a, k) => a.reduce((t, r) => t + (r[k] ?? 0), 0);
  const overdue = seg("overdue").sort((a, b) => (b.pActive * (b.avg ?? 1)) - (a.pActive * (a.avg ?? 1)) || b.pActive - a.pActive);
  const due = seg("due").sort((a, b) => b.ratio - a.ratio);
  const lost = seg("lost").sort((a, b) => (b.lifetime ?? b.visits) - (a.lifetime ?? a.visits));
  const active = list.filter((r) => r.quiet <= 2 * r.typicalGap || r.pActive >= 0.5);
  const summary = {
    clients: list.length, repeat, asOf, horizon, pi: model.pi, medianGap: model.medianGapDays,
    counts: { onTrack: seg("on track").length, due: due.length, overdue: overdue.length, lost: lost.length },
    overdueValuePerVisit: hasAmount ? overdue.reduce((t, r) => t + r.pActive * (r.avg ?? 0), 0) : null,
    overdueValuePerYear: hasAmount ? overdue.reduce((t, r) => t + r.pActive * (r.perYear ?? 0), 0) : null,
    lostValuePerYear: hasAmount ? sum(lost, "perYear") : null,
    activeShare: active.length / list.length,
  };
  const test = backtest(by, asOf, horizon);
  let verdict;
  if (!test) verdict = "unverified";
  else if (test.helps && test.auc >= 0.65) verdict = "usable";
  else if (test.auc >= 0.55) verdict = "weak";
  else verdict = "unidentified";
  if (verdict === "unidentified") warnings.push("On the back-test the ranking was barely better than a coin flip. Do not use 'overdue' to decide who to contact.");
  return { summary, overdue, due, lost, list, test, verdict, warnings, hasAmount, model: { mu0: model.mu0, sigmaW: model.sigmaW, sigmaT: model.sigmaT, pi: model.pi } };
}

// Simulated salon: 220 clients, lognormal personal rhythms, a third quietly leave.
export function sampleText() {
  let a = 11;
  const rng = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const start = Date.UTC(2025, 0, 6) / DAY, end = Date.UTC(2026, 8, 25) / DAY;
  const lines = ["client,date,amount"];
  for (let i = 0; i < 220; i++) {
    const joins = start + Math.floor(rng() * (end - start - 60));
    const mu = Math.log(25 + rng() * 55), price = Math.round((45 + rng() * 110) / 5) * 5;
    const leaveAt = rng() < 0.35 ? joins + 40 + rng() * 300 : Infinity;
    let d = joins;
    while (d <= end && d < leaveAt) {
      lines.push(`C${String(i + 1).padStart(3, "0")},${dayToIso(Math.round(d))},${price + Math.round(gauss() * 6)}`);
      d += Math.max(7, Math.exp(mu + 0.22 * gauss()));
    }
  }
  return lines.join("\n");
}

export function reportCsv(r) {
  const head = "client,segment,visits,last_visit,days_quiet,typical_gap_days,chance_still_active,chance_back_within_window,avg_spend,est_value_per_year";
  const all = [...r.overdue, ...r.due, ...r.lost];
  const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [head, ...all.map((c) => [q(c.client), c.segment, c.visits, dayToIso(c.last), Math.round(c.quiet), Math.round(c.typicalGap), c.pActive.toFixed(3), c.pBack.toFixed(3), c.avg === null ? "" : c.avg.toFixed(2), c.perYear === null ? "" : c.perYear.toFixed(0)].join(","))].join("\n");
}
