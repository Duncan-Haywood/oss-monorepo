// Text and JSON for `node cli.mjs --model drift` (drift-level.mjs). Kept apart from engine.mjs so
// the level model's hundred-odd pinned real-series results cannot move.
import { parseSeries } from './engine.mjs';
import { driftLevel } from './drift-level.mjs';

export const DRIFT_PAPER = {
  authors: 'Gaetano Romano, Guillem Rigaill, Vincent Runge and Paul Fearnhead',
  title: 'Detecting Abrupt Changes in the Presence of Local Fluctuations and Autocorrelated Noise',
  venue: 'Journal of the American Statistical Association (2022), doi 10.1080/01621459.2021.1909598',
  url: 'https://arxiv.org/abs/2005.01379',
  implemented: 'The random-walk-plus-noise model (the paper\'s phi = 0 case) and its robust lag-difference estimate of the noise variance.',
  deviations: 'Solved by exact optimal partitioning over segments with a local-level Kalman cost (a change restarts the level from a flat prior) instead of functional pruning; no AR(1) noise term; lags 1 to 10 fitted by least squares; by default the wander variance is then chosen together with the changes by penalised likelihood (--drift-noise lags keeps the lag-difference value).',
};

// Heavy-tail figures quoted in the text, from eval/tcpd-drift-robust.out.txt (pre-registered:
// biweight everywhere) and eval/drift-tails-sim.out.txt (synthetic; a test checks they match).
export const DRIFT_TAILS = {
  tcpd: { biweightShipped: 0.677, biweightHeldout: 0.441, bankGauss: 63, bankBiweight: 111, wellGauss: 21, wellBiweight: 15 },
  sim: { t3NoiseGauss: 3.0, t3NoiseBiweight: 0.05, t3WalkGauss: 17.4, t3WalkBiweight: 18.08 },
};

// TCPD figures quoted in the text, from eval/tcpd-drift-ml.out.txt (ml: wander by penalised
// likelihood, the default; lags: from lag differences) and eval/tcpd-drift.out.txt (a test checks
// they match).
export const DRIFT_TCPD = {
  shipped: { ml: 0.694, lags: 0.677, level: 0.477, warn: 0.655, zero: 0.663 },
  heldout: { ml: 0.527, lags: 0.420, level: 0.296, warn: 0.497, zero: 0.639 },
};

export function driftResult({ csv, column = null, labelColumn = null, penalty = null, minSegment = null, slope = false, noise = 'ml', loss = 'gauss' }) {
  const { labels, values, column: col, skipped } = parseSeries(csv, column, labelColumn);
  if (values.length < 4) throw new Error('Need at least 4 values.');
  const pen = penalty == null || penalty === 'bic' ? undefined : Number(penalty);
  if (pen !== undefined && !(pen >= 0)) throw new Error('--model drift takes --penalty bic or a number (on the -2 log likelihood scale, noise sd 1).');
  const r = driftLevel(values, { penalty: pen, minSegment: minSegment == null ? 2 : Number(minSegment), slope: !!slope, noise: noise ?? 'ml', loss: loss ?? 'gauss' });
  return {
    model: 'drift', column: col, n: values.length, skipped,
    sigma: r.sigma, omega: r.omega, penalty: r.penalty, slope: r.slope, noise: r.noise,
    omegaFromLags: r.ml ? r.ml.start.omega : r.omega,
    loss: r.loss, lossC: r.lossC, tails: r.tails,
    changes: r.changes.map((c) => ({ ...c, label: labels[c.index] })),
    level: r.level, labels,
    method: DRIFT_PAPER,
  };
}

const fmt = (v) => (Math.abs(v) >= 100 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(3) : v.toPrecision(3));

