// Referral programme state machine. Pure functions over one JSON-serialisable
// object: no I/O, no clock reads (callers pass `now` in ms), money in integer
// minor units (cents). Node-only code lives in server.mjs.
import { randomBytes } from "node:crypto";

export const DAY = 86_400_000;
export const CODE_RE = /^[a-z0-9_-]{3,32}$/;
export const REF_PREFIX = "ref_"; // client_reference_id = "ref_<code>"

export const DEFAULT_PROGRAM = { percent: 20, months: 12, holdDays: 30, minPayout: 5000 };

export const newState = () => ({ affiliates: {}, codes: {}, customers: {}, commissions: {}, payouts: {}, clicks: {}, seen: {} });

const token = (n) => randomBytes(n).toString("base64url");
const clampPct = (p) => Math.min(100, Math.max(0, Number(p)));

// Merge a PROGRAM_JSON-style object over the defaults and reject nonsense early.
export function program(overrides = {}) {
  const p = { ...DEFAULT_PROGRAM, ...overrides };
  p.percent = clampPct(p.percent);
  p.months = p.months === null || p.months === 0 || p.months === "lifetime" ? null : Math.max(1, Math.floor(Number(p.months)));
  p.holdDays = Math.max(0, Math.floor(Number(p.holdDays)));
  p.minPayout = Math.max(0, Math.floor(Number(p.minPayout)));
  if (![p.percent, p.holdDays, p.minPayout].every(Number.isFinite)) throw new Error("invalid programme settings");
  return p;
}

const rulesOf = (a, prog) => ({
  percent: a.percent ?? prog.percent,
  months: a.months === undefined ? prog.months : a.months, // null = lifetime
});

// ---- affiliates ------------------------------------------------------------

export function addAffiliate(state, { name, email, code, percent, months, status = "active" }, now) {
  const em = String(email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) throw new Error("valid email required");
  const nm = String(name || "").trim().slice(0, 80);
  if (!nm) throw new Error("name required");
  const c = String(code || nm.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "").slice(0, 32);
  if (!CODE_RE.test(c)) throw new Error("code must be 3-32 characters: a-z, 0-9, - or _");
  if (state.codes[c]) throw new Error("code already taken");
  if (percent !== undefined && percent !== null && !(Number(percent) >= 0 && Number(percent) <= 100)) throw new Error("percent must be 0-100");
  const id = `aff_${token(6)}`;
  const a = { id, code: c, name: nm, email: em, portal: token(18), status, createdAt: now };
  if (percent !== undefined && percent !== null && percent !== "") a.percent = Number(percent);
  if (months !== undefined) a.months = months === null || months === "" || Number(months) === 0 ? null : Math.floor(Number(months));
  state.affiliates[id] = a;
  state.codes[c] = id;
  return a;
}

export function setStatus(state, id, status) {
  const a = state.affiliates[id];
  if (!a || !["active", "paused", "pending"].includes(status)) return null;
  a.status = status;
  return a;
}

export const byPortal = (state, tok) => Object.values(state.affiliates).find((a) => a.portal === tok) || null;

export function click(state, code) {
  if (!state.codes[code]) return false;
  state.clicks[code] = (state.clicks[code] || 0) + 1;
  return true;
}

// ---- commissions -----------------------------------------------------------

export const isPastHold = (c, prog, now) => now >= c.at + prog.holdDays * DAY;

// What the affiliate is owed on one commission right now (cents, may be negative after a clawback).
export function dueOf(c, prog, now) {
  if (c.status === "void") return 0;
  return (isPastHold(c, prog, now) || c.paid > 0 ? c.amount : 0) - c.paid;
}

const taxOf = (o) => {
  if (Number.isFinite(o.tax)) return o.tax;
  if (Array.isArray(o.total_taxes)) return o.total_taxes.reduce((s, t) => s + (t.amount || 0), 0);
  return 0;
};

function attributionKey(customer, email) {
  return customer ? String(customer) : email ? `email:${String(email).toLowerCase()}` : null;
}

function parseRef(session) {
  const raw = session.client_reference_id || (session.metadata && (session.metadata.ref || session.metadata.referral)) || "";
  const code = String(raw).toLowerCase().replace(/^ref_/, "");
  return CODE_RE.test(code) ? code : null;
}

