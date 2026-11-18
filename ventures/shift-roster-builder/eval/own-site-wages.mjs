// A person's own rate at one site (2026-11-14): "wage at City: +3" on a staff row. Same two-shop weeks as
// eval/site-wages.mjs (a seven-day "City" shop inside a $21.30 city and a "Suburb" shop at the $17.13 state floor; 7 + 3
// made-up people, 1-3 random days off, 24-40 h caps, base wages $17.13-$23.13), everyone allowed at both shops, and the city
// floor priced in every build (--site-wage "City min 21.30"). On top, a share g of the team has agreed a premium of their
// own at the city shop: "wage at City: +k" with k drawn from $1-$4 (parking, a longer trip, a rate kept from a past
// transfer). The site's floor still applies to them. For each seed and g:
//   rule only - built knowing the city floor but not the personal premiums (the best the builder could do before today),
//               then re-priced with them: every shift pinned to the person it went to and rebuilt with the premiums, so
//               the same code costs both rosters;
//   own rates - built with the premiums on the staff rows.
// Overtime is paid on each person's weighted-average rate for the week (29 CFR 778.115) in both. The script stops if the
// re-priced roster differs from the rule-only one, or if pricing the premiums ever leaves more hours open.
//
// Run: node eval/own-site-wages.mjs [seeds] > eval/own-site-wages.out.txt
import { parseStaff, parseShifts, buildRoster } from "../calc.mjs";

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SHIFTS = ["Mon-Sun, 7am, 3pm, 2, Open, site: City", "Mon-Sun, 3pm, 11pm, 2, Close, site: City",
  "Mon-Thu, 11am, 7pm, 1, Day, site: Suburb", "Fri-Sun, 11am, 7pm, 2, Day, site: Suburb"].join("\n");
const RULE = "City min 21.30";
const SEEDS = Number(process.argv[2] || 40), GS = [0.3, 0.6];
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
    out.push({ name: `${home[0]}${k + 1}`, home, wage: (17.13 + Math.round(r() * 6)).toFixed(2), max: [24, 32, 40][Math.floor(r() * 3)], avail, own: r(), prem: 1 + Math.floor(r() * 4) });
  }
  return out;
}
const staffText = (ps, g, withOwn) => "name,wage,max,min,availability\n" + ps.map((p) => `${p.name}, ${p.wage}, ${p.max}, 0, ${p.avail}${withOwn && p.own < g ? `, wage at City: +${p.prem}` : ""}`).join("\n");

const OPTS = { exact: "auto", seed: 1, siteWage: RULE };
const lines = [];
const tot = Object.fromEntries(GS.map((g) => [g, { r: { open: 0, cost: 0, built: 0, premH: 0 }, o: { open: 0, cost: 0, premH: 0 }, cheaper: 0, same: 0 }]));
const t0 = Date.now();
for (let seed = 1; seed <= SEEDS; seed++) {
  const ps = people(seed);
  for (const g of GS) {
    const plain = parseStaff(staffText(ps, g, false)), own = parseStaff(staffText(ps, g, true));
    const sh = parseShifts(SHIFTS);
    if (plain.errors.length || own.errors.length || sh.errors.length) throw new Error([...plain.errors, ...own.errors, ...sh.errors].join("; "));
    const premOf = new Map(ps.filter((p) => p.own < g).map((p) => [p.name, p.prem]));
    // City hours worked by people with a premium of their own there.
    const premH = (r) => r.assignments.reduce((t, a) => t + (a.person && a.slot.site === "City" && premOf.has(a.person) ? (a.slot.end - a.slot.start) / 60 : 0), 0);
    const r = buildRoster(plain.staff, sh.slots, OPTS);
    const pinned = r.assignments.map((a) => ({ ...a.slot, fixed: a.person || NOBODY }));
    const rp = buildRoster(own.staff, pinned, { ...OPTS, exact: false });
    rp.assignments.forEach((a, i) => { if ((a.person || NOBODY) !== (r.assignments[i].person || NOBODY)) throw new Error(`seed ${seed}: re-pricing moved shift ${i}`); });
    const o = buildRoster(own.staff, sh.slots, OPTS);
    if (o.unfilledHours > r.unfilledHours + 1e-9) throw new Error(`seed ${seed} g=${g}: pricing own rates left more hours open`);
    const T = tot[g];
    T.r.open += r.unfilledHours; T.r.cost += rp.cost; T.r.built += r.cost; T.r.premH += premH(r);
    T.o.open += o.unfilledHours; T.o.cost += o.cost; T.o.premH += premH(o);
    if (o.cost < rp.cost - 0.005) T.cheaper++; else if (Math.abs(o.cost - rp.cost) <= 0.005) T.same++;
    lines.push(`seed ${String(seed).padStart(2)} g=${g} | rule only: ${String(r.unfilledHours).padStart(3)} h open, built as $${r.cost.toFixed(2)}, true $${rp.cost.toFixed(2)}, ${String(premH(r)).padStart(3)} h at own premium | own rates: ${String(o.unfilledHours).padStart(3)} h open, $${o.cost.toFixed(2)}, ${String(premH(o)).padStart(3)} h at own premium | saves $${(rp.cost - o.cost).toFixed(2)}`);
  }
}
console.log(`Own rates at a site: the city shop's $21.30 floor priced in every build; a share g of ${SEEDS} made-up 10-person teams has its own +$1-$4 at the city shop.`);
console.log(`City: 2 open 7-3 + 2 close 3-11 daily (224 h); Suburb: 1 on 11-7 Mon-Thu, 2 Fri-Sun (80 h). Wages $17.13-$23.13; everyone may work at both.\n`);
lines.forEach((l) => console.log(l));
const m = (x) => `$${x.toFixed(2)}`;
for (const g of GS) {
  const T = tot[g];
  console.log(`\ng = ${g}, totals over ${SEEDS} weeks (true payroll = floor and own premiums paid, overtime on the week's average rate):`);
  console.log(`  rule only  open ${T.r.open} h, true payroll ${m(T.r.cost)} (the builder said ${m(T.r.built)}, ${m(T.r.cost - T.r.built)} short); ${T.r.premH} city hours at someone's own premium`);
  console.log(`  own rates  open ${T.o.open} h, payroll ${m(T.o.cost)}; ${T.o.premH} city hours at someone's own premium`);
  console.log(`  pricing own rates saved ${m(T.r.cost - T.o.cost)} (${((T.r.cost - T.o.cost) / T.r.cost * 100).toFixed(2)}% of payroll); cheaper in ${T.cheaper} of ${SEEDS} weeks, the same in ${T.same}, dearer in ${SEEDS - T.cheaper - T.same}`);
}
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
