import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBid, markupToMargin, marginToMarkup, overrunToBreakEven } from './engine.mjs';

test('25% markup is only a 20% margin, and the inverse holds', () => {
  assert.equal(markupToMargin(25), 20);
  assert.equal(marginToMarkup(20), 25);
  assert.equal(marginToMarkup(50), 100);
  assert.equal(markupToMargin(100), 50);
});

const base = { laborHours: 40, wage: 30, burdenPct: 25, materials: 1000, overheadPct: 10, marginPct: 20 };

test('walk-away is full cost; price keeps the margin as a share of price', () => {
  const r = calculateBid(base);
  assert.equal(r.labor, 1200);
  assert.equal(r.burden, 300);
  assert.equal(r.directCost, 2500);
  assert.equal(r.overhead, 250);
  assert.equal(r.walkAway, 2750);
  assert.equal(r.price, 3437.5);
  assert.equal(r.effectiveMarginPct, 20);
  assert.equal(r.effectiveMarkupPct, 25);
});

test('material markup rides on top of the margin price', () => {
  const r = calculateBid({ ...base, materialMarkupPct: 10 });
  assert.equal(r.price, 3537.5);
  assert.ok(r.effectiveMarginPct > 20);
});

test('an offered price below cost is flagged as a loss', () => {
  const r = calculateBid({ ...base, offeredPrice: 2500 });
  assert.equal(r.offer.loses, true);
  assert.equal(r.offer.profit, -250);
  assert.equal(r.offer.belowTarget, true);
  const ok = calculateBid({ ...base, offeredPrice: 4000 });
  assert.equal(ok.offer.loses, false);
  assert.equal(ok.offer.belowTarget, false);
  assert.equal(calculateBid(base).offer, null);
});

test('garbage and negative inputs never produce NaN or negative cost', () => {
  const r = calculateBid({ laborHours: 'x', wage: -5, materials: null, marginPct: 400 });
  for (const v of [r.walkAway, r.price, r.profit]) assert.ok(Number.isFinite(v));
  assert.ok(r.walkAway >= 0);
  assert.deepEqual(calculateBid({}).offer, null);
});

test('overrun cushion is the labor slip that erases profit', () => {
  const pctSlip = overrunToBreakEven(base);
  assert.ok(pctSlip > 0 && pctSlip < 100);
  assert.equal(overrunToBreakEven({}), null);
});
