// Real heavy-tailed, clustered-volatility series with dated shocks (data/fx-daily-returns.csv, daily FX log returns in %, 2012-2018).
// Known events: the Swiss National Bank dropped its 1.20 EUR/CHF floor on 2015-01-15; the UK voted for Brexit on 2016-06-23 (the move is 2016-06-24).
// For each mode of `--model meanvar`: how many changes, does one fall within 10 trading days of the event, and how many changes are NOT near any known event.
// usage: node eval/fx-shocks.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/fx-daily-returns.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]);
const SERIES = { chf: { col: 1, events: ['2015-01-15'] }, gbp: { col: 2, events: ['2016-06-24'] }, jpy: { col: 3, events: [] } };
const MODES = [['default', {}], ['--robust', { robust: true }], ['--dispersion', { dispersion: true }], ['--bootstrap', { bootstrap: true }]];
const near = (i, ev) => ev.some((e) => Math.abs(i - labels.indexOf(e)) <= 10);
const kurt = (v) => { const m = v.reduce((s, x) => s + x, 0) / v.length, s2 = v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length; return v.reduce((s, x) => s + (x - m) ** 4, 0) / v.length / s2 ** 2; };
console.log(`n ${labels.length} days, ${labels[0]} to ${labels.at(-1)}`);
for (const [name, { col, events }] of Object.entries(SERIES)) {
  const values = rows.map((r) => +r[col]);
  console.log(`\n${name}: kurtosis ${kurt(values).toFixed(1)} (Gaussian 3), events ${events.join(', ') || 'none documented'}`);
  for (const [mode, opt] of MODES) {
    const cps = analyze({ values, labels, model: 'meanvar', ...opt }).pelt.changepoints;
    const hit = events.length ? cps.some((c) => near(c.index, events)) : null;
    const off = cps.filter((c) => !near(c.index, events)).length;
    console.log(`  ${mode.padEnd(13)} ${cps.length} changes  event found ${hit === null ? '-' : hit ? 'yes' : 'no'}  off-event ${off}  [${cps.map((c) => c.label).join(' ')}]`);
  }
}
