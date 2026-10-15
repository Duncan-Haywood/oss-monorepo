// Pure MRR maths, shared by the server and the browser demo. No Node imports.
// A "sub" is {id, mrr, status, created, endedAt, currency}: mrr in minor units
// per month, created/endedAt in ms (endedAt null while alive).

const DAYS_PER_MONTH = 30.4375;
const PER_MONTH = { day: DAYS_PER_MONTH, week: DAYS_PER_MONTH / 7, month: 1, year: 1 / 12 };

// Minor units per month for one price line. Unknown intervals count as 0
// rather than guessing, so a bad row cannot inflate the headline number.
export function monthlyAmount(amount, interval, intervalCount = 1, quantity = 1) {
  const f = PER_MONTH[interval];
  const n = Math.max(1, Number(intervalCount) || 1);
  if (f === undefined || !Number.isFinite(Number(amount))) return 0;
  return Math.round((Number(amount) * Math.max(0, Number(quantity) || 0) * f) / n);
}

// Statuses that are paying (or about to be retried) right now. Trials, paused
// and unpaid subscriptions are not revenue yet.
export const COUNTED = new Set(["active", "past_due"]);

export function liveMap(subs, { countPastDue = true } = {}) {
  const out = {};
  for (const s of subs) {
    const ok = s.status === "active" || (countPastDue && s.status === "past_due");
    if (ok && s.mrr > 0) out[s.id] = s.mrr;
  }
  return out;
}

// What each sub was worth at instant t, using today's price: Stripe's list API
// has no price history, so a backfill can show new and churned MRR but never
// expansion or contraction. The server marks these months approximate.
export function mapAt(subs, t) {
  const out = {};
  for (const s of subs) {
    if (!(s.mrr > 0) || !s.created || s.created > t) continue;
    if (s.endedAt && s.endedAt <= t) continue;
    if (!s.endedAt && !["active", "past_due", "canceled", "incomplete_expired"].includes(s.status)) continue;
    out[s.id] = s.mrr;
  }
  return out;
}

// Movement between two {id: mrr} maps. `ever` (a set-like object of ids seen
// before) separates a returning customer from a new one.
export function movements(prev, cur, ever = {}) {
  const m = { new: 0, expansion: 0, contraction: 0, churn: 0, reactivation: 0, newCount: 0, churnCount: 0, reactivationCount: 0 };
  for (const [id, v] of Object.entries(cur)) {
    const p = prev[id];
    if (p === undefined) {
      if (ever[id]) { m.reactivation += v; m.reactivationCount++; } else { m.new += v; m.newCount++; }
    } else if (v > p) m.expansion += v - p;
    else if (v < p) m.contraction += p - v;
  }
  for (const [id, p] of Object.entries(prev)) if (cur[id] === undefined) { m.churn += p; m.churnCount++; }
  return m;
}

const sum = (map) => Object.values(map).reduce((a, b) => a + b, 0);
export const ym = (t) => new Date(t).toISOString().slice(0, 7);

// Month-end instants for the n months up to and including the current one
// (the current month ends "now").
export function monthEnds(now, n) {
  const d = new Date(now);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const end = i === 0 ? now : Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i + 1, 1) - 1;
    out.push({ month: ym(end), t: end });
  }
  return out;
}

const emptyMonth = (month) => ({ month, mrr: 0, customers: 0, new: 0, expansion: 0, contraction: 0, churn: 0, reactivation: 0, newCount: 0, churnCount: 0, reactivationCount: 0, startMrr: 0, startCustomers: 0, approximate: false });

// Build the whole history from a subscription list alone.
export function backfill(subs, now, months = 12) {
  const ever = {};
  const out = [];
  const d0 = new Date(now);
  let prev = mapAt(subs, Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() - months + 1, 1) - 1);
  for (const id of Object.keys(prev)) ever[id] = 1;
  for (const { month, t } of monthEnds(now, months)) {
    const cur = mapAt(subs, t);
    const row = { ...emptyMonth(month), ...movements(prev, cur, ever), mrr: sum(cur), customers: Object.keys(cur).length, startMrr: sum(prev), startCustomers: Object.keys(prev).length, approximate: true };
    for (const id of Object.keys(cur)) ever[id] = 1;
    out.push(row);
    prev = cur;
  }
  return { months: out, last: prev, ever };
}

