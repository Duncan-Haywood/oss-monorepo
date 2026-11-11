// The repeat-handling options of the drift model (drift-level.mjs repeats 'drop' / 'missing', README
// "Sticky series: exact repeats") on a real sticky series with documented shocks: Florida frozen
// orange-juice prices, 612 months (data/frozen-juice.csv, AER FrozenJuice), whose monthly price
// repeats the previous month exactly 253 times. Truth, as in eval/frozen-juice.mjs: the eight months
// with 19 or more Orlando freezing degree days; a freeze is found if a change lies within 2 months.
//
// Not pre-registered and not a decision rule: both options were already declined on their synthetic
// power cell (a 5-sd step in a sticky walk found 38 and 33 of 60 times against shipped 60). This asks
// whether the same power loss shows on real shocks. Written and run once, 2026-11-11.
//
// usage: node eval/frozen-juice-sticky.mjs > eval/frozen-juice-sticky.out.txt
import { readFileSync } from 'node:fs';
import { driftLevelChanges } from '../drift-level.mjs';

const rows = readFileSync(new URL('../data/frozen-juice.csv', import.meta.url), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), price = rows.map((r) => Number(r[1])), fdd = rows.map((r) => Number(r[3]));
const freezes = labels.filter((_, i) => fdd[i] >= 19);
const month = (l) => { const [y, m] = l.split('-').map(Number); return y * 12 + m; };
let rep = 0;
for (let t = 1; t < price.length; t++) if (price[t] === price[t - 1]) rep++;
console.log(`frozen-juice price: ${price.length} months, ${rep} exact repeats (${((100 * rep) / (price.length - 1)).toFixed(1)}% of steps); freezes (fdd >= 19): ${freezes.join(' ')}`);
const SET = {
  'shipped (global scale)': {},
  'drop, global': { repeats: 'drop' },
  'drop, scale per segment': { repeats: 'drop', scale: 'segment' },
  'missing, global': { repeats: 'missing' },
  'missing, scale per segment': { repeats: 'missing', scale: 'segment' },
};
console.log('\nsetting                       cuts  freezes found (within 2 months)  cuts near a freeze');
for (const [name, o] of Object.entries(SET)) {
  const cps = driftLevelChanges(price, { noise: 'ml', ...o }).changepoints.map((i) => labels[i]);
  const found = freezes.filter((f) => cps.some((c) => Math.abs(month(c) - month(f)) <= 2));
  const near = cps.filter((c) => freezes.some((f) => Math.abs(month(c) - month(f)) <= 2)).length;
  console.log(`${name.padEnd(28)} ${String(cps.length).padStart(5)}  ${found.length} of ${freezes.length}: ${found.join(' ').padEnd(40)} ${near}`);
}
