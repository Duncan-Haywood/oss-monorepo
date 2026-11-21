// Reported only (eval/count-default-middle.prereg.md): the real shop (UCI Online Retail daily orders), alerts under
// the count default (D) and Middle (M), without and with --period 7.   node eval/count-default-middle-shop.mjs
import { readFileSync } from 'node:fs';
import { parseSeries } from '../engine.mjs';
import { replayWatch, COUNT_DEFAULTS, COUNT_MIDDLE } from '../watch-core.mjs';
const csv = readFileSync(new URL('../data/online-retail-daily.csv', import.meta.url), 'utf8');
const o = parseSeries(csv, 'orders', null);
for (const period of [null, 7]) for (const [k, s] of Object.entries({ D: COUNT_DEFAULTS, M: COUNT_MIDDLE })) {
  const r = replayWatch(o.values, o.labels, { model: 'poisson', ...s, ...(period ? { period } : {}), budget: Infinity });
  console.log(period, k, r.alerts.length, r.alerts.map((a) => a.label).join(' '));
}
