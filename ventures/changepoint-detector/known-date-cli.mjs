// `--known-date <label>` in the CLI: the interrupted-time-series test at a date the user names (known-date.mjs), with
// round 5's settings (eval/known-date-prereg-round5-2026-11-16.md): matched-rho bootstrap, the 90% upper bound for rho
// as a second generator when the line residuals' rho is above 0.5 (larger p), and the random-walk cut guard.
import { parseSeries, DEFAULTS } from './engine.mjs';
import { knownDateTest } from './known-date.mjs';

export function knownDateResult({ csv, column = null, labelColumn = null, date, period = 0, log = false, reps = 999, seed = 1 }) {
  const { values, labels } = parseSeries(csv ?? DEFAULTS.csv, column, labelColumn);
  const k = labels.indexOf(String(date));
  if (k < 0) throw new Error(`--known-date ${date}: no row has that label (labels run ${labels[0]} to ${labels[labels.length - 1]}; the date is the first point after the change)`);
  if (log && values.some((v) => !(v > 0))) throw new Error('--log needs every value above zero.');
  const x = log ? values.map(Math.log) : values;
  const h = knownDateTest(x, k, { period: Number(period) || 0, reps, seed, rhoGenMethod: 'gated', gateRho: 0.5 });
  // calibrated: false when only the random-walk cut let the series through. Round 5's size held on series the line
  // checks pass (0.7-4.9% in every sticky cell), but no-change series passed only by the cut were flagged 17 times in
  // 26 (eval/known-date-cut-admitted.out.txt): a spurious step is what makes the cut large. Their p is shown, not trusted.
  return { date: String(date), scale: log ? 'log' : 'level', firstAfter: labels[k], lastBefore: labels[k - 1] ?? null, ...h, ...(h.refused ? {} : { calibrated: !h.admittedByCut }) };
}

const r3 = (v) => Number(v).toPrecision(3), p4 = (v) => Number(v).toFixed(4);
export function knownDateText(h) {
  const lines = [`A change at a date you named (${h.lastBefore} -> ${h.firstAfter}), tested on the ${h.scale === 'log' ? 'logs (a step of -0.1 is about a 10% fall)' : 'levels'}${h.period ? `, with ${h.period} seasons` : ''}:`];
  if (h.refused) { lines.push(`  Not tested: ${h.reason}.`); return lines.join('\n'); }
  lines.push(`  Joint test (step and slope change both zero): p ${p4(h.p)} (bootstrap, ${h.reps} replicates; the F table would say ${p4(h.pTable)})`);
  lines.push(`  Step at the date: ${r3(h.step)}, 95% range ${r3(h.stepRange95[0])} to ${r3(h.stepRange95[1])}, p ${p4(h.pStep)}`);
  lines.push(`  Slope: ${r3(h.slopeBefore)} per step before, change ${r3(h.slopeChange)} (95% range ${r3(h.slopeChangeRange95[0])} to ${r3(h.slopeChangeRange95[1])}), p ${p4(h.pSlope)}`);
  lines.push(`  Effect against the old line: ${r3(h.effectAverage)} on average after the date, ${r3(h.effectAtEnd)} at the last point`);
  lines.push(`  Noise: AR(1) rho ${h.rho.toFixed(2)}${h.gated ? `; the residuals about a plain line are sticky (rho ${h.lineRho.toFixed(2)} > 0.5), so the p is the larger of two bootstraps, at rho ${h.rhoGen.map((v) => v.toFixed(2)).join(' and ')} (the second a 90% upper bound)` : ''}`);
  if (h.admittedByCut) lines.push(`  NOT A CALIBRATED TEST HERE: a plain line's residuals look like a wander (rho ${h.rhoLine.toFixed(2)}), and the series was let through only because the step and slope change cut that more than 99% of random walks cut at this date (${h.cutBar.toFixed(2)}). On simulated no-change series let through this way, 17 of 26 got p <= 0.05, so read the p-values above as a description, not as evidence of a change.`);
  lines.push('  (Segmented regression with AR(1) noise and a parametric bootstrap; at p 0.05 it flagged 1.0-5.8% of simulated no-change lines of 40-120 points, eval/known-date-sim-round5.out.txt. A small p says the line before the date does not carry on through it; it does not say what caused the change. A control series the change should not touch is the best check.)');
  return lines.join('\n');
}
