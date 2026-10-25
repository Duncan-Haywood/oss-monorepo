import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInputs, runEvaluation, runFunded, mulberry32, analyse, expectancyR, breakEvenWinRate, riskSweep, encodeState, decodeState, toCsv, summaryText, DEFAULTS } from './calc.mjs';

const base = { ...DEFAULTS, sims: 2000, seed: 7 };
const always = (v) => () => v; // rand() < win: 0 always wins, 0.999 always loses (when 0 < win < 1)

test('a perfect record passes in exactly the trades the target needs', () => {
  // risk 0.5% x 1.5R = 0.75% per win; 8% target needs ceil(8/0.75)=11 wins; 2 trades/day -> day 6; min days 4 satisfied
  const p = parseInputs({ ...base, winRatePct: 100 });
  const e = runEvaluation(p, always(0));
  assert.deepEqual([e.passed, e.trades, e.days], [true, 11, 6]);
});

test('minimum trading days delays a pass that the target alone would allow', () => {
  const p = parseInputs({ ...base, winRatePct: 100, profitTargetPct: 1.5, minTradingDays: 5 });
  const e = runEvaluation(p, always(0));
  assert.equal(e.passed, true);
  assert.equal(e.days, 5);
});

test('all losses end on the daily limit before the max drawdown when the daily limit is tighter', () => {
  // 0.5% loss per trade, 2 trades/day = 1%/day; daily limit 0.8% -> breached on trade 2 of day 1 (-1% <= -0.8%)
  const p = parseInputs({ ...base, winRatePct: 0, dailyLossPct: 0.8 });
  const e = runEvaluation(p, always(0.999));
  assert.deepEqual([e.passed, e.reason, e.days, e.trades], [false, 'daily', 1, 2]);
});

test('all losses end on static drawdown with no daily limit: 10% / 0.5% = 20 trades', () => {
  const p = parseInputs({ ...base, winRatePct: 0, dailyLossPct: 0 });
  const e = runEvaluation(p, always(0.999));
  assert.deepEqual([e.passed, e.reason, e.trades, e.days], [false, 'drawdown', 20, 10]);
});

test('a trailing floor follows profit: win to +3%, then lose 10% from the high ends the attempt', () => {
  const p = parseInputs({ ...base, drawdownType: 'trailing', lockAtStart: 'no', dailyLossPct: 0, maxLossPct: 10, profitTargetPct: 50, riskPerTradePct: 1, rewardRisk: 3, tradesPerDay: 1, maxDays: 0, minTradingDays: 0 });
  let n = 0;
  const seq = () => (n++ < 1 ? 0 : 0.999); // one +3% win, then losses of 1%
  const e = runEvaluation(p, seq);
  // floor = 3 - 10 = -7; equity after win 3, then 3 - k <= -7 -> k = 10 losses; trades = 11
  assert.deepEqual([e.reason, e.trades], ['drawdown', 11]);
  // the same sequence on a static 10% floor would need 13 losses (3-k <= -10)
  n = 0;
  const s = runEvaluation({ ...p, drawdownType: 'static' }, seq);
  assert.equal(s.trades, 14);
});

test('lock-at-start stops the trailing floor rising above the starting balance', () => {
  const p = parseInputs({ ...base, drawdownType: 'trailing', lockAtStart: 'yes', dailyLossPct: 0, maxLossPct: 5, profitTargetPct: 90, riskPerTradePct: 1, rewardRisk: 10, tradesPerDay: 1, maxDays: 0, minTradingDays: 0 });
  let n = 0;
  const seq = () => (n++ < 1 ? 0 : 0.999); // +10% then -1% steps; locked floor is 0, so breach when equity <= 0: 10 losses
  const e = runEvaluation(p, seq);
  assert.deepEqual([e.reason, e.trades], ['drawdown', 11]);
});

