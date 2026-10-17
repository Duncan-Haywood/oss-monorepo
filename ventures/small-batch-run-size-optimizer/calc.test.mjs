import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, annualCost, bestBatch, cleanItems, cleanShared, derive, toCsv, EXAMPLE_ITEMS, SHARED_DEFAULTS, ITEM_DEFAULTS } from "./calc.mjs";

const shared = cleanShared(SHARED_DEFAULTS);
const one = (o) => cleanItems([{ ...ITEM_DEFAULTS, name: "x", annualDemand: 10000, unitCost: 2, setupCost: 50, setupHours: 1, holdingPct: 20, ...o }]).items[0];

// Exhaustive search over every allowed batch size, to check the closed-form-plus-neighbours shortcut.
function brute(t, lambda = 0) {
  const d = derive(t, shared);
  const lo = Math.max(t.minB, 1);
  const hi = Math.min(t.maxB > 0 ? t.maxB : 20000, Number.isFinite(d.cap) ? d.cap : 20000);
  let best = null;
  for (let q = lo; q <= Math.max(hi, lo); q++) {
    if (q % t.m) continue;
    const c = annualCost(t, shared, q, lambda);
    if (!best || c < best.cost - 1e-9) best = { q, cost: c };
  }
  return best;
}

test("classic EPQ with no rate limit matches sqrt(2DS/H)", () => {
  const t = one({ unitsPerHour: 0, storagePerUnitYear: 0.1 });
  const H = 2 * 0.2 + 0.1;
  const r = bestBatch(t, shared);
  assert.ok(Math.abs(r.unconstrained - Math.sqrt((2 * 10000 * 50) / H)) < 1e-9);
  assert.ok(Math.abs(r.q - r.unconstrained) <= 1);
});

test("a finite production rate makes the best batch bigger", () => {
  const instant = bestBatch(one({ unitsPerHour: 0 }), shared).q;
  const slow = bestBatch(one({ unitsPerHour: 8 }), shared).q; // 64 a day vs 33 sold a day
  assert.ok(slow > instant);
});

test("the shortcut equals exhaustive search over random products", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let n = 0; n < 300; n++) {
    const t = one({
      annualDemand: 500 + Math.round(rnd() * 20000), unitCost: 0.5 + rnd() * 20, setupCost: 5 + rnd() * 300,
      holdingPct: 5 + rnd() * 40, storagePerUnitYear: rnd() * 0.5, unitsPerHour: rnd() < 0.5 ? 0 : 30 + Math.round(rnd() * 200),
      shelfLifeDays: rnd() < 0.5 ? 0 : 20 + Math.round(rnd() * 300), multiple: 1 + Math.round(rnd() * 23),
      minBatch: rnd() < 0.5 ? 0 : Math.round(rnd() * 200), maxBatch: rnd() < 0.5 ? 0 : 300 + Math.round(rnd() * 3000),
    });
    const lambda = rnd() < 0.5 ? 0 : rnd() * 100;
    const got = bestBatch(t, shared, lambda);
    const want = brute(t, lambda);
    const d = derive(t, shared);
    const hi = Math.min(t.maxB > 0 ? t.maxB : Infinity, d.cap);
    if (hi < Math.max(t.minB, 1) || !want) continue; // infeasible window: flagged by analyze, not searched
    assert.ok(annualCost(t, shared, got.q, lambda) <= want.cost + 1e-6, JSON.stringify({ t, got, want }));
  }
});

test("shelf life caps the batch at what sells before it expires", () => {
  const t = one({ shelfLifeDays: 30 });
  const cap = Math.floor((10000 / 300) * 30);
  const r = bestBatch(t, shared);
  assert.ok(r.q <= cap);
  assert.equal(r.binding, "shelf life");
});

test("batches are whole multiples of the pack size", () => {
  const r = bestBatch(one({ multiple: 24 }), shared);
  assert.equal(r.q % 24, 0);
});

