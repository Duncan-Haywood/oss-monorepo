// Real series for knownDateTest (eval/known-date-prereg-2026-11-16.md), 999 replicates, seed 1, the shipped settings
// (round 3: matched rho, random-walk cut guard). Round 1's output, with its settings, is eval/known-date-real-round1.out.txt. node eval/known-date-real.mjs
// Round 4 (eval/known-date-prereg-round4-2026-11-16.md): `node eval/known-date-real.mjs upper` (output eval/known-date-real-round4.out.txt).
// Round 5 (eval/known-date-prereg-round5-2026-11-16.md): `node eval/known-date-real.mjs gated` (eval/known-date-real-round5.out.txt).
import { readFileSync } from 'node:fs';
import { knownDateTest } from '../known-date.mjs';
const read = (f) => { const [h, ...rows] = readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8').trim().split('\n'); return { head: h.split(','), rows: rows.map((l) => l.split(',')) }; };
const col = (f, name) => { const d = read(f), j = d.head.indexOf(name); return { labels: d.rows.map((r) => r[0]), values: d.rows.map((r) => +r[j]) }; };
const f = (v, p = 3) => Number(v).toFixed(p);
function run(tag, { labels, values }, date, { log = false, period = 0 } = {}, verdict) {
  const k = labels.indexOf(date), x = log ? values.map(Math.log) : values;
  const h = knownDateTest(x, k, { period, reps: 999, seed: 1, ...(['upper', 'gated'].includes(process.argv[2]) ? { rhoGenMethod: process.argv[2] } : {}) });
  if (h.refused) { console.log(`${tag}: refused (${h.reason})`); return h; }
  console.log(`${tag}: date ${date} (k ${k}, n ${h.n})${log ? ', logs' : ''}${period ? `, period ${period}` : ''}`);
  console.log(`  step ${f(h.step)} [${f(h.stepRange95[0])}, ${f(h.stepRange95[1])}] p ${f(h.pStep, 4)}; slope ${f(h.slopeBefore, 4)} + ${f(h.slopeChange, 4)} [${f(h.slopeChangeRange95[0], 4)}, ${f(h.slopeChangeRange95[1], 4)}] p ${f(h.pSlope, 4)}`);
  console.log(`  joint F ${f(h.f, 2)}, bootstrap p ${f(h.p, 4)}, F-table p ${f(h.pTable, 4)}; rho ${f(h.rho)}; effect average ${f(h.effectAverage)}, at end ${f(h.effectAtEnd)}`);
  console.log(`  prediction: ${verdict(h) ? 'MET' : 'NOT MET'}`);
  return h;
}
run('A drivers KSI', col('uk-driver-deaths.csv', 'deaths'), '1983-02', { log: true, period: 12 }, (h) => h.p <= 0.01 && h.step >= -0.35 && h.step <= -0.05);
run('B front passengers', col('uk-road-casualties.csv', 'front'), '1983-02', { log: true, period: 12 }, (h) => h.p <= 0.01 && h.step < 0);
run('C rear passengers (control)', col('uk-road-casualties.csv', 'rear'), '1983-02', { log: true, period: 12 }, (h) => h.pStep > 0.05 || h.step >= 0);
run('D Nile', col('nile.csv', 'volume'), '1899', {}, (h) => h.p <= 0.01 && h.step < 0);
let hits = 0;
for (const d of ['1925-01', '1930-01', '1935-01']) { const h = run(`E nottem placebo`, col('nottem.csv', 'temp_f'), d, { period: 12 }, (h) => h.p > 0.05); if (!h.refused && h.p <= 0.05) hits++; }
console.log(`E: ${hits} of 3 placebo dates with joint p <= 0.05 (prediction at most 1: ${hits <= 1 ? 'MET' : 'NOT MET'})`);
