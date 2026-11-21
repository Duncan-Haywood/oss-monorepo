// Probe (decides nothing; eval/middle-wander.prereg.md): the shipped wander gate's statistic (watch-core.mjs wanderGate;
// log n subtracted, open above 0) on the first 200 days of probe series, seeds 9901-9910, for each cell of sets 2 and 3
// and simulated Search Console sites (cv 0.30). Each entry: margin/jumps the drift fit placed.
import { wanderGate } from '../watch-core.mjs';
import { CELLS3, series3, CELLS2, lcg, N2 } from './middle-trend-sets.mjs';
import { series as gsc } from './gsc-sites.mjs';
const fmt = (g) => `${g.margin == null ? 'shut' : g.margin.toFixed(1)}/${g.jumps.length}`;
const S = Array.from({ length: 10 }, (_, i) => 9901 + i);
for (const c of CELLS3) console.log(c.key, S.map((s) => fmt(wanderGate(series3(c, s).slice(0, 200)))).join(' '));
for (const base of [50, 400, 3000]) for (const fall of [0, 0.2]) console.log('gsc', base, fall, S.map((s) => fmt(wanderGate(gsc(s, base, fall, 0.3).slice(0, 200)))).join(' '));
for (const c of CELLS2) console.log(c.key, S.map((s) => { const u = lcg(s * 2654435761 + c.key.charCodeAt(1) * 97); return fmt(wanderGate(Array.from({ length: N2 }, (_, i) => c.gen(u, i)).slice(0, 200))); }).join(' '));
