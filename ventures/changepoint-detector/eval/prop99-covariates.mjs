// Writes data/prop99-covariates-1989.csv, the --covariates file for the CLI's synthetic control on Proposition 99
// (README "A synthetic control from the command line"): the covariate definitions of eval/synth-balance-real.mjs for
// a 1989 date, one row per state: ln per capita personal income and retail price per pack averaged over 1980-1988,
// packs per head in 1975, 1980 and 1988, and the 1970-1988 mean of packs per head.
//   node eval/prop99-covariates.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const read = (f) => { const [h, ...rows] = readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8').trim().split('\n'); return { head: h.split(','), data: rows.map((l) => l.split(',').map(Number)) }; };
const sales = read('us-cigarette-packs-per-capita.csv'), price = read('us-cigarette-retail-price.csv'), income = read('us-personal-income-per-capita.csv');
const years = sales.data.map((r) => r[0]);
const col = (t, s) => t.data.map((r) => r[t.head.indexOf(s)]);
const yi = (y) => years.indexOf(Math.max(1970, y));
const date = 1989, lo = yi(date - 9), hi = yi(date - 1);
const avg = (a, from = lo) => { let t = 0; for (let i = from; i <= hi; i++) t += a[i]; return t / (hi - from + 1); };
const lines = ['state,ln income 1980-88,price 1980-88 ($/pack),packs 1975,packs 1980,packs 1988,packs mean 1970-88'];
for (const s of sales.head.slice(1)) {
  const packs = col(sales, s);
  if ([col(income, s), col(price, s)].some((a) => a.slice(lo, hi + 1).some((v) => !Number.isFinite(v)))) continue;
  lines.push([s, Math.log(avg(col(income, s))), avg(col(price, s)), packs[yi(1975)], packs[yi(1980)], packs[yi(1988)], avg(packs, yi(1970))].map((v) => (typeof v === 'number' ? Number(v.toFixed(6)) : v)).join(','));
}
writeFileSync(new URL('../data/prop99-covariates-1989.csv', import.meta.url), lines.join('\n') + '\n');
console.log(`${lines.length - 1} states`);
