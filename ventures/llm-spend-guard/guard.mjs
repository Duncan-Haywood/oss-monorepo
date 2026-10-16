// LLM Spend Guard: the policy engine.
//
// Zero dependencies and no I/O, so the same file runs inside the proxy
// (proxy.mjs), wrapped around an SDK call in your own code, in a test, and in
// the browser simulator (index.html).
//
// The shape is reserve-then-settle, the way a card hold works:
//
//   const g = createGuard(policy);
//   const d = g.check({ model, maxOutputTokens, input, scope: { user, feature, run } });
//   if (!d.allowed) return refuse(d.reasons);          // nothing was sent
//   const res = await callProvider({ ...body, max_tokens: d.maxOutputTokens });
//   g.settle(d.id, usageFrom(res));                    // actual cost replaces the hold
//
// `check` prices the worst case of the call (its input estimate plus the full
// output cap) and refuses it when that would cross a budget, so concurrent
// calls cannot all slip under the same remaining dollar. A call that is never
// settled is charged at its hold when the hold expires: an unknown outcome
// counts as spent, never as free.
//
// Budgets are fixed UTC calendar windows (the minute, hour, day or month a
// call starts in, or `total`), matching how providers bill. Breakers watch a
// rolling 60-second window for runaway loops: call rate, spend rate, and the
// same request repeated. Budget counters live in the store you pass (memory by
// default, a JSON file in store-file.mjs); breaker history is process-local.

export const WINDOWS = Object.freeze(['minute', 'hour', 'day', 'month', 'total']);
export const SCOPES = Object.freeze(['global', 'user', 'feature', 'key', 'run']);
const HOLD_TTL_SEC = 600;

export class GuardPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GuardPolicyError';
  }
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function checkPrice(where, p) {
  if (!p || typeof p !== 'object') throw new GuardPolicyError(`${where}: price must be an object like {"in": 3, "out": 15}`);
  for (const k of ['in', 'out']) if (!isNum(p[k])) throw new GuardPolicyError(`${where}.${k}: USD per million tokens, a number >= 0`);
  for (const k of ['cacheRead', 'cacheWrite']) {
    if (p[k] !== undefined && !isNum(p[k])) throw new GuardPolicyError(`${where}.${k}: a number >= 0 when set`);
  }
  return { in: p.in, out: p.out, cacheRead: p.cacheRead ?? p.in, cacheWrite: p.cacheWrite ?? p.in };
}

