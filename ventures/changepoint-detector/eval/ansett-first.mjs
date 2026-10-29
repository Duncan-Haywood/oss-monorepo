// Same pilots' dispute, a quieter series: Ansett Melbourne-Sydney FIRST-class passengers (thousands), 270 weeks from
// 1988-03-28 (data/ansett-melsyd-first.csv; the first 13 weeks are dropped, week 13 of the source is blank). First class
// has no school-holiday swing like economy, so the question is whether the other changes the economy run returned (24 to 43)
// were the season, and what the detector does when the series is quiet outside the closure.
// usage: node eval/ansett-first.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/ansett-melsyd-first.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), thousands = rows.map((r) => +r[1]);
const STOP = labels.indexOf('1989-08-21'), RESTART = labels.indexOf('1989-10-16');
console.log(`n ${thousands.length}; stop week ${labels[STOP]} (${thousands[STOP]}); zero weeks ${thousands.filter((v) => v === 0).length}; restart week ${labels[RESTART]} (${thousands[RESTART]})`);
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
