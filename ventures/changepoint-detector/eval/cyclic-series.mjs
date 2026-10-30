// False alarms on two real cyclic series with no documented step: lynx trappings (1821-1934, ~10-year cycle) and
// yearly sunspot numbers (1700-1988, ~11-year cycle). Every changepoint is a false alarm. Run: node eval/cyclic-series.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';

const load = (f) => {
  const rows = readFileSync(new URL(`../data/${f}.csv`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  return { labels: rows.map((r) => r[0]), values: rows.map((r) => +r[1]) };
};
export const SETUPS = {
  'mean': {},
  '--min-segment 20': { minSegment: 20 },
  '--ar1': { ar1: true },
  '--ar1 joint': { ar1: 'joint' },
  'meanvar --bootstrap': { model: 'meanvar', bootstrap: true },
};
export const count = (d, o) => analyze({ ...d, ...o }).pelt.changepoints.length;

if (process.argv[1] === new URL(import.meta.url).pathname) {
  for (const f of ['lynx', 'sunspot-year']) {
    const d = load(f);
    console.log(`${f} (n=${d.values.length})`);
    for (const [k, o] of Object.entries(SETUPS)) console.log(`  ${k.padEnd(22)} ${count(d, o)}`);
  }
}
