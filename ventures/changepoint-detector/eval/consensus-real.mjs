// The --consensus panel on real series with a documented break (README, "--consensus on real series").
// usage: node eval/consensus-real.mjs
import { readFileSync } from 'node:fs';
import { consensus } from '../consensus.mjs';
const load = (f, col) => {
  const rows = readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  return { labels: rows.map((r) => r[0]), values: rows.map((r) => +r[col]) };
};
const SERIES = [
  ['UK drivers killed or seriously injured (log, period 12); seat-belt law 1983-01-31', 'uk-driver-deaths.csv', 1, { log: true, period: 12 }, '1983-02'],
  ['Lake Huron level, 1875-1972; a level drop near 1920 (recalled, no paper read)', 'lake-huron.csv', 1, {}, '1925'],
  ['Nile annual flow, 1871-1970; published 1898 change (Cobb 1978)', 'nile.csv', 1, {}, '1899'],
  ['Global temperature, annual; the 1946 step the earlier trials dated', 'global-temp-annual.csv', 1, {}, '1946'],
];
for (const [title, file, col, base, truth] of SERIES) {
  const { labels, values } = load(file, col);
  const c = consensus({ values, labels, ...base });
  const hit = c.changes.find((x) => x.label === truth || String(x.label).startsWith(truth));
  console.log(`\n${title}`);
  console.log(`  n ${values.length}, tolerance ${c.tolerance}, settings ${c.settings.length}; cuts per setting: ${c.settings.map((s) => s.changes).join(', ')}`);
  console.log(`  documented ${truth}: ${hit ? `${hit.label} found by ${hit.support}/${hit.of} (${hit.tier})` : 'not in the list'}`);
  for (const x of c.changes.filter((y) => y.tier !== 'few')) console.log(`  ${x.label}  ${x.support}/${x.of}  ${x.direction}  ${x.tier}`);
}
