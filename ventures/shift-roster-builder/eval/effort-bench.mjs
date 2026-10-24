// Does the annealer leave coverable hours open? Seeded random weeks, same generator as scale-bench.mjs, solved with and without the
// long pass (`longPass: false`), and against a long reference run (60 restarts x 40000 iterations) as a stand-in for the best known.
//   node eval/effort-bench.mjs [cases=12]
import { parseStaff, parseShifts, buildRoster } from "../calc.mjs";

const cases = Number(process.argv[2] || 12);
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const open = (r) => r.unfilled.reduce((a, u) => a + (u.slot.end - u.slot.start) / 60, 0);
for (const [P, S] of [[6, 14], [8, 18], [8, 22], [10, 28], [12, 30]]) {
  let seed = 20261024 + P * 100 + S;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  const t = { old: 0, neu: 0, ref: 0 }, ms = { old: 0, neu: 0 };
  let better = 0, worse = 0, missRef = { old: 0, neu: 0 };
  for (let c = 0; c < cases; c++) {
    const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
    const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
    const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
    const run = (extra) => { const t0 = Date.now(); const r = buildRoster(staff, slots, { balance: 60, flowBalance: true, ...extra }); return [open(r), Date.now() - t0]; };
    const [o0, m0] = run({ longPass: false }), [o1, m1] = run({}), [oR] = run({ restarts: 60, iterations: 40000 });
    t.old += o0; t.neu += o1; t.ref += oR; ms.old += m0; ms.neu += m1;
    if (o1 < o0) better++; if (o1 > o0) worse++;
    if (o0 > Math.min(oR, o1)) missRef.old++; if (o1 > oR) missRef.neu++;
  }
  console.log(`${P} people, ${S} shifts: open hours old ${t.old} new ${t.neu} reference ${t.ref}; new better on ${better}, worse on ${worse} of ${cases}; ${(ms.old / cases).toFixed(0)} ms -> ${(ms.neu / cases).toFixed(0)} ms per week; new above reference on ${missRef.neu}`);
}
