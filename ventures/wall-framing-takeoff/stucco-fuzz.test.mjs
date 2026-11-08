import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutStucco, validateStucco, stuccoText } from "./stucco.mjs";

// Property test for the stucco takeoff: random walls, openings and settings.
// Whatever is laid out must be finite, must order enough stock to cover the
// quantities (lower bounds recomputed by hand), must not shrink when waste
// grows, must price only what is typed, and must render text. Hostile settings
// are refused with a reason, never a raw TypeError. Invented inputs only.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rand, a, b) => a + rand() * (b - a);

test("fuzz: stucco quantities are finite, cover the area, and waste only adds", () => {
  const failures = [];
  let laid = 0, refused = 0, priced = 0, withOpenings = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed);
    const tag = `seed ${seed}`;
    const walls = [];
    const n = 1 + Math.floor(rand() * 6);
    for (let i = 0; i < n; i++) {
      const length = Math.round(pick(rand, 60, 720));
      const w = { id: `W${i}`, length };
      if (rand() < 0.2) w.sheathed = false;
      if (rand() < 0.6 && length > 60) {
        const width = Math.round(pick(rand, 18, Math.min(72, length - 24)));
        w.openings = [{ kind: "window", offset: Math.round(pick(rand, 6, length - width - 6)), width, height: Math.round(pick(rand, 18, 60)) }];
      }
      walls.push(w);
    }
    const plan = { studLength: 96, defaultHeaderHeight: 80, walls };
    const d = { waste: 0 };
    if (rand() < 0.5) d.barrierLayers = Math.floor(rand() * 4);
    if (rand() < 0.5) d.lathSheetSqFt = Math.round(pick(rand, 8, 40));
    if (rand() < 0.5) d.bagYieldCuFt = Math.round(pick(rand, 0.3, 1.5) * 100) / 100;
    if (rand() < 0.5) d.trimStock = Math.round(pick(rand, 60, 200));
    if (rand() < 0.5) d.corners = Math.floor(rand() * 10);
    if (rand() < 0.5) d.maxRunFt = Math.round(pick(rand, 6, 40));
    if (rand() < 0.5) { d.bagPrice = Math.round(rand() * 2000) / 100; d.lathPrice = Math.round(rand() * 3000) / 100; }
    const s = layoutStucco(d, plan);
    if (!s.ok) { refused++; if (!s.errors.length) failures.push(`${tag}: refused with no reason`); continue; }
    laid++;
    if (s.trim.casing.openings > 0) withOpenings++;
    for (const v of [s.netSqFt, s.barrier.sqFt, s.barrier.rolls, s.lath.sheets, s.lath.fasteners, s.plaster.volumeCuFt, s.plaster.bags, s.trim.screed.pieces, s.trim.casing.pieces, s.trim.corner.pieces, s.trim.joints.pieces]) {
      if (!Number.isFinite(v) || v < 0) failures.push(`${tag}: bad number ${v}`);
    }
    const sheet = d.lathSheetSqFt ?? 18, yieldCu = d.bagYieldCuFt ?? 0.6;
    if (s.lath.sheets < Math.floor(s.netSqFt * 1.1 / sheet)) failures.push(`${tag}: lath ${s.lath.sheets} sheets cannot cover ${s.netSqFt}`);
    if (s.plaster.bags * yieldCu < s.plaster.volumeCuFt - 1e-6) failures.push(`${tag}: ${s.plaster.bags} bags cannot make ${s.plaster.volumeCuFt} cu ft`);
    const stockFt = (d.trimStock ?? 120) / 12;
    if (s.trim.screed.pieces < Math.floor(s.trim.screed.feet / stockFt)) failures.push(`${tag}: screed pieces cannot cover the feet`);
    if (s.trim.corner.corners !== (d.corners ?? 4)) failures.push(`${tag}: corner count`);
    const anyPrice = d.bagPrice != null || d.lathPrice != null;
    if (anyPrice !== (s.cost != null)) failures.push(`${tag}: cost presence`);
    if (anyPrice) {
      priced++;
      const want = (d.bagPrice ?? 0) * s.plaster.bags + (d.lathPrice ?? 0) * s.lath.sheets;
      if (Math.abs(s.cost - want) > 1e-6) failures.push(`${tag}: cost does not add up`);
    }
    const w = layoutStucco({ ...d, waste: 0.25 }, plan);
    if (!w.ok || w.lath.sheets < s.lath.sheets || w.lath.fasteners < s.lath.fasteners || w.trim.screed.pieces < s.trim.screed.pieces) failures.push(`${tag}: waste shrank an order`);
    try { if (stuccoText(s).length < 5) failures.push(`${tag}: short text`); } catch (x) { failures.push(`${tag}: text threw ${x.message}`); }
  }
  assert.deepEqual(failures, []);
  assert.ok(laid >= 150, `only ${laid} laid out (${refused} refused)`);
  assert.ok(priced >= 30 && withOpenings >= 50, `coverage priced ${priced} openings ${withOpenings}`);
});

test("hostile settings are refused with a reason, not thrown", () => {
  const plan = { studLength: 96, defaultHeaderHeight: 80, walls: [{ id: "A", length: 240 }] };
  for (const bad of [null, undefined, 5, "x", [], true]) {
    assert.ok(validateStucco(bad).length > 0, String(bad));
    assert.equal(layoutStucco(bad, plan).ok, false, String(bad));
  }
  for (const d of [{ waste: "0.1" }, { waste: NaN }, { waste: 9 }, { barrierLayers: 1.5 }, { corners: -1 }, { trimStock: 1 }, { bagPrice: -1 }, { rebound: Infinity }, { scratch: {} }]) {
    const r = layoutStucco(d, plan);
    assert.equal(r.ok, false, JSON.stringify(d));
    assert.ok(r.errors.length > 0);
  }
});
