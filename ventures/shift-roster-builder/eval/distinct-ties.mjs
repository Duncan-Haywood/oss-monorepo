// How many rosters really tie? (2026-11-13)
//
// steadyRoster dropped duplicate tied rosters by comparing rosterCsv, which lists shift copies in the order the search
// placed them: two identical copies of one shift swapped between two people print as different files but are the same
// schedule. rosterKey sorts the rows. For each team and seeds 1-6 this prints the tied best rosters counted both ways,
// each distinct roster's call-out exposure (full check, no pruning), and steadyRoster's pick and time with the new key.
// The same count at reissues: eval/steady-reissue.mjs (each reissue there runs steadyRoster with the posted roster kept).
//   node eval/distinct-ties.mjs        SETS=cafe,spare,salon,retail,clinic
import { parseStaff, parseShifts, buildRoster, rosterCsv, rosterKey, calloutExposure, steadyRoster } from "../calc.mjs";
import { sets } from "./real-rate-week.mjs";

const BASE = { minRestHours: 10 };
const all = sets();
for (const name of (process.env.SETS || Object.keys(all).join(",")).split(",")) {
  const [stf, shf] = all[name];
  const staff = parseStaff(stf).staff, slots = parseShifts(shf).slots;
  const built = [1, 2, 3, 4, 5, 6].map((seed) => ({ seed, r: buildRoster(staff, slots, { ...BASE, seed }) }));
  const best = Math.min(...built.map((b) => b.r.score));
  const tied = built.filter((b) => b.r.score <= best + 1e-6);
  const byCsv = new Map(), byKey = new Map();
  for (const b of tied) { if (!byCsv.has(rosterCsv(b.r))) byCsv.set(rosterCsv(b.r), b); const k = rosterKey(b.r); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(b.seed); }
  const groups = [...byKey.values()].map((seeds) => {
    const r = built.find((b) => b.seed === seeds[0]).r;
    return { seeds, exposure: calloutExposure(staff, slots, r, BASE).exposure };
  });
  const t0 = Date.now();
  const st = steadyRoster(staff, slots, BASE);
  const ms = Date.now() - t0;
  console.log(`${name}: ${tied.length} of 6 seeds at the best score; distinct by file order ${byCsv.size}, by schedule ${byKey.size}`);
  console.log(`  rosters: ${groups.map((g) => `seeds ${g.seeds.join("+")} exposure ${g.exposure}`).join("; ")}`);
  console.log(`  steadyRoster: posts seed ${st.steady.chosenSeed}, exposure ${st.steady.exposure}, ${st.steady.tied.length} tie(s) compared, ${st.steady.rebuilt} rebuilds, ${(ms / 1000).toFixed(1)} s`);
}
