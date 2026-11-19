// The panel-relative gap-shape word (panelShapes, synth-control.mjs) on the two real few-donor panels of
// eval/synth-donor-shape-real.mjs, beside the plain word: each placebo's late/early mean-square ratio, both words, and
// whether it ranks at or above the treated unit. A description run after the confirmatory simulation; nothing here
// was pre-registered or decides a bar.
//   node eval/synth-shape-trend-real.mjs > eval/synth-shape-trend-real.out.txt
import { readFileSync } from 'node:fs';
import { synthControlTest } from '../synth-control.mjs';

const read = (f) => readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8');
const PANELS = [
  { name: 'West Germany 1990', csv: read('oecd-gdp-per-capita-1960-2003.csv'), column: 'WestGermany', date: 1990, window: '1960:2003' },
  { name: 'Basque Country 1970', csv: read('spain-regions-gdp-per-capita.csv'), column: 'BAS', date: 1970, window: '1955:1997' },
];
for (const P of PANELS) {
  const [head, ...lines] = P.csv.trim().split('\n').map((l) => l.split(','));
  const [lo, hi] = P.window.split(':').map(Number), body = lines.filter((l) => +l[0] >= lo && +l[0] <= hi);
  const col = (name) => body.map((l) => +l[head.indexOf(name)]);
  const t = synthControlTest(col(P.column), Object.fromEntries(head.slice(1).filter((c) => c !== P.column).map((c) => [c, col(c)])), body.findIndex((l) => +l[0] === P.date));
  const count = (k) => t.placebos.reduce((c, q) => { c[q.gapShape[k]] += 1; return c; }, { held: 0, grew: 0, faded: 0 });
  console.log(`== ${P.name}: rank ${t.rank} of ${t.donors + 1}; panel centre (median late/early mean square) ${t.shapeCentre.toFixed(2)}, rule ${t.shapeRelative ? 'switched on' : 'off'}; treated gap: plain ${t.gapShape.shape}, hybrid ${t.gapShape.relShape}`);
  console.log(`   placebos plain ${JSON.stringify(count('shape'))}, hybrid ${JSON.stringify(count('relShape'))}`);
  for (const q of t.placebos) console.log(`   ${q.name.padEnd(12)} ratio ${(q.gapShape.late ** 2 / q.gapShape.early ** 2).toFixed(1).padStart(6)}  plain ${q.gapShape.shape.padEnd(5)} hybrid ${q.gapShape.relShape.padEnd(5)}${q.floored >= t.tests.floored.value ? '  ranked at or above' : ''}`);
}