test('time limit ends an attempt that never reaches the target', () => {
  const p = parseInputs({ ...base, winRatePct: 100, rewardRisk: 0.01, maxDays: 3, minTradingDays: 0 });
  const e = runEvaluation(p, always(0));
  assert.deepEqual([e.passed, e.reason, e.days], [false, 'time', 3]);
});

test('fair-coin gambler\'s ruin: +10 steps before -10 steps passes about half the time', () => {
  const r = analyse({ ...DEFAULTS, winRatePct: 50, rewardRisk: 1, riskPerTradePct: 1, profitTargetPct: 10, maxLossPct: 10, dailyLossPct: 0, minTradingDays: 0, maxDays: 0, tradesPerDay: 5, sims: 20000, seed: 99, fundedDays: 0 }, { sweep: false, breakEven: false });
  assert.ok(Math.abs(r.passRate - 0.5) < 0.02, `pass rate ${r.passRate}`);
});

test('gambler\'s ruin is asymmetric as the walk dictates: +5 before -15 passes about 75%', () => {
  const r = analyse({ ...DEFAULTS, winRatePct: 50, rewardRisk: 1, riskPerTradePct: 1, profitTargetPct: 5, maxLossPct: 15, dailyLossPct: 0, minTradingDays: 0, maxDays: 0, tradesPerDay: 5, sims: 20000, seed: 5, fundedDays: 0 }, { sweep: false, breakEven: false });
  assert.ok(Math.abs(r.passRate - 0.75) < 0.02, `pass rate ${r.passRate}`);
});

test('economics: expected cost to pass is fee / pass rate and EV nets the fee', () => {
  const r = analyse({ ...base, fundedDays: 0 }, { sweep: false, breakEven: false });
  assert.equal(r.expectedCostToPass, Math.round((540 / r.passRate) * 100) / 100);
  assert.equal(r.expectedAttempts, Math.round((1 / r.passRate) * 100) / 100);
  assert.equal(r.evPerAttempt, -540); // no funded phase -> no payout, so EV is minus the fee
});

test('funded payouts: a perfect record collects a payout each 4% cycle and is paid the split', () => {
  const r = analyse({ ...base, winRatePct: 100, fundedDays: 12, sims: 500 }, { sweep: false, breakEven: false });
  // 0.75% per win, 2 trades/day -> 1.5%/day; 4% target is reached on trade 6 (4.5%) = day 3; base resets to 4.5%;
  // then 0.75*6=4.5 again every 6 trades -> 24 trades in 12 days = 4 payouts
  assert.equal(r.passRate, 1);
  assert.equal(r.avgPayoutsAfterPass, 4);
  assert.equal(r.expectedPayoutPerPass, 4 * 100000 * 0.04 * 0.8);
});

test('zero expectancy raises a note; negative EV raises a note', () => {
  const r = analyse({ ...base, winRatePct: 40, rewardRisk: 1.5, sims: 1000 }, { sweep: false, breakEven: false });
  assert.equal(r.expectancyR, 0);
  assert.ok(r.notes.some((n) => /expectancy/.test(n)));
});

test('same seed, same answer; different seed, different draws', () => {
  const a = analyse(base, { sweep: false, breakEven: false });
  const b = analyse(base, { sweep: false, breakEven: false });
  const c = analyse({ ...base, seed: 8 }, { sweep: false, breakEven: false });
  assert.deepEqual(a, b);
  assert.notEqual(a.passRate, c.passRate);
});

test('mulberry32 is uniform enough on [0,1)', () => {
  const r = mulberry32(1); let s = 0; for (let i = 0; i < 20000; i++) { const x = r(); assert.ok(x >= 0 && x < 1); s += x; }
  assert.ok(Math.abs(s / 20000 - 0.5) < 0.01);
});

test('expectancy: 45% at 1.5R is 0.125R', () => assert.equal(expectancyR(parseInputs(base)), 0.125));

