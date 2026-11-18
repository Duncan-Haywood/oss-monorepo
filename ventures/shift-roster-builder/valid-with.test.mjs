// validWith (calc.mjs) answers "is this person's list still valid with shift i added (and shift `skip` given up)?" without
// building the list, for the search's inner loops (docs/history/ci-perf-2026-11-12-shift-roster-valid-with.md). It must give
// exactly what validList gives on the list insertSorted would build, for ordered and unordered lists, with and without a skip,
// and for days outside 0-30 (which take the original Set-and-sort check).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStaff, parseShifts, _validListPair as m } from "./calc.mjs";

test("validWith agrees with validList(insertSorted(...)) on 120,000 random moves", () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  let n = 0, yes = 0, skips = 0, unordered = 0, farDays = 0;
  for (let c = 0; c < 300; c++) {
    const st = Array.from({ length: 5 }, (_, p) => `P${p},15,${12 + rnd(30)},0${rnd(2) ? " ,daily: " + (4 + rnd(8)) : ""}`).join("\n");
    // Minutes of :00, :01, :30 and :59 put some gaps one minute either side of the rest limit.
    const mm = () => [":00", ":01", ":30", ":59"][rnd(4)];
    const sh = Array.from({ length: 20 }, () => { const a = rnd(18); return `${days[rnd(7)]},${a}${mm()},${a + 2 + rnd(8)}${mm()},1`; }).join("\n");
    const staff = parseStaff(st).staff, parsed = parseShifts(sh);
    if (parsed.error || !staff.length) continue;
    const ctx = m.buildContext(staff, parsed.slots, { maxDailyHours: rnd(3) ? 0 : 6 + rnd(4), maxConsecDays: 2 + rnd(5), minRestHours: rnd(12) });
    // One case in ten moves every day past 30, so both checks take the slow path.
    if (c % 10 === 9) { ctx.slots = ctx.slots.map((s) => ({ ...s, day: s.day + 28, start: s.start + 28 * 1440, end: s.end + 28 * 1440 })); farDays++; }
    const S = ctx.slots.length;
    for (let k = 0; k < 400; k++) {
      const p = rnd(staff.length);
      const list = [...new Set(Array.from({ length: rnd(7) }, () => rnd(S)))];
      if (rnd(4)) list.sort((a, b) => ctx.slots[a].start - ctx.slots[b].start || a - b); else unordered++;
      const i = rnd(S);
      const skip = list.length && rnd(2) ? list[rnd(list.length)] : -1;
      const base = skip >= 0 ? list.filter((x) => x !== skip) : list;
      const want = m.validList(ctx, p, m.insertSorted(ctx, base, i));
      assert.equal(m.validWith(ctx, p, list, i, skip), want, `case ${c}, list ${list}, add ${i}, skip ${skip}`);
      n++; if (want) yes++; if (skip >= 0) skips++;
    }
  }
  assert.ok(n > 100000 && yes > n / 10 && yes < n * 0.9, `n ${n}, valid ${yes}`);
  assert.ok(skips > n / 4 && unordered > n / 8 && farDays >= 20, `skips ${skips}, unordered ${unordered}, far ${farDays}`);
});
