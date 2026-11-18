// The slope-break test (slope-breaks.mjs, bar 11) on real series in data/, with the best split printed even when it
// does not clear the bar. usage: node eval/slope-real.mjs
import { readFileSync } from 'node:fs';
import { slopeBreaks } from '../slope-breaks.mjs';
const rd = (f) => readFileSync(new URL(`../data/${f}.csv`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const ma7 = (v) => v.map((_, i) => (i < 6 ? NaN : v.slice(i - 6, i + 1).reduce((s, t) => s + t, 0) / 7)).slice(6);
const cases = [];
const add = (name, f, col, per, ann, smooth) => {
  const rows = rd(f); let v = rows.map((r) => Math.log(+r[col]));
  let lab = rows.map((r) => r[0]); if (smooth) { v = ma7(v); lab = lab.slice(6); }
  cases.push({ name, v, lab, per, ann });
};
add('US real GDP (quarterly)', 'us-real-gdp', 1, 'quarter', 4);
add('UK gas (quarterly)', 'uk-gas', 1, 'quarter', 4);
add('Australian population (quarterly)', 'austres', 1, 'quarter', 4);
add('airmiles (annual)', 'airmiles', 1, 'year', 1);
add('Johnson & Johnson earnings (quarterly)', 'johnson-johnson', 1, 'quarter', 4);
add('airline passengers (monthly)', 'airline-passengers', 1, 'month', 12);
add('US births (daily, 7-day mean)', 'us-births-daily', 1, 'day', 365, true);
add('bike-share registered (daily)', 'bike-sharing-daily', 2, 'day', 365);
add('bike-share registered (daily, 7-day mean)', 'bike-sharing-daily', 2, 'day', 365, true);
add('payroll page views (daily, 7-day mean)', 'payroll-views', 1, 'day', 365, true);
for (const c of cases) {
  const t = slopeBreaks(c.v, { maxKnots: 1, critical: 0 }).knots[0];
  const n = c.v.length;
  if (!t) { console.log(`${c.name}: n=${n}, no split`); continue; }
  const sig = slopeBreaks(c.v).knots.length;
  console.log(`${c.name}: n=${n}, best split ${c.lab[t.index]}, W ${t.wald.toFixed(1)} (bar 11), growth ${(t.before * c.ann * 100).toFixed(1)} to ${(t.after * c.ann * 100).toFixed(1)} % a year, reported: ${sig ? 'yes' : 'no'}`);
}
