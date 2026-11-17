// Covariate balance of the outcome-only synthetic control, the shipped default (README "Covariate balance").
// Abadie (2021, section 7) asks a synthetic control fitted on the outcome alone to report how it compares with the
// treated unit on covariates; Abadie, Diamond and Hainmueller (2010, Table 1) do it for California. Same states,
// windows, donor pools and covariate definitions as eval/synth-cov-real.mjs: ln per capita personal income and retail
// price per pack averaged over the nine years before the date, packs per head 14, 9 and 1 years before it, plus the
// before-period mean of packs per head (1970 to date-1). A diagnostic only, not pre-registered: it changes no p.
//   node eval/synth-balance-real.mjs > eval/synth-balance-real.out.txt
import { readFileSync } from 'node:fs';
import { synthControlTest, covariateBalance } from '../synth-control.mjs';
const read = (f) => { const [h, ...rows] = readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8').trim().split('\n'); return { head: h.split(','), data: rows.map((l) => l.split(',').map(Number)) }; };
const sales = read('us-cigarette-packs-per-capita.csv'), tax = read('us-cigarette-state-tax.csv');
const price = read('us-cigarette-retail-price.csv'), income = read('us-personal-income-per-capita.csv');
const years = sales.data.map((r) => r[0]);
const col = (t, s) => t.data.map((r) => r[t.head.indexOf(s)]);
const EXCLUDED = new Set('AK AZ FL HI MD MA MI NJ NY OR WA DC CA'.split(' '));
const DONORS = sales.head.slice(1).filter((s) => !EXCLUDED.has(s));
if (DONORS.length !== 38) throw new Error(`donor pool has ${DONORS.length} states`);
function cleanDonors(last) {
  const i0 = years.indexOf(1988), i1 = years.indexOf(last);
  return DONORS.filter((s) => { const v = col(tax, s); let mx = 0; for (let i = i0; i <= i1; i++) mx = Math.max(mx, v[i] - v[i0]); return mx < 0.5; });
}
const yi = (y) => years.indexOf(Math.max(1970, y));
function covariatesFor(s, date) {
  const lo = yi(date - 9), hi = yi(date - 1);
  const avg = (a, from = lo) => { let t = 0; for (let i = from; i <= hi; i++) t += a[i]; return t / (hi - from + 1); };
  const packs = col(sales, s);
  return [Math.log(avg(col(income, s))), avg(col(price, s)), packs[yi(date - 14)], packs[yi(date - 9)], packs[yi(date - 1)], avg(packs, yi(1970))];
}
const f = (v, p = 2) => Number(v).toFixed(p);
const log = new URL(import.meta.url).search === '?quiet' ? () => {} : console.log;
export const rows = [];
function run(tag, state, date, last) {
  const lo = years.indexOf(1970), hi = years.indexOf(last) + 1;
  const pool = cleanDonors(last).filter((s) => s !== state);
  const y = col(sales, state).slice(lo, hi);
  const donors = Object.fromEntries(pool.map((s) => [s, col(sales, s).slice(lo, hi)]));
  const k = years.slice(lo, hi).indexOf(date);
  const r = synthControlTest(y, donors, k);
  const names = ['ln income', 'price (c/pack)', `packs ${Math.max(1970, date - 14)}`, `packs ${date - 9}`, `packs ${date - 1}`, `packs mean 1970-${date - 1}`];
  const b = covariateBalance(r, { treated: covariatesFor(state, date), donors: Object.fromEntries(pool.map((s) => [s, covariatesFor(s, date)])) }, { names });
  log(`${tag}: ${state} ${date}, 1970-${last}, ${r.donors} donors; outcome-only fit, floored rank ${r.rank} of ${r.donors + 1}, p ${f(r.p, 3)}, before RMSPE ${f(r.preRmspe)}${r.fitWarning ? ', FIT WARNING' : ''}`);
  log(`  weights: ${r.weights.slice(0, 6).map((w) => `${w.name} ${f(w.weight, 3)}`).join(', ')}${r.weights.length > 6 ? `, +${r.weights.length - 6} more` : ''}`);
  log('  covariate            treated  synthetic  donor mean  std gap (synth)  std gap (mean)  placebos matched better');
  for (const c of b) log(`  ${c.name.padEnd(20)} ${f(c.treated, 3).padStart(8)} ${f(c.synthetic, 3).padStart(10)} ${f(c.donorMean, 3).padStart(11)} ${f(c.stdGap).padStart(16)}${c.imbalanced ? '*' : ' '} ${f(c.stdGapDonorMean).padStart(15)} ${f(100 * c.placeboShare, 0).padStart(14)}%`);
  rows.push({ state, date, p: r.p, balance: b });
  return b;
}
log('Outcome-only synthetic control (the default), covariate balance. * = |standardised gap| over 0.25.');
log('std gap = (treated - synthetic) / sd over all units; placebos matched better = share of donors whose own');
log('outcome-only synthetic control is closer to them on that covariate than the treated fit is.\n');
run('T1 Proposition 99', 'CA', 1989, 2000);
run('T2 Question 1', 'MA', 1993, 2000);
run('T3 Proposition 200', 'AZ', 1995, 2002);
run('T4 Measure 44', 'OR', 1997, 2004);
const imb = rows.map((r) => `${r.state} ${r.balance.filter((c) => c.imbalanced).map((c) => c.name).join(', ') || 'none'}`);
log(`\nImbalanced (|std gap| > 0.25): ${imb.join('; ')}`);
