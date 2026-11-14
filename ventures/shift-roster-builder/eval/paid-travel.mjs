// Paid travel between sites (2026-11-14): what does a roster cost once its trips between shops are paid, if the builder did
// not price them, and what does pricing them save?
//
// Same made-up split-shift restaurant pair as eval/travel-between-sites.mjs (rest 0, daily cap 10 h, everyone at both shops,
// 1-3 random days off, 24-40 h caps, $15-22 wages), trip 45 min, and the travel rule on in every build. For each seed:
//   unpriced - built with --travel 45 only (as before today), then re-priced with the trip paid: every shift pinned to the
//              person it went to (or to nobody), rebuilt with travelPay on, so the same roster is costed by the same code;
//   priced   - built with --travel 45 --pay-travel, so the search weighs the trip.
// Reported: open hours, trips, paid travel hours and true payroll (trip paid, overtime included) of each. The script stops if
// the re-priced roster differs from the unpriced one, or if pricing ever leaves more hours open.
//
// Run: node eval/paid-travel.mjs [seeds] [people] > eval/paid-travel.out.txt
import { parseStaff, parseShifts, buildRoster } from "../calc.mjs";

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SHIFTS = [
  "Mon-Sun, 11am, 3pm, 2, Lunch, site: Main", "Mon-Sun, 3pm, 5pm, 1, Afternoon, site: Main", "Mon-Sun, 5pm, 10pm, 2, Dinner, site: Main",
  "Mon-Sun, 11:30am, 2:30pm, 1, Lunch, site: Harbour", "Mon-Sun, 5:30pm, 9:30pm, 1, Dinner, site: Harbour", "Fri-Sun, 5:30pm, 9:30pm, 1, Dinner, site: Harbour",
].join("\n");
const SEEDS = Number(process.argv[2] || 12);
const N = Number(process.argv[3] || 8);
const NOBODY = "(nobody)";

function staffText(seed) {
  const r = rng(seed);
  const rows = [];
  for (let k = 0; k < N; k++) {
    const off = new Set();
    const nOff = 1 + Math.floor(r() * 3);
    while (off.size < nOff) off.add(Math.floor(r() * 7));
    const avail = DAYS.filter((_, d) => !off.has(d)).map((d) => `${d} 9-23`).join("; ");
    rows.push(`P${k + 1}, ${15 + Math.round(r() * 7)}, ${[24, 32, 40][Math.floor(r() * 3)]}, 0, ${avail}, sites: Main | Harbour`);
  }
  return "name,wage,max,min,availability\n" + rows.join("\n");
}

const BASE = { exact: "auto", seed: 1, minRestHours: 0, maxDailyHours: 10, travel: 45 };
const tot = { u: { open: 0, trips: 0, th: 0, cost: 0, ms: 0 }, p: { open: 0, trips: 0, th: 0, cost: 0, ms: 0 }, cheaper: 0, same: 0 };
const lines = [];
for (let seed = 1; seed <= SEEDS; seed++) {
  const st = parseStaff(staffText(seed)), sh = parseShifts(SHIFTS);
  if (st.errors.length || sh.errors.length) throw new Error([...st.errors, ...sh.errors].join("; "));
  let t0 = Date.now();
  const u = buildRoster(st.staff, sh.slots, BASE);
  tot.u.ms += Date.now() - t0;
  // Re-price the unpriced roster: pin every shift to its person (an open one to a name nobody has, so it stays open).
  const pinned = u.assignments.map((a) => ({ ...a.slot, fixed: a.person || NOBODY }));
  const up = buildRoster(st.staff, pinned, { ...BASE, travelPay: true, exact: false });
  up.assignments.forEach((a, i) => { if ((a.person || NOBODY) !== (u.assignments[i].person || NOBODY)) throw new Error(`seed ${seed}: re-pricing moved shift ${i}`); });
  t0 = Date.now();
  const p = buildRoster(st.staff, sh.slots, { ...BASE, travelPay: true });
  tot.p.ms += Date.now() - t0;
  if (p.unfilledHours > u.unfilledHours + 1e-9) throw new Error(`seed ${seed}: pricing the trip left more hours open`);
  for (const [k, r] of [["u", up], ["p", p]]) { tot[k].open += r.unfilledHours; tot[k].trips += r.travelPaid.trips; tot[k].th += r.travelPaid.hours; tot[k].cost += r.cost; }
  if (p.cost < up.cost - 0.005) tot.cheaper++; else if (Math.abs(p.cost - up.cost) <= 0.005) tot.same++;
  lines.push(`seed ${String(seed).padStart(2)} | unpriced: ${String(u.unfilledHours).padStart(2)} h open, ${String(up.travelPaid.trips).padStart(2)} trips, true payroll $${up.cost.toFixed(2)} (built as $${u.cost.toFixed(2)}) | priced: ${String(p.unfilledHours).padStart(2)} h open, ${String(p.travelPaid.trips).padStart(2)} trips, $${p.cost.toFixed(2)} | saves $${(up.cost - p.cost).toFixed(2)}`);
}
console.log(`Paid travel between two shops, ${SEEDS} made-up weeks, ${N} people at both shops, trip 45 min, rest 0, daily cap 10 h.`);
console.log(`Main lunch 11-3 (2), afternoon 3-5 (1), dinner 5-10 (2); Harbour lunch 11:30-2:30 (1), dinner 5:30-9:30 (1, 2 Fri-Sun). Same engine, exact check "auto".\n`);
lines.forEach((l) => console.log(l));
const f = (x) => x.toFixed(2);
console.log(`\nTotals over ${SEEDS} weeks (true payroll = trips paid at the wage, overtime included):`);
console.log(`  unpriced  open ${tot.u.open} h, ${tot.u.trips} trips, ${f(tot.u.th)} h paid travel, true payroll $${f(tot.u.cost)}; ${(tot.u.ms / SEEDS / 1000).toFixed(1)} s a build`);
console.log(`  priced    open ${tot.p.open} h, ${tot.p.trips} trips, ${f(tot.p.th)} h paid travel, payroll $${f(tot.p.cost)}; ${(tot.p.ms / SEEDS / 1000).toFixed(1)} s a build`);
console.log(`  pricing the trip saved $${f(tot.u.cost - tot.p.cost)}; cheaper in ${tot.cheaper} of ${SEEDS} weeks, the same in ${tot.same}, dearer in ${SEEDS - tot.cheaper - tot.same}`);