function record(state, prog, { key, affiliate, customerKey, source, ref, base, currency, at, paymentIntent, charge, invoice }) {
  if (state.commissions[key]) return null;
  if (paymentIntent && Object.values(state.commissions).some((c) => c.paymentIntent === paymentIntent && c.affiliateId === affiliate.id)) return null;
  const cust = state.customers[customerKey];
  const rules = rulesOf(affiliate, prog);
  if (rules.months !== null && cust.count >= rules.months) return { skipped: "past the commission window" };
  const amount = Math.round((base * rules.percent) / 100);
  cust.count += 1;
  if (amount <= 0) return { skipped: "nothing to pay" };
  const c = { id: key, affiliateId: affiliate.id, customer: customerKey, source, ref, currency, base, amount, rate: rules.percent, at, paid: 0, status: "ok", paymentIntent: paymentIntent || null, charge: charge || null, invoice: invoice || null, refunded: 0, history: [{ at, what: "earned" }] };
  state.commissions[key] = c;
  return c;
}

const fmt = (cents, cur) => `${(cents / 100).toFixed(2)} ${String(cur || "").toUpperCase()}`;

// Apply one verified Stripe event. Returns human-readable log lines.
export function applyEvent(state, event, { program: prog = DEFAULT_PROGRAM, now = Date.now() } = {}) {
  if (!event || !event.id || !event.type) return ["ignored: not an event"];
  if (state.seen[event.id]) return [`duplicate event ${event.id}`];
  state.seen[event.id] = now;
  const ids = Object.keys(state.seen);
  if (ids.length > 5000) for (const k of ids.slice(0, ids.length - 4000)) delete state.seen[k];
  const o = event.data && event.data.object;
  if (!o) return [];
  const at = event.created ? event.created * 1000 : now;
  const log = [];

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const code = parseRef(o);
    const email = o.customer_details?.email || o.customer_email || null;
    const key = attributionKey(o.customer, email);
    if (!code || !key) return log;
    const aff = state.affiliates[state.codes[code]];
    if (!aff) return [`unknown referral code "${code}"`];
    if (aff.status !== "active") return [`code "${code}" is ${aff.status}: no attribution`];
    if (email && email.toLowerCase() === aff.email) return [`self-referral by ${aff.email} ignored`];
    if (!state.customers[key]) {
      state.customers[key] = { affiliateId: aff.id, at, via: "checkout", count: 0 };
      log.push(`attributed ${key} to ${code}`);
    }
    if (o.mode === "payment" && o.payment_status === "paid") {
      const base = Math.max(0, (o.amount_total || 0) - (o.total_details?.amount_tax || 0));
      const owner = state.affiliates[state.customers[key].affiliateId];
      const r = record(state, prog, { key: `cs:${o.id}`, affiliate: owner, customerKey: key, source: "checkout", ref: o.id, base, currency: o.currency, at, paymentIntent: o.payment_intent });
      if (r && r.skipped) log.push(`no commission on ${o.id}: ${r.skipped}`);
      else if (r) log.push(`commission ${fmt(r.amount, r.currency)} for ${owner.code} on ${o.id}`);
    }
    return log;
  }

  if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
    const key = [attributionKey(o.customer, null), attributionKey(null, o.customer_email)].find((k) => k && state.customers[k]);
    if (!key || !(o.amount_paid > 0)) return log;
    const owner = state.affiliates[state.customers[key].affiliateId];
    if (!owner || owner.status === "paused") return [`${owner ? owner.code : "affiliate"} is paused: no commission on ${o.id}`];
    const base = Math.max(0, o.amount_paid - taxOf(o));
    const r = record(state, prog, { key: `in:${o.id}`, affiliate: owner, customerKey: key, source: "invoice", ref: o.id, base, currency: o.currency, at, paymentIntent: o.payment_intent, charge: o.charge, invoice: o.id });
    if (r && r.skipped) log.push(`no commission on ${o.id}: ${r.skipped}`);
    else if (r) log.push(`commission ${fmt(r.amount, r.currency)} for ${owner.code} on ${o.id}`);
    return log;
  }

  if (event.type === "charge.refunded") {
    const total = o.amount || 0;
    for (const c of matching(state, o)) {
      if (c.status === "void") continue;
      const frac = total > 0 ? Math.min(1, (o.amount_refunded || 0) / total) : 1;
      const orig = Math.round((c.base * c.rate) / 100);
      const newAmount = Math.max(0, Math.min(c.amount, Math.round(orig * (1 - frac))));
      if (newAmount !== c.amount) {
        c.history.push({ at, what: `refund of ${Math.round(frac * 100)}%: commission ${fmt(c.amount, c.currency)} -> ${fmt(newAmount, c.currency)}` });
        c.amount = newAmount;
        c.refunded = frac;
        log.push(`refund reduced ${c.id} to ${fmt(newAmount, c.currency)}`);
      }
    }
    return log;
  }

  if (event.type === "charge.dispute.created") {
    for (const c of matching(state, o)) {
      if (c.status === "void") continue;
      c.disputedAmount = c.amount;
      c.amount = 0;
      c.history.push({ at, what: "dispute opened: commission withheld" });
      log.push(`dispute withheld ${c.id}`);
    }
    return log;
  }

  if (event.type === "charge.dispute.closed" && o.status === "won") {
    for (const c of matching(state, o)) {
      if (c.disputedAmount) { c.amount = c.disputedAmount; delete c.disputedAmount; c.history.push({ at, what: "dispute won: commission restored" }); log.push(`dispute won, restored ${c.id}`); }
    }
    return log;
  }
  return log;
}

