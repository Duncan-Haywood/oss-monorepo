import { test } from "node:test";
import assert from "node:assert/strict";
import { gangOpenings } from "./ganged.mjs";
import { THICK } from "./engine.mjs";

// Property test: random walls of random openings. Ganging never mutates its
// input, keeps the span the openings covered, only merges same-kind, same-size,
// same-head openings that are too close for their own jacks and kings, is
// idempotent, and writes one note per merge.
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

function randomWall(rand, id) {
  const n = Math.floor(rand() * 7);
  const openings = [];
  let x = rand() * 20;
  for (let i = 0; i < n; i++) {
    const width = pick(rand, [24, 30, 36, 48]);
    const o = { kind: pick(rand, ["window", "window", "door"]), offset: x, width, height: pick(rand, [48, 48, 80]), headerHeight: pick(rand, [82, 82, 84]) };
    if (rand() < 0.2) o.jacks = pick(rand, [1, 2]);
    if (rand() < 0.2) o.kings = pick(rand, [1, 2]);
    if (rand() < 0.2) o.header = pick(rand, ["2x8", "2x10"]);
    if (rand() < 0.3) o.label = `o${i}`;
    openings.push(o);
    x += width + pick(rand, [0, 1, 3, 4.5, 6, 9, 12, 30]);
  }
  // shuffle so the sort inside gangOpenings is exercised
  for (let i = openings.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [openings[i], openings[j]] = [openings[j], openings[i]]; }
  return { id, length: Math.max(x + 20, 60), height: 96, openings };
}

test("fuzz: ganging keeps the covered span, merges only what must merge, and is idempotent", () => {
  const failures = [];
  let merges = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const rand = rng(seed);
    const plan = { walls: [randomWall(rand, "A"), randomWall(rand, "B")] };
    const before = JSON.stringify(plan);
    const { plan: out, notes } = gangOpenings(plan);
    if (JSON.stringify(plan) !== before) failures.push(`seed ${seed}: input mutated`);
    let removed = 0;
    plan.walls.forEach((w, wi) => {
      const o = out.walls[wi].openings;
      const src = w.openings;
      removed += src.length - o.length;
      const span = (xs) => xs.length ? [Math.min(...xs.map((q) => q.offset)), Math.max(...xs.map((q) => q.offset + q.width))] : null;
      const a = span(src), b = span(o);
      if (JSON.stringify(a) !== JSON.stringify(b)) failures.push(`seed ${seed} ${w.id}: span ${a} became ${b}`);
      const gangedCount = o.reduce((s, q) => s + (q.ganged || 1), 0);
      if (gangedCount !== src.length) failures.push(`seed ${seed} ${w.id}: ${src.length} openings became ${gangedCount} units`);
      for (let i = 1; i < o.length; i++) {
        if (o[i].offset < o[i - 1].offset + o[i - 1].width - 1e-9) failures.push(`seed ${seed} ${w.id}: openings overlap after ganging`);
        const p = o[i - 1], q = o[i];
        const gap = q.offset - (p.offset + p.width);
        const need = THICK * ((p.jacks ?? 1) + (q.jacks ?? 1) + Math.max(p.kings ?? 1, q.kings ?? 1));
        const same = p.kind === q.kind && p.height === q.height && p.headerHeight === q.headerHeight && (p.header ?? "") === (q.header ?? "");
        if (same && gap < need - 1e-9) failures.push(`seed ${seed} ${w.id}: neighbours still too close (${gap} < ${need})`);
      }
    });
    merges += removed;
    if (notes.length !== removed) failures.push(`seed ${seed}: ${removed} merges but ${notes.length} notes`);
    const again = gangOpenings(out);
    if (JSON.stringify(again.plan) !== JSON.stringify(out) || again.notes.length) failures.push(`seed ${seed}: not idempotent`);
  }
  assert.ok(merges > 50, `only ${merges} merges exercised`);
  assert.deepEqual(failures.slice(0, 5), []);
});
