// Shape or shock, third try: refit the logged series (log: true, no drift), where a season that grows with the level has a fixed amplitude.
// A growing season (airline, UK gas, J&J) should lose its steps; a real shock (UK driver deaths 1973) should keep them.
// Prints, per series and trend option, the steps inside the first two-cycle window found by the drift fit (as in drift-warning-shape.mjs),
// and how many steps the log refit puts in that same window.
// usage: node eval/drift-warning-log.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const SERIES = [['airline (growing season)', 'airline-passengers.csv', 12], ['UK gas (growing season)', 'uk-gas.csv', 4], ['J&J (growing season)', 'johnson-johnson.csv', 4], ['UK driver deaths (1973 shock)', 'uk-driver-deaths.csv', 12]];
for (const [name, file, period] of SERIES) {
  const rows = readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.replace(/"/g, '').split(','));
  const labels = rows.map((r) => r[0]), raw = rows.map((r) => +r[r.length - 1]);
  for (const trend of [undefined, 'bend']) {
    const d = analyze({ values: raw, labels, period, drift: true, trend });
    let m;
    try { m = analyze({ values: raw, labels, period, log: true, trend }); } catch (e) { console.log(`${name.padEnd(32)} ${(trend || 'no trend').padEnd(8)} log failed: ${e.message}`); continue; }
    const dc = d.pelt.changepoints, mc = m.pelt.changepoints;
    let win = 'none';
    if (d.driftWarning) {
      const k = dc.findIndex((x, j) => j + 2 < dc.length && dc[j + 2].index - x.index <= 2 * period);
      const lo = dc[k].index, hi = lo + 2 * period;
      win = `${dc.filter((x) => x.index >= lo && x.index <= hi).length} steps -> ${mc.filter((x) => x.index >= lo - period && x.index <= hi + period).length} log steps near it`;
    }
    console.log(`${name.padEnd(32)} ${(trend || 'no trend').padEnd(8)} drift warns ${d.driftWarning ? 'yes' : 'no '}  drift steps ${dc.length}  log steps ${mc.length}  window: ${win}`);
  }
}
