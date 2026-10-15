// Referral accounting. Pure functions over a plain-object state, no I/O, no
// Node-only imports: the same file drives the server and the browser simulator.
//
// Money is integer minor units (cents). Every sum is grouped by currency, because
// a 20% commission on 49 USD and on 49 JPY are not addable.

export const DEFAULT_POLICY = {
  rate: 0.2, // share of the amount paid, before tax
  months: 12, // commission window from the customer's first paid invoice; 0 = lifetime
  holdDays: 30, // an entry becomes payable this long after the charge (refund window)
  minPayoutCents: 5000, // per currency; smaller balances roll over
  cookieDays: 60, // how long the browser snippet remembers a referral link
};

const DAY = 86400000;
const clamp = (n, lo, hi, dflt) => (Number.isFinite(Number(n)) ? Math.min(hi, Math.max(lo, Number(n))) : dflt);

export function mergePolicy(over = {}) {
  const p = { ...DEFAULT_POLICY, ...over };
  return {
    rate: clamp(p.rate, 0.01, 0.5, DEFAULT_POLICY.rate),
    months: Math.round(clamp(p.months, 0, 120, DEFAULT_POLICY.months)),
    holdDays: Math.round(clamp(p.holdDays, 0, 120, DEFAULT_POLICY.holdDays)),
    minPayoutCents: Math.round(clamp(p.minPayoutCents, 0, 10_000_000, DEFAULT_POLICY.minPayoutCents)),
    cookieDays: Math.round(clamp(p.cookieDays, 1, 365, DEFAULT_POLICY.cookieDays)),
  };
}

export const newState = () => ({ affiliates: {}, customers: {}, entries: [], payouts: [], clicks: {}, seen: [] });

export const CODE_RE = /^[a-z0-9][a-z0-9_-]{2,23}$/;
export const REF_PREFIX = "rk_";

// A referral code travels in Stripe as `client_reference_id=rk_<code>` or
// metadata.referral=<code>. Anything else is ignored, never trusted.
export function extractCode(obj) {
  const raw = obj?.client_reference_id?.startsWith?.(REF_PREFIX) ? obj.client_reference_id.slice(REF_PREFIX.length) : obj?.metadata?.referral;
  const code = String(raw || "").toLowerCase().trim();
  return CODE_RE.test(code) ? code : null;
}

export function addMonths(ms, months) {
  const d = new Date(ms);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.getTime();
}

export function slugify(name) {
  return String(name || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 16);
}

export function createAffiliate(state, { name, email, code, rate, rand = () => Math.random().toString(36).slice(2, 6) }, now) {
  const clean = { name: String(name || "").trim().slice(0, 80), email: String(email || "").trim().toLowerCase().slice(0, 120) };
  if (!clean.name) return { error: "name is required" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean.email)) return { error: "a valid email is required" };
  let c = code ? String(code).toLowerCase() : "";
  if (c) {
    if (!CODE_RE.test(c)) return { error: "code must be 3-24 characters: a-z, 0-9, - or _" };
    if (state.affiliates[c]) return { error: "that code is taken" };
  } else {
    const base = slugify(clean.name) || "partner";
    do { c = `${base}-${rand()}`.slice(0, 24); } while (state.affiliates[c] || !CODE_RE.test(c));
  }
  const aff = { code: c, ...clean, createdAt: now, status: "active" };
  if (rate !== undefined && rate !== null && rate !== "") aff.rate = clamp(rate, 0.01, 0.5, undefined);
  state.affiliates[c] = aff;
  return { affiliate: aff };
}

export function recordClick(state, code, now) {
  const c = (state.clicks[code] ||= { total: 0, days: {} });
  const day = new Date(now).toISOString().slice(0, 10);
  c.total++; c.days[day] = (c.days[day] || 0) + 1;
  const keys = Object.keys(c.days).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 90))) delete c.days[k];
}

// First touch wins: a customer already attributed (or already paying) is never re-assigned.
export function attribute(state, { customer, code, email, now }) {
  if (!customer || !code) return { ok: false, why: "missing" };
  const aff = state.affiliates[code];
  if (!aff || aff.status !== "active") return { ok: false, why: "unknown_code" };
  if (state.customers[customer]) return { ok: false, why: "already_attributed" };
  if (email && email.toLowerCase() === aff.email) return { ok: false, why: "self_referral" };
  state.customers[customer] = { code, at: now, firstPaidAt: null };
  return { ok: true };
}

