// A real weekly series with a documented closure: Ansett Melbourne-Sydney economy-class passengers (thousands),
// 283 weeks from 1987-06-29 (data/ansett-melsyd-economy.csv). The airline's pilots' dispute began on 18 August 1989:
// the series falls to 7.0 in the week of 1989-08-21, is 0 from 1989-08-28 to 1989-10-09, is 11.6 in the week of 1989-10-16
// (flights resuming) and is back near 20 by December. Does the detector find the stop (the week of 1989-08-21 or 08-28)
// and the restart (1989-10-16), and does each 95% range hold the true week? The tag counts only the dispute's own
// two dates; every other change is listed, because this series is noisy and the count of them is the honest cost.
// usage: node eval/ansett-strike.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/ansett-melsyd-economy.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), thousands = rows.map((r) => +r[1]);
const STOP = labels.indexOf('1989-08-21'), RESTART = labels.indexOf('1989-10-16');
console.log(`n ${thousands.length}; stop week ${labels[STOP]} (${thousands[STOP]}); zero weeks in the series ${thousands.filter((v) => v === 0).length}; restart week ${labels[RESTART]} (${thousands[RESTART]})`);
const counts = thousands.map((v) => Math.round(v * 1000));
for (const [name, values, opt] of [
  ['mean, seasonal 52', thousands, { model: 'mean', period: 52 }],
  ['mean, no season', thousands, { model: 'mean' }],
  ['poisson nb, seasonal 52', counts, { model: 'poisson', period: 52, overdispersion: 'nb' }],
  ['poisson nb, no season', counts, { model: 'poisson', overdispersion: 'nb' }],
]) {
  let r;
  try { r = analyze({ values, labels, ...opt }); } catch (e) { console.log(`\n${name}: error ${e.message}`); continue; }
  const near = (t) => r.pelt.changepoints.some((c) => Math.abs(labels.indexOf(c.label) - t) <= 1);
  const hold = (t) => r.pelt.changepoints.some((c) => c.range95 && c.range95.fromIndex <= t && t <= c.range95.toIndex);
  console.log(`\n${name}: ${r.pelt.changepoints.length} changes; stop within a week ${near(STOP) || near(STOP + 1)}, range holds ${hold(STOP) || hold(STOP + 1)}; restart within a week ${near(RESTART)}, range holds ${hold(RESTART)}`);
  for (const c of r.pelt.changepoints) {
    const rg = c.range95, holds = (t) => rg && rg.fromIndex <= t && t <= rg.toIndex;
    const tag = holds(STOP) || holds(STOP + 1) ? '  (holds the stop)' : holds(RESTART) ? '  (holds the restart)' : '';
    console.log(`  ${c.label}  ${c.meanBefore} -> ${c.meanAfter}  range95 ${rg ? `${rg.from} to ${rg.to}` : 'none'}${tag}`);
  }
}
