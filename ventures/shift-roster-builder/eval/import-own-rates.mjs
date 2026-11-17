// Per-location pay from imports (2026-11-14): do the importers reproduce the hand-written "wage at City:" cells, so the
// own-rate savings measured in eval/own-site-wages.mjs are reachable from an export instead of by typing?
// Same 40 made-up two-shop weeks and premiums (g = 0.3 and 0.6). For each, the team is written out three ways:
//   hand     - staff rows with "wage at City: +k" typed in (eval/own-site-wages.mjs's "own rates" build);
//   csv      - a long staff CSV, one row per person per location (Employee, Location, Hourly Rate, Max Hours), read by
//              --import-staff;
//   7shifts  - 7shifts users, roles, locations, and each user's assignments and wages (a default wage plus a role wage at
//              the City shop for people with a premium), in the API definition's shape, read by --import-7shifts-staff.
// The importers set availability to "any" (most exports carry none), so each person's availability is pasted back onto
// their imported row, as the import note asks a manager to do. Every build prices the city floor. The script stops if
// an imported team prices the hand roster differently, or builds a roster with a different payroll or open hours.
//
// Run: node eval/import-own-rates.mjs [seeds] > eval/import-own-rates.out.txt
import { parseStaff, parseShifts, buildRoster } from "../calc.mjs";
import { importStaffCsv } from "../import-staff.mjs";
import { import7shiftsStaff } from "../import-7shifts.mjs";

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SHIFTS = ["Mon-Sun, 7am, 3pm, 2, Open, site: City", "Mon-Sun, 3pm, 11pm, 2, Close, site: City",
  "Mon-Thu, 11am, 7pm, 1, Day, site: Suburb", "Fri-Sun, 11am, 7pm, 2, Day, site: Suburb"].join("\n");
const SEEDS = Number(process.argv[2] || 40), GS = [0.3, 0.6];
// The same people as eval/own-site-wages.mjs (same generator, same draws in the same order).
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
const hand = (ps, g) => "name,wage,max,min,availability\n" + ps.map((p) => `${p.name}, ${p.wage}, ${p.max}, 0, ${p.avail}${p.own < g ? `, wage at City: +${p.prem}` : ""}`).join("\n");
const cityRate = (p, g) => (Number(p.wage) + (p.own < g ? p.prem : 0)).toFixed(2);
const csv = (ps, g) => "Employee,Location,Hourly Rate,Max Hours\n" + ps.flatMap((p) => [`${p.name},City,${cityRate(p, g)},${p.max}`, `${p.name},Suburb,${p.wage},${p.max}`]).join("\n");
function sevenShifts(ps, g) {
  const c = Math.round;
  const roles = [{ id: 1, location_id: 10, name: "Open" }, { id: 2, location_id: 10, name: "Close" }, { id: 3, location_id: 20, name: "Day" }];
  const out = [
    { object: "users", data: ps.map((p, i) => ({ id: i + 1, first_name: p.name, last_name: "", active: true, type: "employee", hourly_wage: c(Number(p.wage) * 100), wage_type: "hourly", max_weekly_hours: String(p.max) })), meta: { cursor: { next: null } } },
    { object: "roles", data: roles },
    { object: "locations", data: [{ id: 10, name: "City", timezone: "America/Los_Angeles" }, { id: 20, name: "Suburb", timezone: "America/Los_Angeles" }] },
  ];
  ps.forEach((p, i) => {
    out.push({ object: "assignments", user_id: i + 1, data: { locations: [{ id: 10, name: "City" }, { id: 20, name: "Suburb" }], roles } });
    const w = [{ id: 1, role_id: null, wage_type: "hourly", wage_cents: c(Number(p.wage) * 100), effective_date: "2026-01-01" }];
    if (p.own < g) for (const rid of [1, 2]) w.push({ id: 1 + rid, role_id: rid, wage_type: "hourly", wage_cents: c(Number(cityRate(p, g)) * 100), effective_date: "2026-01-01" });
    out.push({ object: "user_wages", user_id: i + 1, data: { current_wages: w, upcoming_wages: [] } });
  });
  return out.map((x) => JSON.stringify(x)).join("\n");
}
// Paste each person's availability over the importer's "any".
const withAvail = (text, ps) => text.split("\n").map((l, i) => {
  if (i === 0) return l;
  const p = ps.find((x) => l.startsWith(x.name + ","));
  if (!p) throw new Error(`no person for imported row "${l}"`);
  return l.replace(/, any(?=,|$)/, `, ${p.avail}`);
}).join("\n");

