// The step alone, with a control series (README "The step alone, with a control series";
// eval/known-date-prereg-control-step-2026-11-17.md). node eval/known-date-control-step-sim.mjs [pairs] [reps] [cells]
// The control round (README "A control series") failed only on its placebo dates, where the joint test read a slow
// bend in the drivers-to-rear ratio; the step's own p fired at none of the five placebo dates. This script scores the
// step's p (pStep: |t| of the step at the date, in the model that also has a slope change, bootstrapped as shipped)
// on the difference arm, beside the joint p, in round-5-style cells plus cells where only the treated series bends.
// Each pair shares a common component C (AR(1) or a random walk, innovation sd 1); control = C + e_c, treated =
// 0.05 t + C + e_x + [treated-only bend or slope change] (+ a treated-only step in the power cells); e_x and e_c
// independent AR(1) with rho_i, sd 1. Rejections at p <= 0.05 among tested pairs; "of all" counts refusals and
// cut-admitted (uncalibrated) results as no rejection. KD_SEED_BASE: exploratory 91000, confirmatory 97000.
// KD_SHARD=i/m runs every m-th pair from i (merge the KD_JSON lines with known-date-control-step-merge.mjs).
import { knownDateTest, placeboCheck } from '../known-date.mjs';
const PLACEBO = process.env.KD_PLACEBO === '1'; // also run the in-time placebos on the difference series
const S = Number(process.argv[2]) || 200, REPS = Number(process.argv[3]) || 199;
const ONLY = process.argv[4] ? new Set(process.argv[4].split(',')) : null;
const SEED_BASE = Number(process.env.KD_SEED_BASE) || 91000;
const [SH_I, SH_M] = (process.env.KD_SHARD || '0/1').split('/').map(Number);
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
function ar(n, rho, r) { const x = []; let u = rho >= 1 ? 0 : gauss(r) / Math.sqrt(1 - rho * rho); for (let t = 0; t < n; t++) { if (t) u = rho * u + gauss(r); x.push(u); } return x; }
// bend: a treated-only quadratic, 0 at both ends and `bend` sd at the middle of the series (a ratio that curves);
// slope: a treated-only slope change at the date (no step); step: a treated-only step at the date.
function pair(n, k, r, { common, rhoI, sharedStep = 0, sharedSlope = 0, step = 0, bend = 0, slope = 0 }) {
  const C = ar(n, common, r), ex = ar(n, rhoI, r), ec = ar(n, rhoI, r);
  const conf = (t) => (t >= k ? sharedStep + sharedSlope * (t - k) : 0);
  const own = (t) => bend * 4 * (t / (n - 1)) * (1 - t / (n - 1)) + (t >= k ? step + slope * (t - k) : 0);
  const x = C.map((c, t) => 0.05 * t + c + conf(t) + own(t) + ex[t]);
  const ctl = C.map((c, t) => c + conf(t) + ec[t]);
  return { x, ctl };
}
function cell(id, label, n, opt, at = 0.5) {
  if (ONLY && !ONLY.has(id)) return;
  const k = Math.round(n * at), r = mulberry(SEED_BASE + n * 7 + Math.round((opt.common ?? 0) * 100) + Math.round(opt.rhoI * 10) + id.charCodeAt(0) * 1000 + Number(id.slice(1)) * 37);
  const t = { tested: 0, rejStep: 0, rejJoint: 0, cut: 0, refused: 0, pairs: 0, warn: 0, rejStepWarn: 0, rejStepClean: 0 };
  for (let s = 0; s < S; s++) {
    const { x, ctl } = pair(n, k, r, opt); // drawn for every s, so shards see the same pairs
    if (s % SH_M !== SH_I) continue;
    t.pairs++;
    const h = knownDateTest(x, k, { reps: REPS, seed: SEED_BASE + s + 1, rhoGenMethod: 'gated', gateRho: 0.5, control: ctl, controlMode: 'difference' });
    if (h.refused) { t.refused++; continue; }
    if (h.admittedByCut) { t.cut++; continue; }
    t.tested++; if (h.pStep <= 0.05) t.rejStep++; if (h.p <= 0.05) t.rejJoint++;
    if (PLACEBO) {
      const w = placeboCheck(x.map((v, i) => v - ctl[i]), k, { reps: REPS, seed: SEED_BASE + s + 1 }).warn;
      if (w) t.warn++;
      if (h.pStep <= 0.05) { if (w) t.rejStepWarn++; else t.rejStepClean++; }
    }
  }
  if (process.env.KD_JSON) { console.log(JSON.stringify({ id, label, n, k, opt, t })); return; }
  print({ id, label, n, k, t });
}
export function print({ id, label, n, k, t }) {
  const pc = (v, d) => (100 * v / Math.max(1, d)).toFixed(1).padStart(5);
  console.log(`${(id + ' ' + label).padEnd(44)} n ${String(n).padStart(3)} k ${String(k).padStart(3)}  step ${pc(t.rejStep, t.tested)}% of ${String(t.tested).padStart(3)} tested (${pc(t.rejStep, t.pairs)}% of all) | joint ${pc(t.rejJoint, t.tested)}% (${pc(t.rejJoint, t.pairs)}% of all) | refused ${t.refused}, cut ${t.cut}${t.warn + t.rejStepWarn + t.rejStepClean ? ` | placebos warn ${pc(t.warn, t.tested)}%; step rejections warned ${t.rejStepWarn} of ${t.rejStep}` : ''}`);
}
if (!process.env.KD_JSON) console.log(`# step alone with a control, seed base ${SEED_BASE}, ${S} pairs per cell, ${REPS} replicates, difference arm`);
// Size: no treated-only change at the date
cell('S1', 'common AR .9, shared slope', 120, { common: 0.9, rhoI: 0.4, sharedSlope: 0.05 });
cell('S2', 'common walk, shared step 2', 120, { common: 1, rhoI: 0.4, sharedStep: 2 });
cell('S3', 'common walk', 60, { common: 1, rhoI: 0 });
cell('S4', 'common AR .8', 40, { common: 0.8, rhoI: 0.4 });
cell('S5', 'common AR .5', 120, { common: 0.5, rhoI: 0 });
cell('S6', 'annual-like: common AR .8', 31, { common: 0.8, rhoI: 0.4 }, 19 / 31);
// Size for the step: the treated series alone bends or turns, no step (the placebo failure)
cell('B1', 'treated bends 8 sd, date mid', 120, { common: 0.5, rhoI: 0, bend: 8 });
cell('B2', 'treated bends 8 sd, date at 80%', 120, { common: 0.5, rhoI: 0, bend: 8 }, 0.8);
cell('B3', 'treated bends 4 sd, rho_i .4', 120, { common: 1, rhoI: 0.4, bend: 4 });
cell('B6', 'treated bends 4 sd, date at 80%', 120, { common: 0.5, rhoI: 0, bend: 4 }, 0.8);
cell('B4', 'treated slope change .05 at the date', 120, { common: 1, rhoI: 0.4, slope: 0.05 });
cell('B5', 'annual-like: treated bends 4 sd', 31, { common: 0.8, rhoI: 0.4, bend: 4 }, 19 / 31);
// Power: a treated-only step of 2 innovation sd
cell('P1', 'common walk, step 2', 120, { common: 1, rhoI: 0.4, step: 2 });
cell('P2', 'common AR .9, shared slope, step 2', 120, { common: 0.9, rhoI: 0.4, sharedSlope: 0.05, step: 2 });
cell('P3', 'common AR .8, step 2', 40, { common: 0.8, rhoI: 0.4, step: 2 });
cell('P4', 'treated bends 8 sd, step 2', 120, { common: 0.5, rhoI: 0, bend: 8, step: 2 });
cell('P5', 'annual-like: step 3', 31, { common: 0.8, rhoI: 0.4, step: 3 }, 19 / 31);
