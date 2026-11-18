import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutPlumbing, plumbingText } from "./plumbing.mjs";

// Seeded property test on invented fixture lists (some hostile): refused with a
// reason, or every total equals an independent recount and nothing is NaN.
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

test("fuzz: random plumbing inputs are recounted by hand or refused with a reason", () => {
  const failures = [];
  let laid = 0, refused = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const rand = rng(seed);
    const fixtures = [];
    const n = Math.floor(rand() * 6);
    for (let i = 0; i < n; i++) {
      const f = { id: `F${i}` };
      if (rand() < 0.4) f.count = rand() < 0.05 ? pick(rand, [0, 1.5, 101, "2"]) : pick(rand, [1, 2, 3]);
      if (rand() < 0.7) f.drainFt = rand() < 0.04 ? pick(rand, [-1, 1e9, "5", NaN]) : pick(rand, [0, 4, 9, 12]);
      if (rand() < 0.5) f.ventFt = pick(rand, [0, 6, 10]);
      if (rand() < 0.6) f.hotFt = pick(rand, [0, 8, 20]);
      if (rand() < 0.6) f.coldFt = pick(rand, [0, 8, 25]);
      if (rand() < 0.3) f.drainFittings = pick(rand, [0, 2, 5]);
      if (rand() < 0.3) f.supplyFittings = pick(rand, [0, 3, 6]);
      if (rand() < 0.2) f.stops = pick(rand, [0, 1, 2]);
      if (rand() < 0.2) f.trap = pick(rand, [true, false]);
      if (rand() < 0.2) f.dfu = pick(rand, [1, 2, 3]);
      fixtures.push(f);
    }
    const d = { fixtures };
    if (rand() < 0.4) d.drainStickFt = pick(rand, [10, 20, 4, 41]);
    if (rand() < 0.4) d.pexCoilFt = pick(rand, [100, 300, 24]);
    if (rand() < 0.3) d.waste = pick(rand, [0, 0.1, 0.5, 0.6]);
    if (rand() < 0.3) d.drainHangerSpacingFt = pick(rand, [4, 0.1]);
    if (rand() < 0.3) d.supplyStrapSpacingFt = pick(rand, [3, 32.5]);
    if (rand() < 0.3) { d.drainPipePrice = 10; d.pexCoilPrice = 50; d.trapPrice = 6; d.stopPrice = 5; }
    let t;
    try { t = layoutPlumbing(d); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!t.ok) { refused++; if (!t.errors?.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    laid++;
    const bad = [];
    let drain = 0, vent = 0, hot = 0, cold = 0, traps = 0, stops = 0, df = 0, sf = 0, cnt = 0;
    for (const f of fixtures) {
      const c = f.count ?? 1;
      cnt += c; drain += c * (f.drainFt ?? 0); vent += c * (f.ventFt ?? 0);
      hot += c * (f.hotFt ?? 0); cold += c * (f.coldFt ?? 0);
      df += c * (f.drainFittings ?? 0); sf += c * (f.supplyFittings ?? 0);
      if (f.trap !== false && ((f.drainFt ?? 0) > 0 || f.trap === true)) traps += c;
      stops += c * (f.stops ?? ((f.hotFt ?? 0) > 0 ? 1 : 0) + ((f.coldFt ?? 0) > 0 ? 1 : 0));
    }
    const waste = d.waste ?? 0.1, stick = d.drainStickFt ?? 10, coil = d.pexCoilFt ?? 100;
    const eq = (a, b, what) => { if (Math.abs(a - b) > 1e-6) bad.push(`${what}: ${a} vs ${b}`); };
    eq(t.fixtureCount, cnt, "fixtures"); eq(t.drainFt, drain, "drain"); eq(t.ventFt, vent, "vent");
    eq(t.hotFt, hot, "hot"); eq(t.coldFt, cold, "cold"); eq(t.traps, traps, "traps"); eq(t.stops, stops, "stops");
    eq(t.drainFittings, df, "drain fittings"); eq(t.supplyFittings, sf, "supply fittings");
    if (t.drainSticks * stick + 1e-6 < (drain + vent) * (1 + waste)) bad.push("sticks do not cover the pipe");
    if (t.hotCoils * coil + 1e-6 < hot * (1 + waste)) bad.push("hot coils do not cover the pipe");
    if (t.coldCoils * coil + 1e-6 < cold * (1 + waste)) bad.push("cold coils do not cover the pipe");
    if (!(drain + vent) && t.drainSticks) bad.push("sticks without pipe");
    for (const k of ["hangers", "straps", "drainSticks", "hotCoils", "coldCoils"]) if (!Number.isInteger(t[k]) || t[k] < 0) bad.push(`bad ${k}`);
    if (t.cost != null && !Number.isFinite(t.cost)) bad.push("cost not finite");
    const anyPrice = d.drainPipePrice != null;
    if (!anyPrice && t.cost !== null) bad.push("cost without prices");
    if (anyPrice) eq(t.cost, t.drainSticks * 10 + (t.hotCoils + t.coldCoils) * 50 + t.traps * 6 + t.stops * 5, "cost");
    try { if (!plumbingText(t).length) bad.push("empty text"); } catch (e) { bad.push(`text threw ${e.message}`); }
    if (bad.length) failures.push(`seed ${seed}: ${bad.join("; ")}`);
  }
  assert.deepEqual(failures.slice(0, 5), []);
  assert.ok(laid > 50 && refused > 5, `laid ${laid}, refused ${refused}`);
});
