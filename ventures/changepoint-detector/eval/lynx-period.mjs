// Lynx trappings (1821-1934, ~10-year cycle, no documented step): does telling the tool the period remove the
// cycle-as-steps false alarms? Every changepoint is a false alarm. Run: node eval/lynx-period.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';

const rows = readFileSync(new URL('../data/lynx.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
export const d = { labels: rows.map((r) => r[0]), values: rows.map((r) => +r[1]) };
export const SETUPS = {};
for (const p of [8, 9, 10, 11, 12]) {
  SETUPS[`--period ${p}`] = { period: p };
  SETUPS[`--log --period ${p}`] = { period: p, log: true };
}
SETUPS['--period 10 --drift'] = { period: 10, drift: true };
export const count = (o) => analyze({ ...d, ...o }).pelt.changepoints.length;

if (process.argv[1] === new URL(import.meta.url).pathname) {
  for (const [k, o] of Object.entries(SETUPS)) console.log(k.padEnd(24), count(o));
}
