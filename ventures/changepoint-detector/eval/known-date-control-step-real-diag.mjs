// After the run, not pre-registered (README "The step alone, with a control series"): why 11 of 13 real tobacco pairs
// were refused. (1) For every donor state against the mean of the other 37, 1970-2000 annual logs, the guard's two
// readings: rho of the residuals about a plain line (the cut guard's first check) and about the before-and-after
// lines at 1989. (2) The tax-rise pairs with the guard switched off (rhoMax 0.99, no cut guard): the estimates a
// regression package would print, with round 5's bootstrap at a rho near a unit root. NOT calibrated tests.
// node eval/known-date-control-step-real-diag.mjs
import { readFileSync } from 'node:fs';
import { knownDateTest, knownDateStatistic } from '../known-date.mjs';
const [h, ...rows] = readFileSync(new URL('../data/us-cigarette-packs-per-capita.csv', import.meta.url), 'utf8').trim().split('\n');
const head = h.split(','), data = rows.map((l) => l.split(',').map(Number)), years = data.map((r) => r[0]);
const EXCLUDED = new Set('AK AZ FL HI MD MA MI NJ NY OR WA DC CA'.split(' '));
const DONORS = head.slice(1).filter((s) => !EXCLUDED.has(s));
const col = (s) => data.map((r) => r[head.indexOf(s)]);
const meanOf = (ss) => data.map((r) => ss.reduce((a, s) => a + r[head.indexOf(s)], 0) / ss.length);
const ratio = (s, last) => { const lo = years.indexOf(1970), hi = years.indexOf(last) + 1, c = meanOf(DONORS.filter((d) => d !== s)); return col(s).slice(lo, hi).map((v, i) => Math.log(v) - Math.log(c.slice(lo, hi)[i])); };
function lag1(e) { let a = 0, b = 0; for (let i = 0; i < e.length; i++) { b += e[i] * e[i]; if (i) a += e[i] * e[i - 1]; } return a / b; }
const corrected = (r, n) => r + (1 + 3 * r) / n;
function lineRho(x) { const n = x.length, tm = (n - 1) / 2, xm = x.reduce((a, v) => a + v, 0) / n; let sxy = 0, sxx = 0; x.forEach((v, t) => { sxy += (t - tm) * (v - xm); sxx += (t - tm) ** 2; }); const b = sxy / sxx; return corrected(lag1(x.map((v, t) => v - xm - b * (t - tm))), n); }
const f = (v, p = 2) => Number(v).toFixed(p);
console.log('## (1) Every donor state against the other 37, 1970-2000, log ratio (bias-corrected lag-1 rho)');
const rs = DONORS.map((s) => { const x = ratio(s, 2000), k = 19, st = knownDateStatistic(x, k); return { s, line: lineRho(x), full: corrected(lag1(st.u), x.length) }; });
rs.sort((a, b) => a.line - b.line);
console.log(rs.map((r) => `${r.s} ${f(r.line)}/${f(r.full)}`).join('  '));
const q = (arr, p) => { const a = [...arr].sort((u, v) => u - v); return a[Math.floor(p * (a.length - 1))]; };
console.log(`about a line: median ${f(q(rs.map((r) => r.line), 0.5))}, ${rs.filter((r) => r.line > 0.7).length} of ${rs.length} above the guard's 0.7`);
console.log(`about the before-and-after lines at 1989: median ${f(q(rs.map((r) => r.full), 0.5))}, ${rs.filter((r) => r.full > 0.7).length} of ${rs.length} above 0.7`);
console.log('## (2) Tax rises with the guard off (rhoMax 0.99, guard none): NOT calibrated');
for (const [tag, s, date, last] of [['T1', 'CA', 1989, 2000], ['T2', 'MA', 1993, 2004], ['T3', 'AZ', 1995, 2006], ['T4', 'OR', 1997, 2008]]) {
  const x = ratio(s, last), k = years.indexOf(date) - years.indexOf(1970);
  const r = knownDateTest(x, k, { reps: 999, seed: 1, rhoGenMethod: 'gated', gateRho: 0.5, rhoMax: 0.99, guard: 'none' });
  console.log(`${tag} ${s} ${date}: ${r.refused ? `refused (${r.reason})` : `step ${f(r.step, 3)} (${f(100 * (Math.exp(r.step) - 1), 1)}%) [${f(r.stepRange95[0], 3)}, ${f(r.stepRange95[1], 3)}] step p ${f(r.pStep, 3)}; slope change ${f(r.slopeChange, 4)} p ${f(r.pSlope, 3)}; GLS rho ${f(r.rho)}, rho about the lines ${f(r.rhoFull)}`}`);
}