// invoice.paid -> a commission entry (idempotent per invoice id).
export function accrue(state, invoice, policy, now) {
  const cur = state.customers[invoice.customer];
  if (!cur) return { ok: false, why: "not_referred" };
  const aff = state.affiliates[cur.code];
  if (!aff || aff.status !== "active") return { ok: false, why: "affiliate_inactive" };
  if (state.entries.some((e) => e.invoice === invoice.id && e.kind === "commission")) return { ok: false, why: "duplicate" };
  if (invoice.customer_email && invoice.customer_email.toLowerCase() === aff.email) return { ok: false, why: "self_referral" };
  const paid = Number(invoice.amount_paid) || 0;
  if (paid <= 0) return { ok: false, why: "nothing_paid" };
  const at = (Number(invoice.created) || Math.floor(now / 1000)) * 1000;
  if (cur.firstPaidAt == null) cur.firstPaidAt = at;
  if (policy.months > 0 && at >= addMonths(cur.firstPaidAt, policy.months)) return { ok: false, why: "window_over" };
  const exTax = invoice.total_excluding_tax ?? (Number(invoice.total) || paid) - (Number(invoice.tax) || 0);
  const base = Math.max(0, Math.min(Number(exTax) || 0, paid));
  const rate = aff.rate ?? policy.rate;
  const cents = Math.round(base * rate);
  if (cents <= 0) return { ok: false, why: "no_commission" };
  state.entries.push({
    id: `e_${invoice.id}`, kind: "commission", code: cur.code, customer: invoice.customer, invoice: invoice.id,
    charge: invoice.charge || null, paymentIntent: invoice.payment_intent || null,
    currency: String(invoice.currency || "usd").toLowerCase(), base, rate, cents0: cents, cents, at, paidIn: null,
  });
  return { ok: true, cents };
}

// Refunds are cumulative on Stripe's side, so recompute from the total refunded so far:
// replaying the same event, or an earlier partial one, leaves the same answer.
export function applyRefund(state, { keys, amount, amountRefunded, full = false }, now) {
  let changed = 0;
  for (const e of state.entries) {
    if (e.kind !== "commission") continue;
    if (!keys.some((k) => k && (k === e.charge || k === e.paymentIntent || k === e.invoice))) continue;
    const ratio = full ? 1 : amount > 0 ? Math.min(1, Math.max(0, amountRefunded / amount)) : 0;
    const next = Math.round(e.cents0 * (1 - ratio));
    const delta = e.cents - next;
    if (delta <= 0) continue; // never raise a commission because an event arrived late
    e.cents = next;
    if (e.paidIn) state.entries.push({ id: `a_${e.invoice}_${now}_${next}`, kind: "adjust", code: e.code, customer: e.customer, invoice: e.invoice, currency: e.currency, cents: -delta, at: now, paidIn: null, note: "refund after payout" });
    changed++;
  }
  return changed;
}

// What each affiliate is owed. Unpaid commission entries mature after holdDays;
// adjustments (refunds after a payout) net immediately. A balance under the
// minimum rolls over rather than being paid.
export function balances(state, policy, now) {
  const out = {};
  const row = (code, cur) => (out[code] ||= {})[cur] ||= { pending: 0, payable: 0, paid: 0, earned: 0 };
  for (const e of state.entries) {
    const r = row(e.code, e.currency);
    if (e.paidIn) { r.paid += e.cents; r.earned += e.cents; continue; }
    r.earned += e.cents;
    if (e.kind === "adjust" || e.at + policy.holdDays * DAY <= now) r.payable += e.cents; else r.pending += e.cents;
  }
  for (const byCur of Object.values(out)) for (const r of Object.values(byCur)) { r.due = r.payable >= policy.minPayoutCents && r.payable > 0 ? r.payable : 0; }
  return out;
}

export function dueEntries(state, code, currency, policy, now) {
  return state.entries.filter((e) => e.code === code && e.currency === currency && !e.paidIn && (e.kind === "adjust" || e.at + policy.holdDays * DAY <= now));
}