export function driftText(r) {
  const L = [];
  L.push(`${r.column}: ${r.n} values${r.skipped ? ` (${r.skipped} non-numeric rows skipped)` : ''}. Model: jumps on a drifting level (random walk between changes).`);
  const how = r.noise === 'ml'
    ? `noise sd from lag differences; wander chosen together with the changes by penalised likelihood, so one big step is not absorbed as wander (lag differences alone said ${fmt(r.omegaFromLags)}; --drift-noise lags uses that)`
    : 'both from lag differences, before any change is fitted';
  L.push(`Noise sd ${fmt(r.sigma)}; the level wanders by about ${fmt(r.omega)} a step between changes (${how}). Penalty ${r.penalty.toFixed(2)} per change.${r.slope ? ` A steady growth of ${fmt(r.slope)} a step was taken out first (--drift-slope).` : ''}`);
  if (!r.changes.length) L.push('No jump stands out from the drift.');
  else {
    L.push(`${r.changes.length} jump${r.changes.length === 1 ? '' : 's'} too big for the drift:`);
    for (const c of r.changes) L.push(`  ${c.label}: level ${fmt(c.before)} -> ${fmt(c.after)} (${c.jump >= 0 ? '+' : ''}${fmt(c.jump)}, ${c.jumpSd >= 0 ? '+' : ''}${c.jumpSd.toFixed(1)} noise sd)`);
  }
  if (r.loss && r.loss !== 'gauss') L.push(`Cost: ${r.loss} (an innovation beyond ${r.lossC} sd ${r.loss === 'biweight' ? 'costs a fixed amount and does not move the level' : 'costs linearly, not quadratically'}).`);
  L.push(...tailLines(r));
  const t = DRIFT_TCPD;
  L.push('');
  const k = r.noise === 'ml' ? 'ml' : 'lags';
  L.push(`On the Turing Change Point Dataset (eval/tcpd-drift-ml.out.txt): F1 ${t.shipped[k].toFixed(3)} on 31 shipped series (plain level model ${t.shipped.level}, level following its over-cut warning ${t.shipped.warn}, reporting nothing ${t.shipped.zero}) and ${t.heldout[k].toFixed(3)} on 7 held out (${t.heldout.level.toFixed(3)}, ${t.heldout.warn.toFixed(3)}, ${t.heldout.zero.toFixed(3)}); ${k === 'ml' ? `the lag-difference wander scores ${t.shipped.lags.toFixed(3)} and ${t.heldout.lags.toFixed(3)}` : `the default (wander by likelihood) scores ${t.shipped.ml.toFixed(3)} and ${t.heldout.ml.toFixed(3)}`}; its gaps to the other drift setting and to the warning's refit have 95% intervals that include zero. It tames smooth and wandering series; heavy tails and volatility bursts (stock prices, counts) still over-cut it.`);
  L.push(`Method: ${DRIFT_PAPER.authors}, ${DRIFT_PAPER.title}. ${DRIFT_PAPER.venue}. ${DRIFT_PAPER.url} (${DRIFT_PAPER.deviations})`);
  L.push('Statistical analysis of data you supply, not advice.');
  return L.join('\n');
}

// The heavy-tail check's lines (drift-level.mjs driftTailCheck): where the tails are, and what that
// means for these jumps. Empty when the steps are not heavy-tailed.
export function tailLines(r) {
  const c = r.tails;
  if (!c || !c.kind) return [];
  const T = DRIFT_TAILS, k = c.stepKurtosis.toFixed(1);
  if (c.kind === 'walk') return [`Heavy-tail check: this reads as a random walk with heavy-tailed steps (kurtosis of the steps ${k}; no noise around the level beyond the fit's floor). In a random walk a jump is one big step, so these jumps may be the walk's largest steps, not changes. A robust cost does not help here (synthetic heavy-tailed walks: ${T.sim.t3WalkGauss} false jumps a series with the default cost, ${T.sim.t3WalkBiweight} with biweight; TCPD's bank: ${T.tcpd.bankGauss} and ${T.tcpd.bankBiweight}, where annotators mark none). For changes in how much it moves, try --model meanvar on its differences.`];
  if (r.loss === 'biweight') return [`Heavy-tail check: the noise around the level is heavy-tailed (kurtosis of the steps ${k}), the case the biweight cost is for.`];
  return [`Heavy-tail check: the noise around the level is heavy-tailed (kurtosis of the steps ${k}), so lone outliers may be read as jumps. Try --drift-loss biweight (synthetic heavy-tailed noise: ${T.sim.t3NoiseGauss.toFixed(2)} false jumps a series with the default cost, ${T.sim.t3NoiseBiweight} with biweight; TCPD's well log ${T.tcpd.wellGauss} cuts to ${T.tcpd.wellBiweight}, F1 0.764 to 0.874).`];
}
