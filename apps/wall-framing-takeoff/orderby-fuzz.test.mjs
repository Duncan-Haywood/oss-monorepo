import { test } from "node:test";
import assert from "node:assert/strict";
import { orderByFromLines } from "./orderby.mjs";

// Seeded property test on invented lines: hostile text is refused with a
// reason (never a raw error); good lines match an independent date recount.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

test("hostile text is refused with a reason or handled, never thrown", () => {
  const bad = [null, undefined, 5, {}, "", "   ", "# only a comment", "a", "a,1", "a,1,2", ",,,",
    "a,,0,2026-06-01", "a,1,,2026-06-01", "a,NaN,0,2026-06-01", "a,Infinity,0,2026-06-01",
    "a,1,0,2026-02-30x", "a,1,0,06/01/2026", "a,1,0,", "a,-1,0,2026-06-01", "a,99999,0,2026-06-01",
    "a,1,999,2026-06-01", "a,1,0,2026-06-01", "a,1,0,2026-06-01,s", "\u0000,1,0,2026-06-01"];
  for (const t of bad) {
    const r = orderByFromLines(t);
    assert.equal(typeof r.ok, "boolean", String(t));
    if (!r.ok) assert.ok(r.errors.length, String(t));
  }
  assert.equal(orderByFromLines("a,1,0,2026-06-01", "not-a-date").ok, false);
  assert.equal(orderByFromLines("a,-1,0,2026-06-01").ok, false);
  assert.equal(orderByFromLines("a,99999,0,2026-06-01").ok, false);
});

test("fuzz: order-by dates agree with an independent recount", () => {
  const failures = [];
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed);
    const n = 1 + Math.floor(rand() * 6);
    const lines = [], exp = [];
    const base = Date.UTC(2026, 0, 1) + Math.floor(rand() * 700) * DAY;
    for (let i = 0; i < n; i++) {
      const lead = Math.floor(rand() * 120), buf = Math.floor(rand() * 15);
      const need = base + Math.floor(rand() * 200) * DAY;
      lines.push(`Item${i}, ${lead}, ${buf}, ${iso(need)}`);
      let ob = need - (lead + buf) * DAY;
      while ([0, 6].includes(new Date(ob).getUTCDay())) ob -= DAY;
      exp.push(iso(ob));
    }
    const today = rand() < 0.5 ? iso(base + Math.floor(rand() * 200) * DAY) : undefined;
    const r = orderByFromLines(lines.join("\n"), today);
    if (!r.ok) { failures.push(`seed ${seed}: refused ${r.errors[0]}`); continue; }
    if (r.rows.length !== n) failures.push(`seed ${seed}: rows ${r.rows.length} != ${n}`);
    const got = r.rows.map((x) => x.orderBy).sort().join();
    if (got !== exp.slice().sort().join()) failures.push(`seed ${seed}: dates differ`);
    for (const x of r.rows) {
      if ([0, 6].includes(new Date(x.orderBy + "T00:00:00Z").getUTCDay())) failures.push(`seed ${seed}: weekend ${x.orderBy}`);
      if (x.orderBy > x.needDate) failures.push(`seed ${seed}: order after need`);
      if (!today && x.status !== "open") failures.push(`seed ${seed}: judged late without today`);
      if (today && (x.status === "late") !== (x.orderBy < today)) failures.push(`seed ${seed}: late flag wrong`);
    }
    const sorted = r.rows.map((x) => x.orderBy);
    if (sorted.join() !== sorted.slice().sort().join()) failures.push(`seed ${seed}: unsorted`);
  }
  assert.deepEqual(failures.slice(0, 5), []);
});
