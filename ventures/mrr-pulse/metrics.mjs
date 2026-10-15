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
