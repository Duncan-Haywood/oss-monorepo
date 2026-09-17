import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, rankOffers, DEFAULTS } from './calc.mjs';

function close(actual, expected, eps = 0.01) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be close to ${expected}`);
}

test('calculate() matches hand-computed arithmetic on the default inputs', () => {
  const r = calculate(DEFAULTS);
  close(r.totalClaims, 31.5);
  close(r.largeLossClaims, 3.15);
  close(r.normalClaims, 28.35);
  close(r.blendedFeePerClaim, 590);
  close(r.grossRevenue, 18585);
  close(r.inZoneCost, 5052.6);
  close(r.travelCost, 374);
  close(r.fixedDeploymentCost, 150);
  close(r.totalCost, 5576.6);
  close(r.netProfit, 13008.4);
  close(r.totalDays, 23);
  close(r.workHours, 210);
  close(r.effectiveHourlyRate, 13008.4 / 210);
  close(r.effectiveDailyRate, 13008.4 / 23);
  close(r.profitPerClaim, 13008.4 / 31.5);
  close(r.profitMarginPct, (13008.4 / 18585) * 100);
  close(r.breakEvenClaimsPerDay, 0.4501, 0.001);
  assert.ok(r.netProfit > 0, 'the default deployment should be profitable');
});

test('a lowball fee schedule can still show a profit while paying a very low effective hourly rate', () => {
  const lowball = calculate({ ...DEFAULTS, feePerClaim: 350, claimsPerDay: 0.8, largeLossPct: 5, largeLossBonusPerClaim: 300 });
  close(lowball.netProfit, 555.4);
  close(lowball.effectiveHourlyRate, 555.4 / 210, 0.01);
  assert.ok(lowball.netProfit > 0, 'still technically profitable');
  assert.ok(lowball.effectiveHourlyRate < 5, 'but a very low effective hourly rate');
});

test('a deployment with zero claims still pays every daily and travel cost', () => {
  const r = calculate({ ...DEFAULTS, claimsPerDay: 0 });
  assert.equal(r.totalClaims, 0);
  assert.equal(r.grossRevenue, 0);
  assert.equal(r.profitPerClaim, null);
  assert.ok(r.netProfit < 0, 'costs still apply with zero claims closed');
});

test('unpaid travel days add cost with zero offsetting revenue', () => {
  const none = calculate({ ...DEFAULTS, travelDaysUnpaid: 0 });
  const some = calculate({ ...DEFAULTS, travelDaysUnpaid: 5 });
  assert.ok(some.netProfit < none.netProfit, 'more unpaid travel days must lower net profit');
  close(none.netProfit - some.netProfit, some.travelCost - none.travelCost);
});

test('a higher large-loss share raises the blended fee and gross revenue', () => {
  const low = calculate({ ...DEFAULTS, largeLossPct: 0 });
  const high = calculate({ ...DEFAULTS, largeLossPct: 50 });
  assert.ok(high.blendedFeePerClaim > low.blendedFeePerClaim);
  assert.ok(high.grossRevenue > low.grossRevenue);
});

test('break-even pace rises when the blended fee falls', () => {
  const good = calculate(DEFAULTS);
  const lowball = calculate({ ...DEFAULTS, feePerClaim: 350, largeLossPct: 5, largeLossBonusPerClaim: 300 });
  assert.ok(lowball.breakEvenClaimsPerDay > good.breakEvenClaimsPerDay);
});

test('rejects a large-loss percentage over 100', () => {
  assert.throws(() => calculate({ ...DEFAULTS, largeLossPct: 150 }), /large-loss/i);
});

test('rejects a negative deployment days', () => {
  assert.throws(() => calculate({ ...DEFAULTS, deploymentDays: -1 }), /deployment days/i);
});

test('rejects a non-numeric input', () => {
  assert.throws(() => calculate({ ...DEFAULTS, feePerClaim: 'a lot' }), /fee per claim/i);
});

test('rankOffers sorts by net profit descending and reports the spread', () => {
  const r = rankOffers([
    { name: 'Firm A', netProfit: 13008 },
    { name: 'Firm B', netProfit: 555 },
    { name: 'Firm C', netProfit: 8000 },
  ]);
  assert.deepEqual(r.ranked.map(o => o.name), ['Firm A', 'Firm C', 'Firm B']);
  assert.equal(r.best.name, 'Firm A');
  assert.equal(r.worst.name, 'Firm B');
  assert.equal(r.spread, 13008 - 555);
  assert.equal(r.offerCount, 3);
});

test('rankOffers on an empty list returns nulls without dividing by zero', () => {
  const r = rankOffers([]);
  assert.equal(r.best, null);
  assert.equal(r.worst, null);
  assert.equal(r.spread, 0);
  assert.equal(r.offerCount, 0);
});

test('rankOffers accepts a negative net profit (a losing offer) rather than rejecting it', () => {
  const r = rankOffers([{ name: 'Bad firm', netProfit: -400 }, { name: 'Good firm', netProfit: 200 }]);
  assert.equal(r.best.name, 'Good firm');
  assert.equal(r.worst.name, 'Bad firm');
  assert.equal(r.spread, 600);
});
