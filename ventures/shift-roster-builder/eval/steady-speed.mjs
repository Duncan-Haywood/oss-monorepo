// A quicker call-out check (2026-11-13): steadyRoster with every tie scored in full (prune: false, outright: false, the
// first version) against the default (outright cover and hand-over-chain short cuts, pruning with hinted case order),
// on the five teams of eval/real-rate-week.mjs. Prints time, rebuilds, and whether the posted roster and exposure match.
// Case-by-case agreement of the short cuts with full rebuilds is in steady.test.mjs and eval/steady-speed.out.txt.
//   node eval/steady-speed.mjs
import { parseStaff, parseShifts, steadyRoster, rosterCsv } from "../calc.mjs";
import { sets } from "./real-rate-week.mjs";
const O = { minRestHours: 10 };
const all = sets();
for (const name of Object.keys(all)) {
  const [a,b] = all[name]; const staff = parseStaff(a).staff, slots = parseShifts(b).slots;
  let t=Date.now(); const s0 = steadyRoster(staff, slots, O, { prune:false, outright:false }); const t0=Date.now()-t;
  t=Date.now(); const s1 = steadyRoster(staff, slots, O); const t1=Date.now()-t;
  console.log(`${name}: old ${(t0/1000).toFixed(1)} s, ${s0.steady.rebuilt} rebuilds; new ${(t1/1000).toFixed(1)} s, ${s1.steady.rebuilt} rebuilds; same roster ${rosterCsv(s0)===rosterCsv(s1)}; seed ${s0.steady.chosenSeed}/${s1.steady.chosenSeed}; exposure ${s0.steady.exposure}/${s1.steady.exposure}; tied new ${s1.steady.tied.map(x=>(x.atLeast?">=":"")+x.exposure).join(" ")}`);
}
