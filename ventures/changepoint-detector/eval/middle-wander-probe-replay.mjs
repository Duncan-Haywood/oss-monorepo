// Probe (decides nothing; eval/middle-wander.prereg.md): Middle (M) against M plus the wander gate (W) replayed daily on
// seeds 9901-9912 of set 3 (KEYS=T4,T5,T6 by default; GSC=1 adds simulated Search Console sites with a 20% fall, cv 0.30).
import { replayWatch, COUNT_MIDDLE } from '../watch-core.mjs';
import { CELLS3, series3 } from './middle-trend-sets.mjs';
import { FROM, labels, AT, series as gsc } from './gsc-sites.mjs';
const ARMS = { M: { ...COUNT_MIDDLE }, W: { ...COUNT_MIDDLE, wander: 'gated' } };
const t0 = Date.now();
const keys = (process.env.KEYS ?? 'T4,T5,T6').split(',');
for (const c of CELLS3.filter((x) => keys.includes(x.key))) {
  const tot = { M: [0, 0, 0], W: [0, 0, 0] };
  for (let s = 9901; s <= 9912; s++) {
    const v = series3(c, s);
    for (const [a, o] of Object.entries(ARMS)) {
      const r = replayWatch(v, labels, { model: 'poisson', ...o, from: FROM, step: 1, budget: Infinity });
      tot[a][0] += r.alerts.length; tot[a][1] += r.alerts.length ? 1 : 0;
      if (c.fall) tot[a][2] += r.alerts.some((x) => Math.abs(labels.indexOf(String(x.label)) - AT) <= 7) ? 1 : 0;
    }
  }
  console.log(c.key, JSON.stringify(tot), ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
if (process.env.GSC) for (const base of [50, 400, 3000]) {
  const tot = { M: [0, 0], W: [0, 0] };
  for (let s = 9901; s <= 9908; s++) { const v = gsc(s, base, 0.2, 0.3); for (const [a, o] of Object.entries(ARMS)) { const r = replayWatch(v, labels, { model: 'poisson', ...o, from: FROM, step: 1, budget: Infinity }); tot[a][0] += r.alerts.length; tot[a][1] += r.alerts.some((x) => Math.abs(labels.indexOf(String(x.label)) - AT) <= 7) ? 1 : 0; } }
  console.log('gsc 20% cv.3', base, JSON.stringify(tot));
}
