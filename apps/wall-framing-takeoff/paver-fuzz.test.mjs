import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutPaver, validatePaver, paverText } from "./paver.mjs";

// Property test (invented inputs): random paver jobs, some hostile, are refused
// with a reason, or every quantity equals an independent recount, the pavers,
// edge pieces, spikes and bags cover what they must, nothing is NaN, and more
// waste never orders fewer pavers.
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

test("fuzz: random paver jobs are refused with a reason or recount by hand", () => {
  let laid = 0, refused = 0;
  const failures = [];
  for (let seed = 1; seed <= 400; seed++) {
    const rand = rng(seed);
    const n = pick(rand, [1, 1, 1, 2, 3, 5, 0, 101]);
    const areas = [];
    for (let i = 0; i < n; i++) {
      areas.push({
        width: rand() < 0.95 ? pick(rand, [0.5, 3, 8, 10, 20, 500]) : pick(rand, [501, 0, -2, "4", NaN]),
        length: rand() < 0.95 ? pick(rand, [2, 6, 12, 40, 500]) : pick(rand, [0, Infinity]),
        ...(rand() < 0.2 ? { subtract: rand() < 0.97 ? pick(rand, [true, false]) : "yes" } : {}),
      });
    }
    const paver = {};
    for (const [k, vals] of Object.entries({
      length: [4, 8, 12, 24, 0, 49], width: [4, 6, 12, 0.5], thickness: [1, 2.375, 3.5, 9], joint: [0, 0.125, 0.5, 3],
      baseDepth: [2, 4, 6, 12, 30], sandDepth: [0, 1, 2, 5], baseOverhang: [0, 6, 12, 30], compaction: [1, 1.25, 2, 3],
      waste: [0, 0.1, 0.25, 0.9], edgeStockFt: [1, 10, 20, 0], spikeSpacingIn: [4, 12, 48, 2], jointSandBagLb: [5, 50, 200, 1],
      paverPrice: [0, 1.5, -1], baseTonPrice: [30, 55],
    })) if (rand() < 0.5) paver[k] = rand() < 0.8 ? pick(rand, vals.slice(0, 3)) : pick(rand, vals);
    const d = { areas, paver };
    if (rand() < 0.3) d.edgeFeet = rand() < 0.8 ? pick(rand, [0, 15, 40, 5000]) : pick(rand, [5001, -1, "9"]);
    let r;
    try { r = layoutPaver(d); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!r.ok) { refused++; if (!r.errors?.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    laid++;
    const L = paver.length ?? 8, W = paver.width ?? 4, T = paver.thickness ?? 2.375, J = paver.joint ?? 0.125;
    const baseD = paver.baseDepth ?? 4, sandD = paver.sandDepth ?? 1, over = paver.baseOverhang ?? 6, comp = paver.compaction ?? 1.25, waste = paver.waste ?? 0.1;
    let net = 0, spread = 0, perim = 0;
    for (const a of areas) {
      const ar = a.width * a.length;
      if (a.subtract) { net -= ar; spread -= ar; } else { net += ar; spread += (a.width + over / 6) * (a.length + over / 6); perim += 2 * (a.width + a.length); }
    }
    const exact = net * 144 / ((L + J) * (W + J));
    if (!close(r.netSqFt, net)) failures.push(`seed ${seed}: net ${r.netSqFt} != ${net}`);
    if (r.pavers < exact * (1 + waste) - 1e-6 || r.pavers >= exact * (1 + waste) + 1) failures.push(`seed ${seed}: pavers ${r.pavers} vs ${exact * (1 + waste)}`);
    if (!close(r.excavationCuYd, spread * (baseD + sandD + T) / 12 / 27)) failures.push(`seed ${seed}: excavation`);
    if (!close(r.baseCuYd, spread * baseD / 12 / 27 * comp)) failures.push(`seed ${seed}: base`);
    if (r.baseCuYd - 1e-9 > r.excavationCuYd * comp) failures.push(`seed ${seed}: base exceeds the hole`);
    const edge = d.edgeFeet ?? perim;
    if (!close(r.edgeFeet, edge)) failures.push(`seed ${seed}: edge`);
    if (r.edgePieces * (paver.edgeStockFt ?? 10) < edge - 1e-6) failures.push(`seed ${seed}: edge pieces short`);
    if (r.spikes * (paver.spikeSpacingIn ?? 12) < edge * 12 - 1e-6) failures.push(`seed ${seed}: spikes short`);
    if (r.jointSandBags * (paver.jointSandBagLb ?? 50) < r.jointSandLb - 1e-6) failures.push(`seed ${seed}: joint sand bags short`);
    for (const k of ["pavers", "baseTons", "sandTons", "jointSandLb", "fabricSqFt", "excavationCuYd"]) if (!Number.isFinite(r[k]) || r[k] < 0) failures.push(`seed ${seed}: ${k} = ${r[k]}`);
    if (r.cost != null && !(Number.isFinite(r.cost) && r.cost >= 0)) failures.push(`seed ${seed}: cost ${r.cost}`);
    const more = layoutPaver({ ...d, paver: { ...paver, waste: Math.min(0.5, waste + 0.1) } });
    if (more.ok && more.pavers < r.pavers) failures.push(`seed ${seed}: more waste ordered fewer pavers`);
    try { if (paverText(r).length < 3) failures.push(`seed ${seed}: short text`); } catch (e) { failures.push(`seed ${seed}: text threw ${e.message}`); }
  }
  assert.ok(laid > 40 && refused > 40, `mix: ${laid} laid, ${refused} refused`);
  assert.deepEqual(failures, []);
});

test("fuzz: hostile settings never throw", () => {
  for (const v of [null, undefined, 5, "x", [], {}, { areas: null }, { areas: [null] }, { areas: [[]] }, { areas: [{ width: 1, length: 1 }], paver: [] }, { areas: [{ width: 1, length: 1 }], paver: { length: null, joint: "a" } }]) {
    const r = layoutPaver(v);
    assert.equal(r.ok === false || r.ok === true, true);
    if (!r.ok) assert.ok(r.errors.length > 0);
    assert.ok(Array.isArray(validatePaver(v)));
  }
});
