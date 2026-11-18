// Small seeded weeks (6-10 people, 22-40 shifts, no time budget, so every build is deterministic), built by main's engine before
// this change (ENGINE=main with MAIN_ENGINE=<path to> git show b92b1c892:ventures/shift-roster-builder/calc.mjs, kept only while measuring), by this engine and by it with repairGuide: false.
// One JSON line per week: open hours and score for each. Results: eval/repair-small.out.txt.
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const eng = process.env.ENGINE === "main" ? pathToFileURL(resolve(process.env.MAIN_ENGINE)).href : "../calc.mjs";
const { parseStaff, parseShifts, buildRoster } = await import(eng);
function seededWeek(seed, P, S) {
  const days = ["Mon", "Tue", "Wed"];
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  const st = Array.from({ length: P }, (_, p) => [`P${p}`, 10 + rnd(12), [8, 11, 13, 16, 24][rnd(5)], 0, `Mon-Wed ${6 + rnd(3)}-${18 + rnd(6)}`].join(",")).join("\n");
  const sh = Array.from({ length: S }, () => { const L = [3, 4, 8, 10][rnd(4)]; const a = 6 + rnd(10); return `${days[rnd(3)]},${a},${Math.min(24, a + L)},1`; }).join("\n");
  return { staff: parseStaff(st).staff, slots: parseShifts(sh).slots };
}
const cfgs = process.env.ENGINE === "main" ? { main: {} } : { guided: {}, unguided: { repairGuide: false } };
for (let s = 1; s <= Number(process.argv[2] || 40); s++) {
  const P = 6 + (s % 5), S = 22 + (s % 19), w = seededWeek(s, P, S), row = { seed: s, P, S };
  for (const [name, x] of Object.entries(cfgs)) {
    const t0 = Date.now(), r = buildRoster(w.staff, w.slots, { exact: true, ...x });
    row[name] = { open: r.unfilledHours, score: Math.round(r.score * 100) / 100, proven: r.optimality?.status ?? null, ms: Date.now() - t0 };
  }
  console.log(JSON.stringify(row));
}
