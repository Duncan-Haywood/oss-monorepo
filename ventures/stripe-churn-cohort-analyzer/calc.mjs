// Subscription CSV analysis: MRR waterfall, churn and cohort retention from a
// Stripe "subscriptions" export (or any CSV with a customer, start date,
// optional end date and an amount). Pure functions, no DOM, no network.

export const INTERVAL_MONTHS = { day: 1 / 30.4375, week: 12 / 52, month: 1, year: 12 };

const ALIASES = {
  id: ["id", "subscription id", "subscription", "subscription_id"],
  customer: ["customer id", "customer", "customer_id", "customer email", "email"],
  status: ["status"],
  start: ["start date (utc)", "start date", "created (utc)", "created", "start", "started", "start_date"],
  end: ["ended at (utc)", "ended at", "canceled at (utc)", "canceled at", "cancelled at", "cancel date", "end date", "end", "ended", "ended_at", "canceled_at"],
  amount: ["amount", "mrr", "price", "plan amount", "unit amount", "monthly amount", "amount_usd"],
  interval: ["interval", "billing interval", "plan interval", "billing_interval", "period"],
  intervalCount: ["interval count", "interval_count"],
  quantity: ["quantity", "seats", "qty"],
  plan: ["plan", "plan name", "product", "price id", "plan_name"],
};

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const src = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