// Live update: fold the change since the last sync into the current month.
export function applySync(state, cur, now) {
  const month = ym(now);
  const row = state.months[month] || (state.months[month] = { ...emptyMonth(month), startMrr: sum(state.last), startCustomers: Object.keys(state.last).length });
  const m = movements(state.last, cur, state.ever);
  for (const k of Object.keys(m)) row[k] += m[k];
  row.mrr = sum(cur); row.customers = Object.keys(cur).length; row.approximate = false;
  for (const id of Object.keys(cur)) state.ever[id] = 1;
  state.last = cur; state.lastSyncAt = now;
  return m;
}

const pct = (a, b) => (b > 0 ? a / b : null);

export function summarize(months) {
  if (!months.length) return null;
  const cur = months[months.length - 1];
  const prior = months.length > 1 ? months[months.length - 2] : null;
  // Rates use the last *complete* month when there is one, because the
  // current month is only partly observed.
  const base = prior || cur;
  const start = base.startMrr;
  return {
    month: cur.month, mrr: cur.mrr, arr: cur.mrr * 12, customers: cur.customers,
    arpa: cur.customers ? Math.round(cur.mrr / cur.customers) : 0,
    netNew: cur.new + cur.expansion + cur.reactivation - cur.contraction - cur.churn,
    growthPct: prior && prior.mrr > 0 ? (cur.mrr - prior.mrr) / prior.mrr : null,
    rates: {
      basis: base.month,
      logoChurn: pct(base.churnCount, base.startCustomers),
      revenueChurn: pct(base.churn, start),
      nrr: start > 0 ? (start + base.expansion - base.contraction - base.churn) / start : null,
      grr: start > 0 ? (start - base.contraction - base.churn) / start : null,
      quickRatio: base.contraction + base.churn > 0 ? (base.new + base.expansion + base.reactivation) / (base.contraction + base.churn) : null,
    },
  };
}

export function formatMoney(minor, currency = "usd") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: String(currency).toUpperCase(), maximumFractionDigits: 0 }).format(minor / 100);
  } catch { return `${(minor / 100).toFixed(0)} ${currency}`; }
}

// Signup-month cohorts: of the subscriptions that started in each of the last
// `months` months, how many (and how much of their MRR) were still alive at the
// end of month 0, 1, 2 ... Uses start and end dates only, so logo retention is
// exact; revenue retention uses today's price for every subscription (marked
// approximate in the README). Trials and paused subscriptions are left out.
export function cohorts(subs, now, months = 12) {
  const rows = [];
  const ends = monthEnds(now, months);
  const eligible = subs.filter((s) => s.mrr > 0 && s.created && ["active", "past_due", "canceled", "incomplete_expired"].includes(s.status));
  for (let i = 0; i < ends.length; i++) {
    const members = eligible.filter((s) => ym(s.created) === ends[i].month);
    if (!members.length) { rows.push({ month: ends[i].month, size: 0, mrr: 0, logo: [], revenue: [] }); continue; }
    const mrr = members.reduce((a, s) => a + s.mrr, 0);
    const logo = [], revenue = [];
    for (let k = i; k < ends.length; k++) {
      const alive = members.filter((s) => !s.endedAt || s.endedAt > ends[k].t);
      logo.push(alive.length / members.length);
      revenue.push(alive.reduce((a, s) => a + s.mrr, 0) / mrr);
    }
    rows.push({ month: ends[i].month, size: members.length, mrr, logo, revenue });
  }
  return rows;
}

