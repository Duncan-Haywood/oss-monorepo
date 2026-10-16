import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GuardPolicyError, costUsd, createGuard, estimateInputTokens, memoryStore, normalisePolicy, priceFor, windowEnd, windowKey,
} from './guard.mjs';

const T0 = Date.UTC(2026, 9, 16, 12, 0, 0);
const PRICES = { big: { in: 3, out: 15 }, small: { in: 1, out: 5 } };

function clockGuard(policy, extra = {}) {
  const clock = { t: T0 };
  const events = [];
  const g = createGuard({ prices: PRICES, ...policy }, { now: () => clock.t, onEvent: (e) => events.push(e), ...extra });
  return { g, clock, events };
}

test('policy validation names the bad field', () => {
  assert.throws(() => normalisePolicy({ prices: { x: { in: -1, out: 1 } } }), /prices\.x\.in/);
  assert.throws(() => normalisePolicy({ budgets: [{ window: 'week', limitUsd: 1 }] }), /budgets\[0\]\.window/);
  assert.throws(() => normalisePolicy({ budgets: [{ scope: 'team', limitUsd: 1 }] }), /budgets\[0\]\.scope/);
  assert.throws(() => normalisePolicy({ budgets: [{}] }), /limitUsd, limitCalls/);
  assert.throws(() => normalisePolicy({ budgets: [{ id: 'a', limitUsd: 1 }, { id: 'a', limitUsd: 2 }] }), /duplicate id "a"/);
  assert.throws(() => normalisePolicy({ breakers: [{ scope: 'run' }] }), /breakers\[0\]/);
  assert.throws(() => normalisePolicy({ mode: 'loose' }), GuardPolicyError);
  assert.equal(normalisePolicy({ prices: { _note: 'comment', a: { in: 1, out: 2 } } }).prices._note, undefined);
});

test('price lookup: exact, then longest prefix, then fallback', () => {
  const p = normalisePolicy({ prices: { 'claude-x': { in: 1, out: 2 }, 'claude-x-mini': { in: 0.1, out: 0.2 } }, fallbackPrice: { in: 9, out: 9 } });
  assert.equal(priceFor(p, 'claude-x').in, 1);
  assert.equal(priceFor(p, 'claude-x-20250101').in, 1);
  assert.equal(priceFor(p, 'claude-x-mini-2025').in, 0.1);
  assert.equal(priceFor(p, 'other').in, 9);
  assert.equal(priceFor(normalisePolicy({}), 'other'), null);
});

test('cost: cache rates default to the input rate; per million tokens', () => {
  const price = normalisePolicy({ prices: { m: { in: 3, out: 15, cacheRead: 0.3 } } }).prices.m;
  assert.equal(costUsd(price, { input: 1e6, output: 1e6 }), 18);
  assert.equal(costUsd(price, { cacheRead: 1e6, cacheWrite: 1e6 }), 0.3 + 3);
  assert.equal(costUsd(price, { input: -5, output: NaN }), 0);
});

test('UTC windows and their ends', () => {
  const t = Date.UTC(2026, 11, 31, 23, 59, 30);
  assert.equal(windowKey('month', t), '2026-12');
  assert.equal(windowKey('day', t), '2026-12-31');
  assert.equal(windowKey('hour', t), '2026-12-31T23');
  assert.equal(windowKey('minute', t), '2026-12-31T23:59');
  assert.equal(windowKey('total', t), 'all');
  assert.equal(windowEnd('month', t), Date.UTC(2027, 0, 1));
  assert.equal(windowEnd('minute', t), Date.UTC(2027, 0, 1));
  assert.equal(windowEnd('total', t), Infinity);
});

test('input estimate errs high (bytes / 3)', () => {
  assert.equal(estimateInputTokens('abcdef'), 2);
  assert.equal(estimateInputTokens(null), 0);
  assert.ok(estimateInputTokens({ messages: [{ role: 'user', content: 'hello world' }] }) > 'hello world'.length / 4);
});

