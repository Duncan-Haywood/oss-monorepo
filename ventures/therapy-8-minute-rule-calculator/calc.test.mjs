import { test } from "node:test";
import assert from "node:assert/strict";
import { unitsFromTotal, unitsPerCode, allocate, parseVisits, analyze, toCsv, EXAMPLE_SHARED } from "./calc.mjs";

test("CMS total-time thresholds: 8-22 is 1 unit, 23-37 is 2, 38-52 is 3, 113-127 is 8", () => {
  const cases = [[0, 0], [7, 0], [8, 1], [22, 1], [23, 2], [37, 2], [38, 3], [52, 3], [53, 4], [67, 4], [68, 5], [112, 7], [113, 8], [127, 8]];
  for (const [m, u] of cases) assert.equal(unitsFromTotal(m), u, `${m} min`);
});

test("per-code count gives a unit at 8 minutes past each 15", () => {
  const cases = [[7, 0], [8, 1], [15, 1], [22, 1], [23, 2], [38, 3]];
  for (const [m, u] of cases) assert.equal(unitsPerCode(m), u, `${m} min`);
});

test("allocation never exceeds the total and gives leftover units to the largest remainders", () => {
  const a = allocate([{ code: "97110", minutes: 23 }, { code: "97140", minutes: 15 }, { code: "97530", minutes: 8 }]);
  assert.equal(a.total, 46);
  assert.equal(a.units, 3);
  assert.deepEqual(a.lines.map((l) => l.units), [2, 1, 0]);
  const b = allocate([{ code: "97110", minutes: 7 }, { code: "97140", minutes: 9 }, { code: "97530", minutes: 8 }]);
  assert.equal(b.units, 2); // 24 min
  assert.deepEqual(b.lines.map((l) => l.units), [0, 1, 1]);
});

test("allocated units always add up to the CMS total, for every pair of minutes up to 60", () => {
  for (let x = 0; x <= 60; x++) for (let y = 0; y <= 60; y++) {
    const a = allocate([{ code: "97110", minutes: x }, { code: "97140", minutes: y }]);
    assert.equal(a.lines.reduce((s, l) => s + l.units, 0), unitsFromTotal(x + y), `${x}+${y}`);
  }
});

test("the per-code count can exceed the CMS count, never fall below it by more than the remainders allow", () => {
  const r = analyze({ visits: "97110 8\n97140 8\n97530 8", rates: "", defaultRate: "30" });
  assert.equal(r.rows[0].units, 2); // 24 min
  assert.equal(r.rows[0].perCodeUnits, 3);
  assert.equal(r.rows[0].over, 1);
  assert.equal(r.rows[0].revenue, 60);
  assert.equal(r.rows[0].revenuePerCode, 90);
});

test("untimed codes are listed but add no timed minutes; unknown codes warn and are left out", () => {
  const p = parseVisits("97110 15\n97014 15\n99999 20\nrandom words");
  assert.equal(p.visits.length, 1);
  assert.equal(p.visits[0].untimed.length, 1);
  assert.equal(p.visits[0].entries.length, 1);
  assert.equal(p.warnings.length, 2);
});

test("blank line separates visits, a heading line names a visit, repeated codes add", () => {
  const p = parseVisits("Mon\n97110 10\n97110 5\n\n97140 20");
  assert.equal(p.visits[0].name, "Mon");
  assert.equal(p.visits[0].entries[0].minutes, 15);
  assert.equal(p.visits[1].name, "Visit 2");
});

test("minutes to the next unit and near misses", () => {
  const r = analyze({ visits: "97110 20\n97140 15", rates: "", defaultRate: "" });
  assert.equal(r.rows[0].units, 2);
  assert.equal(r.rows[0].minutesToNextUnit, 3);
  assert.equal(r.rows[0].nearMiss, true);
  const s = analyze({ visits: "97110 5", rates: "", defaultRate: "" });
  assert.equal(s.rows[0].units, 0);
  assert.equal(s.rows[0].minutesToNextUnit, 3);
});

test("rates: per-code overrides the default, bad lines warn", () => {
  const r = analyze({ visits: "97110 15\n97140 15", rates: "97110=40\nnonsense", defaultRate: "25" });
  assert.equal(r.rows[0].revenue, 65);
  assert.equal(r.warnings.length, 1);
});

test("empty input and a negative default are reported, not computed", () => {
  assert.equal(analyze({ visits: "", rates: "", defaultRate: "" }).ok, false);
  assert.ok(analyze({ visits: "97110 15", rates: "", defaultRate: "-3" }).warnings.length > 0);
});

test("the shipped example runs clean and exports a CSV", () => {
  const a = analyze(EXAMPLE_SHARED);
  assert.equal(a.ok, true);
  assert.deepEqual(a.warnings, []);
  assert.equal(a.totals.visits, 5);
  assert.equal(a.totals.units, a.rows.reduce((s, r) => s + r.units, 0));
  assert.equal(a.totals.nearMisses, 1);
  assert.match(toCsv(a), /^visit,code,minutes,cms_units,per_code_units,rate,cms_amount\n/);
});
