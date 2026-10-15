// Usage metering + tiered pricing. Pure state functions; no node: imports so the browser demo shares them.
const DAY = 86_400_000;
export const IDEMPOTENCY_DAYS = 45;
export const MAX_AGE_MS = 35 * DAY; // Stripe refuses meter events older than 35 days
export const MAX_FUTURE_MS = 5 * 60_000; // ...or more than 5 minutes ahead
export const AGGS = ["sum", "count", "max", "unique"];

export const newState = () => ({ customers: {}, seen: {}, buckets: {}, uniqueMonths: {}, outbox: [], dead: [] });

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const ID = /^[A-Za-z0-9_.:@-]{1,100}$/;
export const dayOf = (ts) => new Date(ts).toISOString().slice(0, 10);
export const monthOf = (ts) => new Date(ts).toISOString().slice(0, 7);

/** Calendar-month period [from, to) in UTC ms containing ts. */
export function periodOf(ts) {
  const d = new Date(ts);
  return { from: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1), to: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) };
}

export function validateConfig(cfg) {
  const errors = [];
  for (const [name, m] of Object.entries(cfg.meters || {})) {
    if (!ID.test(name)) errors.push(`meter name "${name}" is not a valid id`);
    if (!AGGS.includes(m.agg)) errors.push(`meter ${name}: agg must be one of ${AGGS.join(", ")}`);
  }
  for (const [pn, plan] of Object.entries(cfg.plans || {})) {
    for (const [i, line] of (plan.lines || []).entries()) {
      const at = `plan ${pn} line ${i}`;
      if (!cfg.meters?.[line.meter]) errors.push(`${at}: unknown meter "${line.meter}"`);
      if (!["flat", "graduated", "volume", "package"].includes(line.model)) errors.push(`${at}: model must be flat, graduated, volume or package`);
      if (line.model === "flat" && !(line.unit >= 0)) errors.push(`${at}: flat needs unit >= 0`);
      if (line.model === "package" && !(line.unit >= 0 && line.size >= 1)) errors.push(`${at}: package needs unit >= 0 and size >= 1`);
      if (line.model === "graduated" || line.model === "volume") {
        const t = line.tiers || [];
        if (!t.length) errors.push(`${at}: needs tiers`);
        t.forEach((x, j) => {
          if (!(x.unit >= 0)) errors.push(`${at} tier ${j}: unit must be >= 0`);
          if (j < t.length - 1 && !(x.upTo > (t[j - 1]?.upTo ?? 0))) errors.push(`${at} tier ${j}: upTo must increase`);
        });
        if (t.length && t[t.length - 1].upTo != null) errors.push(`${at}: last tier must have upTo null`);
      }
    }
  }
  return errors;
}

export function setCustomer(state, id, { plan, stripeCustomerId } = {}) {
  if (!ID.test(id || "")) throw fail("customer id must be 1-100 characters of letters, digits and _ . : @ -");
  state.customers[id] = { plan: plan ?? state.customers[id]?.plan ?? null, stripeCustomerId: stripeCustomerId ?? state.customers[id]?.stripeCustomerId ?? null };
  return state.customers[id];
}

/**
 * Record one usage event. Idempotent on event.id, so a client may retry safely.
 * Returns {status: "accepted"|"duplicate", forward}; throws a 400 error for a bad event.
 */
