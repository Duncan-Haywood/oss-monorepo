// Real pairs for the step alone with a control (eval/known-date-prereg-control-step-2026-11-17.md): state cigarette
// tax increases, each state's packs per head against the mean of Abadie, Diamond and Hainmueller's (2010) 38 donor
// states, logs, annual (fiscal years), 999 replicates, seed 1, round 5's settings with controlMode 'difference', and
// the in-time placebos run on the same log ratio. node eval/known-date-control-step-real.mjs
import { readFileSync } from 'node:fs';
import { knownDateTest, placeboCheck } from '../known-date.mjs';
const [h, ...rows] = readFileSync(new URL('../data/us-cigarette-packs-per-capita.csv', import.meta.url), 'utf8').trim().split('\n');
const head = h.split(','), data = rows.map((l) => l.split(',').map(Number));
const years = data.map((r) => r[0]);
const col = (s) => data.map((r) => r[head.indexOf(s)]);
// Abadie et al. (2010) drop states with large tobacco-control programmes or tax rises of 50 cents or more in 1989-2000
// (AK, AZ, FL, HI, MD, MA, MI, NJ, NY, OR, WA) and DC; the other 38 are the donor pool. California is the treated one.
const EXCLUDED = new Set('AK AZ FL HI MD MA MI NJ NY OR WA DC CA'.split(' '));
const DONORS = head.slice(1).filter((s) => !EXCLUDED.has(s));
if (DONORS.length !== 38) throw new Error(`donor pool has ${DONORS.length} states`);
const meanOf = (states) => data.map((r) => states.reduce((a, s) => a + r[head.indexOf(s)], 0) / states.length);
const f = (v, p = 3) => Number(v).toFixed(p);
const out = [];
function run(tag, state, date, last, without = []) {
  const ctlStates = DONORS.filter((s) => s !== state && !without.includes(s));
  const lo = years.indexOf(1970), hi = years.indexOf(last) + 1;
  const x = col(state).slice(lo, hi).map(Math.log), c = meanOf(ctlStates).slice(lo, hi).map(Math.log);
  const k = years.slice(lo, hi).indexOf(date);
  const r = knownDateTest(x, k, { reps: 999, seed: 1, rhoGenMethod: 'gated', gateRho: 0.5, control: c, controlMode: 'difference' });
  const res = { tag, state, date, n: x.length, k, refused: r.refused };
  if (r.refused) { console.log(`${tag}: ${state} ${date}, 1970-${last}: REFUSED (${r.reason})`); out.push(res); return res; }
  const pl = placeboCheck(x.map((v, i) => v - c[i]), k, { reps: 999, seed: 1 });
  Object.assign(res, { step: r.step, pStep: r.pStep, p: r.p, admittedByCut: !!r.admittedByCut, warn: pl.warn });
  console.log(`${tag}: ${state} ${date}, 1970-${last} (n ${x.length}, k ${k}), log ratio to the mean of ${ctlStates.length} donors`);
  console.log(`  step ${f(r.step)} (${f(100 * (Math.exp(r.step) - 1), 1)}%) [${f(r.stepRange95[0])}, ${f(r.stepRange95[1])}] p ${f(r.pStep, 4)}; slope ${f(r.slopeBefore, 4)} + ${f(r.slopeChange, 4)} p ${f(r.pSlope, 4)}; joint p ${f(r.p, 4)}; rho ${f(r.rho)}${r.gated ? ' (gated)' : ''}${r.admittedByCut ? ', ADMITTED BY THE CUT' : ''}`);
  console.log(`  in-time placebos on the ratio: ${pl.dates.map((d) => `${years[lo + d.k]} ${d.refused ? 'refused' : `p ${f(d.p, 3)} (step p ${f(d.pStep, 3)})`}`).join(', ')}; ${pl.fired} of ${pl.tested} fired${pl.warn ? ', WARNS' : ''}`);
  out.push(res);
  return res;
}
// a step-only finding: tested (not refused, not cut-admitted), step p <= 0.05 and no placebo warning
const finding = (r) => !r.refused && !r.admittedByCut && r.pStep <= 0.05 && !r.warn;
console.log('## Tax rises (predicted: a fall at the date)');
const t1 = run('T1 Proposition 99 (+25c, 1 Jan 1989)', 'CA', 1989, 2000);
console.log(`T1 prediction (step < 0, a finding): ${finding(t1) && t1.step < 0 ? 'MET' : 'NOT MET'}`);
const others = [run('T2 Question 1 (+25c, 1 Jan 1993)', 'MA', 1993, 2004), run('T3 Proposition 200 (+40c, 1 Dec 1994)', 'AZ', 1995, 2006), run('T4 Measure 44 (+30c, 1 Feb 1997)', 'OR', 1997, 2008)];
const met = others.filter((r) => finding(r) && r.step < 0).length;
console.log(`T2-T4: ${met} of 3 with a fall found (prediction at least 2: ${met >= 2 ? 'MET' : 'NOT MET'})`);
console.log('## Placebo states (state tax per pack changed by at most 2 cents from FY1985 to FY1995), date 1989, 1970-2000');
const PLACEBO = ['AL', 'GA', 'KY', 'MS', 'MT', 'SC', 'TN', 'VA', 'WV'];
const fired = PLACEBO.map((s) => run(`Q ${s}`, s, 1989, 2000)).filter(finding).length;
console.log(`Q: ${fired} of ${PLACEBO.length} placebo states with a step found (prediction at most 1: ${fired <= 1 ? 'MET' : 'NOT MET'})`);
if (process.env.KD_JSON) console.log(JSON.stringify(out));