/** Validate a policy and fill defaults. Throws GuardPolicyError naming the bad field. */
export function normalisePolicy(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new GuardPolicyError('policy must be a JSON object');
  const mode = raw.mode ?? 'enforce';
  if (!['enforce', 'observe'].includes(mode)) throw new GuardPolicyError('mode: "enforce" or "observe"');

  const prices = {};
  for (const [model, p] of Object.entries(raw.prices ?? {})) {
    if (model.startsWith('_')) continue; // "_note"-style comments in a JSON file
    prices[model] = checkPrice(`prices.${model}`, p);
  }
  const fallbackPrice = raw.fallbackPrice == null ? null : checkPrice('fallbackPrice', raw.fallbackPrice);

  for (const k of ['defaultMaxOutputTokens', 'maxOutputTokens']) {
    if (raw[k] != null && !(Number.isInteger(raw[k]) && raw[k] > 0)) throw new GuardPolicyError(`${k}: a whole number > 0`);
  }
  if (raw.maxCostPerCallUsd != null && !isNum(raw.maxCostPerCallUsd)) throw new GuardPolicyError('maxCostPerCallUsd: a number >= 0');

  const ids = new Set();
  const budgets = (raw.budgets ?? []).map((b, i) => {
    const where = `budgets[${i}]`;
    if (!b || typeof b !== 'object') throw new GuardPolicyError(`${where}: must be an object`);
    const id = b.id ?? `${b.scope ?? 'global'}-${b.window ?? 'day'}`;
    if (ids.has(id)) throw new GuardPolicyError(`${where}: duplicate id "${id}"`);
    ids.add(id);
    const scope = b.scope ?? 'global';
    const window = b.window ?? 'day';
    if (!SCOPES.includes(scope)) throw new GuardPolicyError(`${where}.scope: one of ${SCOPES.join(', ')}`);
    if (!WINDOWS.includes(window)) throw new GuardPolicyError(`${where}.window: one of ${WINDOWS.join(', ')}`);
    if (b.limitUsd == null && b.limitCalls == null) throw new GuardPolicyError(`${where}: set limitUsd, limitCalls, or both`);
    if (b.limitUsd != null && !isNum(b.limitUsd)) throw new GuardPolicyError(`${where}.limitUsd: a number >= 0`);
    if (b.limitCalls != null && !(Number.isInteger(b.limitCalls) && b.limitCalls >= 0)) throw new GuardPolicyError(`${where}.limitCalls: a whole number >= 0`);
    const alertAt = (b.alertAt ?? [0.5, 0.8, 1]).map(Number);
    if (alertAt.some((a) => !(a > 0 && a <= 1))) throw new GuardPolicyError(`${where}.alertAt: fractions in (0, 1]`);
    return { id, scope, window, limitUsd: b.limitUsd ?? null, limitCalls: b.limitCalls ?? null, alertAt: [...new Set(alertAt)].sort() };
  });

  const breakers = (raw.breakers ?? []).map((b, i) => {
    const where = `breakers[${i}]`;
    if (!b || typeof b !== 'object') throw new GuardPolicyError(`${where}: must be an object`);
    const scope = b.scope ?? 'global';
    if (!SCOPES.includes(scope)) throw new GuardPolicyError(`${where}.scope: one of ${SCOPES.join(', ')}`);
    const out = {
      id: b.id ?? `breaker-${scope}-${i}`,
      scope,
      maxCallsPerMinute: b.maxCallsPerMinute ?? null,
      maxSpendPerMinuteUsd: b.maxSpendPerMinuteUsd ?? null,
      maxRepeats: b.maxRepeats ?? null,
      repeatWindowSec: b.repeatWindowSec ?? 300,
      cooldownSec: b.cooldownSec ?? 300,
    };
    if (out.maxCallsPerMinute == null && out.maxSpendPerMinuteUsd == null && out.maxRepeats == null) {
      throw new GuardPolicyError(`${where}: set maxCallsPerMinute, maxSpendPerMinuteUsd or maxRepeats`);
    }
    for (const k of ['maxCallsPerMinute', 'maxRepeats']) {
      if (out[k] != null && !(Number.isInteger(out[k]) && out[k] > 0)) throw new GuardPolicyError(`${where}.${k}: a whole number > 0`);
    }
    for (const k of ['maxSpendPerMinuteUsd', 'repeatWindowSec', 'cooldownSec']) {
      if (!(out[k] == null || isNum(out[k]))) throw new GuardPolicyError(`${where}.${k}: a number >= 0`);
    }
    return out;
  });

  return {
    mode,
    prices,
    fallbackPrice,
    requireKnownPrice: raw.requireKnownPrice ?? true,
    requireOutputCap: raw.requireOutputCap ?? true,
    defaultMaxOutputTokens: raw.defaultMaxOutputTokens ?? null,
    maxOutputTokens: raw.maxOutputTokens ?? null,
    maxCostPerCallUsd: raw.maxCostPerCallUsd ?? null,
    holdTtlSec: raw.holdTtlSec ?? HOLD_TTL_SEC,
    budgets,
    breakers,
  };
}

/** The calendar bucket a timestamp falls in, in UTC. */
export function windowKey(window, t) {
  if (window === 'total') return 'all';
  const iso = new Date(t).toISOString(); // 2026-10-16T09:41:07.123Z
  return { month: iso.slice(0, 7), day: iso.slice(0, 10), hour: iso.slice(0, 13), minute: iso.slice(0, 16) }[window];
}

