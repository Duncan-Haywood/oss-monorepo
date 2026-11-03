import { test } from "node:test";
import assert from "node:assert/strict";
import { gangOpenings } from "./ganged.mjs";

// Property test: random walls with random openings. Ganging never mutates the
// input, only merges same-kind/size/head openings, keeps the covered span,
// removes exactly one opening per note, and is idempotent.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

test("fuzz: gangOpenings merges only compatible close openings and preserves coverage", () => {
  const failures = [];
  let merges = 0, kept = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed);
    const walls = [];
    for (let w = 0; w < 1 + Math.floor(rand() * 3); w++) {
      const n = Math.floor(rand() * 7);
      let off = rand() * 10;
      const openings = [];
      for (let i = 0; i < n; i++) {
        const width = 12 + Math.floor(rand() * 48);
        const o = { kind: rand() < 0.7 ? "window" : "door", offset: off, width, height: rand() < 0.8 ? 48 : 36, headerHeight: 80 };
        if (rand() < 0.2) o.header = rand() < 0.5 ? "2x8" : "2x10";
        if (rand() < 0.2) o.jacks = 2;
        openings.push(o);
        off += width + rand() * 8; // gaps of 0..8 in: some close, some not
      }
      // shuffle input order; the engine sorts by offset
      openings.sort(() => rand() - 0.5);
      walls.push({ id: `w${w}`, length: off + 40, openings });
    }
    const plan = { walls };
    const before = JSON.stringify(plan);
    let res;
    try { res = gangOpenings(plan); } catch (e) { failures.push(`${seed}: threw ${e.message}`); continue; }
    if (JSON.stringify(plan) !== before) failures.push(`${seed}: input mutated`);
    const { plan: out, notes } = res;
    let removed = 0;
    walls.forEach((w, wi) => {
      const o = out.walls[wi].openings;
      removed += w.openings.length - o.length;
      for (let i = 1; i < o.length; i++) if (o[i].offset < o[i - 1].offset) failures.push(`${seed}: unsorted`);
      const lo = (a) => Math.min(...a.map((x) => x.offset));
      const hi = (a) => Math.max(...a.map((x) => x.offset + x.width));
      if (w.openings.length) {
        if (lo(o) !== lo(w.openings) || hi(o) !== hi(w.openings)) failures.push(`${seed}: span changed`);
        if (o.some((x) => x.width <= 0)) failures.push(`${seed}: bad width`);
      }
      for (const x of o) {
        if (x.ganged) merges++; else kept++;
        const same = w.openings.filter((s) => s.offset >= x.offset && s.offset + s.width <= x.offset + x.width);
        if (!same.length || same.some((s) => s.kind !== x.kind || s.height !== x.height || (s.header ?? "") !== (x.header ?? ""))) failures.push(`${seed}: mixed merge`);
        if (x.ganged && same.length !== x.ganged) failures.push(`${seed}: ganged count ${x.ganged} vs ${same.length}`);
      }
    });
    if (removed !== notes.length) failures.push(`${seed}: removed ${removed} but ${notes.length} notes`);
    if (gangOpenings(out).notes.length !== 0) failures.push(`${seed}: not idempotent`);
  }
  assert.deepEqual(failures.slice(0, 5), []);
  assert.ok(merges > 50 && kept > 50, `coverage: ${merges} merged, ${kept} kept`);
});