export function ingest(state, cfg, ev, now) {
  if (!ev || typeof ev !== "object") throw fail("event must be an object");
  if (!ID.test(ev.id || "")) throw fail("id is required (1-100 characters); it makes retries safe");
  const meter = cfg.meters?.[ev.meter];
  if (!meter) throw fail(`unknown meter "${ev.meter}"`);
  if (!ID.test(ev.customer || "")) throw fail("customer is required");
  const ts = ev.timestamp == null ? now : typeof ev.timestamp === "number" ? ev.timestamp : Date.parse(ev.timestamp);
  if (!Number.isFinite(ts)) throw fail("timestamp must be an ISO date or epoch milliseconds");
  if (ts < now - MAX_AGE_MS) throw fail("timestamp is more than 35 days old");
  if (ts > now + MAX_FUTURE_MS) throw fail("timestamp is in the future");
  let value = ev.value == null ? 1 : Number(ev.value);
  if (meter.agg === "count") value = 1;
  if (!Number.isFinite(value) || value < 0) throw fail("value must be a number >= 0");
  if (meter.agg === "unique" && !ev.key) throw fail("a unique meter needs a key (for example a user id)");
  if (state.seen[ev.id]) return { status: "duplicate", forward: false };

  state.seen[ev.id] = ts;
  state.customers[ev.customer] ||= { plan: null, stripeCustomerId: null };
  const b = ((state.buckets[ev.customer] ||= {})[ev.meter] ||= {});
  const cell = (b[dayOf(ts)] ||= { sum: 0, count: 0, max: 0, keys: {} });
  cell.sum += value; cell.count += 1; cell.max = Math.max(cell.max, value);
  let forward = Boolean(meter.stripeEvent);
  if (meter.agg === "unique") {
    cell.keys[ev.key] = 1;
    const mk = `${ev.customer}|${ev.meter}|${monthOf(ts)}`;
    const set = (state.uniqueMonths[mk] ||= {});
    forward = forward && !set[ev.key];
    set[ev.key] = 1;
    value = 1;
  }
  if (forward) state.outbox.push({ id: ev.id, customer: ev.customer, event: meter.stripeEvent, value, ts, tries: 0, next: 0 });
  return { status: "accepted", forward };
}

/** Quantity of one meter for one customer in [from, to) (UTC ms). */
export function usage(state, cfg, customer, meter, from, to) {
  const agg = cfg.meters?.[meter]?.agg;
  if (!agg) throw fail(`unknown meter "${meter}"`);
  const days = state.buckets[customer]?.[meter] || {};
  let sum = 0, count = 0, max = 0; const keys = new Set();
  for (const [day, c] of Object.entries(days)) {
    const t = Date.parse(day);
    if (t + DAY <= from || t >= to) continue; // day bucket outside the range
    sum += c.sum; count += c.count; max = Math.max(max, c.max);
    for (const k of Object.keys(c.keys)) keys.add(k);
  }
  return agg === "sum" ? sum : agg === "count" ? count : agg === "max" ? max : keys.size;
}

/** Charge in cents (unrounded) for `qty` units under one plan line, after `included` free units. */
export function price(line, qty) {
  const billable = Math.max(0, qty - (line.included || 0));
  if (line.model === "flat") return billable * line.unit;
  if (line.model === "package") return Math.ceil(billable / line.size) * line.unit;
  const tiers = line.tiers;
  if (line.model === "volume") {
    const t = tiers.find((x) => x.upTo == null || billable <= x.upTo) || tiers[tiers.length - 1];
    return billable * t.unit + (billable > 0 ? t.flat || 0 : 0);
  }
  let left = billable, prev = 0, total = 0;
  for (const t of tiers) {
    const span = t.upTo == null ? left : Math.min(left, t.upTo - prev);
    if (span > 0) total += span * t.unit + (t.flat || 0);
    left -= span; prev = t.upTo ?? prev;
    if (left <= 0) break;
  }
  return total;
}

const cents = (x) => Math.round(x + Number.EPSILON);

/** Invoice preview for the period containing `now` (or an explicit [from,to)). Money in integer cents. */
export function invoice(state, cfg, customer, now, range = periodOf(now)) {
  const c = state.customers[customer];
  if (!c) throw fail("unknown customer", 404);
  const plan = cfg.plans?.[c.plan];
  if (!plan) throw fail(`customer has no plan${c.plan ? ` ("${c.plan}" is not defined)` : ""}`, 404);
  const lines = plan.lines.map((l) => {
    const quantity = usage(state, cfg, customer, l.meter, range.from, range.to);
    return { meter: l.meter, model: l.model, quantity, included: l.included || 0, amount: cents(price(l, quantity)) };
  });
  const base = plan.base || 0;
  const subtotal = base + lines.reduce((s, l) => s + l.amount, 0);
  const total = Math.max(subtotal, plan.minimum || 0);
  return { customer, plan: c.plan, currency: plan.currency || "usd", from: new Date(range.from).toISOString(), to: new Date(range.to).toISOString(), base, lines, minimumTopUp: total - subtotal, total };
}

