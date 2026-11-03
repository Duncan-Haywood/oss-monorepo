import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutOpeningSchedule, openingScheduleText, openingScheduleCsv } from "./openingschedule.mjs";

// Property test on invented plans: the schedule accounts for every opening
// exactly once, marks are unique, unit sizes are never negative, the CSV has one
// line per mark and no formula-leading cell, and shuffling input changes no totals.
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

test("fuzz: opening schedule accounts for every opening once, with unique marks", () => {
  const failures = [];
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed);
    const walls = [];
    let total = 0, doors = 0;
    for (let i = 0, n = 1 + Math.floor(rand() * 6); i < n; i++) {
      const openings = [];
      for (let j = 0, m = Math.floor(rand() * 7); j < m; j++) {
        const kind = rand() < 0.35 ? "door" : "window";
        const o = { kind, width: pick(rand, [24, 30, 36, 36, 48, 72, 36.5]), height: pick(rand, [48, 60, 80, 82]), offset: j * 100 };
        if (rand() < 0.3) o.header = pick(rand, ["2x8", "2x10", "2x12"]);
        if (rand() < 0.3) o.headerPlies = pick(rand, [2, 3]);
        if (rand() < 0.3) o.headerHeight = pick(rand, [80, 82, 84]);
        if (rand() < 0.3) o.label = pick(rand, ["Front", "=SUM(A1)", '"quoted", name', "+cmd", "line\nbreak"]);
        openings.push(o); total++; if (kind === "door") doors++;
      }
      walls.push({ id: `w${i}`, stud: pick(rand, ["2x4", "2x6"]), openings });
    }
    const plan = { defaultHeaderHeight: rand() < 0.5 ? 82 : undefined, walls };
    const d = {};
    if (rand() < 0.5) d.unitAllowance = pick(rand, [0, 0.5, 1, 3, 2.25]);
    if (rand() < 0.3) d.doorPrefix = pick(rand, ["D", "DR", "d"]);
    let s;
    try { s = layoutOpeningSchedule(d, plan); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!s.ok) { failures.push(`seed ${seed}: refused valid input ${s.errors}`); continue; }
    if (s.doors + s.windows !== total || s.doors !== doors) failures.push(`seed ${seed}: counts ${s.doors}+${s.windows} vs ${doors}/${total}`);
    const marks = s.rows.map((r) => r.mark);
    if (new Set(marks).size !== marks.length) failures.push(`seed ${seed}: duplicate marks`);
    const located = s.rows.reduce((a, r) => a + r.locations.length, 0);
    if (located !== total) failures.push(`seed ${seed}: ${located} locations for ${total} openings`);
    for (const r of s.rows) {
      if (r.count !== r.locations.length) failures.push(`seed ${seed}: ${r.mark} count mismatch`);
      if (!(r.unitWidth >= 0) || !(r.unitHeight >= 0)) failures.push(`seed ${seed}: negative unit size`);
      if (r.kind === "window" && r.headerHeight != null && Math.abs(r.sillHeight - (r.headerHeight - r.height)) > 1e-9) failures.push(`seed ${seed}: sill`);
    }
    const csv = openingScheduleCsv(s);
    // header row + one record per mark; embedded newlines sit inside quotes
    if (!csv.startsWith("mark,kind")) failures.push(`seed ${seed}: csv header`);
    if (/(^|,)[=+@][^,]*/m.test(csv.split("\n").slice(1).join("\n").replace(/"[^"]*"/g, "")) ) failures.push(`seed ${seed}: formula-leading cell`);
    if (openingScheduleText(s).length < 1) failures.push(`seed ${seed}: empty text`);
    const rev = layoutOpeningSchedule(d, { ...plan, walls: [...walls].reverse() });
    if (rev.doors !== s.doors || rev.windows !== s.windows || rev.rows.length !== s.rows.length) failures.push(`seed ${seed}: order changed totals`);
  }
  assert.deepEqual(failures.slice(0, 10), []);
});

test("fuzz: hostile settings and plans are refused or handled, never thrown", () => {
  const bad = [null, [], 5, "x", { unitAllowance: -1 }, { unitAllowance: "1" }, { unitAllowance: NaN }, { doorPrefix: "" }, { windowPrefix: "toolong" }, { doorPrefix: 4 }];
  for (const d of bad) { const s = layoutOpeningSchedule(d, { walls: [] }); assert.equal(s.ok, false, JSON.stringify(d)); assert.ok(s.errors.length); }
  const plans = [{ walls: [{ id: "a" }] }, { walls: [{ id: "a", openings: [] }] }];
  for (const p of plans) { const s = layoutOpeningSchedule({}, p); assert.equal(s.ok, true); assert.equal(s.rows.length, 0); }
});

test("fuzz: malformed plans are refused with a reason, never thrown, never scheduled", () => {
  const w = (op) => ({ walls: [{ id: "a", openings: [op] }] });
  const bad = [{}, { walls: "x" }, { walls: [null] }, { walls: [{ id: "a", openings: "x" }] }, w(null), w({ kind: "door", height: 80 }),
    w({ width: "36", height: 80 }), w({ width: -5, height: 80 }), w({ width: NaN, height: 80 }), w({ width: 36, height: 0 }), w({ width: Infinity, height: 80 })];
  for (const p of bad) { const s = layoutOpeningSchedule({}, p); assert.equal(s.ok, false, JSON.stringify(p)); assert.ok(s.errors.length); }
  assert.equal(layoutOpeningSchedule({}, null).ok, false);
});
