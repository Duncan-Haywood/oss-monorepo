import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutBulk, validateBulk, bulkText, PRESETS } from "./bulk.mjs";

// Property test (invented inputs): random bulk-material jobs, some hostile, are
// refused with a reason, or every quantity equals an independent recount.
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
const close = (a, b) => Math.abs(a - b) <= 0.011 + 1e-9 * Math.abs(b);

test("fuzz: random bulk jobs are refused with a reason or recount by hand", () => {
  let laid = 0, refused = 0;
  const failures = [];
  for (let seed = 1; seed <= 400; seed++) {
    const rand = rng(seed);
    const n = pick(rand, [1, 1, 2, 4, 0, 201]);
    const areas = [];
    for (let i = 0; i < n; i++) {
      const shape = pick(rand, ["rect", "rect", "circle", "area", "rect"]);
      const a = shape === "rect" ? { length: pick(rand, [3, 10, 40, 0.5]), width: pick(rand, [2, 8, 25]) }
        : shape === "circle" ? { diameter: pick(rand, [4, 12, 30]) } : { areaSqFt: pick(rand, [10, 150, 900]) };
      if (rand() < 0.5) a.depth = pick(rand, [1, 2, 3, 6, 12]);
      if (rand() < 0.04) a.depth = pick(rand, [0, -1, "3", 121, NaN]);
      if (rand() < 0.03) a.width = pick(rand, [0, "x", Infinity]);
      areas.push(a);
    }
    const material = {};
    if (rand() < 0.7) material.name = rand() < 0.97 ? pick(rand, Object.keys(PRESETS)) : pick(rand, ["lava", "__proto__", 5]);
    for (const [k, vals] of Object.entries({ tonsPerYard: [0.4, 1.5], compaction: [1, 1.2, 0.8], waste: [0, 0.1, 1.5], bagCuFt: [0.5, 2, 0], minYards: [0, 5], pricePerYard: [30, 55], pricePerTon: [20], pricePerBag: [4] }))
      if (rand() < 0.4) material[k] = rand() < 0.85 ? vals[Math.floor(rand() * 2) % vals.length] : pick(rand, vals);
    const d = { areas, material };
    let r;
    try { r = layoutBulk(d); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!r.ok) { refused++; if (!r.errors?.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    laid++;
    const pre = material.name ? PRESETS[material.name] : {};
    const m = { tonsPerYard: 1.4, compaction: 1, waste: 0.05, bagCuFt: 0.5, minYards: 0, ...pre, ...material };
    let cu = 0;
    for (const a of areas) {
      const ar = a.areaSqFt ?? (a.diameter != null ? Math.PI * (a.diameter / 2) ** 2 : a.length * a.width);
      cu += ar * (a.depth ?? pre.depth) / 12;
    }
    const order = cu / 27 * m.compaction * (1 + m.waste);
    const rounded = Math.ceil(Math.max(order, m.minYards) * 4 - 1e-9) / 4;
    const bagsNeed = cu * m.compaction * (1 + m.waste) / m.bagCuFt;
    const bad = [];
    if (!close(r.cuFt, cu)) bad.push(`cuFt ${r.cuFt} vs ${cu}`);
    if (!close(r.orderYards, order)) bad.push(`orderYards ${r.orderYards} vs ${order}`);
    if (r.roundedYards < order - 1e-9 || r.roundedYards < m.minYards) bad.push("rounded yards short");
    if (!close(r.tons, order * m.tonsPerYard)) bad.push("tons");
    if (r.bags < bagsNeed - 1e-6 || r.bags > bagsNeed + 1) bad.push(`bags ${r.bags} vs ${bagsNeed}`);
    if (m.pricePerYard != null && !close(r.cost, rounded * m.pricePerYard)) bad.push("cost per yard");
    for (const k of ["cuFt", "orderYards", "tons", "bags", "sqFt", "roundedYards"]) if (!Number.isFinite(r[k])) bad.push(`${k} not finite`);
    if (!bulkText(r).length) bad.push("no text");
    if (bad.length) failures.push(`seed ${seed}: ${bad.join("; ")}`);
  }
  assert.deepEqual(failures.slice(0, 5), []);
  assert.ok(laid > 80 && refused > 20, `laid ${laid}, refused ${refused}`);
});

test("hostile settings are refused without throwing", () => {
  for (const d of [null, 5, [], {}, { areas: "x" }, { areas: [null] }, { areas: [{ length: 1, width: 1, depth: 2 }], material: [] }]) {
    assert.equal(layoutBulk(d).ok, false);
    assert.ok(validateBulk(d).length);
  }
});
