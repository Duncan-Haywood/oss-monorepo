import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFees, bracketFor, parseEntities, plan, sampleInput, toCsv, DEFAULT_FEES_TEXT } from "./calc.mjs";

const { brackets } = parseFees(DEFAULT_FEES_TEXT);

test("six brackets parse and sort", () => {
  assert.equal(brackets.length, 6);
  assert.equal(brackets[5].max, Infinity);
});

// 2027-and-later fees, 49 CFR 367.50 as amended by 91 FR 56063 (FR Doc 2026-17893). The 2025-2026 table
// ($46 / $138 / $276 / $963 / $4,592 / $44,836) was shipped as "2027" until the 2026-11-12 quality audit.
test("default table is the 2027 schedule at every bracket edge", () => {
  const want = [[0, 55], [2, 55], [3, 167], [5, 167], [6, 333], [20, 333], [21, 1163], [100, 1163], [101, 5548], [1000, 5548], [1001, 54165], [5000, 54165]];
  for (const [n, fee] of want) assert.equal(bracketFor(brackets, n).fee, fee, `${n} vehicles`);
});

test("freight forwarders pay by vehicle count; brokers and leasing pay the lowest bracket", () => {
  assert.equal(plan({ entities: "F, 12, freight-forwarder" }).total, 333);
  assert.equal(plan({ entities: "F, 0, freight-forwarder" }).total, 55);
  assert.equal(plan({ entities: "B, 40, broker" }).total, 55);
});

test("per-vehicle and per-mile figures", () => {
  const r = plan({ entities: "A, 4", annualMiles: 100000 });
  assert.equal(r.rows[0].perVehicle, 41.75);
  assert.match(r.advice.join("\n"), /about 0\.167 cents per mile/);
});

test("bad fee lines and overlaps are reported", () => {
  assert.ok(parseFees("nonsense").errors.length);
  assert.ok(parseFees("0-5: 10\n3-9: 20").errors.length);
  assert.ok(parseFees("5-2: 10").errors.length);
});

test("entities need a name, an integer count and a known type", () => {
  assert.ok(parseEntities("A, x").errors.length);
  assert.ok(parseEntities("A, 3, spaceship").errors.length);
  assert.deepEqual(parseEntities("A, 3").entities, [{ name: "A", n: 3, type: "motor-carrier" }]);
});

test("brokers and leasing pay the lowest bracket regardless of size", () => {
  const r = plan({ entities: "Big Lease, 400, leasing" });
  assert.equal(r.total, 55);
});

test("a carrier at a bracket top sees the jump", () => {
  const r = plan({ entities: "Fleet, 5, motor-carrier" });
  assert.equal(r.total, 167);
  assert.equal(r.rows[0].toNext.extra, 166);
  assert.match(r.advice.join("\n"), /adding one vehicle moves the fee up \$166\.00/);
});

test("a custom fee table overrides the default", () => {
  const r = plan({ entities: "Fleet, 4, motor-carrier", fees: "0-10: 100\n11+: 200" });
  assert.equal(r.total, 100);
});

test("empty input and bad input give errors, not crashes", () => {
  assert.ok(plan({ entities: "" }).error);
  assert.ok(plan({ entities: "x" }).error);
});

test("sample totals and csv", () => {
  const r = plan(sampleInput());
  assert.equal(r.total, 167 + 55 + 55);
  const csv = toCsv(r);
  assert.match(csv, /^registrant,type,vehicles/);
  assert.match(csv, /total,,,,277\.00,/);
});
