// The call-out page's study (how-to-cover-a-shift-when-someone-calls-out.html): on the sample café, every person
// working every day calls out in turn. Counts the cases, those absencePlan patches with nobody else moved, those a
// full rebuild covers as well as the posted week, and how many other shifts each such rebuild moves.
// Used by page-callout*.test.mjs. Run: node eval/callout-cover-study.mjs
import { parseStaff, parseShifts, buildRoster, sampleStaff, sampleShifts, absencePlan, DAYS } from "../calc.mjs";

export function study(text) {
  const slots = parseShifts(sampleShifts()).slots;
  const groups = (ow) => { const m = new Map(); ow.forEach((x, i) => { const k = `${slots[i].day}|${slots[i].start}|${slots[i].label}`; (m.get(k) || m.set(k, []).get(k)).push(x); }); return m; };
  const moved = (a, b) => { const B = groups(b); let n = 0; for (const [k, v] of groups(a)) { const w = [...B.get(k)]; for (const x of v) { const j = w.indexOf(x); if (j >= 0) w.splice(j, 1); } n += w.length; } return n; };
  const staff = parseStaff(text).staff, r = buildRoster(staff, slots, {});
  const o = { cases: 0, patched: 0, covered: 0, moves: [] };
  for (let p = 0; p < staff.length; p++) for (let d = 0; d < 7; d++) {
    if (!r.owner.some((x, i) => x === p && slots[i].day === d)) continue;
    o.cases++;
    if (!absencePlan(staff, slots, r, staff[p].name, [d]).open.length) o.patched++;
    const off = text.split("\n").map((l) => (l.startsWith(staff[p].name + ",") ? `${l}, off: ${DAYS[d]}` : l)).join("\n").replace("min hours, availability", "min hours, availability, off");
    const r2 = buildRoster(parseStaff(off).staff, slots, {});
    if (r2.unfilledHours <= r.unfilledHours) { o.covered++; o.moves.push(moved(r.owner, r2.owner)); }
  }
  return o;
}

/** The sample café as shipped, and with a spare part-timer who can work any shift. */
export const SAMPLE = () => sampleStaff();
export const WITH_SPARE = () => sampleStaff() + "\nHal, 15, 24, 0, any";

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [name, t] of [["sample", SAMPLE()], ["with a spare part-timer", WITH_SPARE()]]) {
    const o = study(t);
    console.log(`${name}: ${o.cases} cases, ${o.patched} patched, ${o.covered} covered by a rebuild, ${Math.min(...o.moves)} to ${Math.max(...o.moves)} other shifts moved`);
  }
}
