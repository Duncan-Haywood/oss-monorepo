// `driftWarning` on a longer monthly series with a dated shock and rebound: euro-area new orders for
// electrical equipment, 195 months 1996-01 to 2012-03 (the late-2008 collapse and the 2009-10 recovery), R's fpp2::elecequip.
// usage: node eval/drift-warning-elecequip.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/eu-elecequip.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), raw = rows.map((r) => +r[1]);
for (const [scale, v] of [['raw', raw], ['log', raw.map(Math.log)]]) {
  for (const trend of [undefined, 'bend']) {
    const r = analyze({ values: v, labels, period: 12, drift: true, trend });
    const cps = r.pelt.changepoints.map((c) => `${c.label}${c.shift > 0 ? '+' : '-'}`).join(' ');
    console.log(`  ${scale} ${(trend || 'no trend').padEnd(8)} steps ${String(r.pelt.changepoints.length).padStart(2)}  warning ${r.driftWarning ? 'yes' : 'no '}  ${cps}`);
  }
}
