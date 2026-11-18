// Call-out rebuilds, column generation first (2026-11-13). For every call-out case calloutExposure plays (five teams of
// eval/real-rate-week.mjs x seeds 1-6, each person-day worked Tue-Sun), rebuild the week the default way and with
// deferCover: true (whole-score column generation before the coverage plateau walk), and compare the open hours, the
// only thing the call-out check reads. Prints any mismatch, cases whose roster differs at the same score, and times.
//   node eval/callout-rebuild-order.mjs   (readings: eval/callout-rebuild-order.out.txt)
import { parseStaff, parseShifts, buildRoster, rosterCsv, pinStarted, keepFromCsv } from "../calc.mjs";
import { sets } from "./real-rate-week.mjs";
const O = { minRestHours: 10 };
const all = sets();
let T0=0,T1=0,n=0,mism=0;
for (const name of Object.keys(all)) {
  const [a,b] = all[name]; const staff = parseStaff(a).staff, slots = parseShifts(b).slots;
  let t0n=0,t1n=0;
  for (let seed=1; seed<=6; seed++) {
  const r = buildRoster(staff, slots, {...O, seed});
  const csv = rosterCsv(r); const keep = keepFromCsv(csv);
  for (let d=1; d<7; d++) {
    const pinned = pinStarted(slots, csv, d*1440-420).slots;
    const working = [...new Set(r.assignments.filter(a=>a.person&&a.slot.day===d).map(a=>a.person))].sort();
    for (const nm of working) {
      const st = staff.map(q => q.name===nm ? {...q, days:q.days.map((w,k)=>k===d?[]:w)} : q);
      let t=Date.now(); const x0 = buildRoster(st, pinned, {...O, keep, keepShift:1}); const d0=Date.now()-t;
      t=Date.now(); const x1 = buildRoster(st, pinned, {...O, keep, keepShift:1, deferCover:true}); const d1=Date.now()-t;
      t0n+=d0; t1n+=d1; n++;
      if (Math.abs(x0.unfilledHours-x1.unfilledHours)>1e-9) { mism++; console.log("MISMATCH", name, seed, d, nm, x0.unfilledHours, x1.unfilledHours, x0.optimality?.status, x1.optimality?.status); }
      else if (rosterCsv(x0)!==rosterCsv(x1)) console.log("  same open, other roster", name, seed, d, nm, x0.score.toFixed(2), x1.score.toFixed(2));
    }
  }}
  console.log(`${name}: ${t0n} ms -> ${t1n} ms`); T0+=t0n; T1+=t1n;
}
console.log(`cases ${n}, mismatches ${mism}, total ${T0} -> ${T1} ms`);

// The whole --steady pick (six builds, pruned call-out check), old order (deferCover: false) against the default now.
import { steadyRoster } from "../calc.mjs";
console.log("\nwhole --steady pick: old order -> now");
for (const name of Object.keys(all)) {
  const [a,b] = all[name]; const staff = parseStaff(a).staff, slots = parseShifts(b).slots;
  let t=Date.now(); const s0 = steadyRoster(staff, slots, {...O, deferCover:false}); const t0=Date.now()-t;
  t=Date.now(); const s1 = steadyRoster(staff, slots, O); const t1=Date.now()-t;
  console.log(`${name}: ${(t0/1000).toFixed(1)} s -> ${(t1/1000).toFixed(1)} s; rebuilds ${s0.steady.rebuilt}/${s1.steady.rebuilt}; same roster ${rosterCsv(s0)===rosterCsv(s1)}; exposure ${s0.steady.exposure}/${s1.steady.exposure}; tied ${s1.steady.tied.map(x=>(x.atLeast?">=":"")+x.exposure).join(" ")}`);
}
