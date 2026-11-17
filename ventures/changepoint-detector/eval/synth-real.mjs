// Real tests for the synthetic control (pre-registration eval/synth-prereg-2026-11-17.md): state cigarette packs per
// head (levels, fiscal years, data/us-cigarette-packs-per-capita.csv) against Abadie, Diamond and Hainmueller's (2010)
// 38 donor states. node eval/synth-real.mjs > eval/synth-real.out.txt
// SC_STAT=floored (or post) ranks by that placebo statistic instead and prints all three (README "A floored ratio";
// SC_STAT=floored node eval/synth-real.mjs > eval/synth-floor-real.out.txt).
import { readFileSync } from 'node:fs';
import { synthControlTest, synthInTimePlacebo } from '../synth-control.mjs';
const read = (f) => { const [h, ...rows] = readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8').trim().split('\n'); return { head: h.split(','), data: rows.map((l) => l.split(',').map(Number)) }; };
const sales = read('us-cigarette-packs-per-capita.csv'), tax = read('us-cigarette-state-tax.csv');
const years = sales.data.map((r) => r[0]);
const col = (t, s) => t.data.map((r) => r[t.head.indexOf(s)]);
const EXCLUDED = new Set('AK AZ FL HI MD MA MI NJ NY OR WA DC CA'.split(' '));
const DONORS = sales.head.slice(1).filter((s) => !EXCLUDED.has(s));
if (DONORS.length !== 38) throw new Error(`donor pool has ${DONORS.length} states`);
// Abadie et al.'s rule, carried to each window's end: drop donors whose tax per pack rose by 50 cents or more from FY1988
function cleanDonors(last) {
  const i0 = years.indexOf(1988), i1 = years.indexOf(last);
  return DONORS.filter((s) => { const v = col(tax, s); let mx = 0; for (let i = i0; i <= i1; i++) mx = Math.max(mx, v[i] - v[i0]); return mx < 0.5; });
}
const f = (v, p = 2) => Number(v).toFixed(p);
const STAT = process.env.SC_STAT;
const opts = { statistic: STAT ?? 'ratio' }; // the last round's tables used the paper's ratio
const out = [];
function run(tag, state, date, last, { exclude = [], fake = null } = {}) {
  const lo = years.indexOf(1970), hi = years.indexOf(last) + 1;
  const pool = cleanDonors(last).filter((s) => s !== state && !exclude.includes(s));
  const y = col(sales, state).slice(lo, hi);
  const donors = Object.fromEntries(pool.map((s) => [s, col(sales, s).slice(lo, hi)]));
  const k = years.slice(lo, hi).indexOf(date);
  const r = fake == null ? synthControlTest(y, donors, k, opts) : synthInTimePlacebo(y, donors, k, years.slice(lo, hi).indexOf(fake), opts);
  const window = fake == null ? `1970-${last}` : `1970-${date - 1}, fake date ${fake}`;
  console.log(`${tag}: ${state} ${fake ?? date}, ${window}, ${r.donors} donors`);
  console.log(`  weights: ${r.weights.slice(0, 6).map((w) => `${w.name} ${f(w.weight, 3)}`).join(', ')}${r.weights.length > 6 ? `, +${r.weights.length - 6} more` : ''}`);
  console.log(`  before RMSPE ${f(r.preRmspe)} packs (worse than ${f(100 * r.preFitShare, 0)}% of the donors' own fits${r.fitWarning ? ', FIT WARNING' : ''}); after RMSPE ${f(r.postRmspe)}; ratio ${f(r.ratio)}`);
  console.log(`  gap after the date: ${f(r.effectAverage)} packs on average, ${f(r.effectAtEnd)} at the end; rank ${r.rank} of ${r.donors + 1}, p ${f(r.p, 3)}`);
  if (STAT) console.log(`  statistics: ${Object.entries(r.tests).map(([key, t]) => `${key} ${f(t.value)} rank ${t.rank} p ${f(t.p, 3)}`).join('; ')} (floor ${f(r.floor)} packs); ranked by ${STAT}`);
  if (fake == null && state === 'CA') console.log(`  gap by year: ${years.slice(lo, hi).map((yy, i) => `${yy} ${f(r.gap[i], 1)}`).join(', ')}`);
  const row = { tag, state, date: fake ?? date, last, donors: r.donors, p: r.p, rank: r.rank, effectAverage: r.effectAverage, effectAtEnd: r.effectAtEnd, preRmspe: r.preRmspe, fitWarning: r.fitWarning };
  out.push(row);
  return row;
}
console.log('## T1 California, Proposition 99 (date 1989)');
const t1 = run('T1 Proposition 99 (+25c, 1 Jan 1989)', 'CA', 1989, 2000);
const t1met = t1.p <= 0.05 && t1.effectAverage >= -30 && t1.effectAverage <= -10 && t1.effectAtEnd < 0;
console.log(`T1 (p <= 0.05, average gap -30 to -10 packs, gap at 2000 below 0): ${t1met ? 'MET' : 'NOT MET'}`);
console.log('## T2-T4 other tax rises (each state against the donors still clean through its window)');
const others = [run('T2 Question 1 (+25c, 1 Jan 1993)', 'MA', 1993, 2000), run('T3 Proposition 200 (+40c, 1 Dec 1994)', 'AZ', 1995, 2002), run('T4 Measure 44 (+30c, 1 Feb 1997)', 'OR', 1997, 2004)];
const met = others.filter((r) => r.p <= 0.10 && r.effectAverage < 0).length;
console.log(`T2-T4: ${met} of 3 with p <= 0.10 and a negative average gap (bar at least 2): ${met >= 2 ? 'MET' : 'NOT MET'}`);
console.log('## I in-time placebos: California with the window cut at 1988');
const inTime = [run('I1', 'CA', 1989, 2000, { fake: 1980 }), run('I2', 'CA', 1989, 2000, { fake: 1984 })];
const iFired = inTime.filter((r) => r.p <= 0.05).length;
console.log(`I: ${iFired} of 2 with p <= 0.05 (bar 0): ${iFired === 0 ? 'MET' : 'NOT MET'}`);
console.log('## Q placebo states (state tax per pack changed by at most 2 cents FY1985-FY1995), date 1989, 1970-2000, the other 37 donors');
const PLACEBO = ['AL', 'GA', 'KY', 'MS', 'MT', 'SC', 'TN', 'VA', 'WV'];
const q = PLACEBO.map((s) => run(`Q ${s}`, s, 1989, 2000));
const qFired = q.filter((r) => r.p <= 0.05).length;
console.log(`Q: ${qFired} of 9 with p <= 0.05 (bar at most 1): ${qFired <= 1 ? 'MET' : 'NOT MET'}`);
if (process.env.SC_JSON) console.log(JSON.stringify(out));
