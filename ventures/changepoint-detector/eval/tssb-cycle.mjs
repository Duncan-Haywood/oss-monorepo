// After the TSSB round (eval/tssb.mjs; T1 failed): does the existing cycle warning (the spectral peak
// test on the level model's residuals, engine.mjs `cycleWarning`) fire on the series where the
// every-setting consensus over-cuts? Descriptive only, run after the round's verdicts; it decides
// nothing and is the evidence a later pre-registered guard would start from.
// usage: node eval/tssb-cycle.mjs tssb-data [cache-dir] > eval/tssb-cycle.out.txt
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyze } from '../engine.mjs';
import { covering } from './tcpd-metrics.mjs';
import { parseDesc, clean } from './tssb.mjs';

const [, , DIR = 'tssb-data', CACHE = join(DIR, 'cache')] = process.argv;
const D = join(DIR, 'tssb', 'datasets');
const desc = parseDesc(readFileSync(join(D, 'desc.txt'), 'utf8'));
const rows = desc.map((d) => {
  const values = readFileSync(join(D, `${d.name}.txt`), 'utf8').trim().split('\n').map(Number);
  const n = values.length;
  const c = JSON.parse(readFileSync(join(CACHE, `${d.name}.json`), 'utf8'));
  const every = clean(c.cps['consensus: every setting'], n);
  const cyc = !!analyze({ values }).cycleWarning;
  const ann = { 0: d.cps };
  return { name: d.name, n, every: every.length, cyc, cover: covering(ann, every, n), zero: covering(ann, [], n) };
});
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const groups = [['cycle warning fires', rows.filter((r) => r.cyc)], ['cycle warning quiet', rows.filter((r) => !r.cyc)]];
console.log(`TSSB, ${rows.length} series: the level model's cycle warning against the every-setting consensus.`);
for (const [nm, g] of groups) {
  const withAgreed = g.filter((r) => r.every > 0);
  console.log(`  ${nm}: ${g.length} series; ${withAgreed.length} with agreed changes (${g.reduce((s, r) => s + r.every, 0)} in all); every-setting cover ${mean(g.map((r) => r.cover)).toFixed(3)}, zero ${mean(g.map((r) => r.zero)).toFixed(3)}`);
}
const over = rows.filter((r) => r.every >= 10);
console.log(`  of the ${over.length} series with 10 or more agreed changes, the cycle warning fires on ${over.filter((r) => r.cyc).length}`);
const hypo = rows.map((r) => (r.cyc ? r.zero : r.cover));
console.log(`  hypothetical (post hoc, not a rule): dropping agreed changes where the warning fires gives cover ${mean(hypo).toFixed(3)} (zero ${mean(rows.map((r) => r.zero)).toFixed(3)}, as run ${mean(rows.map((r) => r.cover)).toFixed(3)})`);
console.log('\nPer series with any agreed change: name, n, agreed, cycle warning.');
for (const r of rows.filter((r) => r.every > 0 || r.cyc)) console.log(`  ${r.name.padEnd(30)} n ${String(r.n).padStart(5)}  agreed ${String(r.every).padStart(2)}  ${r.cyc ? 'cycle' : '-'}`);
