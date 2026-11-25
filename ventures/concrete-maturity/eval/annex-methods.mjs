// Monte Carlo check of the three ways to get a mix's temperature function
// from cubes at three temperatures (calibrate.mjs): the annex's straight line
// through 1/S vs 1/(t - t0), a least-squares hyperbola, and the value that
// brings every cube onto one curve. Truth: synthetic cubes from a known
// Arrhenius mix (syntheticCubes), so the true activation energy is known.
//
//   node eval/annex-methods.mjs [trials=100] > eval/annex-methods-2026-11-24.json
import { syntheticCubes, calibrateMix, collapseFit, collapseRmse } from '../calibrate.mjs';

const trials = Number(process.argv[2] || 100);
const TRUE_E = 42000;
const stats = xs => { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); const n = v.length; const mean = v.reduce((s, x) => s + x, 0) / n; const sd = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)); return { n, mean, sd, p05: v[Math.floor(0.05 * (n - 1))], median: v[Math.floor(0.5 * (n - 1))], p95: v[Math.floor(0.95 * (n - 1))] }; };
const out = { trueActivationEnergy: TRUE_E, trials, temps: [10, 23, 38], schedule: 'breaks at 2,4,8,16,32,64 x final setting, 3 cubes per age', cases: [] };
for (const cv of [0.03, 0.06, 0.10]) {
  for (const withSet of [true, false]) {
    const rows = { recipE: [], hypE: [], collE: [], recipT0: [], hypT0: [], collT0: [], nsRmseDatum0: [], nsRmseHypT0: [], nsRmseColl: [], eaRmseTrue: [], eaRmseHyp: [], eaRmseColl: [] };
    for (let s = 1; s <= trials; s++) {
      const { cubes, setting } = syntheticCubes({ cv, seed: 1000 * Math.round(cv * 100) + s });
      const set = withSet ? setting : [];
      const r = calibrateMix(cubes, set, { rateMethod: 'reciprocal' });
      const h = calibrateMix(cubes, set, { rateMethod: 'hyperbolic' });
      const ce = collapseFit(cubes, 'equivalent-age'); const cd = collapseFit(cubes, 'nurse-saul');
      rows.recipE.push(r.activation?.activationEnergy); rows.hypE.push(h.activation?.activationEnergy); rows.collE.push(ce?.value);
      rows.recipT0.push(r.datum?.datumC); rows.hypT0.push(h.datum?.datumC); rows.collT0.push(cd?.value);
      rows.nsRmseDatum0.push(collapseRmse(cubes, { method: 'nurse-saul', datumC: 0 }));
      if (h.datum) rows.nsRmseHypT0.push(collapseRmse(cubes, { method: 'nurse-saul', datumC: h.datum.datumC }));
      rows.nsRmseColl.push(cd?.rmse);
      rows.eaRmseTrue.push(collapseRmse(cubes, { method: 'equivalent-age', activationEnergy: TRUE_E }));
      if (h.activation) rows.eaRmseHyp.push(collapseRmse(cubes, { method: 'equivalent-age', activationEnergy: h.activation.activationEnergy }));
      rows.eaRmseColl.push(ce?.rmse);
    }
    const c = { cv, settingGiven: withSet };
    for (const [k, v] of Object.entries(rows)) c[k] = stats(v);
    out.cases.push(c);
    console.error(`cv ${cv} setting ${withSet}: E recip ${c.recipE.mean.toFixed(0)}±${c.recipE.sd.toFixed(0)}  hyp ${c.hypE.mean.toFixed(0)}±${c.hypE.sd.toFixed(0)}  coll ${c.collE.mean.toFixed(0)}±${c.collE.sd.toFixed(0)} | T0 recip ${c.recipT0.mean.toFixed(1)} hyp ${c.hypT0.mean.toFixed(1)} coll ${c.collT0.mean.toFixed(1)} | NS rmse d0 ${c.nsRmseDatum0.mean.toFixed(0)} hypT0 ${c.nsRmseHypT0.mean.toFixed(0)} coll ${c.nsRmseColl.mean.toFixed(0)} | EA rmse true ${c.eaRmseTrue.mean.toFixed(0)} hyp ${c.eaRmseHyp.mean.toFixed(0)} coll ${c.eaRmseColl.mean.toFixed(0)}`);
  }
}
console.log(JSON.stringify(out, null, 1));
