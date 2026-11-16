// The repair skipped at a proven floor (README "The repair reserve at 30-60 people"): small seeded weeks (6-10 people, 22-40
// shifts, no time budget, so every build is deterministic), each built with the skip (the default) and with coverRepairAtFloor: true
// (the repair runs as before). One JSON line per week: open hours, open shifts, score, whether it skipped, and build ms.
//   node eval/repair-at-floor-small.mjs > eval/repair-at-floor-small.jsonl
const { parseStaff, parseShifts, buildRoster } = await import("../calc.mjs");
function seededWeek(seed, P, S) { // eval/repair-small.mjs's generator
  const days = ["Mon", "Tue", "Wed"];
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  const st = Array.from({ length: P }, (_, p) => [`P${p}`, 10 + rnd(12), [8, 11, 13, 16, 24][rnd(5)], 0, `Mon-Wed ${6 + rnd(3)}-${18 + rnd(6)}`].join(",")).join("\n");
  const sh = Array.from({ length: S }, () => { const L = [3, 4, 8, 10][rnd(4)]; const a = 6 + rnd(10); return `${days[rnd(3)]},${a},${Math.min(24, a + L)},1`; }).join("\n");
  return { staff: parseStaff(st).staff, slots: parseShifts(sh).slots };
}
for (let seed = 1; seed <= 60; seed++) {
  const P = 6 + (seed % 5), S = 22 + (seed * 7) % 19;
  const { staff, slots } = seededWeek(seed, P, S);
  const out = { seed, P, S };
  for (const [name, extra] of [["skip", {}], ["run", { coverRepairAtFloor: true }]]) {
    const t0 = Date.now();
    const r = buildRoster(staff, slots, { exact: true, deferCover: false, ...extra });
    out[name] = { open: r.unfilledHours, openShifts: r.unfilledSlots, score: r.score, cost: r.cost,
      skipped: !!r.optimality?.coverRepair?.skippedAtFloor, repairMs: r.timings?.coverRepair ?? 0, ms: Date.now() - t0 };
  }
  console.log(JSON.stringify(out));
}
