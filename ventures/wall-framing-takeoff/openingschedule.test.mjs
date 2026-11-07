import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutOpeningSchedule, openingScheduleText, openingScheduleCsv, validateOpeningSchedule } from "./openingschedule.mjs";

const plan = {
  defaultHeaderHeight: 82,
  walls: [
    { id: "N", openings: [
      { kind: "window", label: "Kitchen", offset: 10, width: 36, height: 48, header: "2x10", headerHeight: 80 },
      { kind: "door", label: "Front", offset: 60, width: 38, height: 82 } ] },
    { id: "S", openings: [
      { kind: "window", label: "Bed", offset: 20, width: 36, height: 48, header: "2x10", headerHeight: 80 },
      { kind: "window", label: "Bath", offset: 90, width: 24, height: 36 },
      { kind: "door", label: "Back", offset: 50, width: 38, height: 82 } ] },
    { id: "E" },
  ],
};

test("identical openings share a mark and count; marks are numbered large to small", () => {
  const s = layoutOpeningSchedule({}, plan);
  assert.equal(s.ok, true);
  assert.equal(s.doors, 2); assert.equal(s.windows, 3);
  assert.deepEqual(s.rows.map((r) => [r.mark, r.count]), [["D1", 2], ["W1", 2], ["W2", 1]]);
  assert.deepEqual(s.rows[1].locations.map((l) => l.wall), ["N", "S"]);
});

test("sill height is header height less opening height; doors have none; default header height is used", () => {
  const s = layoutOpeningSchedule({}, plan);
  assert.equal(s.rows[1].sillHeight, 32);               // 80 - 48
  assert.equal(s.rows[2].sillHeight, 46);               // 82 - 36, from defaultHeaderHeight
  assert.equal(s.rows[0].sillHeight, 0);
});

test("unit size is the rough opening less the typed allowance", () => {
  const s = layoutOpeningSchedule({ unitAllowance: 0.75 }, plan);
  assert.equal(s.rows[1].unitWidth, 35.25); assert.equal(s.rows[1].unitHeight, 47.25);
});

test("different header height or size makes a different mark", () => {
  const p = { walls: [{ id: "A", openings: [
    { kind: "window", offset: 0, width: 36, height: 48, headerHeight: 80 },
    { kind: "window", offset: 50, width: 36, height: 48, headerHeight: 84 },
    { kind: "window", offset: 100, width: 36, height: 48, headerHeight: 80, header: "2x12" } ] }] };
  assert.equal(layoutOpeningSchedule({}, p).rows.length, 3);
});

test("no openings, bad settings, text and CSV (formula cells neutralised)", () => {
  assert.equal(layoutOpeningSchedule({}, { walls: [{ id: "A" }] }).rows.length, 0);
  assert.ok(validateOpeningSchedule({ unitAllowance: -1 }).length);
  assert.ok(validateOpeningSchedule({ doorPrefix: "1" }).length);
  assert.equal(layoutOpeningSchedule({ unitAllowance: 9 }, plan).ok, false);
  const s = layoutOpeningSchedule({ doorPrefix: "DR" }, plan);
  assert.match(openingScheduleText(s).join("\n"), /DR1 {2}x2 {2}door {2}RO 38 x 82 in/);
  const evil = layoutOpeningSchedule({}, { walls: [{ id: "=cmd()", openings: [{ kind: "door", offset: 0, width: 30, height: 80, headerHeight: 82 }] }] });
  const csv = openingScheduleCsv(evil);
  assert.equal(csv.split("\n").length, 2);
  assert.match(csv, /"'=cmd\(\): door"/);
});

test("header height must be a positive number at least as tall as the opening", () => {
  const bad = (hh) => layoutOpeningSchedule({}, { walls: [{ id: "A", openings: [{ kind: "window", width: 36, height: 48, headerHeight: hh }] }] });
  assert.equal(bad("80").ok, false);
  assert.equal(bad(-5).ok, false);
  assert.equal(bad(40).ok, false);
  assert.equal(bad(48).ok, true);
  assert.equal(layoutOpeningSchedule({}, { defaultHeaderHeight: "x", walls: [] }).ok, false);
});