// Marks everything currently payable for (code, currency) as paid. Money moves outside
// this program (PayPal, Wise, bank): this records that you sent it.
export function markPaid(state, { code, currency, method, reference }, policy, now) {
  const entries = dueEntries(state, code, currency, policy, now);
  const cents = entries.reduce((s, e) => s + e.cents, 0);
  if (cents <= 0) return { error: "nothing payable" };
  if (cents < policy.minPayoutCents) return { error: `balance ${cents} is under the minimum payout ${policy.minPayoutCents}` };
  const id = `po_${now}_${code}_${currency}`;
  for (const e of entries) e.paidIn = id;
  const payout = { id, code, currency, cents, at: now, method: String(method || "").slice(0, 40), reference: String(reference || "").slice(0, 120), entries: entries.length };
  state.payouts.push(payout);
  return { payout };
}

export function statsFor(state, code, policy, now) {
  const mine = state.entries.filter((e) => e.code === code);
  const customers = Object.values(state.customers).filter((c) => c.code === code);
  return {
    visits: state.clicks[code]?.total || 0,
    referred: customers.length,
    paying: customers.filter((c) => c.firstPaidAt != null).length,
    balances: balances({ ...state, entries: mine }, policy, now)[code] || {},
    recent: mine.slice(-10).reverse().map((e) => ({ at: e.at, kind: e.kind, cents: e.cents, currency: e.currency, paid: Boolean(e.paidIn) })),
  };
}

export function summarize(state, policy, now) {
  const bal = balances(state, policy, now);
  const total = {};
  for (const byCur of Object.values(bal)) for (const [cur, r] of Object.entries(byCur)) {
    const t = (total[cur] ||= { earned: 0, pending: 0, payable: 0, paid: 0, due: 0 });
    for (const k of Object.keys(t)) t[k] += r[k];
  }
  const revenue = {};
  for (const e of state.entries) if (e.kind === "commission") revenue[e.currency] = (revenue[e.currency] || 0) + Math.round(e.base * (e.cents / (e.cents0 || 1)));
  const affs = Object.values(state.affiliates);
  return {
    affiliates: affs.length,
    visits: Object.values(state.clicks).reduce((s, c) => s + c.total, 0),
    referredCustomers: Object.keys(state.customers).length,
    payingCustomers: Object.values(state.customers).filter((c) => c.firstPaidAt != null).length,
    attributedRevenue: revenue,
    commission: total,
    payouts: state.payouts.length,
  };
}

const csvCell = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

// One row per affiliate+currency with a balance due, ready to paste into a PayPal/Wise bulk file.
export function payoutCsv(state, policy, now) {
  const rows = [["code", "name", "email", "currency", "amount", "payable_cents", "entries"]];
  const bal = balances(state, policy, now);
  for (const [code, byCur] of Object.entries(bal)) for (const [cur, r] of Object.entries(byCur)) {
    if (!r.due) continue;
    const a = state.affiliates[code] || {};
    rows.push([code, a.name, a.email, cur.toUpperCase(), (r.due / 100).toFixed(2), r.due, dueEntries(state, code, cur, policy, now).length]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

export function money(cents, currency = "usd") {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: String(currency).toUpperCase() }).format(cents / 100); }
  catch { return `${(cents / 100).toFixed(2)} ${currency}`; }
}

// What a referral program costs per referred customer, for the in-browser planner.
// price: per month; churn: monthly churn 0..1; months: commission window (0 = lifetime).
export function projectEconomics({ price, rate, months, churn, referralsPerMonth = 0 }) {
  const c = Math.min(0.99, Math.max(0.001, Number(churn) || 0.05));
  const p = Math.max(0, Number(price) || 0), r = Math.min(0.5, Math.max(0, Number(rate) || 0));
  const w = Math.max(0, Math.round(Number(months) || 0));
  const lifeMonths = 1 / c; // expected paid months, geometric
  const commissionMonths = w === 0 ? lifeMonths : (1 - Math.pow(1 - c, w)) / c;
  const revenue = p * lifeMonths, commission = p * r * commissionMonths;
  const n = Math.max(0, Number(referralsPerMonth) || 0);
  return { lifeMonths, revenue, commission, net: revenue - commission, commissionShareOfRevenue: revenue ? commission / revenue : 0, monthlyCommissionAtSteadyState: n * commission, monthlyNetNewValue: n * (revenue - commission) };
}
