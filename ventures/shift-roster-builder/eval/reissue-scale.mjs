// The posted-week reissue study (eval/reissue-posted.mjs) beyond the two invented cafés: the page's four built-in templates
// and the seeded 20-60 person weeks of eval/auto-exact.mjs / eval/cg-scale-bench.mjs (same generator and seed rule).
// For each week: build the posted roster with default options, then for every person posted on a call-out day (Wednesday
// onward; the seeded weeks run Mon-Fri, so Wed-Fri) rebuild with that person off that day, the change made at 5pm the
// evening before and every shift that started before it pinned to its posted owner. Each rebuild is priced by
// scheduleChanges against the posted roster (336 h window, 1 hour of pay per short-notice change, the caller exempt).
// On the seeded weeks CAP limits the call-outs per day (every k-th posted person, deterministic) to keep the run short.
//   node eval/reissue-scale.mjs templates
//   node eval/reissue-scale.mjs P S [cases=2] [cap=4] [first=0]   (weeks below `first` are generated and skipped)
// DAYS=2,3 limits the call-out days (0 = Monday); OPTS='{...}' merges extra buildRoster options into every build.
// VARIANTS="rebuild,keep/shift 1" picks variants (default: rebuild, keep/h 0.1, keep/shift 1).
import { parseStaff, parseShifts, buildRoster, TEMPLATES, DAYS } from "../calc.mjs";
import { reissue, VARIANTS } from "./reissue-posted.mjs";

const pick = (process.env.VARIANTS || "rebuild,keep/h 0.1,keep/shift 1").split(",");
const variants = Object.fromEntries(pick.map((k) => [k, VARIANTS[k]]));
const extraOpts = process.env.OPTS ? JSON.parse(process.env.OPTS) : {};
const onlyDays = process.env.DAYS ? process.env.DAYS.split(",").map(Number) : null;

export function studyWeek(staffText, shiftsText, { days = [2, 3, 4, 5, 6], cap = Infinity, base = { minRestHours: 10 }, onCase = null } = {}) {
  if (onlyDays) days = days.filter((d) => onlyDays.includes(d));
  base = { ...base, ...extraOpts };
  const staff = parseStaff(staffText).staff, slots = parseShifts(shiftsText).slots;
  const t0 = Date.now();
  const posted = buildRoster(staff, slots, base);
  const postMs = Date.now() - t0;
  const cases = [];
  for (const day of days) {
    const callers = staff.filter((p) => posted.owner.some((o, i) => o >= 0 && staff[o] === p && slots[i].day === day));
    const step = Math.max(1, Math.ceil(callers.length / cap));
    for (let k = 0; k < callers.length; k += step) {
      const p = callers[k];
      const changedAt = (day - 1) * 1440 + 17 * 60;
      const c = { person: p.name, day: DAYS[day], ...reissue({ staffText, slots, person: p.name, day, changedAt, posted, base, variants }) };
      delete c.out.patch; // the cheapest-taker patch stays in reissue-posted.mjs; only rebuilds are compared here
      cases.push(c);
      if (onCase) onCase(c);
    }
  }
  return { posted: { status: posted.optimality?.status, pay: posted.cost, open: posted.unfilledHours, ms: postMs, copies: slots.length, people: staff.length }, cases };
}

const PROVEN = ["optimal", "improved"];
function add(t, v) {
  t.cases = (t.cases || 0) + 1; t.open = (t.open || 0) + v.open; t.changes = (t.changes || 0) + v.changes; t.owed = (t.owed || 0) + v.owed;
  t.pay = (t.pay || 0) + v.pay; t.ms = (t.ms || 0) + v.ms; t.proven = (t.proven || 0) + (PROVEN.includes(v.status) ? 1 : 0);
}
const f = (v) => `${String(v.open).padStart(4)} h open ${String(v.changes).padStart(3)} changes (${v.people} people) owed $${v.owed.toFixed(2).padStart(7)} pay $${v.pay.toFixed(2)} ${v.status} ${v.ms} ms`;

export function tally(cases, into = {}) {
  for (const c of cases) {
    for (const [k, v] of Object.entries(c.out)) add((into[k] ||= {}), v);
    const fr = c.out.rebuild, ks = c.out["keep/shift 1"];
    if (fr && ks) {
      const w = (into._cmp ||= { fewer: 0, same: 0, more: 0, openUp: 0, openDown: 0 });
      if (ks.open > fr.open + 1e-9) w.openUp++; else if (ks.open < fr.open - 1e-9) w.openDown++;
      if (ks.changes < fr.changes) w.fewer++; else if (ks.changes > fr.changes) w.more++; else w.same++;
    }
  }
  return into;
}

function sum(name, tot) {
  for (const [k, t] of Object.entries(tot)) {
    if (k === "_cmp") { console.log(`CMP ${name} keep/shift 1 vs rebuild: fewer changes ${t.fewer}, same ${t.same}, more ${t.more}; open hours up ${t.openUp}, down ${t.openDown}`); continue; }
    console.log(`TOTAL ${name} ${k.padEnd(13)} open ${t.open} h, changes to others ${t.changes}, premiums $${t.owed.toFixed(2)}, pay $${t.pay.toFixed(2)}, proven ${t.proven}/${t.cases}, ${(t.ms / 1000).toFixed(1)} s`);
  }
}

function report(name, r, all) {
  console.log(`${name} posted: ${r.posted.people} people, ${r.posted.copies} copies, pay $${r.posted.pay}, ${r.posted.open} h open, ${r.posted.status}, ${r.posted.ms} ms; ${r.cases.length} call-outs`);
  for (const c of r.cases) {
    console.log(`${name} ${c.person} off ${c.day} (${c.idx} shifts)`);
    for (const [k, v] of Object.entries(c.out)) console.log(`  ${k.padEnd(13)} ${f(v)}`);
  }
  sum(name, tally(r.cases));
  tally(r.cases, all);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const all = {};
  if (process.argv[2] === "templates") {
    for (const [k, t] of Object.entries(TEMPLATES)) report(k, studyWeek(t.staff(), t.shifts()), all);
    sum("ALL", all);
  } else {
    const P = Number(process.argv[2] || 20), S = Number(process.argv[3] || 56), cases = Number(process.argv[4] || 2), cap = Number(process.argv[5] || 4), first = Number(process.argv[6] || 0);
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    let seed = Number(process.env.SEED || 20261022) + P * 100 + S;
    const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
    for (let c = 0; c < cases; c++) {
      const st = ["name, wage, max hours, min hours, availability", ...Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`)].join("\n");
      const sh = ["day, start, end, people needed", ...Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; })].join("\n");
      if (c < first) continue;
      report(`${P}x${S} week ${c}`, studyWeek(st, sh, { days: [2, 3, 4], cap }), all);
    }
    sum(`${P}x${S}`, all);
  }
}
