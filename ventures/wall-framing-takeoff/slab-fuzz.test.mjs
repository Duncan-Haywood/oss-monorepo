import { test } from "node:test";
import assert from "node:assert/strict";
import { slabConcrete, slabText, BAG_YIELD } from "./slab.mjs";

// Property test: random slab, footing and pier orders are refused with a
// reason, or the ready-mix and bag orders cover the volume, the volume matches
// an independent geometry sum, and more waste never orders less.
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

test("fuzz: random concrete orders cover the volume or are refused with a reason", () => {
  let laid = 0, refused = 0;
  const failures = [];
  for (let seed = 1; seed <= 400; seed++) {
    const rand = rng(seed);
    const shape = pick(rand, ["slab", "footing", "pier", "pier", "slab", "bogus"]);
    const s = {
      shape,
      length: pick(rand, [6, 12, 120, 480, 4800, 6000, 0]),
      width: pick(rand, [2, 4, 12, 96, 2400, 3000]),
      diameter: pick(rand, [4, 6, 12, 24, 60, 72]),
      depth: pick(rand, [1, 2, 4, 6, 12, 48, 96, 120]),
      count: pick(rand, [1, 1, 2, 12, 500, 501, 1.5, 0]),
      waste: rand() < 0.8 ? rand() * 0.5 : 0.7,
      bag: pick(rand, [40, 60, 80, 80, 50]),
    };
    let r;
    try { r = slabConcrete(s); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!r.ok) { refused++; if (!r.errors?.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    laid++;
    const area = s.shape === "pier" ? Math.PI * (s.diameter / 2) ** 2 : s.length * s.width;
    const cuFt = area * s.depth * s.count / 1728;
    if (Math.abs(r.cuFt - cuFt) > 1e-6 * Math.max(1, cuFt)) failures.push(`seed ${seed}: cuFt ${r.cuFt} != ${cuFt}`);
    if (!(r.cuFt > 0)) failures.push(`seed ${seed}: non-positive volume`);
    if (r.orderYd + 1e-9 < r.withWaste || r.orderYd - r.withWaste >= 0.25 + 1e-9) failures.push(`seed ${seed}: order ${r.orderYd} vs ${r.withWaste}`);
    if (r.bags * BAG_YIELD[s.bag] + 1e-9 < r.cuFt * (1 + s.waste)) failures.push(`seed ${seed}: bags ${r.bags} do not cover`);
    if (r.shortLoad !== r.orderYd < 4) failures.push(`seed ${seed}: shortLoad flag wrong`);
    const more = slabConcrete({ ...s, waste: Math.min(0.5, s.waste + 0.1) });
    if (more.ok && (more.orderYd < r.orderYd || more.bags < r.bags)) failures.push(`seed ${seed}: more waste ordered less`);
    try { if (slabText(r).length < 3) failures.push(`seed ${seed}: short text`); } catch (e) { failures.push(`seed ${seed}: text threw ${e.message}`); }
  }
  assert.deepEqual(failures, []);
  assert.ok(laid > 50 && refused > 50, `laid ${laid}, refused ${refused}`);
});