test("a minimum batch above the shelf-life cap is honoured and flagged", () => {
  const a = analyze([{ ...ITEM_DEFAULTS, annualDemand: 3000, unitCost: 2, setupCost: 40, shelfLifeDays: 10, minBatch: 500 }], SHARED_DEFAULTS);
  assert.equal(a.rows[0].best.q, 500);
  assert.ok(a.warnings.some((w) => /shelf life/.test(w)));
});

test("limited hours push setup-heavy products to bigger batches and the plan fits the hours", () => {
  const free = analyze(EXAMPLE_ITEMS, SHARED_DEFAULTS);
  const tight = analyze(EXAMPLE_ITEMS, { ...SHARED_DEFAULTS, hoursAvailable: 405 });
  assert.ok(tight.feasible);
  assert.ok(tight.hoursUsed <= 405 + 1e-6);
  assert.ok(tight.shadow > 0);
  assert.ok(tight.totalBest >= free.totalBest - 1e-9);
  assert.ok(tight.rows.some((r, i) => r.best.q > free.rows[i].best.q));
});

test("hours that cannot be met at the largest batches are reported, not hidden", () => {
  const a = analyze(EXAMPLE_ITEMS, { ...SHARED_DEFAULTS, hoursAvailable: 100 });
  assert.equal(a.feasible, false);
  assert.ok(a.warnings.some((w) => /more hours/.test(w)));
});

test("the best plan never costs more than the user's current batches", () => {
  const a = analyze(EXAMPLE_ITEMS, SHARED_DEFAULTS);
  assert.ok(a.hasCurrent);
  for (const r of a.rows) assert.ok(r.best.total <= r.current.total + 1e-9);
  assert.ok(a.gain > 0);
});

test("the within-5% range contains the best batch and stays within 5%", () => {
  const t = one({ multiple: 10 });
  const r = bestBatch(t, shared);
  const best = annualCost(t, shared, r.q);
  const a = analyze([{ ...ITEM_DEFAULTS, name: "x", annualDemand: 10000, unitCost: 2, setupCost: 50, holdingPct: 20, multiple: 10 }], SHARED_DEFAULTS);
  const f = a.rows[0].flat;
  assert.ok(f.from <= a.rows[0].best.q && a.rows[0].best.q <= f.to);
  assert.ok(annualCost(t, shared, f.from) <= best * 1.05 + 1e-9);
  assert.ok(annualCost(t, shared, f.to) <= best * 1.05 + 1e-9);
});

test("bad input is explained, not computed", () => {
  assert.equal(analyze([], SHARED_DEFAULTS).ok, false);
  const none = analyze([{ ...ITEM_DEFAULTS, name: "a", annualDemand: 1000, unitCost: 1 }], SHARED_DEFAULTS);
  assert.equal(none.ok, false);
  const over = analyze([{ ...ITEM_DEFAULTS, name: "b", annualDemand: 100000, unitCost: 1, setupCost: 20, unitsPerHour: 5 }], SHARED_DEFAULTS);
  assert.equal(over.ok, false);
  assert.ok(over.warnings.some((w) => /more than the line/.test(w)));
  const nohold = analyze([{ ...ITEM_DEFAULTS, name: "c", annualDemand: 1000, setupCost: 20, holdingPct: 0 }], SHARED_DEFAULTS);
  assert.equal(nohold.ok, false);
});

test("numbers typed with symbols are read", () => {
  const a = analyze([{ ...ITEM_DEFAULTS, name: "d", annualDemand: "12,000", unitCost: "$2.50", setupCost: "$60", holdingPct: "20%" }], SHARED_DEFAULTS);
  assert.ok(a.ok);
  assert.ok(a.rows[0].best.q > 0);
});

test("CSV escapes formula injection", () => {
  const a = analyze([{ ...ITEM_DEFAULTS, name: "=HYPERLINK(1)", annualDemand: 1000, unitCost: 2, setupCost: 30 }], SHARED_DEFAULTS);
  assert.match(toCsv(a), /"'=HYPERLINK\(1\)"/);
});
