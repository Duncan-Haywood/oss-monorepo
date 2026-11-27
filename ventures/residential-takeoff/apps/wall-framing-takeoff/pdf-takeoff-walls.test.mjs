// Wall runs measured on a plan PDF in the free PDF plan takeoff, exported as a
// DXF (`wallsDxf`), read here as a plan and turned into a supplier material list.
// Shows the hand-off works end to end: the corners, the tee, the openings and
// the lengths survive the trip.
import { test } from "node:test";
import assert from "node:assert/strict";
import { wallsDxf } from "../../../pdf-plan-takeoff/measure.mjs";
import { planFromDxf } from "./dxf.mjs";
import { samplePlan, takeoff } from "./engine.mjs";
import { materialList } from "./materiallist.mjs";

const S = { ratio: 48, system: "imperial" }; // 1/4" = 1'-0"
const pt = (feet) => (feet * 12 * 72) / S.ratio; // building feet to sheet points
const P = (x, y) => ({ x: pt(x), y: pt(y) });

// A 36 x 24 ft box clicked as one run around the outside, a partition across it
// at 16 ft, a 3 ft door in the front and a 4 ft window in the back.
const measured = [
  { type: "length", page: 1, label: "Walls", scale: S, pts: [P(0, 0), P(36, 0), P(36, 24), P(0, 24), P(0, 0)] },
  { type: "length", page: 1, label: "Walls", scale: S, pts: [P(16, 0), P(16, 24)] },
  { type: "length", page: 1, label: "Doors", scale: S, pts: [P(6, 0), P(9, 0)] },
  { type: "length", page: 1, label: "Windows", scale: S, pts: [P(24, 24), P(28, 24)] },
  { type: "area", page: 1, label: "Floor", scale: S, pts: [P(0, 0), P(36, 0), P(36, 24)] },
];

test("a PDF takeoff's wall runs open as a plan with corners, tees and openings", () => {
  const x = wallsDxf(measured);
  assert.equal(x.ok, true);
  const r = planFromDxf(x.dxf);
  assert.equal(r.ok, true, r.errors.join(" "));
  assert.equal(r.stats.walls, 5); // four exterior walls and the partition
  assert.equal(r.stats.tees, 2); // the partition meets the front and the back
  assert.equal(r.stats.openings, 2);
  // centre lines as clicked: 36 and 24 ft exterior walls, the 24 ft partition teed in at 16 ft from each end it meets
  assert.deepEqual(r.plan.walls.map((w) => [w.length, !!w.corner]), [[432, true], [288, true], [432, true], [288, true], [288, false]]);
  assert.deepEqual(r.plan.walls.flatMap((w) => w.tees || []).sort((a, b) => a - b), [192, 240]);
  const ops = r.plan.walls.flatMap((w) => w.openings || []);
  assert.deepEqual(ops.map((o) => [o.kind, o.width]).sort(), [["door", 36], ["window", 48]]);
});

test("and the plan prices out as a supplier material list", () => {
  const r = planFromDxf(wallsDxf(measured).dxf);
  const base = samplePlan(), plan = r.plan;
  for (const k of ["studSpacing", "studLength", "kerf", "topPlateLap", "cornerExtraStuds", "teeExtraStuds", "defaultHeaderHeight", "stock"]) if (!(k in plan)) plan[k] = base[k];
  const t = takeoff(plan);
  assert.equal(t.ok, true, (t.errors || []).join(" "));
  const m = materialList(t);
  assert.equal(m.ok, true);
  const lumber = m.rows.filter((row) => row.section === "Framing lumber");
  assert.ok(lumber.length > 0);
  assert.equal(m.totals.boards, lumber.reduce((s, row) => s + row.qty, 0));
  // about one stud per 16 in of 192 ft of wall, plus corners, tees and openings: a sanity band, not a count
  assert.ok(m.totals.boards > 150 && m.totals.boards < 400, `boards ${m.totals.boards}`);
});
