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

// Truss bearing toenails (trussToPlate, 2026-11-06) were hand-tested only.
// Property: with trusses in the roof, the nail total rises by exactly
// 2 x trusses x trussToPlate, the roofNails record says the same, the rows
// still add up, and off (0 or unset) adds nothing. Bad values are refused.
test("fuzz: truss bearing nails add exactly 2 x trusses x nails, and nothing when off", () => {
  const failures = [];
  const plan = samplePlan();
  const base = takeoff(plan);
  for (let seed = 1; seed <= 200; seed++) {
    const rand = rng(seed);
    const trusses = Math.floor(rand() * 40);
    const tp = pick(rand, [0, 1, 2, 3, 4, 6]);
    const r = { ...base, roof: { trusses: { count: trusses }, rafters: [] } };
    const off = layoutFasteners({ roofNails: true }, plan, r);
    const on = layoutFasteners({ roofNails: { trussToPlate: tp } }, plan, r);
    if (!off.ok || !on.ok) { failures.push(`seed ${seed}: refused valid ${tp}`); continue; }
    if (on.total - off.total !== 2 * trusses * tp) failures.push(`seed ${seed}: total rose ${on.total - off.total}, want ${2 * trusses * tp}`);
    if (tp && trusses && on.roofNails?.count !== 2 * trusses * tp) failures.push(`seed ${seed}: roofNails.count`);
    if ((!tp || !trusses) && on.roofNails != null) failures.push(`seed ${seed}: record present while off`);
    if (on.connections.reduce((s, c) => s + c.nails, 0) !== on.total) failures.push(`seed ${seed}: rows != total`);
  }
  assert.deepEqual(failures.slice(0, 10), []);
  for (const bad of [-1, 1.5, 21, NaN, "2"]) {
    assert.equal(layoutFasteners(/** @type {any} */ ({ roofNails: { trussToPlate: bad } }), plan, { ...base, roof: { trusses: { count: 3 }, rafters: [] } }).ok, false, String(bad));
  }
});

// Wall braces (fasteners.wallBracing, 2026-11-06) were hand-tested only.
// Property: the count equals the sum of ceil(length / spacing) over walls at
// least minWallLength long, brace feet equal count x height / sin(angle), cost
// is count x price, nails per brace add exactly count x nails to the total,
// a tighter spacing never gives fewer braces, and bad settings are refused.
test("fuzz: wall braces count ceil(length / spacing) per long-enough wall, and nails add count x nails", () => {
  const failures = [];
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed);
    const walls = Array.from({ length: 1 + Math.floor(rand() * 6) }, (_, i) => ({
      id: `W${i}`, length: 12 + Math.floor(rand() * 700), height: pick(rand, [96, 97.125, 108, 120]), members: [],
    }));
    const r = { walls };
    const spacing = pick(rand, [24, 100, 120, 300, 600]);
    const minWallLength = pick(rand, [12, 48, 96, 240]);
    const angle = pick(rand, [30, 45, 60]);
    const price = pick(rand, [undefined, 0, 20]);
    const nailsPerBrace = pick(rand, [undefined, 0, 4, 12]);
    const wb = { spacing, minWallLength, angle, price, nailsPerBrace };
    const off = layoutFasteners({ waste: 0 }, {}, r);
    const l = layoutFasteners({ waste: 0, wallBracing: wb }, {}, r);
    if (!l.ok) { failures.push(`seed ${seed}: refused valid ${JSON.stringify(wb)}`); continue; }
    const braced = walls.filter((w) => w.length >= minWallLength);
    const count = braced.reduce((s, w) => s + Math.ceil(w.length / spacing - 1e-9), 0);
    const feet = braced.reduce((s, w) => s + (Math.ceil(w.length / spacing - 1e-9) * w.height) / Math.sin((angle * Math.PI) / 180), 0) / 12;
    const b = l.wallBracing;
    if (b.count !== count) failures.push(`seed ${seed}: count ${b.count}, want ${count}`);
    if (b.walls !== braced.length) failures.push(`seed ${seed}: walls ${b.walls}, want ${braced.length}`);
    if (Math.abs(b.feet - feet) > 1e-6) failures.push(`seed ${seed}: feet ${b.feet}, want ${feet}`);
    if (price != null && b.cost !== count * price) failures.push(`seed ${seed}: cost`);
    if (price == null && b.cost != null) failures.push(`seed ${seed}: cost without price`);
    if (l.total - off.total !== count * (nailsPerBrace ?? 0)) failures.push(`seed ${seed}: nails rose ${l.total - off.total}, want ${count * (nailsPerBrace ?? 0)}`);
    if (l.walls.reduce((s, w) => s + w.nails, 0) !== l.total) failures.push(`seed ${seed}: wall rows != total`);
    if (l.connections.reduce((s, c) => s + c.nails, 0) !== l.total) failures.push(`seed ${seed}: connection rows != total`);
    const tight = layoutFasteners({ waste: 0, wallBracing: { ...wb, spacing: Math.max(24, spacing / 2) } }, {}, r);
    if (tight.wallBracing.count < count) failures.push(`seed ${seed}: tighter spacing gave fewer braces`);
  }
  assert.deepEqual(failures.slice(0, 10), []);
  const r = { walls: [{ id: "A", length: 200, height: 97.125, members: [] }] };
  for (const bad of [{ spacing: 5 }, { spacing: 2000 }, { angle: 29 }, { angle: 61 }, { minWallLength: 1 }, { nailsPerBrace: 1.5 }, { nailsPerBrace: -1 }, { price: -1 }])
    assert.equal(layoutFasteners(/** @type {any} */ ({ wallBracing: bad }), {}, r).ok, false, JSON.stringify(bad));
});