/** When the bucket containing t ends, in ms; Infinity for `total`. */
export function windowEnd(window, t) {
  const d = new Date(t);
  if (window === 'total') return Infinity;
  if (window === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  const ms = { day: 86_400_000, hour: 3_600_000, minute: 60_000 }[window];
  return Math.floor(t / ms) * ms + ms;
}

/**
 * Price for a model: exact name first, then the longest configured prefix, so
 * "claude-sonnet-4-5" also prices a dated snapshot like "claude-sonnet-4-5-20250929".
 */
export function priceFor(policy, model) {
  if (typeof model !== 'string' || !model) return policy.fallbackPrice;
  if (policy.prices[model]) return policy.prices[model];
  let best = null;
  for (const name of Object.keys(policy.prices)) {
    if (model.startsWith(name) && (!best || name.length > best.length)) best = name;
  }
  return best ? policy.prices[best] : policy.fallbackPrice;
}

/** USD for a usage record { input, output, cacheRead, cacheWrite } (token counts). */
export function costUsd(price, usage = {}) {
  const n = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
  return (n(usage.input) * price.in + n(usage.output) * price.out
    + n(usage.cacheRead) * price.cacheRead + n(usage.cacheWrite) * price.cacheWrite) / 1e6;
}

/**
 * A deliberately high input-token estimate: UTF-8 bytes / 3 of the JSON the
 * request sends. Real tokenisers average nearer 4 bytes per token for English,
 * so the hold errs toward refusing a call that would just fit, never toward
 * letting one through that would not.
 */
export function estimateInputTokens(input) {
  if (input == null) return 0;
  const text = typeof input === 'string' ? input : JSON.stringify(input);
  return Math.ceil(new TextEncoder().encode(text).length / 3);
}

/** FNV-1a over a string, as 8 hex characters: a cheap repeat fingerprint. */
export function fingerprint(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function memoryStore(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    get: (k) => m.get(k),
    set: (k, v) => { m.set(k, v); },
    delete: (k) => { m.delete(k); },
    entries: () => [...m.entries()],
  };
}

const scopeValue = (scope, ctx) => (scope === 'global' ? '*' : String(ctx?.[scope] ?? '(none)'));
const round6 = (x) => Math.round(x * 1e6) / 1e6;

export function createGuard(rawPolicy, { store = memoryStore(), now = () => Date.now(), onEvent = () => {} } = {}) {
  const policy = normalisePolicy(rawPolicy);
  const holds = new Map();
  const history = new Map(); // breaker id + scope value -> [{ t, usd, fp, holdId }]
  let halted = null;
  let seq = 0;

  const emit = (event) => {
    try { onEvent({ at: new Date(now()).toISOString(), ...event }); } catch { /* a notifier must never break the guard */ }
  };

  const bucketKey = (b, ctx, t) => `b|${b.id}|${scopeValue(b.scope, ctx)}|${windowKey(b.window, t)}`;
  const readBucket = (k) => store.get(k) ?? { spent: 0, reserved: 0, calls: 0 };

  function expireHolds(t) {
    for (const [id, h] of holds) if (t - h.t > policy.holdTtlSec * 1000) settle(id, null, { reason: 'hold-expired' });
  }

  function pruneHistory(t) {
    for (const [k, list] of history) {
      const keep = list.filter((e) => t - e.t <= Math.max(60, e.repeatWindowSec) * 1000);
      if (keep.length) history.set(k, keep); else history.delete(k);
    }
  }

  function breakerVerdict(br, ctx, t, est, fp) {
    const sv = scopeValue(br.scope, ctx);
    const tripKey = `trip|${br.id}|${sv}`;
    const trip = store.get(tripKey);
    if (trip && trip.until > t) {
      return { code: 'breaker-open', breaker: br.id, scopeValue: sv, retryAfterSec: Math.ceil((trip.until - t) / 1000), message: `breaker ${br.id} is open for ${br.scope}=${sv} (${trip.reason}); retry in ${Math.ceil((trip.until - t) / 1000)}s` };
    }
    const list = history.get(`${br.id}|${sv}`) ?? [];
    const lastMinute = list.filter((e) => t - e.t < 60_000);
    let reason = null;
    if (br.maxCallsPerMinute != null && lastMinute.length + 1 > br.maxCallsPerMinute) {
      reason = `more than ${br.maxCallsPerMinute} calls in 60s`;
    } else if (br.maxSpendPerMinuteUsd != null && lastMinute.reduce((s, e) => s + e.usd, 0) + est > br.maxSpendPerMinuteUsd) {
      reason = `more than $${br.maxSpendPerMinuteUsd} in 60s`;
    } else if (br.maxRepeats != null && list.filter((e) => e.fp === fp && t - e.t < br.repeatWindowSec * 1000).length + 1 > br.maxRepeats) {
      reason = `the same request more than ${br.maxRepeats} times in ${br.repeatWindowSec}s`;
    }
    if (!reason) return null;
    const until = t + br.cooldownSec * 1000;
    if (policy.mode === 'enforce') store.set(tripKey, { until, reason, at: t });
    emit({ type: 'trip', breaker: br.id, scope: br.scope, scopeValue: sv, reason, cooldownSec: br.cooldownSec, mode: policy.mode });
    return { code: 'breaker-tripped', breaker: br.id, scopeValue: sv, retryAfterSec: br.cooldownSec, message: `breaker ${br.id} tripped for ${br.scope}=${sv}: ${reason}` };
  }

  /**
   * Decide on a call before it is sent.
   *   req: { model, maxOutputTokens?, input? | inputTokens?, scope?: { user, feature, key, run }, fingerprint? }
   * Returns { allowed, id, mode, estimateUsd, maxOutputTokens, inputTokens, reasons[], warnings[] }.
   * In observe mode `allowed` is always true and `reasons` says what enforce would have refused.
   */
  function check(req = {}) {
    const t = now();
    expireHolds(t);
    pruneHistory(t);
    const ctx = req.scope ?? {};
    const reasons = [];
    const warnings = [];
    const price = priceFor(policy, req.model);

    if (halted) reasons.push({ code: 'halted', message: `all calls are halted: ${halted}` });
    if (!price && policy.requireKnownPrice) {
      reasons.push({ code: 'unpriced-model', message: `no price configured for model "${req.model}"; add it to prices or set fallbackPrice` });
    }

    let maxOut = Number.isInteger(req.maxOutputTokens) && req.maxOutputTokens > 0 ? req.maxOutputTokens : null;
    if (maxOut == null) {
      if (policy.defaultMaxOutputTokens) {
        maxOut = policy.defaultMaxOutputTokens;
        warnings.push({ code: 'output-cap-added', message: `no output cap on the request; added ${maxOut}` });
      } else if (policy.requireOutputCap) {
        reasons.push({ code: 'no-output-cap', message: 'the request sets no output-token cap, so its cost has no upper bound' });
      }
    }
    if (maxOut != null && policy.maxOutputTokens && maxOut > policy.maxOutputTokens) {
      warnings.push({ code: 'output-cap-clamped', message: `output cap ${maxOut} lowered to the policy ceiling ${policy.maxOutputTokens}` });
      maxOut = policy.maxOutputTokens;
    }

    const inputTokens = Number.isFinite(req.inputTokens) ? req.inputTokens : estimateInputTokens(req.input);
    const estimateUsd = price ? costUsd(price, { input: inputTokens, output: maxOut ?? 0 }) : 0;
    if (policy.maxCostPerCallUsd != null && estimateUsd > policy.maxCostPerCallUsd) {
      reasons.push({ code: 'call-too-expensive', message: `worst case $${estimateUsd.toFixed(4)} is over the per-call limit $${policy.maxCostPerCallUsd}` });
    }

    const fp = req.fingerprint ?? fingerprint(`${req.model}|${typeof req.input === 'string' ? req.input : JSON.stringify(req.input ?? '')}`);
    if (!reasons.length) {
      for (const br of policy.breakers) {
        const v = breakerVerdict(br, ctx, t, estimateUsd, fp);
        if (v) reasons.push(v);
      }
    }

    const keys = [];
    for (const b of policy.budgets) {
      const k = bucketKey(b, ctx, t);
      keys.push([b, k]);
      const cur = readBucket(k);
      const sv = scopeValue(b.scope, ctx);
      if (b.limitUsd != null && cur.spent + cur.reserved + estimateUsd > b.limitUsd + 1e-12) {
        reasons.push({
          code: 'budget-exceeded', budget: b.id, scopeValue: sv,
          retryAfterSec: Number.isFinite(windowEnd(b.window, t)) ? Math.ceil((windowEnd(b.window, t) - t) / 1000) : null,
          message: `budget ${b.id} (${b.scope}=${sv}, ${b.window}): $${round6(cur.spent + cur.reserved)} used or held of $${b.limitUsd}; this call could cost up to $${estimateUsd.toFixed(4)}`,
        });
      }
      if (b.limitCalls != null && cur.calls + 1 > b.limitCalls) {
        reasons.push({
          code: 'call-limit', budget: b.id, scopeValue: sv,
          retryAfterSec: Number.isFinite(windowEnd(b.window, t)) ? Math.ceil((windowEnd(b.window, t) - t) / 1000) : null,
          message: `budget ${b.id} (${b.scope}=${sv}, ${b.window}): ${cur.calls} of ${b.limitCalls} calls used`,
        });
      }
    }

    const enforce = policy.mode === 'enforce';
    const allowed = !enforce || reasons.length === 0;
    const decision = { allowed, id: null, mode: policy.mode, model: req.model ?? null, estimateUsd: round6(estimateUsd), maxOutputTokens: maxOut, inputTokens, reasons, warnings };
    if (reasons.length) emit({ type: enforce ? 'block' : 'would-block', model: req.model ?? null, scope: ctx, reasons });
    if (!allowed) return decision;

    const id = `h${++seq}-${t.toString(36)}`;
    for (const [, k] of keys) {
      const cur = readBucket(k);
      store.set(k, { ...cur, reserved: cur.reserved + estimateUsd, calls: cur.calls + 1 });
    }
    const entries = [];
    for (const br of policy.breakers) {
      const hk = `${br.id}|${scopeValue(br.scope, ctx)}`;
      const e = { t, usd: estimateUsd, fp, holdId: id, repeatWindowSec: br.repeatWindowSec };
      history.set(hk, [...(history.get(hk) ?? []), e]);
      entries.push(e);
    }
    holds.set(id, { t, price, estimateUsd, keys, entries, ctx });
    decision.id = id;
    return decision;
  }

  function maybeAlert(b, k, before, after, ctx) {
    if (b.limitUsd == null || b.limitUsd === 0) return;
    for (const a of b.alertAt) {
      const line = a * b.limitUsd;
      if (before < line - 1e-12 && after >= line - 1e-12) {
        const ak = `a|${k}|${a}`;
        if (store.get(ak)) continue;
        store.set(ak, true);
        emit({ type: 'alert', budget: b.id, scope: b.scope, scopeValue: scopeValue(b.scope, ctx), window: b.window, threshold: a, spentUsd: round6(after), limitUsd: b.limitUsd });
      }
    }
  }

  /**
   * Replace a hold with the call's actual cost. `usage` is { input, output,
   * cacheRead, cacheWrite } in tokens, or null when the outcome is unknown
   * (the stream broke, the provider sent no usage): the hold is then charged.
   */
  function settle(id, usage, { reason } = {}) {
    const h = holds.get(id);
    if (!h) return null;
    holds.delete(id);
    const actual = usage && h.price ? costUsd(h.price, usage) : h.estimateUsd;
    for (const [b, k] of h.keys) {
      const cur = readBucket(k);
      const next = { ...cur, reserved: Math.max(0, cur.reserved - h.estimateUsd), spent: cur.spent + actual };
      store.set(k, next);
      maybeAlert(b, k, cur.spent, next.spent, h.ctx);
    }
    for (const e of h.entries) e.usd = actual;
    emit({ type: 'settle', id, costUsd: round6(actual), heldUsd: round6(h.estimateUsd), reason: reason ?? (usage ? 'usage' : 'unknown-usage') });
    return { costUsd: round6(actual), heldUsd: round6(h.estimateUsd) };
  }

  /** Release a hold without charging it: the call never reached the provider, or the provider refused it. */
  function cancel(id) {
    const h = holds.get(id);
    if (!h) return false;
    holds.delete(id);
    for (const [, k] of h.keys) {
      const cur = readBucket(k);
      store.set(k, { ...cur, reserved: Math.max(0, cur.reserved - h.estimateUsd), calls: Math.max(0, cur.calls - 1) });
    }
    for (const [hk, list] of history) history.set(hk, list.filter((e) => e.holdId !== id));
    return true;
  }

  /** Current window of every budget bucket the store holds, open breakers, and the halt flag. */
  function status() {
    const t = now();
    expireHolds(t);
    const budgets = [];
    const open = [];
    for (const [k, v] of store.entries()) {
      const parts = k.split('|');
      if (parts[0] === 'b') {
        const b = policy.budgets.find((x) => x.id === parts[1]);
        if (!b || windowKey(b.window, t) !== parts[3]) continue;
        budgets.push({ budget: b.id, scope: b.scope, scopeValue: parts[2], window: b.window, windowKey: parts[3], spentUsd: round6(v.spent), heldUsd: round6(v.reserved), limitUsd: b.limitUsd, calls: v.calls, limitCalls: b.limitCalls });
      } else if (parts[0] === 'trip' && v.until > t) {
        open.push({ breaker: parts[1], scopeValue: parts[2], reason: v.reason, retryAfterSec: Math.ceil((v.until - t) / 1000) });
      }
    }
    return { mode: policy.mode, halted, holds: holds.size, budgets, openBreakers: open };
  }

  /** Drop counters for windows that have closed, so a long-lived store stays small. */
  function compact() {
    const t = now();
    let dropped = 0;
    for (const [k] of store.entries()) {
      const parts = k.split('|');
      const bk = parts[0] === 'a' ? parts.slice(1) : parts;
      if (bk[0] !== 'b') {
        if (parts[0] === 'trip' && store.get(k).until <= t) { store.delete(k); dropped++; }
        continue;
      }
      const b = policy.budgets.find((x) => x.id === bk[1]);
      if (!b || windowKey(b.window, t) !== bk[3]) { store.delete(k); dropped++; }
    }
    return dropped;
  }

  return {
    policy,
    check,
    settle,
    cancel,
    status,
    compact,
    halt(reason = 'halted by operator') { halted = String(reason); emit({ type: 'halt', reason: halted }); },
    resume() { halted = null; emit({ type: 'resume' }); },
    /** check, run, settle in one go. `run(decision)` resolves to { result, usage }. */
    async guarded(req, run) {
      const d = check(req);
      if (!d.allowed) {
        const err = new Error(d.reasons.map((r) => r.message).join('; '));
        err.name = 'SpendGuardBlocked';
        err.decision = d;
        throw err;
      }
      let out;
      try {
        out = await run(d);
      } catch (e) {
        if (d.id) (e?.charged ? settle(d.id, null) : cancel(d.id));
        throw e;
      }
      if (d.id) settle(d.id, out?.usage ?? null);
      return out?.result;
    },
  };
}
