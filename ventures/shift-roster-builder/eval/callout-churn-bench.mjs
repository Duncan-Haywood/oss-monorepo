// A posted week, then one person cannot work Wednesday. Compare two ways to reissue it on the sample café:
// rebuild the whole week with that person off Wednesday, or patch only their Wednesday shifts with the cheapest
// person coverOptions finds. Counts the shifts that change for other people and prices short-notice premiums
// with scheduleChanges. Invented staff and wages. Run: node eval/callout-churn-bench.mjs
import { parseStaff, parseShifts, buildRoster, rosterCsv, coverOptions, scheduleChanges, sampleStaff, sampleShifts } from "../calc.mjs";

export function run({ staffText = sampleStaff(), shiftsText = sampleShifts(), changedAt = 1 * 1440 + 17 * 60, noticeHours = 336 } = {}) {
  const slots = parseShifts(shiftsText).slots;
  const base = (text) => { const p = parseStaff(text); if (p.errors.length) throw new Error(p.errors[0]); return p.staff; };
  const staff = base(staffText);
  const posted = buildRoster(staff, slots, { minRestHours: 10 });
  const postedCsv = rosterCsv(posted);
  const wages = Object.fromEntries(staff.map((s) => [s.name, s.wage]));
  const rows = [];
  for (const person of staff.map((s) => s.name)) {
    const idx = posted.owner.map((o, i) => (staff[o]?.name === person && slots[i].day === 2 ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    // (a) rebuild the whole week with the person off Wednesday
    const text = staffText.split("\n").map((l, n) => (n === 0 ? l + ", off" : l.startsWith(person + ",") ? l + ", off: Wed" : l)).join("\n");
    const rebuilt = buildRoster(base(text), slots, { minRestHours: 10 });
    const rebuiltCsv = rosterCsv(rebuilt);
    // (b) patch: each of their Wednesday shifts to the cheapest person who fits, else left open
    const owner = posted.owner.slice(); const patched = { ...posted, owner };
    let patchCost = 0, left = 0;
    for (const i of idx) {
      const o = coverOptions(staff, slots, { ...posted, owner }, i);
      const best = o.fits[0];
      if (best) { owner[i] = staff.findIndex((s) => s.name === best.name); patchCost += best.extraCost; } else { owner[i] = -1; left++; }
    }
    const lines = postedCsv.trim().split("\n"); const rowOf = posted.assignments.map((a) => slots.indexOf(a.slot));
    const patchedCsv = [lines[0], ...lines.slice(1).map((l, k) => { const i = rowOf[k]; const c = l.split(","); c[5] = owner[i] >= 0 ? staff[owner[i]].name : "UNFILLED"; return c.join(","); })].join("\n") + "\n";
    const opt = { changedAt, noticeHours, premiumHours: 1, wages, exempt: [person] };
    const a = scheduleChanges(postedCsv, rebuiltCsv, opt), b = scheduleChanges(postedCsv, patchedCsv, opt);
    const others = (r) => r.changes.filter((c) => c.person !== person);
    rows.push({ person, wedShifts: idx.length,
      rebuild: { changes: a.changes.length, others: others(a).length, people: new Set(others(a).map((c) => c.person)).size, owed: a.owed, open: rebuilt.unfilled.length, cost: rebuilt.cost },
      patch: { changes: b.changes.length, others: others(b).length, people: new Set(others(b).map((c) => c.person)).size, owed: b.owed, open: left, cost: posted.cost + patchCost } });
  }
  return { postedCost: posted.cost, postedOpen: posted.unfilled.length, rows };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = run();
  console.log(`posted: $${r.postedCost}, ${r.postedOpen} open`);
  for (const x of r.rows) console.log(x.person.padEnd(5), x.wedShifts, "rebuild", JSON.stringify(x.rebuild), "patch", JSON.stringify(x.patch));
}