// A charge/dispute object can name the payment through any of these ids.
function matching(state, o) {
  const charge = o.object === "dispute" ? o.charge : o.id;
  const pi = o.payment_intent;
  return Object.values(state.commissions).filter((c) => (charge && c.charge === charge) || (pi && c.paymentIntent === pi) || (o.invoice && c.invoice === o.invoice));
}

// Manual commission (an off-Stripe sale, a bonus) or a correction.
export function adjust(state, affiliateId, { amount, currency, note }, now) {
  const a = state.affiliates[affiliateId];
  if (!a) throw new Error("no such affiliate");
  const n = Math.round(Number(amount));
  if (!Number.isFinite(n) || n === 0) throw new Error("amount required (cents, may be negative)");
  const key = `adj:${token(6)}`;
  state.commissions[key] = { id: key, affiliateId, customer: null, source: "manual", ref: String(note || "").slice(0, 120), currency: String(currency || "usd").toLowerCase(), base: 0, amount: n, rate: 0, at: 0, paid: 0, status: "ok", paymentIntent: null, charge: null, invoice: null, refunded: 0, history: [{ at: now, what: `manual adjustment: ${note || ""}` }] };
  return state.commissions[key];
}

// ---- balances and payouts --------------------------------------------------

export function balances(state, prog, now) {
  const out = {};
  for (const a of Object.values(state.affiliates)) out[a.id] = { customers: 0, revenue: {}, earned: {}, pending: {}, due: {}, paid: {}, clicks: state.clicks[a.code] || 0 };
  for (const c of Object.values(state.customers)) if (out[c.affiliateId]) out[c.affiliateId].customers++;
  for (const c of Object.values(state.commissions)) {
    const b = out[c.affiliateId];
    if (!b || c.status === "void") continue;
    const add = (m, v) => { m[c.currency] = (m[c.currency] || 0) + v; };
    add(b.revenue, c.base);
    add(b.earned, c.amount);
    add(b.paid, c.paid);
    const due = dueOf(c, prog, now);
    add(b.due, due);
    if (!isPastHold(c, prog, now) && c.paid === 0) add(b.pending, c.amount);
  }
  return out;
}

// One open payout per affiliate and currency whose due balance reaches the minimum.
export function createPayouts(state, prog, now, { affiliateId, force = false } = {}) {
  const groups = new Map();
  for (const c of Object.values(state.commissions)) {
    if (affiliateId && c.affiliateId !== affiliateId) continue;
    const d = dueOf(c, prog, now);
    if (d === 0) continue;
    const k = `${c.affiliateId}|${c.currency}`;
    if (!groups.has(k)) groups.set(k, { affiliateId: c.affiliateId, currency: c.currency, total: 0, items: [] });
    const g = groups.get(k);
    g.total += d;
    g.items.push({ c, d });
  }
  const made = [];
  for (const g of groups.values()) {
    if (g.total <= 0 || (!force && g.total < prog.minPayout)) continue;
    const id = `pay_${token(6)}`;
    for (const { c, d } of g.items) { c.paid += d; c.history.push({ at: now, what: `in payout ${id}` }); }
    state.payouts[id] = { id, affiliateId: g.affiliateId, currency: g.currency, amount: g.total, commissions: g.items.map((i) => ({ id: i.c.id, delta: i.d })), at: now, status: "open", paidAt: null, reference: null };
    made.push(state.payouts[id]);
  }
  return made;
}

export function markPaid(state, id, reference, now) {
  const p = state.payouts[id];
  if (!p || p.status !== "open") return null;
  p.status = "paid"; p.paidAt = now; p.reference = String(reference || "").slice(0, 120) || null;
  return p;
}

// Cancel an open payout (the money was never sent): its commissions become due again.
export function voidPayout(state, id) {
  const p = state.payouts[id];
  if (!p || p.status !== "open") return null;
  for (const { id: cid, delta } of p.commissions) if (state.commissions[cid]) state.commissions[cid].paid -= delta;
  p.status = "void";
  return p;
}
