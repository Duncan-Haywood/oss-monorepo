// Pure delivery logic for webhook-relay: no I/O, no clock, no Node imports, so
// the browser page and the server share exactly the same retry rules.

export const DEFAULT_POLICY = {
  // Seconds to wait before attempt 2, 3, ...; the list length is the retry
  // budget, so attempts = delays.length + 1. About a day and a half in total.
  delays: [10, 60, 300, 1800, 7200, 21600, 43200, 86400],
  retryAfterCapSec: 86400,
  retentionDays: 14,
  maxEvents: 5000,
};

export const newState = () => ({ events: {}, seq: 0 });

// 2xx delivered. 408/425/429 and 5xx and network errors are the receiver's
// transient trouble: retry. Any other 4xx means the receiver understood and
// refused; retrying the same bytes cannot change that, so park it as dead
// (replayable by hand once the receiver is fixed).
export function classify(status) {
  if (status >= 200 && status < 300) return "delivered";
  if (status === 408 || status === 425 || status === 429 || status >= 500 || status === 0) return "retry";
  return "dead";
}

export function parseRetryAfter(value, nowMs) {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  if (/^\d+$/.test(s)) return Number(s);
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : Math.max(0, Math.ceil((t - nowMs) / 1000));
}

// "Same webhook sent twice" key: the provider's own event id when the headers
// carry one, so a provider-side retry of an event we already hold is absorbed.
export function idempotencyKey(route, headers, bodyText) {
  const h = (n) => headers[n];
  const id = h("webhook-id") || h("x-github-delivery") || h("x-shopify-webhook-id") || h("x-gitlab-event-uuid") || h("x-wc-webhook-delivery-id") || h("linear-delivery") || h("idempotency-key") || h("x-idempotency-key");
  if (id) return `${route}:${id}`;
  try {
    const j = JSON.parse(bodyText);
    if (j && typeof j.id === "string" && typeof j.type === "string") return `${route}:${j.id}`; // Stripe-shaped
  } catch { /* not JSON */ }
  return null;
}

// targets: one URL, or several for fan-out. Each target becomes its own event
// (own retries, own dead/replay state), so one slow consumer never holds up
// the others. A provider-side retry of an event already held is absorbed per target.
export function ingest(state, { route, target, targets, headers, body, now, policy = DEFAULT_POLICY }) {
  const list = [...new Set(targets && targets.length ? targets : [target])];
  const key = idempotencyKey(route, headers, body.toString("utf8"));
  const ids = [];
  let created = 0;
  for (const t of list) {
    const dup = key && Object.values(state.events).find((e) => e.key === key && e.target === t);
    if (dup) { ids.push(dup.id); continue; }
    state.seq += 1;
    const id = `evt_${now.toString(36)}_${state.seq.toString(36)}`;
    state.events[id] = {
      id, route, target: t, key, receivedAt: now, headers, bodyB64: body.toString("base64"), size: body.length,
      status: "pending", nextAt: now, attempts: [],
    };
    ids.push(id); created += 1;
  }
  if (created) prune(state, now, policy);
  return { id: ids[0], ids, duplicate: created === 0 };
}

export const due = (state, now) =>
  Object.values(state.events).filter((e) => e.status === "pending" && e.nextAt <= now).sort((a, b) => a.nextAt - b.nextAt);

// Per-target throttle so a burst (a bulk import, a replay of 500 dead events)
// cannot flatten a small receiver. limits maps target URL -> max delivery
// attempts per rolling minute. Over-limit events simply stay pending for the
// next pass: waiting costs no retry budget and is not a failure.
export function throttle(state, queue, now, limits = {}) {
  const used = {};
  for (const e of Object.values(state.events)) {
    if (!limits[e.target]) continue;
    for (const a of e.attempts) if (a.at > now - 60_000) used[e.target] = (used[e.target] || 0) + 1;
  }
  return queue.filter((e) => {
    const cap = limits[e.target];
    if (!cap) return true;
    if ((used[e.target] || 0) >= cap) return false;
    used[e.target] = (used[e.target] || 0) + 1;
    return true;
  });
}

