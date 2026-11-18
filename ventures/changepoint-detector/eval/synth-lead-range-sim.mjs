// Simulation: an uncertain lead. README "A shock before the date" ended "Next: ... a lead that is uncertain (a range
// of backdates reported together without picking the best p)". Pre-registration eval/synth-lead-range-prereg-2026-11-18.md.
// Panels from eval/synth-anticip-sim.mjs (cell N1: 39 units, 19 points before the stated date, 12 after; Z and W).
// Each panel is fitted at every backdate 0..4 (synthLeadRange, outcome-only fit, floored ratio). Per panel we keep:
//   p0          the stated date's p (the default today)
//   pOracle     the p backdated by the true lead (what --anticipation gives when the lead is known)
//   naive       the smallest p over the five leads (trying leads and keeping the best: not a test)
//   pRange      the permutation min-p over the range (synthLeadRange's one p for the range)
//   pMean       the floored statistic averaged over the leads, ranked among the units (synthLeadRange)
//   pMaxScaled  each unit's largest lead statistic, each lead's divided by its median over the units, ranked
//   pBonf       min(1, 5 x naive), the textbook correction, for comparison
//   maxP        the largest p over the leads
// Cells: A0 nothing; A4 a covariate shock (beta 1.0) 4 points early, no effect; E0, E2, E4 effect -1 from 0, 2, 4
// points before the stated date.
//   SC_SEED_BASE=81000 SC_SHARD=0/4 node eval/synth-lead-range-sim.mjs 50 > part0.json
import { synthLeadRange } from '../synth-control.mjs';
import { CELLS as ANT, anticipPanel } from './synth-anticip-sim.mjs';
import { seedOf } from './synth-floor-sim.mjs';

export const CELLS = { A0: ANT.A0, A4: ANT.A4, E0: ANT.E0, E2: ANT.E2, E4: ANT.E4 };
export const LEADS = [0, 1, 2, 3, 4];

export function scorePanel(cell, seed) {
  const { rows } = anticipPanel(cell, seed);
  const donors = Object.fromEntries(rows.slice(1).map((d, j) => [`d${j}`, d]));
  const r = synthLeadRange(rows[0], donors, cell.k, LEADS);
  const at = (l) => r.leads.find((e) => e.lead === l);
  return {
    p0: at(0).p, pOracle: at(cell.lead).p, naive: r.naiveMinP, pRange: r.pRange, pMean: r.pMean, pMaxScaled: r.pMaxScaled, pBonf: Math.min(1, LEADS.length * r.naiveMinP), maxP: r.maxP,
    bestLead: r.bestLead, gap0: at(0).gapFromDate, gapOracle: at(cell.lead).gapFromDate, gapBest: at(r.bestLead).gapFromDate,
  };
}

if (process.argv[1]?.endsWith('synth-lead-range-sim.mjs')) {
  const reps = Number(process.argv[2] ?? 50);
  const base = Number(process.env.SC_SEED_BASE ?? 81000);
  const [si, sn] = (process.env.SC_SHARD ?? '0/1').split('/').map(Number);
  const names = Object.keys(CELLS);
  for (const name of process.env.SC_CELLS ? process.env.SC_CELLS.split(',') : names) {
    const ci = names.indexOf(name);
    for (let rep = 0; rep < reps; rep++) if (rep % sn === si) console.log(JSON.stringify({ cell: name, rep, ...scorePanel(CELLS[name], seedOf(base, ci, rep)) }));
  }
}