test('break-even win rate is below the current rate when EV is positive and null when unreachable', () => {
  const p = parseInputs({ ...base, winRatePct: 60, rewardRisk: 2, fee: 100, sims: 1500 });
  const be = breakEvenWinRate(p, 1500);
  assert.ok(be > 0 && be < 60, `break-even ${be}`);
  const hopeless = parseInputs({ ...base, fee: 1e9, sims: 500 });
  assert.equal(breakEvenWinRate(hopeless, 500), null);
});

test('risk sweep lists only risks the drawdown can bear and raises pass rate with risk on a positive edge in a short window', () => {
  const p = parseInputs({ ...base, maxLossPct: 1.2 });
  assert.deepEqual(riskSweep(p, 500).map((r) => r.riskPerTradePct), [0.25, 0.5, 0.75, 1]);
});

test('bad input throws instead of clamping', () => {
  assert.throws(() => parseInputs({ ...base, winRatePct: 120 }), /at most 100/);
  assert.throws(() => parseInputs({ ...base, accountSize: 0 }), /greater than 0/);
  assert.throws(() => parseInputs({ ...base, riskPerTradePct: 11 }), /cannot exceed the max drawdown/);
  assert.throws(() => parseInputs({ ...base, drawdownType: 'weird' }), /static or trailing/);
  assert.throws(() => parseInputs({ ...base, minTradingDays: 40, maxDays: 30 }), /Minimum trading days/);
  assert.throws(() => parseInputs({ ...base, fee: 'abc' }), /must be a number/);
  assert.throws(() => parseInputs({ ...base, tradesPerDay: 1.5 }), /whole number/);
});

test('share state round-trips and a malformed hash falls back to nothing', () => {
  const s = encodeState({ accountSize: '50000', winRatePct: '55', seed: '3' });
  assert.deepEqual(decodeState('#' + s), { accountSize: '50000', winRatePct: '55', seed: '3' });
  assert.deepEqual(decodeState('%%%'), {});
});

test('csv and summary text carry the sweep and the not-a-forecast line', () => {
  const r = analyse({ ...base, sims: 600 });
  assert.match(toCsv(r), /^risk_per_trade_pct,pass_rate_pct/);
  assert.equal(toCsv(r).trim().split('\n').length, 1 + r.sweep.length);
  assert.match(summaryText(r), /not a forecast/);
});

test('input bounds: profit target tops out at 100% and trades per day at 50', () => {
  assert.doesNotThrow(() => parseInputs({ ...base, profitTargetPct: 100 }));
  assert.throws(() => parseInputs({ ...base, profitTargetPct: 100.5 }), /at most 100/);
  assert.doesNotThrow(() => parseInputs({ ...base, tradesPerDay: 50 }));
  assert.throws(() => parseInputs({ ...base, tradesPerDay: 51 }), /at most 50/);
});

test('a 50% win rate loses when the draw lands above it', () => {
  const p = parseInputs({ ...base, winRatePct: 50 });
  const e = runEvaluation(p, always(0.6));
  assert.equal(e.passed, false);
  assert.equal(e.reason, 'drawdown');
});

test('the max drawdown is breached on the first trade that reaches it, not one earlier', () => {
  // 10.1% static floor, 0.5% lost per trade: 20 losses reach 10.0% (still inside), the 21st reaches 10.5%.
  const p = parseInputs({ ...base, winRatePct: 0, maxLossPct: 10.1, dailyLossPct: 0, drawdownType: 'static', maxDays: 30 });
  const e = runEvaluation(p, always(0.999));
  assert.deepEqual([e.passed, e.reason, e.trades], [false, 'drawdown', 21]);
});

test('funded phase: a 50% win rate loses when the draw lands above it', () => {
  const p = parseInputs({ ...base, winRatePct: 50, fundedDays: 30 });
  assert.deepEqual(runFunded(p, always(0.6)), { payouts: 0, breached: true });
  assert.equal(runFunded(p, always(0.4)).breached, false);
});