// result: {status, ms, error?, retryAfter?}. Returns the event's new status.
export function recordAttempt(state, id, result, now, policy = DEFAULT_POLICY) {
  const e = state.events[id];
  if (!e) return null;
  const verdict = classify(result.status);
  e.attempts.push({ at: now, status: result.status, ms: result.ms ?? 0, error: result.error || null });
  if (verdict === "delivered") { e.status = "delivered"; e.nextAt = null; e.deliveredAt = now; return "delivered"; }
  const retriesUsed = e.attempts.length - (e.attemptBase || 0);
  if (verdict === "dead" || retriesUsed > policy.delays.length) { e.status = "dead"; e.nextAt = null; return "dead"; }
  const wait = policy.delays[retriesUsed - 1];
  const ra = parseRetryAfter(result.retryAfter, now);
  const sec = ra == null ? wait : Math.min(Math.max(wait, ra), policy.retryAfterCapSec);
  e.status = "pending"; e.nextAt = now + sec * 1000;
  return "pending";
}

// Manual replay: a fresh retry budget, original bytes. Past attempts stay in the log.
export function replay(state, id, now) {
  const e = state.events[id];
  if (!e) return null;
  e.status = "pending"; e.nextAt = now; e.attemptBase = e.attempts.length; delete e.deliveredAt;
  return e;
}

export function prune(state, now, policy = DEFAULT_POLICY) {
  const cutoff = now - policy.retentionDays * 86400_000;
  for (const e of Object.values(state.events)) {
    if (e.status !== "pending" && e.receivedAt < cutoff) delete state.events[e.id];
  }
  const all = Object.values(state.events);
  if (all.length > policy.maxEvents) {
    all.filter((e) => e.status !== "pending").sort((a, b) => a.receivedAt - b.receivedAt)
      .slice(0, all.length - policy.maxEvents).forEach((e) => delete state.events[e.id]);
  }
}

export function summary(state) {
  const out = { total: 0, pending: 0, delivered: 0, dead: 0, byRoute: {} };
  for (const e of Object.values(state.events)) {
    out.total += 1; out[e.status] += 1;
    const r = (out.byRoute[e.route] ||= { pending: 0, delivered: 0, dead: 0 });
    r[e.status] += 1;
  }
  return out;
}

// Prometheus text exposition of what the relay holds right now. Gauges, not
// counters: state is capped and events can be deleted, so totals could go down.
const esc = (v) => String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
export function metrics(state, nowMs) {
  const by = {}, oldest = {};
  for (const e of Object.values(state.events)) {
    (by[e.route] ||= { pending: 0, delivered: 0, dead: 0 })[e.status] += 1;
    if (e.status === "pending") oldest[e.route] = Math.min(oldest[e.route] ?? Infinity, e.receivedAt);
  }
  const L = ["# HELP webhook_relay_events Events currently held, by route and status.", "# TYPE webhook_relay_events gauge"];
  for (const [r, c] of Object.entries(by)) for (const [st, n] of Object.entries(c)) L.push(`webhook_relay_events{route="${esc(r)}",status="${st}"} ${n}`);
  L.push("# HELP webhook_relay_oldest_pending_age_seconds Age of the oldest event still waiting for delivery.", "# TYPE webhook_relay_oldest_pending_age_seconds gauge");
  for (const [r, t] of Object.entries(oldest)) L.push(`webhook_relay_oldest_pending_age_seconds{route="${esc(r)}"} ${Math.max(0, Math.floor((nowMs - t) / 1000))}`);
  return L.join("\n") + "\n";
}

// For the page: when each attempt would fire if the receiver stays down.
export function schedule(policy = DEFAULT_POLICY) {
  let t = 0;
  return [{ attempt: 1, afterSec: 0, atSec: 0 }, ...policy.delays.map((d, i) => ({ attempt: i + 2, afterSec: d, atSec: (t += d) }))];
}

export function humanDuration(sec) {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${+(sec / 3600).toFixed(1)}h`;
  return `${+(sec / 86400).toFixed(1)}d`;
}
