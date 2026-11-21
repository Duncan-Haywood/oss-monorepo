// The real shop (UCI Online Retail's daily orders, README "A real shop's daily series") under the count ladder with the
// gated growth term in Middle (README "The joint growth fit, gated"): each rung's alerts, with and without --period 7.
// Reported, deciding nothing.   node eval/real-shop-joint-middle.mjs
import { readFileSync } from 'node:fs';
import { parseSeries } from '../engine.mjs';
import { eagernessReplay } from '../watch-core.mjs';
const orders = parseSeries(readFileSync(new URL('../data/online-retail-daily.csv', import.meta.url), 'utf8'), 'orders', null);
for (const period of [undefined, 7]) {
  const r = eagernessReplay(orders.values, orders.labels, { model: 'poisson', period, keepAlerts: true });
  console.log(`period ${period ?? 'none'}: suggest ${r.suggest}`);
  for (const s of r.settings) console.log(`  ${s.key}: ${s.alerts} alerts, ${s.per100.toFixed(2)} per 100 checks: ${s.alertLabels.join(' ')}`);
}
