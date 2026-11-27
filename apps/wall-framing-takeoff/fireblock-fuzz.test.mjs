import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutFireblock } from "./fireblock.mjs";

// Seeded property test on invented walls: hostile input is refused with a
// reason (never a raw error or a hang); good input matches a hand recount.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

test("hostile takeoffs are refused with a reason", () => {
  const bad = [null, 5, "x", {}, { walls: "abc" }, { walls: [null] }, { walls: [{ id: "a", members: [null] }] },
    { walls: [{ id: "a", members: "x" }] },
    { walls: [{ id: "a", members: [{ orient: "v", x: NaN, y: 0, w: 1.5, h: 100 }] }] },
    { walls: [{ id: "a", members: [{ orient: "v", x: "0", y: 0, w: 1.5, h: 100 }] }] },
    { walls: [{ id: "a", members: [{ orient: "v", x: 0, y: 0, w: 1.5, h: 1e9 }] }] }];
  for (const r of bad) {
    const f = layoutFireblock({}, r);
    assert.equal(f.ok, false, JSON.stringify(r));
    assert.ok(f.errors.length);
  }
});

test("fuzz: rows, pieces, boards and cost agree with a hand recount", () => {
  const failures = [];
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed);
    const heightIn = 60 + Math.floor(rand() * 400);
    const nStuds = 2 + Math.floor(rand() * 8);
    let x = 0;
    const members = [], gaps = [];
    for (let i = 0; i < nStuds; i++) {
      members.push({ kind: "stud", orient: "v", x, y: 1.5, w: 1.5, h: heightIn - 3 });
      const gap = 6 + Math.floor(rand() * 40);
      if (i < nStuds - 1) gaps.push(gap);
      x += 1.5 + gap;
    }
    const intervalFt = 4 + Math.floor(rand() * 8);
    const waste = rand() < 0.5 ? 0 : 0.05;
    const price = rand() < 0.5 ? 3.5 : undefined;
    const f = layoutFireblock({ intervalFt, waste, boardPrice: price }, { walls: [{ id: "W", stud: "2x4", members }] });
    const rows = Math.max(0, Math.ceil((heightIn - 1.5) / (intervalFt * 12) - 1e-9) - 1);
    if (!f.ok) { failures.push(`seed ${seed}: refused ${f.errors[0]}`); continue; }
    if (f.rowsTotal !== rows) failures.push(`seed ${seed}: rows ${f.rowsTotal} != ${rows}`);
    if (f.pieces !== rows * gaps.length) failures.push(`seed ${seed}: pieces ${f.pieces} != ${rows * gaps.length}`);
    const feet = rows * gaps.reduce((s, g) => s + g, 0) / 12;
    const got = f.sizes[0] ? f.sizes[0].lengthFt : 0;
    if (Math.abs(got - feet) > 1e-9) failures.push(`seed ${seed}: length ${got} != ${feet}`);
    if (f.boards * 8 * 12 < feet * 12 - 1e-6) failures.push(`seed ${seed}: ${f.boards} boards cannot hold ${feet} ft`);
    if (price != null && f.cost !== f.boards * price) failures.push(`seed ${seed}: cost`);
  }
  assert.deepEqual(failures, []);
});
