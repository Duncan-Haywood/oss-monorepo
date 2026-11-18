// Time and court limits on random leagues (2026-11-18): how often the slot search leaves a limit
// broken in a round where an exact assignment keeps them all, and whether limitConflicts() names
// the leagues where some round cannot keep them.
// Run: node eval/limit-conflicts.mjs [leagues=300]  (writes nothing; eval/limit-conflicts.txt holds a run)
import { buildSchedule, parseDate, mulberry32, legalRoundSlots, limitConflicts } from "../calc.mjs";

const N = Number(process.argv[2] || 300);
const rand = mulberry32(777);
const tally = { leagues: 0, rounds: 0, feasibleRounds: 0, brokenInFeasibleRounds: 0, infeasibleRounds: 0, deadPairRounds: 0, crowdRounds: 0,
  leaguesWithInfeasibleRound: 0, flagged: 0, flaggedWithInfeasibleRound: 0, infeasibleUnflagged: 0 };
for (let trial = 0; trial < N; trial++) {
  const n = 6 + Math.floor(rand() * 11);
  const per = Math.floor(n / 2);
  const nc = 1 + Math.floor(rand() * 3);
  const nt = Math.ceil(per / nc) + Math.floor(rand() * 2);
  const courts = Array.from({ length: nc }, (_, i) => `C${i + 1}`);
  const times = Array.from({ length: nt }, (_, i) => `${17 + i}:00`);
  const teams = Array.from({ length: n }, (_, i) => `T${i + 1}`);
  const k = 1 + Math.floor(rand() * Math.min(5, n));
  const tl = {}, cl = {};
  const pick = (arr) => { const s = arr.filter(() => rand() < 0.5); return s.length ? s : [arr[Math.floor(rand() * arr.length)]]; };
  for (let j = 0; j < k; j++) { const t = Math.floor(rand() * n); if (rand() < 0.7 || nc === 1) tl[t] = pick(times); else cl[t] = pick(courts); }
  const s = buildSchedule({ teams, start: parseDate("2027-01-05"), weekdays: [2], courts, times, timeLimits: tl, courtLimits: cl, seed: 1 + trial });
  tally.leagues++;
  const legal = (m, slot) => [m.home, m.away].every((x) => (!tl[x] || tl[x].includes(times[Math.floor(slot / nc)])) && (!cl[x] || cl[x].includes(courts[slot % nc])));
  const open = Array.from({ length: nc * nt }, (_, i) => i);
  let anyInfeasible = false;
  for (const r of s.rounds) {
    tally.rounds++;
    const ms = r.matches.map((m) => ({ ...m, slot: -1 }));
    const feasible = legalRoundSlots(ms, open, legal) !== null;
    const broken = r.matches.some((m) => !legal(m, m.slot));
    if (feasible) { tally.feasibleRounds++; if (broken) tally.brokenInFeasibleRounds++; }
    else {
      tally.infeasibleRounds++; anyInfeasible = true;
      if (r.matches.some((m) => !open.some((k2) => legal(m, k2)))) tally.deadPairRounds++; else tally.crowdRounds++;
    }
  }
  const c = limitConflicts(teams, { times, courts, timeLimits: tl, courtLimits: cl });
  if (anyInfeasible) tally.leaguesWithInfeasibleRound++;
  if (c.length) { tally.flagged++; if (anyInfeasible) tally.flaggedWithInfeasibleRound++; }
  else if (anyInfeasible) tally.infeasibleUnflagged++;
}
console.log(JSON.stringify(tally, null, 1));
