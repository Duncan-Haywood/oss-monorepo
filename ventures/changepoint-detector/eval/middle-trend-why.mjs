// Why MR (--trend robust) still alerts on growing sites (README "A Middle that allows for growth", "Why, not measured
// here"): per daily check on set 3's T1 generator, whether the gate kept the growth term, the growth read, and the
// steps PELT put in the window, beside the replayed alerts. A diagnostic on probe seeds (9301-9310 by default) that no
// bar uses; it decides nothing.   node eval/middle-trend-why.mjs [first-seed] [count] [cell]
import { analyze } from '../engine.mjs';
import { replayWatch, COUNT_MIDDLE } from '../watch-core.mjs';
import { FROM, labels as GLABELS } from './gsc-sites.mjs';
import { series3, CELLS3 } from './middle-trend-sets.mjs';

const first = Number(process.argv[2] ?? 9301), count = Number(process.argv[3] ?? 10), key = process.argv[4] ?? 'T1';
const c = CELLS3.find((x) => x.key === key);
let keptAll = 0, checksAll = 0;
for (let seed = first; seed < first + count; seed++) {
  const v = series3(c, seed);
  const rows = [];
  for (let end = FROM; end <= v.length; end++) {
    const r = analyze({ model: 'poisson', overdispersion: 'nb', trend: 'robust', values: v.slice(0, end), labels: GLABELS.slice(0, end) });
    const kept = !r.trendNote;
    rows.push({ end, kept, g: r.trend?.logGrowthAcrossSeries ?? null, cps: r.pelt.changepoints.map((p) => p.index) });
    keptAll += kept; checksAll++;
  }
  const rep = replayWatch(v, GLABELS, { model: 'poisson', ...COUNT_MIDDLE, trend: 'robust', from: FROM, step: 1, budget: Infinity });
  const flips = rows.slice(1).filter((r, i) => r.kept !== rows[i].kept).length;
  console.log(`seed ${seed}: kept ${rows.filter((r) => r.kept).length}/${rows.length} checks, ${flips} flips; alerts ${rep.alerts.map((a) => `${a.index}@${a.reportedAt}`).join(' ') || 'none'}`);
  for (const a of rep.alerts) { const r = rows.find((x) => x.end === a.reportedAt + 1); console.log(`   at ${a.reportedAt}: kept ${r?.kept} g ${r?.g} steps ${r?.cps.join(',')}`); }
}
console.log(`kept ${keptAll}/${checksAll}`);
