import test from "node:test";
import assert from "node:assert/strict";
import { OneEuro, ShoulderTracker } from "./pose.mjs";

// Deterministic noise: a small LCG mapped to a sum of uniforms (roughly normal, sd 1).
function rng(seed = 7) { let s = seed >>> 0; return () => { s = (1664525 * s + 1013904223) >>> 0; return s / 2 ** 32; }; }
const gauss = r => (r() + r() + r() + r() + r() + r() - 3) * Math.SQRT2;
const sd = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
const ok = (lx, ly, rx, ry) => ({ ok: true, left: { x: lx, y: ly }, right: { x: rx, y: ry }, notes: [] });

test("One Euro: a still point with 4 px of detector jitter at 15 fps comes out at at most 0.4 of the jitter", () => {
  const r = rng(), f = new OneEuro(), raw = [], out = [];
  for (let i = 0; i < 300; i++) { const v = 200 + 4 * gauss(r); raw.push(v); out.push(f.filter(v, i * 1000 / 15)); }
  const a = sd(raw.slice(30)), b = sd(out.slice(30));
  assert.ok(a > 3 && a < 5, `raw sd ${a}`);
  assert.ok(b < 0.4 * a, `filtered sd ${b} vs raw ${a}`);
});

test("One Euro: a shopper stepping sideways at 300 px/s is followed with under 20 px of lag once moving", () => {
  const f = new OneEuro(); let lag = 0;
  for (let i = 0; i < 60; i++) { const t = i * 1000 / 15, v = 100 + 300 * t / 1000; lag = v - f.filter(v, t); }
  assert.ok(lag > 0 && lag < 20, `lag ${lag}`);
});

test("One Euro: first sample passes through, a clock that does not advance changes nothing, bad settings throw", () => {
  const f = new OneEuro();
  assert.equal(f.filter(50, 1000), 50);
  assert.equal(f.filter(90, 1000), 50);
  assert.equal(f.filter(NaN, 1100), 50);
  assert.throws(() => new OneEuro({ minCutoff: 0 }), RangeError);
  assert.throws(() => new OneEuro({ beta: -1 }), RangeError);
});

test("tracker: points held for holdMs after the shoulders are lost, then dropped", () => {
  const t = new ShoulderTracker({ holdMs: 500 });
  assert.equal(t.update(ok(100, 200, 220, 200), 0).state, "tracking");
  const h = t.update({ ok: false, error: "hidden" }, 300);
  assert.equal(h.state, "holding");
  assert.deepEqual(h.left, { x: 100, y: 200 });
  const l = t.update({ ok: false, error: "hidden" }, 700);
  assert.equal(l.state, "lost");
  assert.equal(l.error, "hidden");
  // after a loss the next detection starts fresh, not smoothed from the old place
  const n = t.update(ok(300, 200, 420, 200), 800);
  assert.deepEqual(n.left, { x: 300, y: 200 });
});

test("tracker: a jump wider than jumpPx (another person, a model swap) restarts the filter instead of gliding", () => {
  const t = new ShoulderTracker({ jumpPx: 100 });
  for (let i = 0; i < 10; i++) t.update(ok(100, 200, 220, 200), i * 66);
  const j = t.update(ok(400, 200, 520, 200), 10 * 66);
  assert.deepEqual(j.left, { x: 400, y: 200 });
  // a small move is smoothed, so it lands between the old and new places
  const s = t.update(ok(410, 200, 530, 200), 11 * 66);
  assert.ok(s.left.x > 400 && s.left.x < 410, `smoothed ${s.left.x}`);
});

test("tracker: smoothing keeps the shoulder span steadier than the raw detections (the outline's scale)", () => {
  const r = rng(11), t = new ShoulderTracker(), raw = [], out = [];
  for (let i = 0; i < 200; i++) {
    const f = ok(150 + 3 * gauss(r), 240 + 3 * gauss(r), 270 + 3 * gauss(r), 240 + 3 * gauss(r));
    raw.push(f.right.x - f.left.x);
    const u = t.update(f, i * 1000 / 15); out.push(u.right.x - u.left.x);
  }
  const a = sd(raw.slice(20)), b = sd(out.slice(20));
  assert.ok(b < a / 2.5, `span sd ${b} vs raw ${a}`);
});
