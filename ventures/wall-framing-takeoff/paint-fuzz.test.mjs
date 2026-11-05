import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutPaint, paintText } from "./paint.mjs";

// Property test: random paint settings (including wrong-typed ones) are refused
// with a reason or give finite, non-negative quantities and text that builds.
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
const plan = {
  studLength: 92.625,
  walls: [
    { id: "A", length: 240, sheathed: true, openings: [{ kind: "door", width: 36, height: 80 }, { kind: "window", width: 48, height: 48 }] },
    { id: "B", length: 120, sheathed: false, openings: [] },
  ],
};
const BAD = ["12", NaN, Infinity, -1, {}, [], true, 1e12];

test("fuzz: random paint settings are refused with a reason or give sane quantities", () => {
  const failures = [];
  let laid = 0, refused = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const rand = rng(seed);
    const d = {};
    if (rand() < 0.5) d.height = 72 + rand() * 168;
    if (rand() < 0.4) d.faces = pick(rand, [1, 2]);
    if (rand() < 0.4) d.coats = Math.floor(rand() * 6);
    if (rand() < 0.3) d.primerCoats = Math.floor(rand() * 3);
    if (rand() < 0.3) d.coverage = 50 + rand() * 550;
    if (rand() < 0.3) d.waste = rand() * 0.5;
    if (rand() < 0.3) d.ceilings = [{ width: 60 + rand() * 200, depth: 60 + rand() * 200 }];
    if (rand() < 0.3) d.trimFeet = rand() * 500;
    if (rand() < 0.3) d.gallonPrice = rand() * 80;
    if (rand() < 0.3) d.fivePrice = rand() * 300;
    if (rand() < 0.3) d.doorFaces = pick(rand, [0, 1, 2]);
    if (rand() < 0.5) {
      const k = pick(rand, ["height", "faces", "coats", "primerCoats", "coverage", "waste", "trimFeet", "gallonPrice", "fivePrice", "doorFaces", "doorLeafSqFt", "trimFtPerGal", "ceilingCoats", "primerPrice", "primerCoverage"]);
      d[k] = pick(rand, BAD);
    }
    if (rand() < 0.15) d.ceilings = [pick(rand, [{ width: "9", depth: "9" }, { width: NaN, depth: 5 }, null, { width: Infinity, depth: 1 }])];
    let r;
    try { r = layoutPaint(d, plan); if (r.ok) paintText(r); } catch (e) { failures.push(`seed ${seed}: threw ${e.message} for ${JSON.stringify(d)}`); continue; }
    if (!r.ok) { refused++; if (!r.errors?.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    laid++;
    for (const k of ["wallSqFt", "paintGallonsExact", "primerGallonsExact", "paintGallons", "primerGallons", "paintPails"]) {
      if (!Number.isFinite(r[k]) || r[k] < 0) failures.push(`seed ${seed}: ${k}=${r[k]} for ${JSON.stringify(d)}`);
    }
    if (r.cost != null && (!Number.isFinite(r.cost) || r.cost < 0)) failures.push(`seed ${seed}: cost=${r.cost} for ${JSON.stringify(d)}`);
  }
  assert.deepEqual(failures.slice(0, 5), []);
  assert.ok(laid > 50 && refused > 50, `laid ${laid}, refused ${refused}`);
});
