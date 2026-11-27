import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutFlooring, flooringText } from "./flooring.mjs";

// Property test: random flooring settings (including wrong-typed ones) are refused
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
const BAD = ["12", NaN, Infinity, -1, 0, {}, [], true, 1e12];
const NUMS = {
  plank: ["boxSqFt", "waste", "diagonalWaste", "underlaymentRollSqFt", "boxPrice", "underlaymentPrice"],
  tile: ["tileWidth", "tileLength", "joint", "thickness", "waste", "thinsetSqFtPerBag", "groutLbPerCuFt", "groutBagLb", "tilePrice", "thinsetPrice", "groutPrice"],
  carpet: ["rollWidth", "trimAllowance", "padWaste", "carpetPrice", "padPrice", "tackStripLength", "tackPrice"],
};

test("fuzz: random flooring settings are refused with a reason or give sane quantities", () => {
  const failures = [];
  let laid = 0, refused = 0;
  for (let seed = 1; seed <= 600; seed++) {
    const rand = rng(seed);
    const d = { rooms: [] };
    const n = 1 + Math.floor(rand() * 5);
    for (let i = 0; i < n; i++) d.rooms.push({ name: `R${i}`, width: 36 + rand() * 400, depth: 36 + rand() * 400, kind: pick(rand, ["plank", "tile", "carpet"]), diagonal: rand() < 0.3 });
    if (rand() < 0.5) d.plank = { boxSqFt: 10 + rand() * 40, waste: rand() * 0.3, underlayment: rand() < 0.5, boxPrice: rand() * 100 };
    if (rand() < 0.5) d.tile = { tileWidth: 4 + rand() * 30, tileLength: 4 + rand() * 30, joint: rand() * 0.5, thickness: 0.2 + rand(), tilePrice: rand() * 20, groutPrice: rand() * 30 };
    if (rand() < 0.5) d.carpet = { rollWidth: 72 + rand() * 150, trimAllowance: rand() * 12, carpetPrice: rand() * 40, tackPrice: rand() * 10 };
    if (rand() < 0.5) {
      const kind = pick(rand, Object.keys(NUMS));
      d[kind] = d[kind] || {};
      d[kind][pick(rand, NUMS[kind])] = pick(rand, BAD);
    }
    if (rand() < 0.15) d.rooms[0][pick(rand, ["width", "depth", "kind"])] = pick(rand, BAD);
    if (rand() < 0.05) d.rooms.push(pick(rand, [null, 5, "x"]));
    let r;
    try { r = layoutFlooring(d); if (r.ok) flooringText(r); } catch (e) { failures.push(`seed ${seed}: threw ${e.message} for ${JSON.stringify(d)}`); continue; }
    if (!r.ok) { refused++; if (!r.errors?.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    laid++;
    const nums = [];
    if (r.plank) nums.push(["plank.boxes", r.plank.boxes], ["plank.sqFt", r.plank.sqFt], ["plank.leftover", r.plank.leftoverSqFt]);
    if (r.tile) nums.push(["tile.tiles", r.tile.tiles], ["tile.thinset", r.tile.thinsetBags], ["tile.groutLb", r.tile.groutLb], ["tile.groutBags", r.tile.groutBags]);
    if (r.carpet) nums.push(["carpet.rollSqYd", r.carpet.rollSqYd], ["carpet.seams", r.carpet.seams], ["carpet.padSqYd", r.carpet.padSqYd], ["carpet.tackFeet", r.carpet.tackFeet]);
    if (r.cost != null) nums.push(["cost", r.cost]);
    for (const [k, v] of nums) if (!Number.isFinite(v) || v < -1e-6) failures.push(`seed ${seed}: ${k}=${v} for ${JSON.stringify(d)}`);
  }
  assert.deepEqual(failures.slice(0, 5), []);
  assert.ok(laid > 50 && refused > 50, `laid ${laid}, refused ${refused}`);
});
