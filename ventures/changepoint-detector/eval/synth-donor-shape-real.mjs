// The gap-shape word (gapShape, README "A donor's own event that is not a step") on the two real few-donor panels of
// eval/synth-few-donors-real.mjs: each unit ranked at or above the treated one, with its own gap's first and last
// third and the word the "ranked above" note prints. A description; nothing here was pre-registered or decides a bar.
//   node eval/synth-donor-shape-real.mjs > eval/synth-donor-shape-real.out.txt
import { readFileSync } from 'node:fs';
import { synthResult } from '../synth-cli.mjs';
import { aboveNote } from '../synth-view.mjs';
import { gapShape, synthControlTest } from '../synth-control.mjs';

const read = (f) => readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8');
const PANELS = [
  { name: 'West Germany 1990', csv: read('oecd-gdp-per-capita-1960-2003.csv'), column: 'WestGermany', date: 1990, window: '1960:2003' },
  { name: 'Basque Country 1970', csv: read('spain-regions-gdp-per-capita.csv'), column: 'BAS', date: 1970, window: '1955:1997' },
];
for (const P of PANELS) {
  const r = synthResult({ csv: P.csv, column: P.column, date: P.date, donors: ['all'], window: P.window });
  console.log(`== ${P.name}: rank ${r.rank} of ${r.donors + 1}; units at or above: ${r.above.map((q) => `${q.name} ${q.gapShape ?? 'none'} (weight ${q.weight.toFixed(3)})`).join(', ')}`);
  const own = gapShape(r.gap.slice(r.labels.indexOf(r.firstAfter)));
  // every placebo's word, from the same fit on the parsed wide CSV (one row per year, one column per unit)
  const [head, ...lines] = P.csv.trim().split('\n').map((l) => l.split(','));
  const [lo, hi] = P.window.split(':').map(Number), body = lines.filter((l) => +l[0] >= lo && +l[0] <= hi);
  const col = (name) => body.map((l) => +l[head.indexOf(name)]);
  const t = synthControlTest(col(P.column), Object.fromEntries(head.slice(1).filter((c) => c !== P.column).map((c) => [c, col(c)])), body.findIndex((l) => +l[0] === P.date));
  const counts = {};
  for (const q of t.placebos) counts[q.gapShape.shape] = (counts[q.gapShape.shape] ?? 0) + 1;
  if (t.rank !== r.rank) throw new Error('the parsed fit does not match synthResult');
  console.log(`treated unit's own gap: ${own.shape} (first third RMS ${own.early.toPrecision(3)}, last ${own.late.toPrecision(3)}); all ${r.donors} placebos: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`note: ${aboveNote(r)}`);
  console.log('');
}
