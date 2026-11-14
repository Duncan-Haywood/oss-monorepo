// Probe: on person-days coverRisk flags but calloutExposure's rebuild covers, what did the rebuild do?
import { parseStaff, parseShifts, buildContext, buildRoster, coverRisk, rosterCsv, keepFromCsv, pinStarted } from "../calc.mjs";
import { sets } from "./real-rate-week.mjs";
const BASE = { minRestHours: 10 };
const all = sets();
for (const name of (process.env.SETS || "cafe,spare,clinic,retail").split(",")) {
  const [stf, shf] = all[name];
  const staff = parseStaff(stf).staff, slots = parseShifts(shf).slots;
  const r = buildRoster(staff, slots, BASE);
  const ctx = buildContext(staff, slots, BASE);
  const risk = coverRisk(ctx, r.owner);
  const csv = rosterCsv(r), keep = keepFromCsv(csv);
  console.log(`${name}: roster open ${r.unfilledHours} h, flagged ${risk.cases.length}`);
  for (const c of risk.cases) {
    const d = c.day, pn = staff[c.person].name;
    const pinned = pinStarted(slots, csv, d * 1440 - 420).slots;
    const st = staff.map((q) => (q.name === pn ? { ...q, days: q.days.map((w, k) => (k === d ? [] : w)) } : q));
    const rb = buildRoster(st, pinned, { ...BASE, keep, keepShift: 1, deferCover: true });
    const added = rb.unfilledHours - r.unfilledHours;
    if (added > 0) { console.log(`  ${pn} ${d}: opens ${added} h`); continue; }
    // diff by slot index (same slot list order assumed)
    const moved = [];
    for (let i = 0; i < slots.length; i++) if (r.owner[i] !== rb.owner[i]) moved.push(`${i}(d${slots[i].day} ${slots[i].start % 1440 / 60}-${slots[i].end % 1440 / 60}) ${r.owner[i] >= 0 ? staff[r.owner[i]].name : "OPEN"}->${rb.owner[i] >= 0 ? staff[rb.owner[i]].name : "OPEN"}`);
    console.log(`  ${pn} d${d} (${c.hours} h): covered, open ${r.unfilledHours}->${rb.unfilledHours}, ${moved.length} moved: ${moved.join("; ")}`);
  }
}
