import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFees, bracketFor, parseEntities, plan, sampleInput, toCsv, DEFAULT_FEES_TEXT } from "./calc.mjs";

const { brackets } = parseFees(DEFAULT_FEES_TEXT);

test("six brackets parse and sort", () => {
  assert.equal(brackets.length, 6);
  assert.equal(brackets[5].max, Infinity);
});

test("bracket edges: 2->3 and 20->21 change the fee", () => {
  assert.equal(bracketFor(brackets, 2).fee, 46);
  assert.equal(bracketFor(brackets, 3).fee, 138);
  assert.equal(bracketFor(brackets, 20).fee, 276);
  assert.equal(bracketFor(brackets, 21).fee, 963);
  assert.equal(bracketFor(brackets, 5000).fee, 44797);
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
  assert.equal(r.total, 46);
});

test("a carrier at a bracket top sees the jump", () => {
  const r = plan({ entities: "Fleet, 5, motor-carrier" });
  assert.equal(r.total, 138);
  assert.equal(r.rows[0].toNext.extra, 138);
  assert.match(r.advice.join("\n"), /adding one vehicle moves the fee up \$138\.00/);
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
  assert.equal(r.total, 138 + 46 + 46);
  const csv = toCsv(r);
  assert.match(csv, /^registrant,type,vehicles/);
  assert.match(csv, /total,,,,230\.00,/);
});