test('fails closed: unpriced model and uncapped output are refused by default', () => {
  const { g } = clockGuard({});
  const a = g.check({ model: 'mystery', maxOutputTokens: 100 });
  assert.equal(a.allowed, false);
  assert.equal(a.reasons[0].code, 'unpriced-model');
  const b = g.check({ model: 'big', input: 'hi' });
  assert.equal(b.allowed, false);
  assert.equal(b.reasons[0].code, 'no-output-cap');
});

test('output cap is added when missing and clamped to the ceiling', () => {
  const { g } = clockGuard({ defaultMaxOutputTokens: 500, maxOutputTokens: 1000 });
  const a = g.check({ model: 'big', input: 'x' });
  assert.equal(a.allowed, true);
  assert.equal(a.maxOutputTokens, 500);
  assert.equal(a.warnings[0].code, 'output-cap-added');
  const b = g.check({ model: 'big', input: 'x', maxOutputTokens: 64000 });
  assert.equal(b.maxOutputTokens, 1000);
  assert.equal(b.warnings[0].code, 'output-cap-clamped');
});

test('per-call worst-case limit', () => {
  const { g } = clockGuard({ maxCostPerCallUsd: 0.01 });
  assert.equal(g.check({ model: 'big', inputTokens: 100, maxOutputTokens: 100 }).allowed, true);
  const d = g.check({ model: 'big', inputTokens: 100, maxOutputTokens: 10_000 });
  assert.equal(d.allowed, false);
  assert.equal(d.reasons[0].code, 'call-too-expensive');
});

test('holds count against the budget, so concurrent calls cannot overshoot it', () => {
  // Each call's worst case: 1e5 output tokens at $15/M = $1.50.
  const { g } = clockGuard({ budgets: [{ id: 'day', limitUsd: 4 }] });
  const a = g.check({ model: 'big', inputTokens: 0, maxOutputTokens: 100_000 });
  const b = g.check({ model: 'big', inputTokens: 0, maxOutputTokens: 100_000 });
  const c = g.check({ model: 'big', inputTokens: 0, maxOutputTokens: 100_000 });
  assert.equal(a.allowed && b.allowed, true);
  assert.equal(c.allowed, false, 'two holds of $1.50 leave $1, less than a third worst case');
  assert.equal(c.reasons[0].code, 'budget-exceeded');
  assert.ok(c.reasons[0].retryAfterSec > 0);
  // Settling at the real (small) cost frees the rest of the hold.
  g.settle(a.id, { input: 0, output: 1000 });
  g.settle(b.id, { input: 0, output: 1000 });
  assert.equal(g.check({ model: 'big', inputTokens: 0, maxOutputTokens: 100_000 }).allowed, true);
  const s = g.status().budgets.find((x) => x.budget === 'day');
  assert.equal(s.spentUsd, 0.03);
  assert.equal(s.heldUsd, 1.5);
});

test('per-user budgets are separate; calls without a user share one "(none)" bucket', () => {
  const { g } = clockGuard({ budgets: [{ id: 'u', scope: 'user', limitUsd: 0.02 }] });
  const call = (user) => g.check({ model: 'small', inputTokens: 0, maxOutputTokens: 3000, scope: { user } }); // $0.015
  const a = call('ann');
  g.settle(a.id, { output: 3000 });
  assert.equal(call('ann').allowed, false);
  assert.equal(call('bob').allowed, true);
  const n = call(undefined);
  g.settle(n.id, { output: 3000 });
  const blocked = call(undefined);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reasons[0].scopeValue, '(none)');
});

test('the budget resets when its window rolls over', () => {
  const { g, clock } = clockGuard({ budgets: [{ id: 'm', window: 'minute', limitUsd: 0.02 }] });
  const a = g.check({ model: 'small', inputTokens: 0, maxOutputTokens: 3000 });
  g.settle(a.id, { output: 3000 });
  assert.equal(g.check({ model: 'small', inputTokens: 0, maxOutputTokens: 3000 }).allowed, false);
  clock.t += 60_000;
  assert.equal(g.check({ model: 'small', inputTokens: 0, maxOutputTokens: 3000 }).allowed, true);
});