/** Straight-line forecast of the period's invoice from the burn rate so far. */
export function projection(state, cfg, customer, now) {
  const p = periodOf(now), elapsed = Math.max(now - p.from, DAY / 24), span = p.to - p.from;
  const c = state.customers[customer], plan = cfg.plans?.[c?.plan];
  if (!plan) throw fail("unknown customer or plan", 404);
  const used = invoice(state, cfg, customer, now);
  let total = plan.base || 0; const lines = [];
  for (const l of plan.lines) {
    const meter = cfg.meters[l.meter];
    const q = usage(state, cfg, customer, l.meter, p.from, p.to);
    const projected = meter.agg === "max" || meter.agg === "unique" ? q : (q / elapsed) * span;
    const amount = cents(price(l, projected));
    total += amount; lines.push({ meter: l.meter, quantity: Math.round(projected), amount });
  }
  return { customer, usedSoFar: used.total, projectedTotal: Math.max(total, plan.minimum || 0), lines, basis: "straight-line from usage so far this month; a guess, not a bill" };
}

/** Entitlement check: would `quantity` more units stay inside the plan's hard limit? */
export function check(state, cfg, customer, meter, quantity, now) {
  const c = state.customers[customer];
  const line = cfg.plans?.[c?.plan]?.lines.find((l) => l.meter === meter);
  if (!c || !line) throw fail("unknown customer, plan or meter", 404);
  const p = periodOf(now), used = usage(state, cfg, customer, meter, p.from, p.to);
  const limit = line.limit ?? null;
  const agg = cfg.meters[meter].agg;
  const after = agg === "max" ? Math.max(used, quantity) : used + quantity;
  return { allowed: limit == null || after <= limit, used, limit, remaining: limit == null ? null : Math.max(0, limit - used), resetsAt: new Date(p.to).toISOString() };
}

/** Drop idempotency records and day buckets older than the retention window. Call occasionally. */
export function prune(state, now, keepMonths = 14) {
  const cutoff = now - IDEMPOTENCY_DAYS * DAY;
  for (const [id, t] of Object.entries(state.seen)) if (t < cutoff) delete state.seen[id];
  const old = dayOf(now - keepMonths * 31 * DAY);
  for (const meters of Object.values(state.buckets)) for (const days of Object.values(meters)) for (const d of Object.keys(days)) if (d < old) delete days[d];
  const oldMonth = monthOf(now - keepMonths * 31 * DAY);
  for (const k of Object.keys(state.uniqueMonths)) if (k.split("|")[2] < oldMonth) delete state.uniqueMonths[k];
}

/** Send due outbox items with `send(item)`; a thrown error with .retry=false is permanent. Returns counts. */
export async function flush(state, send, now, { max = 200, maxTries = 8 } = {}) {
  let sent = 0, retried = 0, dead = 0;
  const keep = [];
  const due = state.outbox.filter((o) => o.next <= now).slice(0, max);
  const dueSet = new Set(due);
  for (const o of state.outbox) {
    if (!dueSet.has(o)) { keep.push(o); continue; }
    const stripeId = state.customers[o.customer]?.stripeCustomerId;
    if (!stripeId) { o.reason = "customer has no stripeCustomerId"; state.dead.push(o); dead++; continue; }
    try { await send({ ...o, stripeCustomerId: stripeId }); sent++; }
    catch (e) {
      o.tries += 1; o.reason = e.message;
      if (e.retry === false || o.tries >= maxTries) { state.dead.push(o); dead++; }
      else { o.next = now + Math.min(3_600_000, 2 ** o.tries * 30_000); keep.push(o); retried++; }
    }
  }
  state.outbox = keep;
  if (state.dead.length > 1000) state.dead.splice(0, state.dead.length - 1000);
  return { sent, retried, dead, pending: keep.length };
}

export function toCsv(state, cfg, now) {
  const p = periodOf(now), rows = [["customer", "meter", "agg", "period_start", "quantity"]];
  for (const customer of Object.keys(state.buckets)) for (const meter of Object.keys(state.buckets[customer])) {
    if (cfg.meters[meter]) rows.push([customer, meter, cfg.meters[meter].agg, new Date(p.from).toISOString().slice(0, 10), usage(state, cfg, customer, meter, p.from, p.to)]);
  }
  const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return rows.map((r) => r.map(q).join(",")).join("\n") + "\n";
}
