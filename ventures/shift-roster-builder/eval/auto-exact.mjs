// Should the exact check run by default on mid-size weeks? Runs buildRoster on the cg-scale-bench weeks (same generator and seed
// rule as eval/end-to-end.mjs) twice: with the default options (exact "auto") and with exact: true, and prints, per week, the time,
// open hours, open shifts, pay, score and the proof status of each.
//   node eval/auto-exact.mjs [P=20] [S=56] [cases=3] [first=0]
//   node eval/auto-exact.mjs templates   (the page's built-in template weeks instead)
// OPTS='{"...":...}' merges extra buildRoster options into both runs (e.g. '{"exactMs":4000}', as the page passes).
import { parseStaff, parseShifts, buildRoster, TEMPLATES } from "../calc.mjs";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const run = (staff, slots, o) => { const t0 = Date.now(); const r = buildRoster(staff, slots, { ...extra, ...o }); return { r, ms: Date.now() - t0 }; };
const line = (tag, { r, ms }) => `  ${tag.padEnd(6)} ${String(ms).padStart(6)} ms, open ${r.unfilledHours} h / ${r.unfilledSlots} shifts, pay $${r.cost.toFixed(2)}, score ${Number(r.score).toFixed(2)}, status ${r.optimality?.status ?? "none"}${r.optimality?.scoreCG ? `, cg proven ${r.optimality.scoreCG.proven}` : ""}`;
const P = Number(process.argv[2] || 20), S = Number(process.argv[3] || 56), cases = Number(process.argv[4] || 3), first = Number(process.argv[5] || 0);
let seed = Number(process.env.SEED || 20261022) + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
const extra = process.env.OPTS ? JSON.parse(process.env.OPTS) : {};
const modes = (process.env.MODES || "auto,exact").split(",");
const MODE = { auto: {}, exact: { exact: true }, off: { exact: false } };
if (process.argv[2] === "templates") {
  console.log(`built-in templates, options ${JSON.stringify(extra)}`);
  for (const [k, t] of Object.entries(TEMPLATES)) {
    const staff = parseStaff(t.staff()).staff, slots = parseShifts(t.shifts()).slots;
    console.log(`${k}: ${staff.length} people, ${slots.length} copies`);
    for (const m of modes) console.log(line(m, run(staff, slots, MODE[m])));
  }
  process.exit(0);
}
console.log(`${P} people, ${S} shift lines, options ${JSON.stringify(extra)}`);
for (let c = 0; c < cases; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  if (c < first) continue;
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  console.log(`week ${c}: ${slots.length} copies`);
  for (const m of modes) console.log(line(m, run(staff, slots, MODE[m])));
}
