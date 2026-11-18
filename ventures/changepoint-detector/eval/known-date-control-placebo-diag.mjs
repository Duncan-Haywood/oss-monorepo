// After the control pre-registration failed R3 (not pre-registered; a diagnosis): the same placebo dates on the
// treated series alone and on the control alone, round 5's test, 999 replicates. node eval/known-date-control-placebo-diag.mjs
import { readFileSync } from 'node:fs';
import { knownDateTest } from '../known-date.mjs';
const read = (f) => { const [h, ...rows] = readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8').trim().split('\n'); return { head: h.split(','), rows: rows.map((l) => l.split(',')) }; };
const d = read('uk-road-casualties.csv'), e = d.rows.findIndex((r) => r[0] === '1983-02');
const col = (name) => d.rows.slice(0, e).map((r) => Math.log(+r[d.head.indexOf(name)]));
const labels = d.rows.slice(0, e).map((r) => r[0]);
for (const name of ['drivers', 'front', 'rear', 'drivers-rear', 'front-rear']) {
  const [a, b] = name.split('-'), x = b ? col(a).map((v, t) => v - col(b)[t]) : col(a);
  for (const date of ['1974-01', '1977-01', '1980-01']) {
    const h = knownDateTest(x, labels.indexOf(date), { period: 12, reps: 999, seed: 1, rhoGenMethod: 'gated', gateRho: 0.5 });
    console.log(`${name.padEnd(13)} ${date}: ${h.refused ? `refused (${h.reason.slice(0, 60)}...)` : `joint p ${h.p.toFixed(3)}, step p ${h.pStep.toFixed(3)}, slope change ${h.slopeChange.toFixed(4)} p ${h.pSlope.toFixed(3)}, rho ${h.rho.toFixed(2)}${h.admittedByCut ? ' (cut-admitted)' : ''}`}`);
  }
}