const OPTS = { exact: "auto", seed: 1, siteWage: "City min 21.30" };
const sh = parseShifts(SHIFTS);
const lines = [];
const tot = Object.fromEntries(GS.map((g) => [g, { hand: 0, csv: 0, s7: 0, open: 0, cellsCsv: 0, cells7: 0, same: { csv: 0, s7: 0 } }]));
const t0 = Date.now();
for (let seed = 1; seed <= SEEDS; seed++) {
  const ps = people(seed);
  for (const g of GS) {
    const h = parseStaff(hand(ps, g));
    const ci = importStaffCsv(csv(ps, g)), si = import7shiftsStaff(sevenShifts(ps, g));
    if (ci.rows !== ps.length || si.rows !== ps.length) throw new Error(`seed ${seed}: imported ${ci.rows} / ${si.rows} of ${ps.length}`);
    const c = parseStaff(withAvail(ci.staffText, ps)), s = parseStaff(withAvail(si.staffText, ps));
    for (const x of [h, c, s]) if (x.errors.length) throw new Error(x.errors.join("; "));
    const T = tot[g];
    T.cellsCsv += (ci.staffText.match(/wage at City/g) || []).length;
    T.cells7 += (si.staffText.match(/wage at City/g) || []).length;
    const rh = buildRoster(h.staff, sh.slots, OPTS), rc = buildRoster(c.staff, sh.slots, OPTS), rs = buildRoster(s.staff, sh.slots, OPTS);
    for (const [k, r] of [["csv", rc], ["7shifts", rs]]) {
      if (Math.abs(r.cost - rh.cost) > 0.005 || r.unfilledHours !== rh.unfilledHours) throw new Error(`seed ${seed} g=${g}: ${k} import built $${r.cost.toFixed(2)} / ${r.unfilledHours} h open, hand $${rh.cost.toFixed(2)} / ${rh.unfilledHours} h`);
    }
    // Same rate on every shift for every person: price the hand roster with each imported team.
    const pinned = rh.assignments.map((a) => ({ ...a.slot, fixed: a.person || "(nobody)" }));
    for (const [k, x] of [["csv", c], ["7shifts", s]]) {
      const rp = buildRoster(x.staff, pinned, { ...OPTS, exact: false });
      if (Math.abs(rp.cost - rh.cost) > 0.005) throw new Error(`seed ${seed} g=${g}: the hand roster costs $${rp.cost.toFixed(2)} with the ${k} team, $${rh.cost.toFixed(2)} by hand`);
    }
    const same = (r) => r.assignments.every((a, i) => (a.person || "") === (rh.assignments[i].person || ""));
    if (same(rc)) T.same.csv++;
    if (same(rs)) T.same.s7++;
    T.hand += rh.cost; T.csv += rc.cost; T.s7 += rs.cost; T.open += rh.unfilledHours;
    lines.push(`seed ${String(seed).padStart(2)} g=${g} | hand $${rh.cost.toFixed(2)}, csv $${rc.cost.toFixed(2)}, 7shifts $${rs.cost.toFixed(2)}, ${rh.unfilledHours} h open | same roster: csv ${same(rc) ? "yes" : "no (tie)"}, 7shifts ${same(rs) ? "yes" : "no (tie)"}`);
  }
}
console.log(`Imported own rates: ${SEEDS} made-up two-shop weeks (eval/own-site-wages.mjs), the team typed by hand vs read from a long staff CSV and from 7shifts users + wages.\n`);
lines.forEach((l) => console.log(l));
for (const g of GS) {
  const T = tot[g];
  console.log(`\ng = ${g}: payroll over ${SEEDS} weeks hand $${T.hand.toFixed(2)}, csv $${T.csv.toFixed(2)}, 7shifts $${T.s7.toFixed(2)}; ${T.open} h open in each; "wage at City" cells written: csv ${T.cellsCsv}, 7shifts ${T.cells7}; identical rosters csv ${T.same.csv}/${SEEDS}, 7shifts ${T.same.s7}/${SEEDS}`);
}
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