test('call-count limits (e.g. agent steps per run)', () => {
  const { g } = clockGuard({ budgets: [{ id: 'steps', scope: 'run', window: 'total', limitCalls: 3 }] });
  const ids = [1, 2, 3].map(() => g.check({ model: 'small', inputTokens: 1, maxOutputTokens: 1, scope: { run: 'r1' } }));
  assert.ok(ids.every((d) => d.allowed));
  const d = g.check({ model: 'small', inputTokens: 1, maxOutputTokens: 1, scope: { run: 'r1' } });
  assert.equal(d.reasons[0].code, 'call-limit');
  assert.equal(d.reasons[0].retryAfterSec, null, 'a total window never reopens');
  assert.equal(g.check({ model: 'small', inputTokens: 1, maxOutputTokens: 1, scope: { run: 'r2' } }).allowed, true);
  // A cancelled call gives its step back.
  g.cancel(ids[0].id);
  assert.equal(g.check({ model: 'small', inputTokens: 1, maxOutputTokens: 1, scope: { run: 'r1' } }).allowed, true);
});

test('repeat breaker trips on the same request, stays open for the cooldown, then closes', () => {
  const { g, clock, events } = clockGuard({ breakers: [{ id: 'loop', scope: 'run', maxRepeats: 3, repeatWindowSec: 60, cooldownSec: 120 }] });
  const call = () => g.check({ model: 'small', input: 'same', maxOutputTokens: 10, scope: { run: 'r' } });
  for (let i = 0; i < 3; i++) { const d = call(); assert.equal(d.allowed, true); g.settle(d.id, { output: 10 }); clock.t += 1000; }
  const tripped = call();
  assert.equal(tripped.reasons[0].code, 'breaker-tripped');
  assert.equal(events.filter((e) => e.type === 'trip').length, 1);
  // A different request in the same run is still refused while the breaker is open.
  const other = g.check({ model: 'small', input: 'different', maxOutputTokens: 10, scope: { run: 'r' } });
  assert.equal(other.reasons[0].code, 'breaker-open');
  assert.ok(other.reasons[0].retryAfterSec <= 120);
  assert.equal(g.status().openBreakers.length, 1);
  clock.t += 121_000;
  assert.equal(call().allowed, true);
});

test('rate and spend-rate breakers', () => {
  const { g, clock } = clockGuard({ breakers: [{ id: 'rate', maxCallsPerMinute: 5, cooldownSec: 30 }] });
  for (let i = 0; i < 5; i++) { assert.equal(g.check({ model: 'small', input: `q${i}`, maxOutputTokens: 1 }).allowed, true); clock.t += 100; }
  assert.equal(g.check({ model: 'small', input: 'q6', maxOutputTokens: 1 }).reasons[0].code, 'breaker-tripped');

  const s = clockGuard({ breakers: [{ id: 'usd', maxSpendPerMinuteUsd: 0.05 }] });
  const a = s.g.check({ model: 'big', inputTokens: 0, maxOutputTokens: 2000 }); // $0.03 hold
  s.g.settle(a.id, { output: 2000 });
  assert.equal(s.g.check({ model: 'big', inputTokens: 0, maxOutputTokens: 2000 }).reasons[0].code, 'breaker-tripped');
});

test('alerts fire once per threshold per window', () => {
  const { g, events } = clockGuard({ budgets: [{ id: 'd', limitUsd: 0.1, alertAt: [0.5, 1] }] });
  const spend = (out) => { const d = g.check({ model: 'small', inputTokens: 0, maxOutputTokens: out }); g.settle(d.id, { output: out }); };
  spend(6000); // $0.03
  spend(6000); // $0.06: crosses 50%
  spend(2000); // $0.07
  const alerts = events.filter((e) => e.type === 'alert');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].threshold, 0.5);
  assert.equal(alerts[0].spentUsd, 0.06);
});

