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

// Red-team 2026-11-12: guards for mutants that escaped (overlap at a shared edge, per-vehicle at one
// vehicle, the top bracket's toNext) and two real defects (gapped fee tables, hex/exponent counts).
test("brackets that share an edge overlap", () => {
  assert.deepEqual(parseFees("0-2: 55\n2-5: 100").errors, ["Fee brackets 0-2 and 2+ overlap."]);
  assert.deepEqual(parseFees("0-2: 55\n3-5: 100").errors, []);
});

test("one vehicle has a per-vehicle figure", () => {
  assert.equal(plan({ entities: "Solo, 1" }).rows[0].perVehicle, 55);
});

test("the top bracket has nothing to grow into and brokers have no next bracket", () => {
  const r = plan({ entities: "Mega, 1500\nB, 0, broker" });
  assert.equal(r.total, 54165 + 55);
  assert.equal(r.rows[0].toNext, null);
  assert.equal(r.rows[1].toNext, null);
});

test("a fee table with a gap is an error, not a wrong jump", () => {
  const r = plan({ fees: "0-2: 55\n6-20: 333", entities: "A, 2" });
  assert.match(r.error, /no bracket covers 3-5 vehicles/i);
  assert.match(parseFees("0-2: 55\n3-5: 167\n10+: 400").errors.join("\n"), /6-9/);
});

test("vehicle counts are plain whole numbers", () => {
  for (const bad of ["0x10", "1e3", "-0", "5.0", "+3"]) assert.ok(parseEntities(`A, ${bad}`).errors.length, bad);
  assert.deepEqual(parseEntities("A, 1 200").entities[0].n, 1200);
  assert.deepEqual(parseEntities("A, 1_200").entities[0].n, 1200);
});


test("overlap messages name an open bracket with +, not Infinity", () => {
  assert.doesNotMatch(parseFees("0-2: 55\n3+: 100\n50-60: 9").errors.join("\n"), /Infinity/);
});

test("csv export defuses spreadsheet formulas in names", () => {
  const csv = toCsv(plan({ entities: '=HYPERLINK("http://x.test"), 3\n@SUM(A1), 1\n-2+3, 2' }));
  assert.match(csv, /^"'=HYPERLINK\(""http:\/\/x\.test""\)",/m);
  assert.match(csv, /^'@SUM\(A1\),/m);
  assert.match(csv, /^'-2\+3,/m);
  assert.match(csv, /,3,3-5,167\.00,55\.67$/m);
});
