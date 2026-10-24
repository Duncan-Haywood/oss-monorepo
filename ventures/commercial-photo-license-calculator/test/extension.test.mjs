import assert from 'node:assert/strict';
import test from 'node:test';
import { priceExtension } from '../extension.mjs';

const web6 = { channels: ['web'], term: 6, territory: 'national', exclusivity: 'none' };
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.005, `${a} != ${b}`);

test('extending a web license from 6 to 12 months charges the sqrt-term difference', () => {
  // rights(6mo)=1200*.35*1*1*1.25=525; rights(12mo)=525*sqrt2=742.46
  const r = priceExtension({ creative: 1200, images: 5, current: web6, extended: { ...web6, term: 12 } });
  near(r.paidRights, 525);
  near(r.newScopeRights, 742.462);
  near(r.extensionFee, 217.462);
  near(r.perImage, 43.492);
  assert.equal(r.narrower, false);
});

test('widening to paid ads and worldwide credits the first license', () => {
  const r = priceExtension({
    creative: 1200, images: 5, current: web6,
    extended: { channels: ['web', 'paid'], term: 6, territory: 'worldwide', exclusivity: 'none' },
  });
  // channel factor .85*1.4+.15*2.4=1.55; rights=1200*.35*1.55*1.6=1041.6
  near(r.newScopeRights, 1041.6);
  near(r.extensionFee, 516.6);
  near(r.freshQuote, 2241.6);
});

test('partial credit and rush apply to the new scope only', () => {
  const r = priceExtension({ creative: 1000, images: 1, rush: 50, creditPercent: 50, current: web6, extended: { ...web6, term: 12 } });
  near(r.credit, 437.5 * 0.5);
  near(r.newScopeRights, 437.5 * Math.SQRT2 * 1.5);
  near(r.extensionFee, 437.5 * Math.SQRT2 * 1.5 - 218.75);
});

test('a narrower scope is flagged and never quotes a negative fee', () => {
  const r = priceExtension({ creative: 1200, images: 5, current: { ...web6, term: 12 }, extended: web6 });
  assert.equal(r.narrower, true);
  assert.equal(r.extensionFee, 0);
});

test('bad input is rejected with a readable message', () => {
  assert.throws(() => priceExtension({ creative: -1, images: 1, current: web6, extended: web6 }), /Creative fee/);
  assert.throws(() => priceExtension({ creative: 1, images: 0, current: web6, extended: web6 }), /Images/);
  assert.throws(() => priceExtension({ creative: 1, images: 1, current: { ...web6, channels: [] }, extended: web6 }), /at least one channel/);
  assert.throws(() => priceExtension({ creative: 1, images: 1, current: web6, extended: { ...web6, territory: 'moon' } }), /territory/);
  assert.throws(() => priceExtension({ creative: 1, images: 1, creditPercent: 101, current: web6, extended: web6 }), /Credit/);
});