test('observe mode refuses nothing but reports what enforce would refuse', () => {
  const { g, events } = clockGuard({ mode: 'observe', budgets: [{ id: 'd', limitUsd: 0 }] });
  const d = g.check({ model: 'big', inputTokens: 10, maxOutputTokens: 10 });
  assert.equal(d.allowed, true);
  assert.equal(d.reasons[0].code, 'budget-exceeded');
  assert.equal(events[0].type, 'would-block');
});

test('an unsettled hold is charged in full when it expires', () => {
  const { g, clock } = clockGuard({ holdTtlSec: 10, budgets: [{ id: 'd', limitUsd: 1 }] });
  const d = g.check({ model: 'big', inputTokens: 0, maxOutputTokens: 10_000 }); // $0.15
  assert.ok(d.allowed);
  clock.t += 11_000;
  const s = g.status().budgets[0];
  assert.equal(s.spentUsd, 0.15);
  assert.equal(s.heldUsd, 0);
  assert.equal(g.settle(d.id, { output: 1 }), null, 'a late settle is ignored, not double-counted');
});

test('settle with null usage charges the hold', () => {
  const { g } = clockGuard({ budgets: [{ id: 'd', limitUsd: 1 }] });
  const d = g.check({ model: 'big', inputTokens: 0, maxOutputTokens: 10_000 });
  assert.deepEqual(g.settle(d.id, null), { costUsd: 0.15, heldUsd: 0.15 });
});

test('halt refuses everything until resume', () => {
  const { g } = clockGuard({});
  g.halt('bill spike');
  const d = g.check({ model: 'big', inputTokens: 1, maxOutputTokens: 1 });
  assert.equal(d.reasons[0].code, 'halted');
  assert.match(d.reasons[0].message, /bill spike/);
  g.resume();
  assert.equal(g.check({ model: 'big', inputTokens: 1, maxOutputTokens: 1 }).allowed, true);
});

test('guarded(): settles on success, cancels on error, throws SpendGuardBlocked on refusal', async () => {
  const { g } = clockGuard({ budgets: [{ id: 'd', limitUsd: 0.05 }] });
  const r = await g.guarded({ model: 'small', inputTokens: 0, maxOutputTokens: 1000 }, async (d) => ({ result: d.maxOutputTokens, usage: { output: 1000 } }));
  assert.equal(r, 1000);
  await assert.rejects(g.guarded({ model: 'small', inputTokens: 0, maxOutputTokens: 1000 }, async () => { throw new Error('network'); }), /network/);
  assert.equal(g.status().budgets[0].spentUsd, 0.005, 'the failed call cost nothing');
  await assert.rejects(g.guarded({ model: 'big', inputTokens: 0, maxOutputTokens: 100_000 }, async () => ({})), { name: 'SpendGuardBlocked' });
});

test('compact drops closed windows; state survives in a shared store', () => {
  const store = memoryStore();
  const clock = { t: T0 };
  const policy = { prices: PRICES, budgets: [{ id: 'h', window: 'hour', limitUsd: 1 }, { id: 'all', window: 'total', limitUsd: 10 }] };
  const g1 = createGuard(policy, { store, now: () => clock.t });
  const d = g1.check({ model: 'small', inputTokens: 0, maxOutputTokens: 1000 });
  g1.settle(d.id, { output: 1000 });
  // A restarted process reading the same store sees the spend.
  const g2 = createGuard(policy, { store, now: () => clock.t });
  assert.equal(g2.status().budgets.find((b) => b.budget === 'h').spentUsd, 0.005);
  clock.t += 3_600_000;
  assert.equal(g2.compact(), 1);
  assert.deepEqual(g2.status().budgets.map((b) => b.budget), ['all']);
});

test('a throwing event handler never breaks a decision', () => {
  const g = createGuard({ prices: PRICES }, { onEvent: () => { throw new Error('webhook down'); } });
  g.halt('x');
  assert.equal(g.check({ model: 'big', inputTokens: 1, maxOutputTokens: 1 }).allowed, false);
});
