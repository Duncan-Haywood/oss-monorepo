import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutRetaining, retainingText } from "./retaining.mjs";

// Property test (invented inputs): random retaining walls, some hostile, are refused
// with a reason, or blocks, caps, gravel, fabric and geogrid equal an independent
// recount, the blocks cover the face, nothing is NaN, and more waste never orders fewer.
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
const close = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));

test("fuzz: random retaining walls are refused with a reason or recount by hand", () => {
  let laid = 0, refused = 0;
  const failures = [];
  for (let seed = 1; seed <= 400; seed++) {
    const rand = rng(seed);
    const n = pick(rand, [1, 1, 2, 3, 6, 0, 101]);
    const walls = [];
    for (let i = 0; i < n; i++) walls.push({
      length: rand() < 0.93 ? pick(rand, [3, 10, 22.5, 40, 120, 1000]) : pick(rand, [0, -4, 1001, "9", NaN, Infinity]),
      height: rand() < 0.93 ? pick(rand, [0.5, 1, 2.5, 3, 4, 8, 20]) : pick(rand, [0, 21, "3", NaN, -1]),
    });
    const block = {};
    for (const [k, vals] of Object.entries({
      blockLength: [8, 12, 16, 18, 3], blockHeight: [4, 6, 8, 1], blockDepth: [8, 12, 15], capLength: [12, 16, 24],
      buryIn: [0, 6, 12, 40], waste: [0, 0.05, 0.2, 0.6], baseDepth: [0, 6, 8], baseOverhang: [0, 6, 12],
      drainWidth: [0, 12, 24], compaction: [1, 1.25, 1.5, 0.5], geogridEvery: [0, 2, 3, 2.5], geogridLength: [0, 4, 6],
      capAdhesiveFtPerTube: [10, 20, 30], blockPrice: [0, 3.5], capPrice: [4], baseTonPrice: [30],
    })) if (rand() < 0.5) block[k] = rand() < 0.85 ? pick(rand, vals.slice(0, 3)) : pick(rand, vals);
    const d = { walls, block };
    let r;
    try { r = layoutRetaining(d); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!r.ok) { refused++; if (!r.errors?.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    laid++;
    const L = block.blockLength ?? 16, H = block.blockHeight ?? 6, D = block.blockDepth ?? 12, capL = block.capLength ?? 16;
    const bury = block.buryIn ?? 6, waste = block.waste ?? 0.05, baseD = block.baseDepth ?? 6, over = block.baseOverhang ?? 6;
    const drainW = block.drainWidth ?? 12, comp = block.compaction ?? 1.25, gE = block.geogridEvery ?? 0, gL = block.geogridLength ?? 4;
    let blocks = 0, caps = 0, base = 0, drain = 0, grid = 0, fabric = 0, feet = 0;
    for (const w of walls) {
      const exp = Math.ceil(w.height * 12 / H - 1e-9), bur = Math.ceil(bury / H - 1e-9);
      const per = Math.ceil(w.length * 12 / L - 1e-9);
      const wb = Math.ceil((exp + bur) * per * (1 + waste) - 1e-9);
      if (wb < (exp + bur) * per) failures.push(`seed ${seed}: fewer blocks than the grid`);
      if (wb * L * H < w.length * 12 * w.height * 12) failures.push(`seed ${seed}: blocks do not cover the face`);
      blocks += wb; caps += Math.ceil(w.length * 12 / capL * (1 + waste) - 1e-9); feet += w.length;
      base += w.length * ((D + 2 * over) / 12) * (baseD / 12) / 27 * comp;
      const built = (exp + bur) * H / 12;
      drain += w.length * (drainW / 12) * built / 27;
      fabric += w.length * (built + drainW / 12 + 2);
      if (gE > 0 && gL > 0) grid += Math.floor((exp - 1) / gE) * w.length * gL;
    }
    if (r.blocks !== blocks) failures.push(`seed ${seed}: blocks ${r.blocks} != ${blocks}`);
    if (r.caps !== caps) failures.push(`seed ${seed}: caps ${r.caps} != ${caps}`);
    if (!close(r.baseCuYd, base)) failures.push(`seed ${seed}: base`);
    if (!close(r.drainCuYd, drain)) failures.push(`seed ${seed}: drain`);
    if (!close(r.fabricSqFt, fabric)) failures.push(`seed ${seed}: fabric`);
    if (!close(r.geogridSqFt, grid)) failures.push(`seed ${seed}: geogrid ${r.geogridSqFt} != ${grid}`);
    if (!close(r.feet, feet)) failures.push(`seed ${seed}: feet`);
    for (const k of ["blocks", "caps", "baseCuYd", "drainCuYd", "fabricSqFt", "geogridSqFt", "adhesiveTubes", "blocksPerSqFt"]) {
      if (!Number.isFinite(r[k]) || r[k] < 0) failures.push(`seed ${seed}: ${k} = ${r[k]}`);
    }
    if (block.blockPrice == null && block.capPrice == null && block.baseTonPrice == null && r.cost !== null) failures.push(`seed ${seed}: cost without a price`);
    if (/NaN|undefined|Infinity/.test(retainingText(r).join("\n"))) failures.push(`seed ${seed}: bad text`);
    const more = layoutRetaining({ walls, block: { ...block, waste: Math.min(0.5, waste + 0.1) } });
    if (more.ok && more.blocks < r.blocks) failures.push(`seed ${seed}: more waste ordered fewer blocks`);
  }
  assert.deepEqual(failures.slice(0, 8), []);
  assert.ok(laid > 80 && refused > 20, `laid ${laid}, refused ${refused}`);
});
