// `driftWarning` on trendless monthly seasonal series (no trend confound), 72 months each:
// UK deaths from bronchitis, emphysema and asthma 1974-79 (all, male, female; the cold-winter/flu peak of
// January 1976 is the dated shock) and US accidental deaths 1973-78 (not a null after all: see us-accidental-deaths.mjs).
// usage: node eval/drift-warning-trendless.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const SERIES = [
  ['UK lung deaths, all (Jan 1976 peak)', 'uk-ldeaths.csv'],
  ['UK lung deaths, male (Jan 1976 peak)', 'uk-mdeaths.csv'],
  ['UK lung deaths, female (Jan 1976 peak)', 'uk-fdeaths.csv'],
  ['US accidental deaths (drop at 1973-12 in every seasonal setup: eval/us-accidental-deaths.mjs)', 'us-accidental-deaths.csv'],
];
for (const [name, file] of SERIES) {
  const rows = readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  const labels = rows.map((r) => r[0]), raw = rows.map((r) => +r[1]);
  console.log(name);
  for (const [scale, v] of [['raw', raw], ['log', raw.map(Math.log)]]) {
    for (const trend of [undefined, 'bend']) {
      const r = analyze({ values: v, labels, period: 12, drift: true, trend });
      const cps = r.pelt.changepoints.map((c) => `${c.label}${c.shift > 0 ? '+' : '-'}`).join(' ');
      console.log(`  ${scale} ${(trend || 'no trend').padEnd(8)} steps ${String(r.pelt.changepoints.length).padStart(2)}  warning ${r.driftWarning ? 'yes' : 'no '}  ${cps}`);
    }
  }
}
