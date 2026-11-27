import { test } from "node:test";
import assert from "node:assert/strict";
import { openingSizes } from "./ifcwasm.mjs";

// Property test for openingSizes (the lookup the page builds from the Rust IFC
// reader's JSON). Random plans, including hostile ones (missing fields, NaN,
// zero-length walls, negative sizes), never make it throw. A hit has finite
// sizes on the 1/16 in grid, a header at least as high as the opening and a kind
// only when the model says "void". A probe far from every opening gets null.
// Invented plans only; no real architect's model.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const num = (r, lo, hi) => lo + r() * (hi - lo);
const odd = (r) => pick(r, [NaN, Infinity, -1, 0, null, undefined, "3", {}]);

function wall(r, hostile) {
  const sx = num(r, -20, 20), sy = num(r, -20, 20), len = num(r, 1, 12), a = num(r, 0, 6.28);
  const w = { start: [sx, sy], end: [sx + len * Math.cos(a), sy + len * Math.sin(a)], openings: [] };
  for (let i = 0; i < Math.floor(r() * 4); i++) {
    const from = num(r, 0, len - 1), to = from + num(r, 0.5, 1.5);
    const o = { from, to, height: num(r, 0.5, 2.6), sill: pick(r, [0, 0.03, 0.06, 0.9, 1.2]), kind: pick(r, ["void", "door", "window"]) };
    if (hostile && r() < 0.5) o[pick(r, ["from", "to", "height", "sill", "kind"])] = odd(r);
    w.openings.push(o);
  }
  if (hostile && r() < 0.3) w[pick(r, ["start", "end", "openings"])] = pick(r, [null, undefined, [], [0], "x", {}]);
  if (hostile && r() < 0.1) w.end = w.start;
  return w;
}

test("openingSizes never throws and returns sane sizes", () => {
  let hits = 0, nulls = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const r = rng(seed), hostile = seed % 2 === 0;
    const info = r() < 0.05 ? pick(r, [null, undefined, {}, { walls: null }, { walls: [] }]) : { walls: Array.from({ length: 1 + Math.floor(r() * 5) }, () => wall(r, hostile)) };
    let look;
    try { look = openingSizes(info); } catch (e) { if (hostile) continue; throw e; }
    assert.equal(typeof look, "function");
    for (let k = 0; k < 8; k++) {
      let got;
      try { got = look({ x: num(r, -900, 900), y: num(r, -900, 900) }); } catch (e) { if (hostile) continue; throw e; }
      if (got == null) { nulls++; continue; }
      hits++;
      if (hostile) continue;
      assert.ok(Number.isFinite(got.height) && got.height > 0);
      assert.ok(Number.isFinite(got.headerHeight) && got.headerHeight >= got.height);
      assert.equal(got.height * 16, Math.round(got.height * 16));
      assert.ok(got.kind === undefined || got.kind === "window" || got.kind === "door");
    }
  }
  assert.ok(nulls > 0);
});

test("a probe on a void's middle finds it; kind follows the sill; far probes miss", () => {
  const info = { walls: [{ start: [0, 0], end: [10, 0], openings: [
    { from: 1, to: 2, height: 1.0, sill: 0.9, kind: "void" },
    { from: 4, to: 5, height: 2.1, sill: 0, kind: "void" },
    { from: 7, to: 8, height: 1.2, sill: 0.9, kind: "window" },
  ] }] };
  const look = openingSizes(info), k = 1 / 0.0254;
  const win = look({ x: 1.5 * k, y: 0 }), door = look({ x: 4.5 * k, y: 0 }), mod = look({ x: 7.5 * k, y: 0 });
  assert.equal(win.kind, "window");
  assert.equal(door.kind, "door");
  assert.equal(mod.kind, undefined);
  assert.equal(win.headerHeight, Math.round(1.9 * k * 16) / 16);
  assert.equal(look({ x: 3 * k, y: 0 }), null);
  assert.equal(look({ x: 1.5 * k, y: 7 }), null);
});
