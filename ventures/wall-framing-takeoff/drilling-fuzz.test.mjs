import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutDrilling, drillingText, STUD_WIDTH, DWV_OD } from "./drilling.mjs";

// Property test: random pipe and cable runs over random walls are refused with
// a reason, or checked consistently: the pass/fail flag matches an independent
// recomputation of the stated limits, a failure always carries a fix, a doubled
// stud never takes less than a single one, and the text report builds.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rand, xs) => xs[Math.floor(rand() * xs.length)];

test("fuzz: random drilling runs check consistently or are refused with a reason", () => {
  let laid = 0, refused = 0;
  const failures = [];
  for (let seed = 1; seed <= 400; seed++) {
    const rand = rng(seed);
    const walls = ["A", "B", "C"].map((id) => ({ id, stud: pick(rand, ["2x4", "2x6", "2x8", undefined]), bearing: pick(rand, [true, false, undefined]) }));
    const runs = [];
    const n = 1 + Math.floor(rand() * 5);
    for (let i = 0; i < n; i++) {
      const r = { wall: pick(rand, ["A", "B", "C", "A", "B", "C", "Z"]), kind: pick(rand, ["bore", "bore", "notch"]), count: pick(rand, [undefined, 1, 3, 40]) };
      if (r.kind === "bore" && rand() < 0.5) r.pipe = pick(rand, Object.keys(DWV_OD));
      else r.size = pick(rand, [0.5, 1, 1.5, 2.2, 3.3, 5, 12, 0, -1, 13]);
      if (rand() < 0.4) r.doubled = true;
      runs.push(r);
    }
    const d = { runs };
    if (rand() < 0.3) d.clearance = pick(rand, [0, 0.125, 0.5, 2]);
    let t;
    try { t = layoutDrilling(d, { walls }); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!t.ok) { refused++; if (!t.errors?.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    laid++;
    if (t.rows.length !== runs.length) failures.push(`seed ${seed}: ${t.rows.length} rows for ${runs.length} runs`);
    const clr = d.clearance ?? 0.125;
    let bad = 0, holes = 0;
    t.rows.forEach((row, i) => {
      const r = runs[i], w = walls.find((x) => x.id === r.wall);
      const width = STUD_WIDTH[w.stud || "2x4"], bearing = w.bearing !== false, bore = r.kind === "bore";
      const size = r.pipe != null ? DWV_OD[r.pipe] + clr : r.size;
      const relaxed = !bearing || !!r.doubled;
      const frac = bore ? (relaxed ? 0.6 : 0.4) : (bearing ? 0.25 : 0.4);
      const max = bore ? Math.min(frac * width, width - 2 * 0.625) : frac * width;
      const ok = size <= max + 1e-9;
      if (row.ok !== ok) failures.push(`seed ${seed} run ${i}: ok ${row.ok}, expected ${ok} (size ${size}, max ${max})`);
      if (!row.ok && !row.fix) failures.push(`seed ${seed} run ${i}: failed with no fix`);
      if (row.ok && row.fix) failures.push(`seed ${seed} run ${i}: passed but has a fix`);
      if (!bore && row.edge !== null) failures.push(`seed ${seed} run ${i}: notch has an edge distance`);
      if (row.ok && bore && row.edge < 0.625 - 1e-3) failures.push(`seed ${seed} run ${i}: passing bore leaves edge ${row.edge}`);
      if (!row.ok) bad++;
      if (bore) holes += r.count ?? 1;
    });
    if (t.failing !== bad) failures.push(`seed ${seed}: failing ${t.failing}, counted ${bad}`);
    if (t.holes !== holes) failures.push(`seed ${seed}: holes ${t.holes}, counted ${holes}`);
    // doubling never makes a bore stricter
    for (const r of runs) if (r.kind === "bore" && !r.doubled) {
      const a = layoutDrilling({ runs: [r], clearance: d.clearance }, { walls }), b = layoutDrilling({ runs: [{ ...r, doubled: true }], clearance: d.clearance }, { walls });
      if (a.ok && b.ok && a.rows[0].ok && !b.rows[0].ok) failures.push(`seed ${seed}: doubling a passing bore made it fail`);
    }
    try { if (drillingText(t).length < 2) failures.push(`seed ${seed}: short text`); } catch (e) { failures.push(`seed ${seed}: text threw ${e.message}`); }
  }
  assert.ok(laid > 40 && refused > 20, `laid ${laid}, refused ${refused}`);
  assert.deepEqual(failures, []);
});

test("fuzz: hostile drilling input never throws", () => {
  const junk = [null, undefined, NaN, Infinity, "2", {}, [], true, -1, 1e9, "bore"];
  const walls = [{ id: "A" }];
  for (const a of junk) for (const b of junk) {
    for (const d of [a, { runs: [a] }, { runs: [{ wall: "A", kind: "bore", size: a, count: b }] }, { runs: [{ wall: a, kind: b, pipe: a }] }, { runs: [{ wall: "A", kind: "bore", size: 1 }], clearance: a, limits: b }])
      assert.doesNotThrow(() => { const t = layoutDrilling(d, { walls }); if (t.ok) drillingText(t); });
  }
});
