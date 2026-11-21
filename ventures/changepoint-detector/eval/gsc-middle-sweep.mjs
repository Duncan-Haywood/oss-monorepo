// A middle "How eager" setting for over-dispersed daily counts (README "A middle setting for over-dispersed counts").
// The same simulated sites as eval/gsc-watch-sim.mjs (not real Search Console data): 240 days, weekends at 70%, a gamma
// day multiplier (cv 15%) beyond Poisson, base 50/400/3000 clicks a day, a lasting fall of 0/10/20/40% on day 180, the
// watch run each day from day 120. One candidate setting per run, a seed range per run, so tuning and the fresh check
// use disjoint seeds (eval/gsc-middle.prereg.md).
//   node eval/gsc-middle-sweep.mjs '<json watch options>' <first seed> <last seed> [cv]
// Prints one JSON line per cell: { base, fall, seeds, heard, delays, falseA, watched, chance }.
// chance: on the no-fall series, the share of seeds with any alert inside the 15-day window around day 180 that a
// fall's alert would count in, so "heard" can be read against what false alerts alone would give.
import { replayWatch } from '../watch-core.mjs';
import { N, AT, FROM, labels, series } from './gsc-sites.mjs';

const opts = JSON.parse(process.argv[2] ?? '{}');
const S0 = Number(process.argv[3] ?? 1), S1 = Number(process.argv[4] ?? 20), CV = Number(process.argv[5] ?? 0.15);
for (const base of [50, 400, 3000]) for (const fall of [0, 0.1, 0.2, 0.4]) {
  let heard = 0, falseA = 0, watched = 0, chance = 0; const delays = [];
  for (let s = S0; s <= S1; s++) {
    const r = replayWatch(series(s, base, fall, CV), labels, { model: 'poisson', ...opts, from: FROM, step: 1, budget: Infinity });
    let got = null, inWin = false;
    for (const a of r.alerts) {
      const idx = labels.indexOf(String(a.label));
      if (!fall && Math.abs(idx - AT) <= 7 && a.reportedAt >= AT) inWin = true;
      if (fall && Math.abs(idx - AT) <= 7 && a.reportedAt >= AT) { if (got == null) got = a.reportedAt - AT; }
      else if (!fall || a.reportedAt < AT) falseA++;
    }
    if (inWin) chance++;
    watched += fall ? AT - FROM : N - FROM;
    if (got != null) { heard++; delays.push(got); }
  }
  console.log(JSON.stringify({ base, fall, seeds: S1 - S0 + 1, heard, delays, falseA, watched, chance }));
}
