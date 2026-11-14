#!/usr/bin/env node
// Bill 200 simulated Texas homes (check/resstock_tx_usage.json, from
// check/resstock_tx.py) on the example plans, and print what the label's
// 1,000 kWh price gets right and wrong. Output is check/resstock-results.md;
// page.test.mjs checks the saved file is exactly what this prints.
//
// The plans are the worked example's (invented terms in EFL shape) plus one
// free-nights plan, also invented. The homes are NREL ResStock simulations
// under 2018 weather, not meter readings.
import { readFileSync } from 'node:fs';
import { compare, normalisePlan, monthBill, EXAMPLE } from '../engine.mjs';

const data = JSON.parse(readFileSync(new URL('./resstock_tx_usage.json', import.meta.url), 'utf8'));
const NIGHTS = {
  name: 'Example D: free nights 9 p.m.-6 a.m.',
  base: 9.95,
  energy: [{ upTo: null, cents: 21.5 }],
  tduFixed: 4.5,
  tduCents: 5.5,
  tou: [{ name: 'nights', days: 'all', start: 21, end: 6, cents: 0 }],
};
const plans = [...EXAMPLE.plans, NIGHTS].map(normalisePlan);
const short = ['A flat', 'B credit', 'C tiers', 'D nights'];

const q = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
};
const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`;
const usd = (x) => `${x < 0 ? '-' : ''}$${Math.abs(Math.round(x)).toLocaleString('en-US')}`;

const homes = data.homes;
const H = homes.length;
const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const results = homes.map((h) => {
  const months = h.months.map((kwh, i) => ({ month: `2018-${MONTHS[i]}`, kwh }));
  const r = compare(plans.slice(0, 3), months);
  // Free nights: bill with the home's own night kWh.
  const d = h.months.reduce((s, kwh, i) => s + monthBill(plans[3], { kwh, windows: [h.nights[i]] }).total, 0);
  const totals = Object.fromEntries(r.map((x) => [x.plan.name, x]));
  return { h, annual: h.months.reduce((s, x) => s + x, 0), byPlan: plans.slice(0, 3).map((p) => totals[p.name]), d };
});

const lines = [];
const out = (s = '') => lines.push(s);
out('# 200 simulated Texas homes on the example plans');
out();
out(`Homes: ${H} drawn (seed ${data.seed}) from ${data.pool} occupied, no-PV ResStock AMY2018 homes in ${data.counties.join(', ')}. Simulated, not metered. Plans: the worked example's A, B, C and a free-nights plan D, all invented terms with the same placeholder TDU charges.`);
out();
const annual = results.map((r) => r.annual);
out(`Annual use: median ${Math.round(q(annual, 0.5)).toLocaleString('en-US')} kWh, 10th-90th percentile ${Math.round(q(annual, 0.1)).toLocaleString('en-US')}-${Math.round(q(annual, 0.9)).toLocaleString('en-US')} kWh.`);
const homeMonths = homes.flatMap((h) => h.months);
const inBand = homeMonths.filter((k) => k >= 1000 && k <= 2000).length;
out(`Home-months between 1,000 and 2,000 kWh (plan B's credit band): ${inBand} of ${homeMonths.length} (${pct(inBand, homeMonths.length)}); under 1,000: ${pct(homeMonths.filter((k) => k < 1000).length, homeMonths.length)}; over 2,000: ${pct(homeMonths.filter((k) => k > 2000).length, homeMonths.length)}.`);
out();
out('## Which plan is cheapest for each home');
out();
out('By the label\'s 1,000 kWh price the order is B (8.1 cents), C (14.2), A (16.0).');
out();
out('| Plan | Cheapest for | Dearest for | Median annual cost | Label 1,000 kWh price x annual kWh, minus the true cost (median) |');
out('|---|---|---|---|---|');
for (let j = 0; j < 3; j++) {
  const cheapest = results.filter((r) => r.byPlan.reduce((b, x, i) => (x.total < r.byPlan[b].total ? i : b), 0) === j).length;
  const dearest = results.filter((r) => r.byPlan.reduce((b, x, i) => (x.total > r.byPlan[b].total ? i : b), 0) === j).length;
  const cost = results.map((r) => r.byPlan[j].total);
  const err = results.map((r) => (plans[j].label[1000] / 100) * r.annual - r.byPlan[j].total);
  out(`| ${short[j]} | ${cheapest} of ${H} | ${dearest} of ${H} | ${usd(q(cost, 0.5))} | ${usd(q(err, 0.5))} |`);
}
out();
const credit = results.map((r) => r.byPlan[1].creditMonths);
out(`Plan B's credit: median ${q(credit, 0.5).toFixed(1)} of 12 months collected; all 12 in ${credit.filter((c) => c === 12).length} homes; 6 or fewer in ${credit.filter((c) => c <= 6).length}; none in ${credit.filter((c) => c === 0).length}.`);
const vsBest = results.map((r) => r.byPlan[1].total - Math.min(...r.byPlan.map((x) => x.total)));
out(`Choosing B by its label price cost a home, against the cheapest of A, B and C on its own year: median ${usd(q(vsBest, 0.5))}, 90th percentile ${usd(q(vsBest, 0.9))}, most ${usd(Math.max(...vsBest))}.`);
out();
out('## Free nights');
out();
const share = results.map((r) => r.h.nights.reduce((s, x) => s + x, 0) / r.annual);
out(`Share of each home's year used 9 p.m.-6 a.m.: median ${pct(q(share, 0.5), 1)}, 10th-90th percentile ${pct(q(share, 0.1), 1)}-${pct(q(share, 0.9), 1)}.`);
// D against A: D costs 21.5c on day kWh only, A 9.1c on all kWh; equal base and TDU.
const breakEven = 1 - plans[0].energy[0].cents / plans[3].energy[0].cents;
// With equal base and TDU charges, a free-window plan beats a flat energy rate e when its other-hours rate is below e / (1 - share).
const dayPrice = share.map((x) => plans[0].energy[0].cents / (1 - x));
out(`For a free-nights plan to beat A's flat 9.1 cents, with the same base and TDU charges, its daytime rate must be under 9.1 / (1 - night share): ${q(dayPrice, 0.5).toFixed(1)} cents for the median home (10th-90th percentile ${q(dayPrice, 0.1).toFixed(1)}-${q(dayPrice, 0.9).toFixed(1)}).`);
out(`D beats A when more than ${pct(breakEven, 1)} of use falls in the free hours (1 - 9.1 / 21.5); that held for ${results.filter((r) => r.d < r.byPlan[0].total).length} of ${H} homes. D was cheapest of all four for ${results.filter((r) => r.d < Math.min(...r.byPlan.map((x) => x.total))).length}.`);
out();
out('Simulated homes, invented plans: this measures how much the label\'s three prices leave out for a realistic spread of Texas usage, not what any real plan costs.');
process.stdout.write(lines.join('\n') + '\n');
