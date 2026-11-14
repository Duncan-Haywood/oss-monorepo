// What does sharing staff between two shops buy? (2026-11-14)
//
// Made-up weeks (seeded, so every run prints the same numbers): a seven-day "Main" shop with an opening and a closing
// shift of two people each, and a smaller "Harbour" shop, one person Mon-Thu and two Fri-Sun. Each site has its own
// people with random days off, weekly caps and wages. Two ways to plan:
//   separate   - each site built alone from its own staff (what --each-location gave before sites: existed)
//   floaters f - one build across both sites; a share f of each site's people may work at either (sites: Main | Harbour),
//                the rest only at home (sites: <home>)
// For f = 0 the joint build is the separate build in one run, so its open hours must match (a check that the site rule
// keeps the two staff lists apart). Every roster is also checked: nobody works at a site their row does not list.
//
// Run: node eval/shared-staff-sites.mjs > eval/shared-staff-sites.out.txt
import { parseStaff, parseShifts, buildRoster, siteSplit, siteKey } from "../calc.mjs";

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAIN = ["Mon-Sun, 7am, 3pm, 2, Open, site: Main", "Mon-Sun, 3pm, 11pm, 2, Close, site: Main"].join("\n");
const HARBOUR = ["Mon-Thu, 11am, 7pm, 1, Day, site: Harbour", "Fri-Sun, 11am, 7pm, 2, Day, site: Harbour"].join("\n");

function people(seed) {
  const r = rng(seed);
  const out = [];
  const make = (home, n) => {
    for (let k = 0; k < n; k++) {
      const off = new Set();
      const nOff = 1 + Math.floor(r() * 3); // 1-3 days off
      while (off.size < nOff) off.add(Math.floor(r() * 7));
      const early = r() < 0.3; // some cannot do closes
      const avail = DAYS.filter((_, d) => !off.has(d)).map((d) => `${d} ${early ? "6-19" : "6-24"}`).join("; ");
      out.push({ name: `${home[0]}${k + 1}`, home, wage: 15 + Math.round(r() * 7), max: [24, 32, 40][Math.floor(r() * 3)], avail, float: r() });
    }
  };
  make("Main", 7);
  make("Harbour", 3);
  return out;
}

const row = (p, sites) => `${p.name}, ${p.wage}, ${p.max}, 0, ${p.avail}${sites ? `, sites: ${sites}` : ""}`;
const OPTS = { exact: "auto", seed: 1 };

function build(staffRows, shiftsText) {
  const st = parseStaff("name,wage,max,min,availability\n" + staffRows.join("\n"));
  const sh = parseShifts(shiftsText);
  if (st.errors.length || sh.errors.length) throw new Error([...st.errors, ...sh.errors].join("; "));
  const r = buildRoster(st.staff, sh.slots, OPTS);
  const by = new Map(st.staff.map((p) => [p.name, p]));
  for (const a of r.assignments) if (a.person && a.slot.site) {
    const s = by.get(a.person).sites;
    if (s && !s.includes(siteKey(a.slot.site))) throw new Error(`${a.person} placed at ${a.slot.site}`);
  }
  return r;
}

const SEEDS = Number(process.argv[2] || 40), FS = [0, 0.25, 0.5, 1];
const tot = { sep: { open: 0, cost: 0 }, ...Object.fromEntries(FS.map((f) => [f, { open: 0, cost: 0, sharedPeople: 0, better: 0, worse: 0 }])) };
const lines = [];
const t0 = Date.now();
for (let seed = 1; seed <= SEEDS; seed++) {
  const ps = people(seed);
  const a = build(ps.filter((p) => p.home === "Main").map((p) => row(p)), MAIN);
  const b = build(ps.filter((p) => p.home === "Harbour").map((p) => row(p)), HARBOUR);
  const sepOpen = a.unfilledHours + b.unfilledHours, sepCost = a.cost + b.cost;
  tot.sep.open += sepOpen; tot.sep.cost += sepCost;
  const cells = [`seed ${String(seed).padStart(2)}  separate ${String(sepOpen).padStart(3)} h open $${sepCost.toFixed(0).padStart(5)}`];
  for (const f of FS) {
    const r = build(ps.map((p) => row(p, p.float < f ? "Main | Harbour" : p.home)), MAIN + "\n" + HARBOUR);
    if (f === 0 && Math.abs(r.unfilledHours - sepOpen) > 1e-9) throw new Error(`seed ${seed}: f=0 joint ${r.unfilledHours} vs separate ${sepOpen}`);
    const sp = siteSplit(r);
    const T = tot[f];
    T.open += r.unfilledHours; T.cost += r.cost; T.sharedPeople += sp.shared.length;
    if (r.unfilledHours < sepOpen - 1e-9) T.better++;
    if (r.unfilledHours > sepOpen + 1e-9) T.worse++;
    cells.push(`f=${f}: ${String(r.unfilledHours).padStart(3)} h $${r.cost.toFixed(0).padStart(5)} ${sp.shared.length} shared`);
  }
  lines.push(cells.join(" | "));
}
console.log(`Shared staff between two shops, ${SEEDS} made-up weeks (Main: 2 open + 2 close daily, 224 h; Harbour: 1-2 on 11-7, 80 h; 7 + 3 people).`);
console.log(`Same seeds, same engine (buildRoster, exact check "auto"); f = share of each site's people allowed at both sites.\n`);
lines.forEach((l) => console.log(l));
console.log("");
console.log(`Totals over ${SEEDS} weeks:`);
console.log(`  separate builds          open ${tot.sep.open} h, payroll $${tot.sep.cost.toFixed(0)}`);
for (const f of FS) {
  const T = tot[f];
  console.log(`  one build, f = ${String(f).padEnd(4)}     open ${T.open} h (${T.open - tot.sep.open >= 0 ? "+" : ""}${T.open - tot.sep.open}), payroll $${T.cost.toFixed(0)} (${T.cost - tot.sep.cost >= 0 ? "+" : "-"}$${Math.abs(T.cost - tot.sep.cost).toFixed(0)}); fewer open hours in ${T.better} weeks, more in ${T.worse}; ${(T.sharedPeople / SEEDS).toFixed(1)} people a week work at both`);
}
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)} s; payroll covers the hours that get filled, so filling more can cost more.)`);
