// Wages by site (2026-11-14): a business with one shop inside a city whose minimum wage is above the state's. What does a
// roster cost once the city floor is paid, if the builder did not know about it, and what does pricing it save?
//
// Rates: Washington's 2026 state minimum is $17.13 and Seattle's is $21.30 (Washington L&I, "Local minimum wage rates",
// https://lni.wa.gov/workers-rights/wages/minimum-wage/local-minimum-wage-rates, read 2026-11-14). The shops, teams and
// wages are made up: a seven-day "City" shop (an opening and a closing shift of two people each, 224 h) inside the city and
// a smaller "Suburb" shop (one person Mon-Thu, two Fri-Sun, 11-7, 80 h) outside it; 7 + 3 people, 1-3 random days off,
// 24-40 h caps, base wages $17.13-$23.13 (the state floor plus 0-6 dollars). A share f of each shop's people may work at
// both. For each seed and f:
//   unpriced - built as before today (one wage per person), then re-priced with "City min 21.30": every shift pinned to the
//              person it went to (or to nobody) and rebuilt with the floor, so the same code costs both rosters;
//   priced   - built with --site-wage "City min 21.30", so the search sees who costs more at the city shop.
// Overtime is paid on each person's weighted-average rate for the week (29 CFR 778.115) in both. The script stops if the
// re-priced roster differs from the unpriced one, or if pricing ever leaves more hours open.
//
// Run: node eval/site-wages.mjs [seeds] > eval/site-wages.out.txt
import { parseStaff, parseShifts, buildRoster } from "../calc.mjs";

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SHIFTS = ["Mon-Sun, 7am, 3pm, 2, Open, site: City", "Mon-Sun, 3pm, 11pm, 2, Close, site: City",
  "Mon-Thu, 11am, 7pm, 1, Day, site: Suburb", "Fri-Sun, 11am, 7pm, 2, Day, site: Suburb"].join("\n");
const RULE = "City min 21.30";
const SEEDS = Number(process.argv[2] || 40), FS = [0.5, 1];
const NOBODY = "(nobody)";

function people(seed) {
  const r = rng(seed);
  const out = [];
  for (const [home, n] of [["City", 7], ["Suburb", 3]]) for (let k = 0; k < n; k++) {
    const off = new Set();
    const nOff = 1 + Math.floor(r() * 3);
    while (off.size < nOff) off.add(Math.floor(r() * 7));
    const early = r() < 0.3;
    const avail = DAYS.filter((_, d) => !off.has(d)).map((d) => `${d} ${early ? "6-19" : "6-24"}`).join("; ");
    out.push({ name: `${home[0]}${k + 1}`, home, wage: (17.13 + Math.round(r() * 6)).toFixed(2), max: [24, 32, 40][Math.floor(r() * 3)], avail, float: r() });
  }
  return out;
}

const OPTS = { exact: "auto", seed: 1 };
const lines = [];
const tot = Object.fromEntries(FS.map((f) => [f, { u: { open: 0, cost: 0, built: 0, cityLow: 0 }, p: { open: 0, cost: 0, cityLow: 0 }, cheaper: 0, same: 0 }]));
const t0 = Date.now();
for (let seed = 1; seed <= SEEDS; seed++) {
  const ps = people(seed);
  for (const f of FS) {
    const st = parseStaff("name,wage,max,min,availability\n" + ps.map((p) => `${p.name}, ${p.wage}, ${p.max}, 0, ${p.avail}, sites: ${p.float < f ? "City | Suburb" : p.home}`).join("\n"));
    const sh = parseShifts(SHIFTS);
    if (st.errors.length || sh.errors.length) throw new Error([...st.errors, ...sh.errors].join("; "));
    const wage = new Map(st.staff.map((p) => [p.name, p.wage]));
    // Hours at the city shop worked by people whose own wage is under the city floor (each one is topped up).
    const cityLow = (r) => r.assignments.reduce((t, a) => t + (a.person && a.slot.site === "City" && wage.get(a.person) < 21.3 ? (a.slot.end - a.slot.start) / 60 : 0), 0);
    const u = buildRoster(st.staff, sh.slots, OPTS);
    const pinned = u.assignments.map((a) => ({ ...a.slot, fixed: a.person || NOBODY }));
    const up = buildRoster(st.staff, pinned, { ...OPTS, siteWage: RULE, exact: false });
    up.assignments.forEach((a, i) => { if ((a.person || NOBODY) !== (u.assignments[i].person || NOBODY)) throw new Error(`seed ${seed}: re-pricing moved shift ${i}`); });
    const p = buildRoster(st.staff, sh.slots, { ...OPTS, siteWage: RULE });
    if (p.unfilledHours > u.unfilledHours + 1e-9) throw new Error(`seed ${seed} f=${f}: pricing the city floor left more hours open`);
    const T = tot[f];
    T.u.open += u.unfilledHours; T.u.cost += up.cost; T.u.built += u.cost; T.u.cityLow += cityLow(u);
    T.p.open += p.unfilledHours; T.p.cost += p.cost; T.p.cityLow += cityLow(p);
    if (p.cost < up.cost - 0.005) T.cheaper++; else if (Math.abs(p.cost - up.cost) <= 0.005) T.same++;
    lines.push(`seed ${String(seed).padStart(2)} f=${f} | unpriced: ${String(u.unfilledHours).padStart(3)} h open, built as $${u.cost.toFixed(2)}, true $${up.cost.toFixed(2)}, ${String(cityLow(u)).padStart(3)} h topped up | priced: ${String(p.unfilledHours).padStart(3)} h open, $${p.cost.toFixed(2)}, ${String(cityLow(p)).padStart(3)} h topped up | saves $${(up.cost - p.cost).toFixed(2)}`);
  }
}
console.log(`Wages by site: a city shop with a $21.30 floor and a suburban shop at the $17.13 state floor, ${SEEDS} made-up weeks, 7 + 3 people.`);
console.log(`City: 2 open 7-3 + 2 close 3-11 daily (224 h); Suburb: 1 on 11-7 Mon-Thu, 2 Fri-Sun (80 h). Wages $17.13-$23.13. f = share allowed at both shops.\n`);
lines.forEach((l) => console.log(l));
const m = (x) => `$${x.toFixed(2)}`;
for (const f of FS) {
  const T = tot[f];
  console.log(`\nf = ${f}, totals over ${SEEDS} weeks (true payroll = city floor paid, overtime on the week's average rate):`);
  console.log(`  unpriced  open ${T.u.open} h, true payroll ${m(T.u.cost)} (the builder said ${m(T.u.built)}, ${m(T.u.cost - T.u.built)} short); ${T.u.cityLow} city hours by people under the floor`);
  console.log(`  priced    open ${T.p.open} h, payroll ${m(T.p.cost)}; ${T.p.cityLow} city hours by people under the floor`);
  console.log(`  pricing the floor saved ${m(T.u.cost - T.p.cost)} (${((T.u.cost - T.p.cost) / T.u.cost * 100).toFixed(2)}% of payroll); cheaper in ${T.cheaper} of ${SEEDS} weeks, the same in ${T.same}, dearer in ${SEEDS - T.cheaper - T.same}`);
}
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
