import { test } from "node:test";
import assert from "node:assert/strict";
import { takeoff, samplePlan } from "./engine.mjs";
import { sheathe } from "./sheathing.mjs";
import { layoutFasteners, validateFasteners } from "./fasteners.mjs";

// Property test: random wall plans and nailing schedules. Valid settings give
// counts that are finite and non-negative, whose per-wall rows and connection
// rows both add up to the total, whose order never falls under the count, and
// where more waste or a tighter spacing never gives fewer nails. Out-of-range
// settings are refused with a reason, never counted.
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

function randomPlan(rand) {
  const plan = samplePlan();
  const n = 1 + Math.floor(rand() * 4);
  plan.walls = [];
  for (let i = 0; i < n; i++) {
    const length = 96 + Math.floor(rand() * 40) * 12;
    const openings = [];
    let at = 24;
    for (let k = 0; k < Math.floor(rand() * 3); k++) {
      const width = pick(rand, [24, 36, 48, 72]);
      if (at + width + 24 > length) break;
      openings.push({ kind: "window", label: `W${k}`, offset: at, width, height: 48, header: "2x10" });
      at += width + 36 + Math.floor(rand() * 48);
    }
    plan.walls.push({ id: `W${i}`, length, stud: "2x4", corner: rand() < 0.5, tees: rand() < 0.3 ? [Math.floor(length / 2)] : [], sheathed: rand() < 0.8, openings });
  }
  return plan;
}

test("fuzz: nail counts add up, stay non-negative and move the right way with waste and spacing", () => {
  const failures = [];
  let counted = 0, refused = 0, withSheathing = 0;
  const bad = (v) => !Number.isFinite(v) || v < 0;
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed);
    const plan = randomPlan(rand);
    const r = takeoff(plan);
    if (!r.walls?.length) continue;
    if (rand() < 0.7) { r.sheathing = sheathe(plan, r); if (r.sheathing?.walls) withSheathing++; }
    const d = {
      studEndNails: pick(rand, [undefined, 1, 2, 3]), plateSpacing: pick(rand, [undefined, 8, 16, 24]),
      jackSpacing: pick(rand, [undefined, 6, 12]), edgeSpacing: pick(rand, [undefined, 4, 6, 12]), fieldSpacing: pick(rand, [undefined, 6, 12]),
      waste: pick(rand, [undefined, 0, 0.1, 0.5]), nailsPerBox: pick(rand, [undefined, 500, 2500]), price: pick(rand, [undefined, 40]),
      holdDowns: rand() < 0.5 ? { wallEnds: rand() < 0.5, openingMinWidth: pick(rand, [null, 24, 48]), price: pick(rand, [undefined, 15]) } : undefined,
      plateStraps: rand() < 0.3 ? { perJoint: pick(rand, [1, 2]) } : undefined,
    };
    const errs = validateFasteners(d);
    const l = layoutFasteners(d, plan, r);
    if (errs.length) { refused++; if (l.ok || !l.errors.length) failures.push(`seed ${seed}: invalid settings counted`); continue; }
    if (!l.ok) { failures.push(`seed ${seed}: valid settings refused: ${l.errors}`); continue; }
    counted++;
    const sumConn = l.connections.reduce((s, c) => s + c.nails, 0);
    const sumWalls = l.walls.reduce((s, w) => s + w.nails, 0);
    if (bad(l.total) || bad(l.order) || l.connections.some((c) => bad(c.nails)) || l.walls.some((w) => bad(w.nails))) failures.push(`seed ${seed}: NaN or negative count`);
    if (sumConn !== l.total) failures.push(`seed ${seed}: connections ${sumConn} != total ${l.total}`);
    if (sumWalls !== l.total) failures.push(`seed ${seed}: walls ${sumWalls} != total ${l.total}`);
    if (l.order < l.total) failures.push(`seed ${seed}: order ${l.order} < total ${l.total}`);
    if (l.boxes != null && l.boxes * d.nailsPerBox < l.order) failures.push(`seed ${seed}: ${l.boxes} boxes do not cover ${l.order}`);
    if (l.holdDowns && l.holdDowns.count !== l.holdDowns.wallEnds + l.holdDowns.openingSides) failures.push(`seed ${seed}: hold-down count`);
    const more = layoutFasteners({ ...d, waste: Math.min(0.5, (d.waste ?? 0.1) + 0.1) }, plan, r);
    if (more.total !== l.total || more.order < l.order) failures.push(`seed ${seed}: more waste changed the count or lowered the order`);
    const tight = layoutFasteners({ ...d, plateSpacing: Math.max(3, (d.plateSpacing ?? 16) / 2) }, plan, r);
    if (tight.total < l.total) failures.push(`seed ${seed}: tighter plate spacing gave fewer nails`);
    const wide = layoutFasteners({ ...d, holdDowns: { ...(d.holdDowns || {}), wallEnds: false, openingMinWidth: 24 } }, plan, r);
    const narrow = layoutFasteners({ ...d, holdDowns: { ...(d.holdDowns || {}), wallEnds: false, openingMinWidth: 72 } }, plan, r);
    if (wide.holdDowns.count < narrow.holdDowns.count) failures.push(`seed ${seed}: a wider opening threshold counted more hold-downs`);
  }
  assert.deepEqual(failures.slice(0, 10), []);
  assert.ok(counted > 200 && withSheathing > 100, `coverage: ${counted} counted, ${refused} refused, ${withSheathing} sheathed`);
});

test("fuzz: out-of-range nailing settings are refused", () => {
  const plan = samplePlan();
  const r = takeoff(plan);
  for (const d of [{ studEndNails: 0 }, { studEndNails: 7 }, { plateSpacing: 2 }, { edgeSpacing: 13 }, { waste: 0.9 }, { nailsPerBox: 10 }, { price: -1 }, { rafterTies: { perBearing: 3 } }, { plateStraps: { perJoint: 0 } }, { holdDowns: { openingMinWidth: 1 } }, []]) {
    const l = layoutFasteners(/** @type {any} */ (d), plan, r);
    assert.equal(l.ok, false, JSON.stringify(d));
    assert.ok(l.errors.length);
  }
});
