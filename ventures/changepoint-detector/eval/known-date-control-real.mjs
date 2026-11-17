// Real pairs for the known-date test with a control series (eval/known-date-prereg-control-2026-11-17.md), 999
// replicates, seed 1, round 5's settings plus controlMode 'difference'. node eval/known-date-control-real.mjs
import { readFileSync } from 'node:fs';
import { knownDateTest } from '../known-date.mjs';
const read = (f) => { const [h, ...rows] = readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8').trim().split('\n'); return { head: h.split(','), rows: rows.map((l) => l.split(',')) }; };
const col = (f, name) => { const d = read(f), j = d.head.indexOf(name); return { labels: d.rows.map((r) => r[0]), values: d.rows.map((r) => Math.log(+r[j])) }; };
const f = (v, p = 3) => Number(v).toFixed(p);
function run(tag, s, c, date, { period = 12, upTo = null } = {}, verdict) {
  let { labels, values } = s, ctl = c.values;
  if (upTo) { const e = labels.indexOf(upTo); labels = labels.slice(0, e); values = values.slice(0, e); ctl = ctl.slice(0, e); }
  const k = labels.indexOf(date);
  const h = knownDateTest(values, k, { period, reps: 999, seed: 1, rhoGenMethod: 'gated', gateRho: 0.5, control: ctl, controlMode: 'difference' });
  if (h.refused) { console.log(`${tag}: refused (${h.reason}); prediction NOT MET`); return h; }
  console.log(`${tag}: date ${date} (k ${k}, n ${h.n}), logs, period ${period}${upTo ? `, rows before ${upTo}` : ''}`);
  console.log(`  step ${f(h.step)} [${f(h.stepRange95[0])}, ${f(h.stepRange95[1])}] p ${f(h.pStep, 4)}; slope ${f(h.slopeBefore, 4)} + ${f(h.slopeChange, 4)} [${f(h.slopeChangeRange95[0], 4)}, ${f(h.slopeChangeRange95[1], 4)}] p ${f(h.pSlope, 4)}`);
  console.log(`  joint F ${f(h.f, 2)}, bootstrap p ${f(h.p, 4)}, F-table p ${f(h.pTable, 4)}; rho ${f(h.rho)}${h.gated ? ' (gated)' : ''}${h.admittedByCut ? ', ADMITTED BY THE CUT' : ''}`);
  if (verdict) console.log(`  prediction: ${verdict(h) ? 'MET' : 'NOT MET'}`);
  return h;
}
const RC = 'uk-road-casualties.csv', rear = col(RC, 'rear');
run('R1 drivers - rear', col(RC, 'drivers'), rear, '1983-02', {}, (h) => h.pStep <= 0.01 && h.step >= -0.40 && h.step <= -0.10 && h.pSlope > 0.05);
run('R2 front - rear', col(RC, 'front'), rear, '1983-02', {}, (h) => h.pStep <= 0.01 && h.step < 0 && h.pSlope > 0.05);
let hits = 0;
for (const d of ['1974-01', '1977-01', '1980-01']) { const h = run('R3 placebo drivers - rear', col(RC, 'drivers'), rear, d, { upTo: '1983-02' }); if (!h.refused && !h.admittedByCut && h.p <= 0.05) hits++; }
console.log(`R3: ${hits} of 3 placebo dates with joint p <= 0.05 (prediction at most 1: ${hits <= 1 ? 'MET' : 'NOT MET'})`);
let hits4 = 0;
for (const d of ['1976-01', '1977-01']) { const h = run('R4 placebo male - female lung deaths', col('uk-mdeaths.csv', 'deaths'), col('uk-fdeaths.csv', 'deaths'), d); if (!h.refused && !h.admittedByCut && h.p <= 0.05) hits4++; }
console.log(`R4: ${hits4} of 2 placebo dates with joint p <= 0.05 (prediction at most 1: ${hits4 <= 1 ? 'MET' : 'NOT MET'})`);
