// Largest relative difference between the engine and statsmodels at equal variances, per quantity,
// over every case in eval/reference.json. Run: node ventures/kalman-smoother/eval/agreement.mjs
import { readFileSync } from "node:fs";
import { buildModel, kalmanFilter, kalmanSmoother } from "../engine.mjs";

const REF = JSON.parse(readFileSync(new URL("./reference.json", import.meta.url), "utf8"));
const worst = {};
const note = (k, a, b, scale) => {
  const d = Math.abs(a - b) / Math.max(Math.abs(b), scale);
  worst[k] = Math.max(worst[k] ?? 0, d);
};
for (const c of REF.cases) {
  const model = buildModel(c.spec, c.variances);
  const f = kalmanFilter(model, c.y);
  const s = kalmanSmoother(model, f);
  const sy = Math.max(...c.y.filter((v) => v != null).map(Math.abs));
  note("loglik", f.loglik, c.loglik, 1);
  for (let t = 0; t < c.y.length; t++) {
    for (let i = 0; i < c.smoothedState.length; i++) {
      note("smoothed state", s.state[t][i], c.smoothedState[i][t], 1e-6 * sy);
      note("smoothed state variance", s.stateVar[t][i][i], c.smoothedStateVar[i][t], 1e-9 * sy * sy);
    }
    note("smoothed irregular", s.eps[t].mean, c.smoothedIrregular[t], 1e-6 * sy);
    note("smoothed irregular variance", s.eps[t].var, c.smoothedIrregularVar[t], 1e-9 * sy * sy);
    note("smoothed level disturbance", s.eta[t].mean[0], c.smoothedLevelDisturbance[t], 1e-6 * sy);
    note("smoothed level disturbance variance", s.eta[t].varDiag[0], c.smoothedLevelDisturbanceVar[t], 1e-9 * sy * sy);
    if (f.steps[t].kind === "std") {
      note("one-step error", f.steps[t].v, c.forecastError[t], 1e-6 * sy);
      note("one-step variance", f.steps[t].F, c.forecastErrorVar[t], 1e-9);
    }
  }
}
console.log(`statsmodels ${REF.statsmodels}, ${REF.cases.length} cases`);
for (const [k, v] of Object.entries(worst)) console.log(`${k.padEnd(38)} ${v.toExponential(1)}`);
