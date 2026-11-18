// Real tests for the synthetic control matched on covariates (pre-registration eval/synth-cov-prereg-2026-11-17.md).
// The states, windows, donor pools, dates and bars are the floored-ratio round's (eval/synth-real.mjs); the fit now
// matches each unit on five predictors, as Abadie, Diamond and Hainmueller (2010, Table 1) do less two:
//   ln per capita personal income (BEA SAINC1, data/us-personal-income-per-capita.csv) and the average retail price
//   per pack (CDC Tax Burden on Tobacco, data/us-cigarette-retail-price.csv), each averaged over the nine fiscal years
//   before the date (1980-1988 for California), and packs per head at date-14, date-9 and date-1 (1975, 1980, 1988).
//   For a date whose window starts before 1970 (the in-time placebos) both are clamped to 1970.
// The paper's 15-24 population share and beer consumption are left out (no source reachable this session).
// Both fits are printed for every row; the bars read the covariate fit with the floored ratio.
//   node eval/synth-cov-real.mjs > eval/synth-cov-real.out.txt
import { readFileSync } from 'node:fs';
import { synthControlTest } from '../synth-control.mjs';
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
function predictorsFor(s, date) {
  const lo = yi(date - 9), hi = yi(date - 1);
  const avg = (a) => { let t = 0; for (let i = lo; i <= hi; i++) t += a[i]; return t / (hi - lo + 1); };
  const packs = col(sales, s);
  return [Math.log(avg(col(income, s))), avg(col(price, s)), packs[yi(date - 14)], packs[yi(date - 9)], packs[yi(date - 1)]];
}
const f = (v, p = 2) => Number(v).toFixed(p);
const out = [];
function run(tag, state, date, last, { fake = null } = {}) {
  const lo = years.indexOf(1970), hi = years.indexOf(fake == null ? last : date - 1) + 1;
  const at = fake ?? date;
  const pool = cleanDonors(last).filter((s) => s !== state);
  const y = col(sales, state).slice(lo, hi);
  const donors = Object.fromEntries(pool.map((s) => [s, col(sales, s).slice(lo, hi)]));
  const k = years.slice(lo, hi).indexOf(at);
  const predictors = { treated: predictorsFor(state, at), donors: Object.fromEntries(pool.map((s) => [s, predictorsFor(s, at)])) };
  const c = synthControlTest(y, donors, k, { predictors });
  const o = synthControlTest(y, donors, k);
  const window = fake == null ? `1970-${last}` : `1970-${date - 1}, fake date ${fake}`;
  console.log(`${tag}: ${state} ${at}, ${window}, ${c.donors} donors`);
  for (const [name, r] of [['covariates', c], ['outcome', o]]) {
    console.log(`  ${name}: weights ${r.weights.slice(0, 6).map((w) => `${w.name} ${f(w.weight, 3)}`).join(', ')}${r.weights.length > 6 ? `, +${r.weights.length - 6} more` : ''}${r.v ? `; V ${r.v.map((v) => f(v, 3)).join(' ')} (ln income, price, packs ${at - 14 < 1970 ? 1970 : at - 14}, ${Math.max(1970, at - 9)}, ${at - 1})` : ''}`);
    console.log(`    before RMSPE ${f(r.preRmspe)} (worse than ${f(100 * r.preFitShare, 0)}% of donors${r.fitWarning ? ', FIT WARNING' : ''}); after ${f(r.postRmspe)}; gap ${f(r.effectAverage)} average, ${f(r.effectAtEnd)} at the end; floored rank ${r.tests.floored.rank} of ${r.donors + 1}, p ${f(r.tests.floored.p, 3)} (ratio rank ${r.tests.ratio.rank}, p ${f(r.tests.ratio.p, 3)}; floor ${f(r.floor)})`);
  }
  if (fake == null && state === 'CA') console.log(`  covariate gap by year: ${years.slice(lo, hi).map((yy, i) => `${yy} ${f(c.gap[i], 1)}`).join(', ')}`);
  const row = { tag, state, date: at, p: c.tests.floored.p, rank: c.tests.floored.rank, effectAverage: c.effectAverage, effectAtEnd: c.effectAtEnd, pOutcome: o.tests.floored.p };
  out.push(row);
  return row;
}
console.log('## T1 California, Proposition 99 (date 1989)');
const t1 = run('T1 Proposition 99 (+25c, 1 Jan 1989)', 'CA', 1989, 2000);
const t1met = t1.p <= 0.05 && t1.effectAverage >= -30 && t1.effectAverage <= -10 && t1.effectAtEnd < 0;
console.log(`T1 (p <= 0.05, average gap -30 to -10 packs, gap at 2000 below 0): ${t1met ? 'MET' : 'NOT MET'}`);
console.log('## T2-T4 other tax rises');
const others = [run('T2 Question 1 (+25c, 1 Jan 1993)', 'MA', 1993, 2000), run('T3 Proposition 200 (+40c, 1 Dec 1994)', 'AZ', 1995, 2002), run('T4 Measure 44 (+30c, 1 Feb 1997)', 'OR', 1997, 2004)];
const met = others.filter((r) => r.p <= 0.10 && r.effectAverage < 0).length;
console.log(`T2-T4: ${met} of 3 with p <= 0.10 and a negative average gap (bar at least 2): ${met >= 2 ? 'MET' : 'NOT MET'}`);
console.log('## I in-time placebos: California with the window cut at 1988');
const inTime = [run('I1', 'CA', 1989, 2000, { fake: 1980 }), run('I2', 'CA', 1989, 2000, { fake: 1984 })];
const iFired = inTime.filter((r) => r.p <= 0.05).length;
console.log(`I: ${iFired} of 2 with p <= 0.05 (bar 0): ${iFired === 0 ? 'MET' : 'NOT MET'}`);
console.log('## Q placebo states, date 1989, 1970-2000');
const q = ['AL', 'GA', 'KY', 'MS', 'MT', 'SC', 'TN', 'VA', 'WV'].map((s) => run(`Q ${s}`, s, 1989, 2000));
const qFired = q.filter((r) => r.p <= 0.05).length;
console.log(`Q: ${qFired} of 9 with p <= 0.05 (bar at most 1): ${qFired <= 1 ? 'MET' : 'NOT MET'}`);
console.log(`ALL REAL BARS: ${t1met && met >= 2 && iFired === 0 && qFired <= 1 ? 'MET' : 'NOT MET'}`);
