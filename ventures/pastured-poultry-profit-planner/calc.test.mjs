import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, batch, season, birdsSold, blendedPricePerLb, breakEvenPricePerLb, mortalitySensitivity, feedSensitivity, channelScenarios, scaleScenarios, num, money } from "./calc.mjs";

const base = { ...DEFAULTS };

test("birds sold and blended price", () => {
  assert.equal(birdsSold({ ...base, birdsPerBatch: 200, mortalityPct: 10 }), 180);
  assert.equal(blendedPricePerLb({ ...base, directSharePct: 50, directPricePerLb: 8, wholesalePricePerLb: 4 }), 6);
  assert.equal(birdsSold({ ...base, mortalityPct: 150 }), 0);
});

test("batch arithmetic by hand", () => {
  const o = { ...base, birdsPerBatch: 100, mortalityPct: 10, dressedLb: 4, directSharePct: 100, directPricePerLb: 6, chickCost: 2, feedPerBirdLb: 15, feedPricePerLb: 0.4, processingPerBird: 5, suppliesPerBatch: 100, hoursPerBatch: 10, wage: 20 };
  const b = batch(o);
  assert.equal(b.sold, 90);
  assert.equal(b.revenue, 90 * 4 * 6);
  // feed: 90 survivors + 10 dead at half = 95 bird-equivalents x 15 lb x $0.40
  assert.ok(Math.abs(b.feed - 95 * 15 * 0.4) < 1e-9);
  assert.equal(b.chicks, 200);
  assert.equal(b.processing, 450);
  assert.ok(Math.abs(b.profit - (b.revenue - b.chicks - b.feed - b.processing - 100 - 200)) < 1e-9);
});

test("season is batches times batch less fixed and equipment", () => {
  const s = season(base);
  const b = batch(base);
  assert.ok(Math.abs(s.profit - (base.batches * b.profit - base.fixedYear - base.startupEquip / base.equipLifeYears)) < 1e-9);
  assert.ok(s.profitBeforeLabour > s.profit);
});

test("break-even price makes a season's profit zero", () => {
  const p = breakEvenPricePerLb(base);
  const s = season({ ...base, directSharePct: 100, directPricePerLb: p });
  assert.ok(Math.abs(s.profit) < 1e-6, String(s.profit));
});

test("more mortality never helps; more feed cost never helps", () => {
  const m = mortalitySensitivity(base);
  for (let i = 1; i < m.length; i++) assert.ok(m[i].profit < m[i - 1].profit);
  const f = feedSensitivity(base);
  for (let i = 1; i < f.length; i++) assert.ok(f[i].profit < f[i - 1].profit);
});

test("direct beats wholesale when direct price is higher", () => {
  const [w, , d] = channelScenarios(base);
  assert.ok(d.profit > w.profit);
});

test("zero birds do not divide by zero", () => {
  const s = season({ ...base, birdsPerBatch: 0 });
  assert.equal(s.perBird, null);
  assert.equal(breakEvenPricePerLb({ ...base, birdsPerBatch: 0 }), null);
  assert.equal(season({ ...base, batches: 0 }).perHour, null);
});

test("scale scenarios return one row per size and hours grow slower than birds", () => {
  const r = scaleScenarios(base);
  assert.equal(r.length, 5);
  assert.ok(r[4].hours / r[0].hours < 10);
});

test("num and money parse and format", () => {
  assert.equal(num("$1,234.5"), 1234.5);
  assert.ok(Number.isNaN(num("abc")));
  assert.equal(money(-1234.4), "-$1,234");
});