export function parseDate(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  let iso = s;
  if (/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/.test(s)) iso = s.replace(" ", "T") + (s.length > 10 ? "" : "T00:00:00") + "Z";
  else if (/^\d{9,10}$/.test(s)) return new Date(Number(s) * 1000);
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function monthKey(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function monthIndex(d) { return d.getUTCFullYear() * 12 + d.getUTCMonth(); }
export function keyOfIndex(i) { return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`; }
// First instant after month index i.
function endOfIndex(i) { return new Date(Date.UTC(Math.floor((i + 1) / 12), (i + 1) % 12, 1)); }

function findColumns(header) {
  const norm = header.map((h) => h.trim().toLowerCase());
  const cols = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const at = norm.indexOf(n);
      if (at !== -1) { cols[field] = at; break; }
    }
  }
  return cols;
}

// Returns { subs, skipped, columns } where each sub is
// { id, customer, plan, start: Date, end: Date|null, mrr }.
export function normalizeRows(table) {
  if (!table.length) return { subs: [], skipped: [], columns: {}, error: "The file is empty." };
  const header = table[0];
  const cols = findColumns(header);
  if (cols.start === undefined) return { subs: [], skipped: [], columns: cols, error: "No start/created date column found. Expected a header like “Start Date (UTC)” or “Created (UTC)”." };
  if (cols.amount === undefined) return { subs: [], skipped: [], columns: cols, error: "No amount column found. Expected a header like “Amount” or “MRR”." };
  const subs = [], skipped = [];
  for (let r = 1; r < table.length; r++) {
    const line = table[r];
    const get = (f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
    const start = parseDate(get("start"));
    const amount = Number(get("amount").replace(/[$,\s]/g, ""));
    if (!start) { skipped.push({ line: r + 1, reason: "unreadable start date" }); continue; }
    if (!Number.isFinite(amount) || get("amount") === "") { skipped.push({ line: r + 1, reason: "unreadable amount" }); continue; }
    let end = parseDate(get("end"));
    const status = get("status").toLowerCase();
    if (end && end < start) { skipped.push({ line: r + 1, reason: "end date before start date" }); continue; }
    if (!end && ["canceled", "cancelled", "incomplete_expired"].includes(status)) {
      skipped.push({ line: r + 1, reason: `status ${status} but no end date` });
      continue;
    }
    if (status === "incomplete_expired" || status === "incomplete") { skipped.push({ line: r + 1, reason: "never became a paid subscription" }); continue; }
    const iv = get("interval").toLowerCase().replace(/ly$/, "").replace(/s$/, "");
    const per = INTERVAL_MONTHS[iv] ?? (get("interval") === "" ? 1 : null);
    if (per === null) { skipped.push({ line: r + 1, reason: `unknown interval “${get("interval")}”` }); continue; }
    const count = Number(get("intervalCount")) || 1;
    const qty = cols.quantity === undefined ? 1 : Number(get("quantity")) || 1;
    subs.push({
      id: get("id") || `row-${r + 1}`,
      customer: get("customer") || get("id") || `row-${r + 1}`,
      plan: get("plan") || "(no plan column)",
      start, end,
      mrr: (amount * qty) / (per * count),
    });
  }
  return { subs, skipped, columns: cols, error: subs.length ? null : "No usable subscription rows were found." };
}

function activeAt(sub, instant) {
  return sub.start < instant && (!sub.end || sub.end >= instant);
}

export function analyze(subs, { asOf = null } = {}) {
  if (!subs.length) return { invalid: "No subscriptions to analyze." };
  const first = Math.min(...subs.map((s) => monthIndex(s.start)));
  const lastData = Math.max(...subs.map((s) => monthIndex(s.end ?? s.start)));
  const nowIdx = asOf ? monthIndex(asOf) : Math.max(monthIndex(new Date(Math.max(...subs.map((s) => (s.end ?? s.start).getTime())))), lastData);
  const months = [];
  for (let i = first; i <= nowIdx; i++) {
    const closeAt = endOfIndex(i), openAt = endOfIndex(i - 1);
    const act = subs.filter((s) => activeAt(s, closeAt));
    const opening = subs.filter((s) => activeAt(s, openAt));
    const started = subs.filter((s) => monthIndex(s.start) === i);
    const ended = subs.filter((s) => s.end && monthIndex(s.end) === i);
    const sum = (a) => a.reduce((t, s) => t + s.mrr, 0);
    months.push({
      key: keyOfIndex(i), index: i,
      startMrr: sum(opening), newMrr: sum(started), churnedMrr: sum(ended), endMrr: sum(act),
      startCustomers: opening.length, newCustomers: started.length, churnedCustomers: ended.length, endCustomers: act.length,
    });
  }
  // Same-month start+end is counted in both new and churned so the waterfall reconciles.
  for (const m of months) {
    const recon = m.startMrr + m.newMrr - m.churnedMrr;
    m.reconciles = Math.abs(recon - m.endMrr) < 0.01;
  }

  // Cohorts by start month: share of subscriptions (and MRR) still active k months on.
  const cohorts = [];
  for (let i = first; i <= nowIdx; i++) {
    const members = subs.filter((s) => monthIndex(s.start) === i);
    if (!members.length) continue;
    const mrr0 = members.reduce((t, s) => t + s.mrr, 0);
    const logo = [], revenue = [];
    for (let k = 0; i + k <= nowIdx; k++) {
      const alive = members.filter((s) => activeAt(s, endOfIndex(i + k)));
      logo.push(alive.length / members.length);
      revenue.push(alive.reduce((t, s) => t + s.mrr, 0) / mrr0);
    }
    cohorts.push({ key: keyOfIndex(i), size: members.length, mrr: mrr0, logo, revenue });
  }

  const recent = months.slice(-4, -1).length >= 1 ? months.slice(-4, -1) : months.slice(-1); // last 3 complete months
  const rate = (arr, num, den) => {
    const d = arr.reduce((t, m) => t + m[den], 0);
    return d > 0 ? arr.reduce((t, m) => t + m[num], 0) / d : 0;
  };
  const last = months[months.length - 1];
  const logoChurn = rate(recent, "churnedCustomers", "startCustomers");
  const revenueChurn = rate(recent, "churnedMrr", "startMrr");
  const newSum = recent.reduce((t, m) => t + m.newMrr, 0), lostSum = recent.reduce((t, m) => t + m.churnedMrr, 0);
  const arpa = last.endCustomers ? last.endMrr / last.endCustomers : 0;
  const summary = {
    currentMrr: last.endMrr, currentCustomers: last.endCustomers, arpa,
    logoChurn, revenueChurn,
    lifetimeMonths: logoChurn > 0 ? 1 / logoChurn : null,
    revenueLtv: logoChurn > 0 ? arpa / logoChurn : null,
    quickRatio: lostSum > 0 ? newSum / lostSum : null,
    windowLabel: recent.length === 1 ? recent[0].key : `${recent[0].key} to ${recent[recent.length - 1].key}`,
    firstMonth: months[0].key, lastMonth: last.key,
  };

  // Where do cancellations happen: tenure at end, in months.
  const ended = subs.filter((s) => s.end);
  const tenures = ended.map((s) => monthIndex(s.end) - monthIndex(s.start));
  const early = tenures.filter((t) => t <= 2).length;

  const findings = [];
  if (ended.length >= 10 && early / ended.length >= 0.4) {
    findings.push({ severity: "high", title: "Most churn happens in the first three months", detail: `${early} of ${ended.length} cancellations (${Math.round((100 * early) / ended.length)}%) came within 2 months of starting. That points at onboarding and fit, not at the long-run product; fixing the first weeks moves the number most.` });
  }
  const trailing = months.slice(-7, -1);
  if (trailing.length === 6) {
    const a = rate(trailing.slice(0, 3), "churnedCustomers", "startCustomers"), b = rate(trailing.slice(3), "churnedCustomers", "startCustomers");
    if (a > 0 && b / a >= 1.4) findings.push({ severity: "high", title: "Churn is rising", detail: `Monthly logo churn averaged ${(a * 100).toFixed(1)}% across the three months before ${trailing[3].key} and ${(b * 100).toFixed(1)}% since. Check what changed: pricing, a cohort acquired from one channel, or a competitor.` });
    if (b > 0 && a / b >= 1.4) findings.push({ severity: "info", title: "Churn is falling", detail: `Monthly logo churn fell from ${(a * 100).toFixed(1)}% to ${(b * 100).toFixed(1)}% over the last six months.` });
  }
  const live = subs.filter((s) => activeAt(s, endOfIndex(nowIdx)));
  const top = live.slice().sort((x, y) => y.mrr - x.mrr)[0];
  if (top && last.endMrr > 0 && live.length >= 5 && top.mrr / last.endMrr >= 0.2) {
    findings.push({ severity: "medium", title: "One subscription is over 20% of MRR", detail: `${top.customer} accounts for ${(100 * top.mrr / last.endMrr).toFixed(0)}% of current MRR. Losing it would cost more than your typical quarter of new sales.` });
  }
  const byPlan = new Map();
  for (const s of subs) {
    const p = byPlan.get(s.plan) ?? { plan: s.plan, total: 0, ended: 0 };
    p.total++; if (s.end) p.ended++;
    byPlan.set(s.plan, p);
  }
  const plans = [...byPlan.values()].filter((p) => p.total >= 10).map((p) => ({ ...p, rate: p.ended / p.total })).sort((x, y) => y.rate - x.rate);
  if (plans.length >= 2 && plans[0].rate - plans[plans.length - 1].rate >= 0.25) {
    findings.push({ severity: "medium", title: "Cancellation rates differ a lot between plans", detail: `${plans[0].plan}: ${Math.round(plans[0].rate * 100)}% of subscriptions have ended, against ${Math.round(plans[plans.length - 1].rate * 100)}% on ${plans[plans.length - 1].plan}. The gap is a pricing or fit signal worth a look.` });
  }
  if (!findings.length) findings.push({ severity: "info", title: "No strong pattern flagged", detail: "Nothing in this export crosses the tool’s thresholds (early-life churn, rising churn, concentration, plan gaps). Read the cohort table before drawing conclusions." });
  return { months, cohorts, summary, findings, plans, tenureEndedCount: ended.length };
}

// Month index the analysis treats as "now" (same rule analyze() uses).
function nowIndex(subs, asOf) {
  if (asOf) return monthIndex(asOf);
  return Math.max(monthIndex(new Date(Math.max(...subs.map((s) => (s.end ?? s.start).getTime())))), Math.max(...subs.map((s) => monthIndex(s.end ?? s.start))));
}

// Monthly logo churn for one plan (or "all") over the last three complete months.
export function planChurn(subs, plan = "all", { asOf = null } = {}) {
  const pool = plan === "all" ? subs : subs.filter((s) => s.plan === plan);
  if (!pool.length) return 0;
  const now = nowIndex(subs, asOf);
  let gone = 0, base = 0;
  for (let i = now - 3; i < now; i++) {
    const open = endOfIndex(i - 1);
    base += pool.filter((s) => activeAt(s, open)).length;
    gone += pool.filter((s) => s.end && monthIndex(s.end) === i).length;
  }
  return base > 0 ? gone / base : 0;
}

const annuity = (x, months) => { let t = 0; for (let k = 1; k <= months; k++) t += Math.pow(1 - x, k); return t; };

// What a price rise does to recurring revenue over `months`, for the live subscriptions on one plan.
// increasePct: the rise, e.g. 15. extraLossPct: share of affected subscriptions that cancel as a direct
// result, right away. churnLiftPts: extra monthly churn points on the survivors for the whole horizon.
// breakevenLossPct is the extra-cancellation share at which the rise stops paying over the horizon.
export function simulatePriceIncrease(subs, { plan = "all", increasePct = 10, extraLossPct = 5, churnLiftPts = 0, months = 12, asOf = null } = {}) {
  if (!subs.length) return { invalid: "No subscriptions to simulate." };
  const now = nowIndex(subs, asOf);
  const instant = endOfIndex(now);
  const live = subs.filter((s) => activeAt(s, instant) && (plan === "all" || s.plan === plan));
  if (!live.length) return { invalid: "No active subscriptions on that plan." };
  const p = Math.max(0, increasePct) / 100, e = Math.min(100, Math.max(0, extraLossPct)) / 100;
  const lift = Math.max(0, churnLiftPts) / 100;
  const base = Math.min(0.99, planChurn(subs, plan, { asOf }) || planChurn(subs, "all", { asOf }));
  const mrr0 = live.reduce((t, s) => t + s.mrr, 0);
  const sBase = annuity(base, months), sNew = annuity(Math.min(0.99, base + lift), months);
  const without = mrr0 * sBase;
  const withRise = mrr0 * (1 - e) * (1 + p) * sNew;
  const breakeven = p > 0 && sNew > 0 ? Math.max(0, 1 - sBase / ((1 + p) * sNew)) : 0;
  const path = [];
  for (let k = 1; k <= months; k++) path.push({ month: k, without: mrr0 * Math.pow(1 - base, k), withRise: mrr0 * (1 - e) * (1 + p) * Math.pow(1 - Math.min(0.99, base + lift), k) });
  return {
    plan, subscriptions: live.length, currentMrr: mrr0, baselineChurn: base,
    newMrr: mrr0 * (1 - e) * (1 + p), withoutRevenue: without, withRevenue: withRise, delta: withRise - without,
    breakevenLossPct: breakeven * 100, pays: withRise >= without, path, months,
  };
}

// What cutting monthly logo churn is worth. Projects MRR forward `months` with the recent monthly
// churn and recent new MRR held flat, then again with churn lowered by `reductionPts` points.
// New MRR is the average over the last three complete months. Arithmetic on stated assumptions,
// not a forecast: it ignores expansion, seasonality and any change in what it costs to win customers.
export function simulateChurnReduction(subs, { reductionPts = 1, months = 12, asOf = null } = {}) {
  if (!subs.length) return { invalid: "No subscriptions to project." };
  const now = nowIndex(subs, asOf);
  const mrr0 = subs.filter((s) => activeAt(s, endOfIndex(now))).reduce((t, s) => t + s.mrr, 0);
  if (!(mrr0 > 0)) return { invalid: "No active subscriptions to project." };
  const base = Math.min(0.99, planChurn(subs, "all", { asOf }));
  const better = Math.max(0, base - Math.max(0, reductionPts) / 100);
  let added = 0;
  for (let i = now - 3; i < now; i++) added += subs.filter((s) => monthIndex(s.start) === i).reduce((t, s) => t + s.mrr, 0);
  const newMrr = added / 3;
  const project = (c) => { let m = mrr0; const path = []; for (let k = 1; k <= months; k++) { m = m * (1 - c) + newMrr; path.push({ month: k, mrr: m }); } return path; };
  const without = project(base), withCut = project(better);
  const last = (a) => a[a.length - 1].mrr;
  return {
    currentMrr: mrr0, baselineChurn: base, reducedChurn: better, newMrrPerMonth: newMrr, months,
    baselineMrr: last(without), reducedMrr: last(withCut),
    mrrGain: last(withCut) - last(without), arrGain: 12 * (last(withCut) - last(without)),
    cumulativeGain: withCut.reduce((t, p, i) => t + p.mrr - without[i].mrr, 0),
    lifetimeBase: base > 0 ? 1 / base : null, lifetimeReduced: better > 0 ? 1 / better : null,
    path: without.map((p, i) => ({ month: p.month, without: p.mrr, withCut: withCut[i].mrr })),
  };
}

// Deterministic demo data so the example is reproducible.
export function sampleCsv() {
  let seed = 20260929;
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const plans = [["Starter", 19], ["Pro", 49], ["Team", 129]];
  const lines = ["id,Customer ID,Status,Start Date (UTC),Canceled At (UTC),Plan,Amount,Interval"];
  const asOf = Date.UTC(2026, 8, 15);
  let n = 0;
  for (let m = 0; m < 20; m++) {
    const perMonth = 6 + Math.floor(m * 0.9) + Math.floor(rnd() * 4);
    for (let j = 0; j < perMonth; j++) {
      const [plan, amt] = plans[rnd() < 0.55 ? 0 : rnd() < 0.75 ? 1 : 2];
      const start = Date.UTC(2025, 0 + m, 1 + Math.floor(rnd() * 27));
      const monthlyHazard = plan === "Starter" ? 0.09 : plan === "Pro" ? 0.045 : 0.025;
      let life = 0; while (rnd() > monthlyHazard && life < 40) life++;
      const early = rnd() < 0.12;
      const months = early ? 1 : life;
      const end = start + months * 30.4375 * 864e5 + rnd() * 5 * 864e5;
      n++;
      const yearly = plan === "Pro" && rnd() < 0.2;
      const fmt = (t) => new Date(t).toISOString().slice(0, 10);
      const canceled = end < asOf && months < 40;
      lines.push(`sub_${String(n).padStart(4, "0")},cus_${String(n).padStart(4, "0")},${canceled ? "canceled" : "active"},${fmt(start)},${canceled ? fmt(end) : ""},${plan},${yearly ? amt * 10 : amt},${yearly ? "year" : "month"}`);
    }
  }
  return lines.join("\n");
}

export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
export const pct = (x, d = 1) => (x * 100).toFixed(d) + "%";
