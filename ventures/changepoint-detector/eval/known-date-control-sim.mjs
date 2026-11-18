// Size and power of knownDateTest with a control series (README "A control series";
// eval/known-date-prereg-control-2026-11-17.md). node eval/known-date-control-sim.mjs [series] [reps] [arms]
// Each pair shares a common component C (AR(1) or a random walk, innovation sd 1) and, in some cells, a confounder
// that moves both series at the date (a shared step or slope change). control = a C + e_c, treated = 0.05 t + C + e_x
// (+ a step of `step` innovation sd at the date in the power cells), e_x and e_c independent AR(1) with rho_i, sd 1.
// Arms: plain (round 5's test on the treated series alone, no control), difference, regress. Rejections at p <= 0.05
// among tested series; "of all" counts refusals and cut-admitted (uncalibrated) results as no rejection.
// KD_SEED_BASE sets the seed base (exploratory 61000; confirmatory 67000, fixed in the pre-registration).
import { knownDateTest } from '../known-date.mjs';
const S = Number(process.argv[2]) || 200, REPS = Number(process.argv[3]) || 199;
const ARMS = (process.argv[4] || 'plain,difference,regress').split(',');
const SEED_BASE = Number(process.env.KD_SEED_BASE) || 61000;
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
function ar(n, rho, r) { const x = []; let u = rho >= 1 ? 0 : gauss(r) / Math.sqrt(1 - rho * rho); for (let t = 0; t < n; t++) { if (t) u = rho * u + gauss(r); x.push(u); } return x; }
function pair(n, k, r, { common, rhoI, sharedStep = 0, sharedSlope = 0, step = 0, a = 1 }) {
  const C = ar(n, common, r), ex = ar(n, rhoI, r), ec = ar(n, rhoI, r);
  const conf = (t) => (t >= k ? sharedStep + sharedSlope * (t - k) : 0);
  const x = C.map((c, t) => 0.05 * t + c + conf(t) + ex[t] + (t >= k ? step : 0));
  const ctl = C.map((c, t) => a * (c + conf(t)) + ec[t]);
  return { x, ctl };
}
const tally = () => ({ tested: 0, rej: 0, cut: 0, refused: 0 });
function cell(label, n, opt) {
  const k = Math.round(n / 2), r = mulberry(SEED_BASE + n * 7 + Math.round((opt.common ?? 0) * 100) + Math.round(opt.rhoI * 10) + label.length * 1000);
  const t = Object.fromEntries(ARMS.map((a) => [a, tally()]));
  for (let s = 0; s < S; s++) {
    const { x, ctl } = pair(n, k, r, opt);
    for (const arm of ARMS) {
      const h = knownDateTest(x, k, { reps: REPS, seed: SEED_BASE + s + 1, rhoGenMethod: 'gated', gateRho: 0.5, ...(arm === 'plain' ? {} : { control: ctl, controlMode: arm }) });
      const c = t[arm];
      if (h.refused) { c.refused++; continue; }
      if (h.admittedByCut) { c.cut++; continue; }
      c.tested++; if (h.p <= 0.05) c.rej++;
    }
  }
  const pc = (v, d) => (100 * v / Math.max(1, d)).toFixed(1).padStart(5);
  console.log(`${label.padEnd(30)} n ${String(n).padStart(3)}  ` + ARMS.map((a) => { const c = t[a]; return `${a} ${pc(c.rej, c.tested)}% of ${String(c.tested).padStart(3)} tested (${pc(c.rej, S)}% of all; refused ${c.refused}, cut ${c.cut})`; }).join(' | '));
  if (process.env.KD_JSON) console.log(JSON.stringify({ label, n, opt, t, S }));
}
console.log(`# control series, seed base ${SEED_BASE}, ${S} pairs per cell, ${REPS} replicates; arms ${ARMS.join(', ')}`);
console.log('## Size (no change in the treated series beyond what the control shares)');
cell('S1 common AR .9, shared slope', 120, { common: 0.9, rhoI: 0.4, sharedSlope: 0.05 });
cell('S2 common walk, shared step 2', 120, { common: 1, rhoI: 0.4, sharedStep: 2 });
cell('S3 common walk', 60, { common: 1, rhoI: 0 });
cell('S4 common AR .8', 40, { common: 0.8, rhoI: 0.4 });
cell('S5 common AR .5', 120, { common: 0.5, rhoI: 0 });
cell('S6 common walk, control x2', 120, { common: 1, rhoI: 0.4, a: 2 });
console.log('## Power (a step of 2 innovation sd in the treated series only)');
cell('P1 common walk, step 2', 120, { common: 1, rhoI: 0.4, step: 2 });
cell('P2 common AR .9, shared slope, step 2', 120, { common: 0.9, rhoI: 0.4, sharedSlope: 0.05, step: 2 });
cell('P3 common AR .8, step 2', 40, { common: 0.8, rhoI: 0.4, step: 2 });
