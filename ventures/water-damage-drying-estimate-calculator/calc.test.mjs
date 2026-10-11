import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, readInput, equipment, jobCost, sampleInput, encodeShare, decodeShare, toCsv, SHARE_KEYS } from "./calc.mjs";

const base = () => readInput(sampleInput()).v;

test("the worked example sizes air movers by floor, wall and ceiling and dehumidifiers by class", () => {
  const e = equipment(base());
  assert.equal(e.movers, 17);
  assert.equal(e.cuft, 4800);
  assert.equal(e.factor, 50);
  assert.equal(e.pintsNeeded, 96);
  assert.equal(e.dehus, 2);
});

test("a higher class needs more dehumidifier capacity for the same room", () => {
  const c2 = equipment(base());
  const c3 = equipment({ ...base(), waterClass: 3 });
  assert.ok(c3.pintsNeeded > c2.pintsNeeded);
  assert.equal(c3.dehus, 2);
  assert.equal(equipment({ ...base(), waterClass: 1 }).dehus, 1);
});

test("a ceiling-only loss still gets at least one air mover and no dehumidifier area", () => {
  const e = equipment({ ...base(), floorSf: 0, wallLf: 0, ceilingSf: 100 });
  assert.equal(e.movers, 1);
  assert.equal(e.dehus, 0);
});

test("the carrier cap bills the approved days but costs every day", () => {
  const v = base();
  const eq = equipment(v);
  const j = jobCost(v, eq);
  assert.equal(j.billedDays, 3);
  assert.equal(j.unpaidDays, 1);
  assert.equal(j.equipBill, 646 * 3);
  assert.equal(j.equipCost, 117 * 4);
  assert.equal(j.bill, 2768);
  assert.equal(j.cost, 1394.67);
  assert.equal(j.profit, 1373.33);
});

test("with no cap every drying day is billed", () => {
  const v = { ...base(), approvedDays: 0 };
  const j = jobCost(v, equipment(v));
  assert.equal(j.billedDays, 4);
  assert.equal(j.unpaidDays, 0);
});

test("margin falls with each day past the approval", () => {
  const r = plan(sampleInput());
  const m = Object.fromEntries(r.table.map((t) => [t.days, t.marginPct]));
  assert.ok(m[3] > m[4] && m[4] > m[5] && m[5] > m[6]);
  assert.ok(r.advice.some((a) => /carrier approved 3 days but you plan 4/.test(a)));
});

test("advice flags a margin under target and a margin over it", () => {
  assert.ok(plan({ ...sampleInput(), targetMarginPct: "80" }).advice.some((a) => /points under your 80%/.test(a)));
  assert.ok(plan(sampleInput()).advice.some((a) => /clears your 35% target/.test(a)));
});

test("bad input is explained, not computed", () => {
  assert.match(plan({ ...sampleInput(), floorSf: "0", wallLf: "0", ceilingSf: "0" }).error, /affected/);
  assert.match(plan({ ...sampleInput(), waterClass: "5" }).error, /class/);
  assert.match(plan({ ...sampleInput(), dehuPints: "0" }).error, /pint/);
  assert.match(plan({ ...sampleInput(), dryDays: "0" }).error, /Drying days/);
  assert.match(plan({ ...sampleInput(), targetMarginPct: "95" }).error, /Margin/);
  assert.match(plan({ ...sampleInput(), techRate: "-5" }).error, /techRate/);
  assert.match(plan({ ...sampleInput(), sfPerMover: "0" }).error, /per air mover/);
});

test("share links carry only known keys and round-trip", () => {
  assert.deepEqual(decodeShare("#" + encodeShare(sampleInput())), sampleInput());
  assert.deepEqual(decodeShare("#evil=1&floorSf=800"), { floorSf: "800" });
  assert.equal(SHARE_KEYS.length, Object.keys(sampleInput()).length);
});

test("CSV has a row per drying-day count", () => {
  const r = plan(sampleInput());
  assert.equal(toCsv(r).split("\n").length, r.table.length + 1);
});
