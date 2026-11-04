// noiseFloor k (CLI --noise-floor k): sigma is at least k x the median absolute step. Two questions:
// (1) does it cure the smooth-series over-cut (austres)? (2) does it leave real step series alone (synthetic white-noise
// steps, 200 seeds; and every committed real CSV that has steps)? usage: node eval/noise-floor.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/austres.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const aus = rows.map((r) => Math.log(+r[1]));
console.log('austres (no documented break), changes found by k:');
for (const [name, opt] of [['trend', { model: 'trend' }], ['mean, ar1 auto', { model: 'mean', ar1: 'auto' }]])
  console.log(`  ${name}: ` + [0, 0.5, 1, 2].map((k) => `k=${k}: ${analyze({ values: aus, ...opt, noiseFloor: k }).pelt.changepoints.length}`).join(', '));
let s = 12345; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
let differ = 0, hit = 0, base = 0, floored = 0;
for (let r = 0; r < 200; r++) {
  const v = Array.from({ length: 120 }, (_, i) => (i < 60 ? 0 : 1.5) + gauss());
  const a = analyze({ values: v, model: 'mean' }), b = analyze({ values: v, model: 'mean', noiseFloor: 1 });
  if (JSON.stringify(a.pelt.changepoints) !== JSON.stringify(b.pelt.changepoints)) differ++;
  if (a.pelt.changepoints.length === 1 && Math.abs(a.pelt.changepoints[0].index - 60) <= 3) base++;
  if (b.pelt.changepoints.length === 1 && Math.abs(b.pelt.changepoints[0].index - 60) <= 3) floored++;
  if (b.noiseFloor) hit++;
}
console.log(`200 synthetic series, one 1.5-sd step at 60: found with k=0 ${base}, with k=1 ${floored}; floor changed the answer on ${differ}; floor bound on ${hit}`);
// (3) a drifting real series WITH a documented break: US airline passenger miles, 1937-1960, in logs (the 1946 end of
// the war, eval/airmiles.mjs). Which k keep it? Together with austres above this brackets k.
const am = readFileSync(new URL('../data/airmiles.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const av = am.map((r) => Math.log(+r[1]));
console.log('airmiles (documented break 1946), trend, changes found by k:');
console.log('  ' + [0, 0.5, 1, 1.5, 2, 3].map((k) => `k=${k}: ` + (analyze({ values: av, model: 'trend', noiseFloor: k }).pelt.changepoints.map((c) => am[c.index][0]).join('+') || 'none')).join(', '));
