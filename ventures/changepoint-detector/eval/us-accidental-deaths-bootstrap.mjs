// US accidental deaths (USAccDeaths): does --bootstrap lose the 1973-12 fall once the season is removed?
// The 2026-10-31 real-series sweep ran with no --period and saw the step vanish; this runs both ways.
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/us-accidental-deaths.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
console.log('model\tperiod\tbootstrap\tchanges');
for (const model of ['mean', 'meanvar'])
  for (const period of [undefined, 12])
    for (const bootstrap of [false, true]) {
      const cps = analyze({ values, labels, model, ...(period ? { period } : {}), bootstrap }).pelt.changepoints;
      console.log([model, period ?? 'none', bootstrap, cps.map((c) => c.label).join(' ') || '-'].join('\t'));
    }
