import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptySketch, addWall, addOpening, moveCorner, moveWall, moveOpening, resizeOpening,
  removeWall, removeOpening, planFromSketch, restoreSketch,
} from "./sketch.mjs";
import { takeoff } from "./engine.mjs";

// Property test for the plan editor's model: random edit sequences (draw,
// open, drag, resize, delete) and random stored JSON. After every edit the
// invariants hold (finite coordinates, walls over 1 in, openings inside their
// wall and not overlapping, unique ids), and a refused edit changes nothing.
// A restored sketch obeys the same invariants. Invented drawings only.
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
const num = (rand, lo, hi) => Math.round(lo + rand() * (hi - lo));
const pt = (rand) => ({ x: num(rand, -50, 400), y: num(rand, -50, 400) });

function check(sk, tag, out) {
  const ids = new Set();
  const L = (w) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  for (const w of sk.walls) {
    if (ids.has(w.id)) out.push(`${tag}: duplicate id ${w.id}`);
    ids.add(w.id);
    if (![w.a.x, w.a.y, w.b.x, w.b.y].every(Number.isFinite)) out.push(`${tag}: non-finite wall`);
    if (L(w) < 1 - 1e-9) out.push(`${tag}: wall ${w.id} is ${L(w)} in`);
  }
  for (const o of sk.openings) {
    if (ids.has(o.id)) out.push(`${tag}: duplicate id ${o.id}`);
    ids.add(o.id);
    const w = sk.walls.find((x) => x.id === o.wall);
    if (!w) { out.push(`${tag}: opening ${o.id} on a missing wall`); continue; }
    if (!(o.width > 0) || o.offset < -1e-9 || o.offset + o.width > L(w) + 0.01) out.push(`${tag}: opening ${o.id} outside wall (${o.offset}+${o.width} on ${L(w)})`);
    for (const p of sk.openings) {
      if (p !== o && p.wall === o.wall && o.offset < p.offset + p.width - 1e-9 && p.offset < o.offset + o.width - 1e-9) out.push(`${tag}: openings ${o.id},${p.id} overlap`);
    }
  }
  if (sk.nextId <= Math.max(0, ...ids)) out.push(`${tag}: nextId ${sk.nextId} not above every id`);
}

test("fuzz: random edit sequences keep the sketch valid and refused edits change nothing", () => {
  const failures = [];
  let refused = 0, applied = 0, planned = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const rand = rng(seed);
    const sk = emptySketch();
    for (let step = 0; step < 40; step++) {
      const before = JSON.stringify(sk);
      const w = sk.walls.length ? pick(rand, sk.walls) : null;
      const o = sk.openings.length ? pick(rand, sk.openings) : null;
      const op = pick(rand, ["wall", "wall", "wall", "open", "open", "corner", "move", "slide", "resize", "rmwall", "rmopen"]);
      let r;
      try {
        if (op === "wall") r = addWall(sk, pt(rand), pt(rand)) ? { ok: true } : { ok: false };
        else if (op === "open" && w) r = addOpening(sk, w.id, pick(rand, ["door", "window"]), num(rand, -20, 300), num(rand, -5, 120));
        else if (op === "corner" && w) r = moveCorner(sk, w.id, pick(rand, ["a", "b"]), pt(rand));
        else if (op === "move" && w) r = moveWall(sk, w.id, num(rand, -60, 60), num(rand, -60, 60));
        else if (op === "slide" && o) r = moveOpening(sk, o.id, num(rand, -50, 400));
        else if (op === "resize" && o) r = resizeOpening(sk, o.id, pick(rand, ["a", "b"]), num(rand, -20, 300));
        else if (op === "rmwall" && w && rand() < 0.3) { removeWall(sk, w.id); r = { ok: true }; }
        else if (op === "rmopen" && o) { removeOpening(sk, o.id); r = { ok: true }; }
        else continue;
      } catch (e) { failures.push(`seed ${seed} step ${step} ${op}: threw ${e.message}`); break; }
      if (r.ok) applied++;
      else { refused++; if (JSON.stringify(sk) !== before) failures.push(`seed ${seed} step ${step} ${op}: refused but changed the sketch`); }
      check(sk, `seed ${seed} step ${step} ${op}`, failures);
      if (failures.length > 20) break;
    }
    if (sk.walls.length) {
      try {
        const p = planFromSketch(sk);
        if (p.ok) { takeoff(p.plan); planned++; }
        else if (!p.errors?.length) failures.push(`seed ${seed}: plan refused with no reason`);
      } catch (e) { failures.push(`seed ${seed}: plan/takeoff threw ${e.message}`); }
    }
    if (failures.length > 20) break;
  }
  assert.deepEqual(failures.slice(0, 10), []);
  assert.ok(applied > 500 && refused > 100 && planned > 50, `applied ${applied}, refused ${refused}, planned ${planned}`);
});

test("fuzz: restoreSketch of hostile stored JSON never throws and returns a valid sketch", () => {
  const failures = [];
  let kept = 0, nulls = 0;
  const junk = (rand) => pick(rand, [null, undefined, NaN, Infinity, -1, 0, 1.5, "x", "1", {}, [], true, 1e9, { x: "1", y: 2 }]);
  for (let seed = 1; seed <= 400; seed++) {
    const rand = rng(seed * 7919);
    const walls = Array.from({ length: num(rand, 0, 8) }, (_, i) => rand() < 0.2 ? junk(rand) : {
      id: rand() < 0.15 ? junk(rand) : rand() < 0.1 ? 1 : i + 1,
      a: rand() < 0.1 ? junk(rand) : pt(rand), b: rand() < 0.1 ? junk(rand) : pt(rand),
    });
    const openings = Array.from({ length: num(rand, 0, 8) }, (_, i) => rand() < 0.2 ? junk(rand) : {
      id: rand() < 0.15 ? junk(rand) : 100 + i, wall: rand() < 0.2 ? junk(rand) : num(rand, 1, 8),
      kind: rand() < 0.15 ? junk(rand) : pick(rand, ["door", "window"]),
      offset: rand() < 0.15 ? junk(rand) : num(rand, -10, 300), width: rand() < 0.15 ? junk(rand) : num(rand, 0, 100),
    });
    const raw = rand() < 0.1 ? junk(rand) : { walls: rand() < 0.05 ? junk(rand) : walls, openings: rand() < 0.1 ? junk(rand) : openings };
    let r;
    try { r = restoreSketch(JSON.parse(JSON.stringify(raw) ?? "null")); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!r) { nulls++; continue; }
    kept++;
    check(r.sketch, `seed ${seed}`, failures);
    if (!(r.dropped >= 0)) failures.push(`seed ${seed}: bad dropped ${r.dropped}`);
  }
  assert.deepEqual(failures.slice(0, 10), []);
  assert.ok(kept > 100 && nulls > 10, `kept ${kept}, nulls ${nulls}`);
});