// Where today's MRR sits: by plan (price nickname, else product) and by
// customer. Counts the same subscriptions as liveMap, so the plan totals add up
// to the headline MRR. atRisk is the past-due slice of that total (failed
// payments still being retried): revenue to chase before it becomes churn. A customer with two subscriptions is one customer.
export function breakdown(subs, { countPastDue = true, top = 5 } = {}) {
  const plans = {}, customers = {};
  let total = 0, atRisk = 0, atRiskSubs = 0;
  for (const s of subs) {
    const ok = s.status === "active" || (countPastDue && s.status === "past_due");
    if (!ok || !(s.mrr > 0)) continue;
    total += s.mrr;
    if (s.status === "past_due") { atRisk += s.mrr; atRiskSubs++; }
    const lines = s.plans && Object.keys(s.plans).length ? s.plans : { "(unnamed)": s.mrr };
    for (const [k, v] of Object.entries(lines)) {
      const e = (plans[k] ||= { plan: k, mrr: 0, subs: 0 });
      e.mrr += v; e.subs++;
    }
    const c = s.customer || s.id;
    customers[c] = (customers[c] || 0) + s.mrr;
  }
  const byPlan = Object.values(plans).sort((a, b) => b.mrr - a.mrr).map((p) => ({ ...p, share: total ? p.mrr / total : 0 }));
  const ranked = Object.entries(customers).sort((a, b) => b[1] - a[1]);
  const share = (n) => (total ? ranked.slice(0, n).reduce((a, [, v]) => a + v, 0) / total : 0);
  return { total, atRisk: { mrr: atRisk, subs: atRiskSubs, share: total ? atRisk / total : 0 }, plans: byPlan, concentration: { customers: ranked.length, top1: share(1), top5: share(top), topN: top, largest: ranked[0]?.[1] || 0 } };
}

// Run-rate projection, not a prediction. Takes up to the last `window`
// complete months (the current month is only partly observed), turns each
// into monthly rates (churn, contraction and expansion as a share of starting
// MRR; new + reactivation as an amount), and rolls MRR forward `horizon`
// months. "base" uses the averages, "low" the worst month's rates, "high" the
// best month's. Returns null with fewer than two usable complete months.
export function forecast(months, { horizon = 6, window = 3 } = {}) {
  if (months.length < 2) return null;
  const cur = months[months.length - 1];
  const usable = months.slice(0, -1).filter((m) => m.startMrr > 0).slice(-window);
  if (usable.length < 2) return null;
  const rows = usable.map((m) => ({
    adds: m.new + m.reactivation,
    loss: (m.churn + m.contraction) / m.startMrr,
    exp: m.expansion / m.startMrr,
  }));
  const avg = (k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
  const scenarios = {
    base: { adds: avg("adds"), loss: avg("loss"), exp: avg("exp") },
    low: { adds: Math.min(...rows.map((r) => r.adds)), loss: Math.max(...rows.map((r) => r.loss)), exp: Math.min(...rows.map((r) => r.exp)) },
    high: { adds: Math.max(...rows.map((r) => r.adds)), loss: Math.min(...rows.map((r) => r.loss)), exp: Math.max(...rows.map((r) => r.exp)) },
  };
  const [y, mo] = cur.month.split("-").map(Number);
  const labels = Array.from({ length: horizon }, (_, i) => new Date(Date.UTC(y, mo - 1 + i + 1, 1)).toISOString().slice(0, 7));
  const out = { basis: usable.map((m) => m.month), startMrr: cur.mrr, months: labels };
  for (const [name, s] of Object.entries(scenarios)) {
    let mrr = cur.mrr;
    out[name] = labels.map(() => (mrr = Math.max(0, Math.round(mrr * (1 + s.exp - s.loss) + s.adds))));
  }
  return out;
}

// Monthly history as CSV for a spreadsheet, an accountant or an investor deck.
// Money is in major units (12.34), one row per month, oldest first. Months
// rebuilt from dates at today's prices are flagged in the `approximate` column.
// Any cell that could be read as a formula is prefixed with a quote.
export function monthsCsv(months, currency = "usd") {
  const head = ["month", "mrr", "customers", "new", "expansion", "reactivation", "contraction", "churn", "approximate"];
  const major = (v) => (v / 100).toFixed(2);
  const rows = months.map((m) => [m.month, major(m.mrr), m.customers, major(m.new), major(m.expansion), major(m.reactivation), major(m.contraction), major(m.churn), m.approximate ? "yes" : "no"]);
  const cell = (v) => { const s = String(v); return /^[=+\-@\t\r]/.test(s) ? `'${s}` : /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return `# currency: ${String(currency).toUpperCase()}, amounts in major units\n` + [head, ...rows].map((r) => r.map(cell).join(",")).join("\n") + "\n";
}
