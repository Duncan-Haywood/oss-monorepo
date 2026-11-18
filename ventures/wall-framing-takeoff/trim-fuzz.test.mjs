import { test } from "node:test";
import assert from "node:assert/strict";
import { samplePlan } from "./engine.mjs";
import { layoutTrim, trimText } from "./trim.mjs";

// Property test: random trim settings on the sample house are refused with a
// reason, or lay out with board counts that cover the cut feet, no negative
// quantities, and a text report that builds.
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

test("fuzz: random trim settings lay out consistently or are refused with a reason", () => {
  const plan = samplePlan();
  let laid = 0, refused = 0;
  const failures = [];
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed);
    const d = {
      baseStock: pick(rand, [48, 96, 144, 192, 300, 20]),
      casingStock: pick(rand, [48, 96, 120, 240]),
      shoeStock: pick(rand, [96, 144]),
      casingWidth: pick(rand, [1.5, 2.25, 3.5, 9]),
      reveal: pick(rand, [0, 0.1875, 0.5, 2]),
      scarf: pick(rand, [0, 0, 2, 6, 15]),
      waste: rand() * 0.35,
      shoe: rand() < 0.5,
    };
    if (rand() < 0.4) d.baseSides = pick(rand, [1, 2, 3]);
    let t;
    try { t = layoutTrim(d, plan); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!t.ok) { refused++; if (!t.errors?.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    laid++;
    const cover = (feet, boards, stock, name) => {
      if (feet < 0 || boards < 0) failures.push(`seed ${seed}: negative ${name}`);
      if (boards * stock / 12 + 1e-6 < feet) failures.push(`seed ${seed}: ${name} boards ${boards} x ${stock} in do not cover ${feet} ft`);
    };
    cover(t.baseFeet, t.baseBoards, t.baseStock, "base");
    cover(t.casingFeet, t.casingBoards, t.casingStock, "casing");
    if (d.shoe) cover(t.shoeFeet, t.shoeBoards, t.shoeStock, "shoe");
    try { if (trimText(t).length < 1) failures.push(`seed ${seed}: empty text`); } catch (e) { failures.push(`seed ${seed}: text threw ${e.message}`); }
  }
  assert.deepEqual(failures, []);
  assert.ok(laid > 50 && refused > 10, `laid ${laid}, refused ${refused}`);
});
