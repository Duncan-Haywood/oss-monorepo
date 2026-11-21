// Changepoint detection for a numeric series: when did its level or its
// volatility change, and how sure can we be?
//
// Two methods from the literature, run side by side:
//
//  * PELT (Killick, Fearnhead & Eckley 2012): the exact minimum of
//    -2 log-likelihood + penalty x (number of changes) over every possible
//    segmentation, found in about linear time by pruning candidates that can
//    never be optimal. Gives the segmentation.
//  * Bayesian online changepoint detection (Adams & MacKay 2007): a posterior
//    over the "run length" (time since the last change) updated one point at a
//    time, with a Normal-Inverse-Gamma prior on each segment's mean and
//    variance. Gives a probability for each candidate change.
//
// Pure functions, no DOM, no network, no randomness: the same input always
// gives the same output, in the browser, the CLI and `platform/agents/tools.mjs`.

import { NILE_CSV } from './example-data.mjs';
import { slopeBreaks } from './slope-breaks.mjs';
import { hingeTest } from './hinge-test.mjs';
import { twoHingeTest } from './two-hinge.mjs';
import { knownDateTest, placeboCheck } from './known-date.mjs';
import { groupRamps } from './ramps.mjs';
import { updateRateChanges, updateRateLines, spellsResult, spellsLine } from './update-rate.mjs';
import { robustSd, median } from './stats-core.mjs';
import { garchCost, garchCuts, GARCH_CUT_PEN, GARCH_TERM_PEN } from './garch.mjs';
export { garchSigma, garchSegLL, garchCost, garchForward, garchCuts, GARCH_CUT_PEN, GARCH_TERM_PEN, GARCH_T_PEN, GARCH_T_NUS, GARCH_GRID, GARCH_T_PASSES } from './garch.mjs';
import { parseSeries } from './parse-series.mjs';
import { bocpd, defaultPrior, peaks } from './bocpd.mjs';
export { robustSd, lgamma, digamma, trigamma, nbPairCheck } from './stats-core.mjs';
export { splitLine, numCell, parseSeries } from './parse-series.mjs';
import { GROWTH_RANGE_NB_NOTE, ar1JointFit, ar1Rho, blockVarianceRatio, countDispersion, fisherG, localFitScale, longRunSd, prewhiten, stepResiduals, preSteps } from './presteps.mjs';
import { bootstrapPenalty, clumpingOut, fmt, makeCost, meanvarNoiseCheck, pelt, penaltyValue, round, squaredDispersion, stats } from './segmentation.mjs';
export { ar1JointFit, ar1ProfileFit, ar1Rho, ar2ProfileFit, blockVarianceRatio, countDispersion, findBursts, fisherG, lineRss, localFitScale, longRunSd, lsKnots, poissonHolidays, poissonSeasonal, poissonTrend, prewhiten, seasonalAdjust, stepResiduals, preSteps, trendAdjust } from './presteps.mjs';
export { bootstrapPenalty, clumpingLaw, makeCost, meanvarNoiseCheck, nb1Dispersion, negbinSize, negbinSizeGlobal, optimalPartitioning, pelt, penaltyValue, poissonBootstrapPenalty, squaredDispersion } from './segmentation.mjs';
export { bocpd, defaultPrior, defaultPoissonPrior, defaultNbPrior, gammaPoissonLogMarginal, nigLogMarginal, peaks } from './bocpd.mjs';

export const PAPERS = [
  {
    authors: 'Ryan Prescott Adams and David J. C. MacKay',
    title: 'Bayesian Online Changepoint Detection',
    venue: 'arXiv preprint arXiv:0710.3742',
    year: 2007,
    url: 'https://arxiv.org/abs/0710.3742',
    implemented:
      'The run-length recursion (Algorithm 1) with a constant hazard 1/lambda and a Normal-Inverse-Gamma conjugate model, so each segment has an unknown mean and variance and the predictive is Student-t.',
    deviations:
      'The prior is centred on the data (median and robust variance), an empirical-Bayes choice the paper leaves open. Run lengths whose posterior mass falls below 1e-10 are pruned. Because P(r_t = 0) equals the hazard under a constant hazard, a change is reported as the probability, seen `lag` points later, that the run started at that point.',
    bibtex: `@article{adams2007bayesian,
  title   = {Bayesian Online Changepoint Detection},
  author  = {Adams, Ryan Prescott and MacKay, David J. C.},
  journal = {arXiv preprint arXiv:0710.3742},
  year    = {2007}
}`,
  },
  {
    authors: 'Rebecca Killick, Paul Fearnhead and Idris A. Eckley',
    title: 'Optimal Detection of Changepoints With a Linear Computational Cost',
    venue: 'Journal of the American Statistical Association 107(500): 1590-1598',
    year: 2012,
    url: 'https://arxiv.org/abs/1101.1438',
    doi: '10.1080/01621459.2012.737745',
    implemented:
      'PELT with Gaussian -2 log-likelihood costs for a change in mean (variance estimated once, robustly) or in mean and variance, and K = 0 in the pruning rule, which is valid for these costs.',
    deviations:
      'The known variance of the mean-only model is estimated from the median absolute difference of successive points, so a few level shifts do not inflate it.',
    bibtex: `@article{killick2012optimal,
  title   = {Optimal Detection of Changepoints With a Linear Computational Cost},
  author  = {Killick, Rebecca and Fearnhead, Paul and Eckley, Idris A.},
  journal = {Journal of the American Statistical Association},
  volume  = {107},
  number  = {500},
  pages   = {1590--1598},
  year    = {2012},
  doi     = {10.1080/01621459.2012.737745}
}`,
  },
];

export const DEFAULTS = {
  // CSV text: one numeric column, or a label/time column and a value column.
  csv: NILE_CSV,
  // Value column by header name or 0-based index; null picks the last numeric column.
  column: null,
  // Label column (years, dates) by name or index; null uses the first column if it is not the value column.
  labelColumn: null,
  // 'mean': change in level only. 'meanvar': change in level and/or volatility.
  // 'poisson': change in the rate of a count series (whole numbers, 0 or more).
  // 'trend': change in level or slope, a straight line per segment (a series that climbs or falls).
  model: 'mean',
  // 'bic', 'aic', 'hannan-quinn', or a number (the cost of one extra change).
  penalty: 'bic',
  // Shortest segment PELT may return; null means 2 for 'mean' and 10 for
  // 'meanvar', where a variance fitted to two or three points is so unreliable
  // that its likelihood gain alone would justify a change.
  minSegment: null,
  // BOCPD prior expected run length (1 / hazard), in points.
  hazardLambda: 100,
  // BOCPD looks this many points past a candidate before scoring it.
  lag: 5,
  // BOCPD reports candidates whose probability reaches this.
  threshold: 0.5,
  // Seasonal period in points (12 for monthly data with a yearly cycle, 7 for
  // daily data with a weekly one); 0 or null for none. The per-phase median of
  // the detrended series is subtracted before detection ('mean' and 'meanvar').
  period: 0,
  // true: let the seasonal shape drift (running median across cycles) instead of one fixed profile.
  drift: false,
  // true: widen the noise scale of the 'mean' model for lag-1 autocorrelation
  // so a drifting, sticky series is not cut into many false segments. 'joint': fit the
  // segment means and rho together on the exact AR(1) likelihood (more power on small shifts).
  ar1: false,
  // true: fit one linear trend under the steps and remove it, so a slow ramp is not read as many
  // small level changes (mean and meanvar models; applied after the seasonal adjustment).
  // 'bend': also allow the slope to change once (knot and second slope chosen by BIC).
  // 'bends': up to three slope changes, added greedily while BIC keeps falling.
  trend: false,
  // fraction of the series kept clear at each end when searching for slope-change knots (default 0.1, knots at 10 to 90%; 0.2 was the default before 2026-10-20).
  knotMargin: 0.1,
};

// ---------------------------------------------------------------- analyze

/**
 * Run both methods on a series. Input: DEFAULTS overlaid with the caller's
 * fields; `values` (array of numbers) may replace `csv`.
 */
export function analyze(input = {}) {
  const o = { ...DEFAULTS, ...input };
  let labels, values, column, skipped = 0;
  if (Array.isArray(o.values)) {
    values = o.values.map(Number).filter(Number.isFinite);
    labels = Array.isArray(o.labels) ? o.labels.map(String) : values.map((_, i) => String(i + 1));
    column = 'values';
    skipped = o.values.length - values.length;
  } else {
    ({ labels, values, column, skipped } = parseSeries(o.csv, o.column, o.labelColumn));
  }
  if (values.length < 4) throw new Error(`Need at least 4 numbers; got ${values.length}.`);
  if (values.length > 100000) throw new Error('More than 100,000 points: aggregate the series first.');
  const pre = preSteps(o, values, labels);
  values = pre.values;
  let { sigma, rho } = pre;
  const { model, original0, period, burstInfo, rawCounts, phi, penalty, nbSize, nb1Delta, profile, exposure, seasonMultiplicative, original, holidayFit, slope, slopeAfter, knot, knots, slopes, knotRanges, curvature, curved, growth, countKnot, growthAfter, countKnots, countRates, countRanges, noiseFloorK, noiseFloorHit, joint } = pre;
  const minSegment = Math.max(1, Math.floor(Number(o.minSegment) || (model === 'meanvar' ? 10 : model === 'trend' ? 4 : 2)));
  // robust: the variance model with Laplace noise, for heavy tails (eval/meanvar-laplace.mjs, README)
  const robust = !!o.robust && model === 'meanvar';
  if (o.robust && model !== 'meanvar') throw new Error('The robust cost is for the "meanvar" model only.');
  let p;
  if (joint) {
    p = ar1JointFit(values, { penalty: o.penalty, minSegment });
    ({ rho, sigma } = p);
  } else p = isFinite(nbSize) && nbSize > 0 ? pelt(values, { model: 'negbin', penalty, minSegment, size: nbSize, exposure }) : nb1Delta > 0 ? pelt(values, { model: 'negbin1', penalty, minSegment, size: nb1Delta, exposure }) : pelt(values, { model: robust ? 'meanvarlaplace' : model, penalty, minSegment, sigma, exposure });
  // dispersion: refit with the penalty scaled by the squared residuals' dispersion (heavy tails, clustered volatility)
  let dispersion = null;
  if (o.dispersion) {
    if (model !== 'meanvar' || robust) throw new Error('The dispersion penalty is for the "meanvar" model without --robust.');
    const f = squaredDispersion(values, p.changepoints);
    if (f > 1.0001) { dispersion = round(f, 2); p = pelt(values, { model, penalty: f * penaltyValue(penalty ?? 'bic', values.length, model), minSegment, sigma, exposure }); }
  }
  // bootstrap: refit with a penalty read off block-resampled residuals (clustered volatility, heavy tails, short memory)
  let bootstrap = null;
  if (o.bootstrap) {
    if ((model !== 'meanvar' && model !== 'mean' && model !== 'poisson') || robust || o.dispersion || o.ar1) throw new Error('The bootstrap penalty is for the "meanvar", "mean" or "poisson" model without --robust, --dispersion or --ar1.');
    const bp = bootstrapPenalty(values, { minSegment, model, sigma, exposure });
    const bic = penaltyValue(penalty ?? 'bic', values.length, model);
    if (bp > bic * 1.0001) { bootstrap = round(bp, 2); p = pelt(values, { model, penalty: bp, minSegment, sigma, exposure }); }
  }
  // garch: cuts searched jointly with a segment-wise GARCH(1,1) likelihood (clustered volatility; not for heavy tails alone)
  let garchFit = null;
  if (o.garch) {
    if (model !== 'meanvar' || robust || o.dispersion || o.bootstrap || o.ar1 || o.trend || period) throw new Error('The GARCH search is for the "meanvar" model without --robust, --dispersion, --bootstrap, --ar1, --trend or --period.');
    if (values.length > 20000) throw new Error(`The GARCH search takes at most 20,000 points (each step rescans every segment); got ${values.length}. Aggregate first, or use --bootstrap.`);
    const ln = Math.log(values.length);
    const g = garchCuts(values, { pen: GARCH_CUT_PEN * ln, garchPen: GARCH_TERM_PEN * ln, minSeg: minSegment, maxCuts: 40, stride: Math.max(1, Math.ceil(values.length / 250)) });
    garchFit = { clustered: g.garch, alpha: g.a, beta: g.b, cutPenalty: round(GARCH_CUT_PEN * ln, 3), garchPenalty: round(GARCH_TERM_PEN * ln, 3) };
    garchFit.note = g.garch
      ? `The volatility clusters (a shared GARCH(1,1), a ${g.a}, b ${g.b}), so these cuts are changes the clustering does not explain; a burst it can explain, even a crash, is not cut (33 years of the Dow: no cut at all, README "Cuts searched jointly with a GARCH likelihood"). For bursts as changes use --bootstrap. Not for heavy tails without clustering: on t3 noise it raised a false change on 44-49% of series.`
      : 'No volatility clustering worth its penalty, so these are plain mean-and-variance cuts at a slightly higher penalty (1.5 times BIC).';
    // penalty reported in pelt's units (twice the log-likelihood)
    p = { changepoints: g.cuts.slice().sort((a, b) => a - b), penalty: 2 * GARCH_CUT_PEN * ln };
  }
  const bounds = [0, ...p.changepoints, values.length];
  const segments = [];
  const lines = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const s = stats(values.slice(bounds[i], bounds[i + 1]));
    // seasonal counts: the segment's mean is its rate per average-season point, total over total exposure
    if (exposure) { let a = 0, E = 0; for (let t = bounds[i]; t < bounds[i + 1]; t++) { a += values[t]; E += exposure[t]; } s.mean = a / E; }
    const seg = { start: bounds[i], end: bounds[i + 1] - 1, from: labels[bounds[i]], to: labels[bounds[i + 1] - 1], n: s.n, mean: round(s.mean), sd: round(s.sd) };
    if (o.log && !o.trend && model !== 'trend') seg.geometricMean = round(Math.exp(s.mean), 4);
    if (model === 'trend') {
      const f = lineFit(values, bounds[i], bounds[i + 1]);
      lines.push(f);
      Object.assign(seg, { slope: round(f.slope, 4), sd: round(f.sd) });
    }
    segments.push(seg);
  }
  // With --ar1 the Bayesian pass uses the conditional AR(1) likelihood on the original series (rho fixed),
  // not the prewhitened one: prewhitening turns a shift into a spike plus a (1 - rho)-sized step.
  // The trend model's Bayesian pass runs the level model on the series minus a straight line whose slope is the
  // median first difference: a level shift touches one difference only, so the slope estimate ignores it.
  let bvals = values;
  if (model === 'trend') {
    const slope = median(values.slice(1).map((v, i) => v - values[i]));
    bvals = values.map((v, i) => v - slope * i);
  }
  // robust: the Bayesian pass reads the series clipped at the median +- 2 robust sds, so a heavy-tailed outlier is one
  // bounded surprise, not evidence of a new segment (eval/meanvar-bayes-tails.mjs, README)
  if (robust) { const m = median(bvals), c = 2 * robustSd(bvals); bvals = bvals.map((v) => Math.max(m - c, Math.min(m + c, v))); }
  const b = bocpd(bvals, { ...(rho ? { rho, prior: { ...defaultPrior(prewhiten(values, rho)), mu: median(values) } } : {}), hazardLambda: Number(o.hazardLambda) || 100, lag: Math.max(1, Math.floor(Number(o.lag) || 5)), model: model === 'trend' ? 'mean' : model, exposure, dispersion: phi ?? (nb1Delta > 0 ? 1 + nb1Delta : 1), nbSize: isFinite(nbSize) && nbSize > 0 ? nbSize : 0 });
  const det = peaks(b.changeProb, Number(o.threshold) || 0.5);
  // joint AR(1) fits use their own likelihood, so no range is offered for them
  let ranges = null;
  if (!joint && o.intervals !== false) {
    const nbOn = isFinite(nbSize) && nbSize > 0;
    // GARCH cuts with clustering: the range comes from the same segment likelihood that chose them, (a, b) held at the fit
    const cost = garchFit?.clustered ? garchCost(values, garchFit.alpha, garchFit.beta)
      : nbOn ? makeCost(values, 'negbin', sigma, 0, exposure, nbSize) : nb1Delta > 0 ? makeCost(values, 'negbin1', sigma, 0, exposure, nb1Delta) : makeCost(values, robust ? 'meanvarlaplace' : model, sigma, 0, exposure);
    ranges = changeIntervals(p.changepoints, values.length, cost, { minSegment, level: 0.95 });
  }
  const { clumping, rangeWarning, driftWarning, cycleWarning, overcut, overcutWarning } = stepWarnings({ ranges, model, o, values, p, phi, nbSize, nb1Delta, period, segments, robust, garchFit, labels, noiseFloorK, sigma, penalty, minSegment, original });
  // update-rate check (update-rate.mjs, README "When a series starts updating less often"): when the share of steps that
  // repeat the previous value exactly changed. It reads only the values (before any log), so it is the same check the drift
  // model shows; jumps near such a date may be catch-ups after a stale stretch, whatever model dated them.
  const updateRate = updateRateChanges(original0);
  const updateRateWarning = updateRateLines(updateRate, labels)[0] ?? null;
  // short sparse spells (opt-in, o.spells; README "Short sparse spells on the CLI and page"): a month or so of fewer
  // updates inside a stretch, the old schedule coming back after it. Needs dated rows; it never moves a cut.
  const spells = o.spells ? spellsResult(original0, labels, { u: updateRate }) : null;
  const spellsWarning = spells ? spellsLine(spells) : null;
  const changes = p.changepoints.map((i, k) => {
    const before = segments[k];
    const after = segments[k + 1];
    let near = 0;
    for (let j = Math.max(1, i - 3); j <= Math.min(values.length - 1, i + 3); j++) near = Math.max(near, b.changeProb[j]);
    const trend = model === 'trend' ? {
      // the jump between the two fitted lines at the change, and the slope on each side
      jump: round(lines[k + 1].at(i) - lines[k].at(i)),
      slopeBefore: before.slope,
      slopeAfter: after.slope,
    } : null;
    return {
      index: i,
      label: labels[i],
      lastBefore: labels[i - 1],
      meanBefore: before.mean,
      meanAfter: after.mean,
      shift: trend ? trend.jump : round(after.mean - before.mean),
      ...(trend ? { jump: trend.jump, slopeBefore: trend.slopeBefore, slopeAfter: trend.slopeAfter } : {}),
      ...(o.log ? { ratio: round(Math.exp(trend ? trend.jump : after.mean - before.mean), 4) } : {}),
      shiftInNoiseSd: round((trend ? trend.jump : after.mean - before.mean) / (joint ? longRunSd(sigma / Math.sqrt(1 + rho), rho) : sigma), 3),
      sdBefore: before.sd,
      sdAfter: after.sd,
      bocpdProbWithin3: round(near, 3),
      ...(ranges ? { range95: { from: labels[ranges[k].from], to: labels[ranges[k].to], fromIndex: ranges[k].from, toIndex: ranges[k].to } } : {}),
    };
  });
  const excursions = model === 'poisson' ? findExcursions(original, p.changepoints, { exposure }).map((x) => ({ from: labels[x.fromIndex], to: labels[x.toIndex], fromIndex: x.fromIndex, toIndex: x.toIndex, length: x.length, direction: x.direction, baselineRate: round(x.baselineRate), excursionRate: round(x.excursionRate), ratio: x.ratio === null ? null : round(x.ratio, 3), sameBaselineLR: round(x.sameBaselineLR, 3) })) : [];
  const summary = summarize({ n: values.length, column, model, changes, det, labels, prob: b.changeProb, skipped }) + (o.log ? ' Values are natural logs: a move of x in the mean is a factor of e^x (the ratio is in each change).' : '') + excursions.map((x) => ` Changes at ${x.from} and just after ${x.to} may be one temporary ${x.direction === 'up' ? 'burst' : 'dip'}, not two steps: the rate before and after it is the same (${fmt(x.baselineRate)} a point, likelihood ratio ${fmt(x.sameBaselineLR)} against 3.84), and inside it is ${fmt(x.excursionRate)}.`).join('');
  return {
    n: values.length,
    column,
    skipped,
    model,
    noiseSd: round(sigma),
    ...(noiseFloorHit ? { noiseFloor: noiseFloorK } : {}),
    ...(period ? { seasonal: { period, profile: profile.map((v) => round(v, exposure || seasonMultiplicative ? 3 : undefined)), ...(exposure || seasonMultiplicative ? { multiplicative: true } : {}) } } : {}),
    ...(slope !== null ? { trend: { slopePerPoint: round(slope, 6), ...(curved !== undefined ? { curved, ...(curved ? { curvaturePerPoint2: round(curvature, 9), slopeChangePerPoint: round(2 * curvature, 9) } : {}) } : {}), ...(knot !== undefined ? { slopeAfter: round(slopeAfter, 6), slopeChangesAt: knot, ...(knotRanges ? { slopeChangeRange95: knotRanges.map((r) => ({ at: labels[r.knot], from: labels[r.from], to: labels[r.to], fromIndex: r.from, toIndex: r.to })) } : {}), ...(knots.length > 1 ? { slopeChangesAtAll: knots, slopes: slopes.map((v) => round(v, 6)) } : {}) } : {}) } } : {}),
    ...(pre.trendRobustKept === false ? { trendNote: 'With --trend robust (or the gated joint fit) the growth rate did not beat a flat level by log n, so it was left out and the steps are about a flat level.' } : {}),
    ...(growth !== null ? { trend: { logGrowthAcrossSeries: round(growth, 4), growthFactorAcrossSeries: round(Math.exp(growth), 4), multiplicative: true, ...(countKnot !== undefined ? { growthChangesAt: countKnot, logGrowthAcrossSeriesAfter: round(growthAfter, 4), ...(countRanges ? { growthChangeRange95: countRanges.map((r) => ({ at: labels[r.knot], from: labels[r.from], to: labels[r.to], fromIndex: r.from, toIndex: r.to })), ...(o.overdispersion === 'nb' ? { growthChangeRangeNote: GROWTH_RANGE_NB_NOTE } : {}) } : {}), ...(countKnots.length > 1 ? { growthChangesAtAll: countKnots, logGrowthAcrossSeriesRates: countRates.map((v) => round(v, 4)) } : {}) } : {}) } } : {}),
    ...(holidayFit ? { holidays: { count: holidayFit.count, factor: round(holidayFit.factor, 3), ...(holidayFit.kinds ? { kinds: holidayFit.kinds.map((k) => ({ ...k, factor: round(k.factor, 3) })) } : {}) } } : {}),
    ...(dispersion ? { dispersion } : {}),
    ...(bootstrap ? { bootstrapPenalty: bootstrap } : {}),
    ...(garchFit ? { garch: garchFit } : {}),
    ...(rangeWarning ? { rangeWarning } : {}),
    ...(driftWarning ? { driftWarning } : {}),
    ...(cycleWarning ? { cycleWarning } : {}),
    ...(overcutWarning ? { overcutWarning, overcut } : {}),
    ...(updateRateWarning ? { updateRateWarning, updateRate: { changes: updateRate.changes, stretches: updateRate.stretches } } : {}),
    ...(spells ? { shortSpells: spells, spellsWarning } : {}),
    ...(rho !== null ? { ar1: { rho: round(rho, 3) } } : {}),
    ...(phi !== null ? { dispersion: round(phi, 3) } : {}),
    ...(clumping ? { clumping, ...(clumping.hint ? { clumpingWarning: clumping.hint } : {}) } : {}),
    ...(burstInfo ? { bursts: burstInfo } : {}),
    ...(o.episodes ? { episodes: findEpisodes(changes, values.length, typeof o.episodes === 'number' ? { maxLen: o.episodes } : {}).map((e) => ({ ...e, from: labels[e.startIndex], to: labels[e.endIndex] })) } : {}),
    ...(o.spikes ? { spikes: findSpikes(changes, sigma, typeof o.spikes === 'number' ? { maxSpan: o.spikes } : {}).map((e) => ({ ...e, from: labels[e.startIndex], to: labels[e.endIndex], base: round(e.base), baseAfter: round(e.baseAfter), excursion: round(e.excursion), excursionInNoiseSd: e.excursionInNoiseSd === null ? null : round(e.excursionInNoiseSd, 1) })) } : {}),
    ...(excursions.length ? { excursions } : {}),
    ...(changes.length > 1 && groupRamps(changes, segments, values.length, { values }).length ? { ramps: groupRamps(changes, segments, values.length, { values }) } : {}),
    ...(o.slopeBreaks ? { slopeBreaks: slopeBreakReport(values, labels, o.slopeBreaks) } : {}),
    ...(o.hingeTest ? { hingeTest: hingeTestReport(values, labels, o.hingeTest, { log: !!o.log }) } : {}),
    ...(o.twoHingeTest ? { twoHingeTest: twoHingeTestReport(values, labels, o.twoHingeTest, { log: !!o.log }) } : {}),
    ...(o.knownDate != null && o.knownDate !== '' && o.knownDate !== false ? { knownDate: knownDateReport(values, labels, o.knownDate, { log: !!o.log, period: Number(o.period) || 0 }) } : {}),
    pelt: { penalty: round(p.penalty), minSegment, changepoints: changes, segments },
    bocpd: {
      hazardLambda: Number(o.hazardLambda) || 100,
      lag: Math.max(1, Math.floor(Number(o.lag) || 5)),
      threshold: Number(o.threshold) || 0.5,
      detections: det.map((i) => ({ index: i, label: labels[i], probability: round(b.changeProb[i], 3) })),
      changeProb: b.changeProb.map((v) => round(v, 3)),
      mapRunLength: b.mapRun,
    },
    labels,
    ...(o.log ? { log: true } : {}),
    values: o.log ? original0 : rawCounts,
    ...(period || o.trend || holidayFit ? { adjusted: values.map((v, t) => round(exposure ? v / exposure[t] : v)) } : {}),
    summary,
  };
}

/**
 * analyze()'s warnings about the fitted steps, read off the fit and the series: ranges too narrow (wandering level,
 * autocorrelation, overdispersed counts, short variance segments, non-Gaussian noise), a drifting seasonal shape, a cycle
 * read as steps, and over-cutting a smooth series. Each is a sentence for the reader or null; none moves a cut.
 */
function stepWarnings({ ranges, model, o, values, p, phi, nbSize, nb1Delta, period, segments, robust, garchFit, labels, noiseFloorK, sigma, penalty, minSegment, original }) {
  // the range assumes independent noise: on sticky series without --ar1 it is far too narrow (57% and 30% coverage, README)
  const clumping = o.overdispersion === 'nb' || o.overdispersion === 'nb1' ? clumpingOut(o.overdispersion, nbSize, nb1Delta, original) : null;
  let rangeWarning = null;
  if (ranges && model === 'mean' && !o.ar1 && values.length >= 20) {
    const r0 = ar1Rho(values);
    const vr0 = r0 < 0.3 ? blockVarianceRatio(values) : 0;
    if (r0 < 0.3 && p.changepoints.length >= 5 && vr0 >= 3) rangeWarning = `The series' level wanders more than independent noise allows (block means vary ${round(vr0, 1)} times as much; white noise gives about 1) although the lag-1 correlation is small (rho about ${round(r0, 2)}), so these ${p.changepoints.length} steps and their ranges may be false alarms from slow drift or a cycle rather than separate regime changes: on 7,980 yearly tree rings with no documented step the default found 38, --ar1 still 11 (README, quiet series). A real step raises this ratio too, so read it as a prompt to check dates, not as a verdict.`;
    if (r0 >= 0.3) rangeWarning = `The series looks autocorrelated (rho about ${round(r0, 2)}), so these ranges are too narrow: use --ar1 (page: allow for autocorrelation).${p.changepoints.length >= 5 ? ` With ${p.changepoints.length} steps at this rho, many may be false alarms: on real cycles with no documented step the default found 23 (lynx) and 46 (sunspots), --ar1 found none and --ar1 joint kept a 2 sd step (README, cyclic series).` : ''}`;
  }
  // the same for counts that vary more than Poisson: the plain Poisson range held the date in 6% to 42% of overdispersed series (README)
  if (ranges && !rangeWarning && model === 'poisson' && !phi && !(isFinite(nbSize) && nbSize > 0) && !(nb1Delta > 0) && o.overdispersion !== 'nb1' && values.length >= 90) {
    const d0 = countDispersion(values, period);
    if (d0 >= 2.5) rangeWarning = `These counts vary about ${round(d0, 1)} times more than Poisson counts would, so these ranges are too narrow: use the negative-binomial cost (--overdispersion nb).`;
  }
  // a variance model reads a short run of similar values as its own calm regime: on 202 quarters of US GDP growth the
  // default 5-point minimum made a 5-quarter patch a segment and its range missed the documented date (README, Great Moderation)
  if (!rangeWarning && model === 'meanvar' && p.changepoints.length) {
    const short = segments.filter((s) => s.n < 10);
    if (short.length) rangeWarning = `${short.length === 1 ? 'One segment has' : `${short.length} segments have`} fewer than 10 points (${short.map((s) => `${s.from} to ${s.to}`).join(', ')}), and a variance model can read a short quiet run as its own regime: check the dates, or try --min-segment 12 or more.`;
  }
  // a variance model assumes Gaussian noise: on heavy-tailed, autocorrelated or volatility-clustered noise with no change at all it
  // reported one 35% to 68% of the time (eval/meanvar-robustness.mjs, README). Warn from the segment-standardised residuals.
  // GARCH cuts with clustering: the ranges come from the GARCH fit (garchCost above); on fresh seeds they held the planted
  // change in 93-98% of series where the independent-noise range held it in 75-94% (eval/meanvar-garch-range-prereg-2026-11-13.md)
  if (!rangeWarning && model === 'meanvar' && values.length >= 40 && !garchFit?.clustered) {
    const nd = meanvarNoiseCheck(values, p.changepoints, robust);
    if (nd) rangeWarning = nd;
  }
  // a drifting seasonal shape that the profile cannot follow shows up as a run of steps inside a cycle or two (UK gas, README):
  // they mark a changing seasonal shape, not separate regime changes
  let driftWarning = null;
  if (o.drift && period && p.changepoints.length >= 3) {
    const cp = p.changepoints;
    const k = cp.findIndex((c, j) => j + 2 < cp.length && cp[j + 2] - c <= 2 * period);
    // autocorrelated noise alone fires this warning (75% to 88% of null series at rho 0.5, eval/drift-warning-null195-ar1.mjs); --ar1 cut that to 0 to 3%
    const hintAr1 = !o.ar1 && ar1Rho(values) >= 0.3 ? ` The residuals look autocorrelated (rho about ${round(ar1Rho(values), 2)}), which alone can cause such a run of steps: re-run with --ar1 (page: allow for autocorrelation) before reading them as a changing shape.` : '';
    if (k >= 0) driftWarning = `With a drifting seasonal shape, ${cp.slice(k).filter((c) => c - cp[k] <= 2 * period).length} steps fall within two cycles of ${labels[cp[k]]}: that usually marks a seasonal shape that is still changing (for example an amplitude that grows), not separate regime changes. Check the dates against the series.${hintAr1}`;
  }
  // a cycle read as steps leaves a spectral peak in the residuals (Fisher's g; sunspots p 2e-6, ~1-3% false on synthetic nulls,
  // README 2026-10-30); with --period the season is already modelled, so the hint stays off
  let cycleWarning = null;
  if (!period && model !== 'poisson' && p.changepoints.length >= 5 && values.length >= 60) {
    const fg = fisherG(stepResiduals(values, p.changepoints));
    if (fg.p < 0.01 && fg.period >= 3) cycleWarning = `The residuals about these ${p.changepoints.length} steps carry a periodic component (peak at about ${round(fg.period, 1)} points, p ${fg.p < 1e-4 ? '< 0.0001' : round(fg.p, 4)}), so some steps may be a cycle read as regime changes, not separate changes: on sunspots (an 11-year cycle) the default found 46 steps and none were real. If the period is known, give it with --period; otherwise read the dates with care.`;
  }
  // over-cut check (TCPD, eval/tcpd-defaults.mjs, README 2026-11-10): on the 31 Turing Change Point Dataset series the plain
  // level model scored below reporting no change (F1 0.477 vs 0.663), mostly by cutting smooth or trending series into
  // hundreds of steps. A noise floor of 2x the local-line residual scale (window 25) raised F1 on 27 of the 28 series where it
  // differed (+0.21). So when the plain level model cuts 5 or more times and that floor halves the count, say so.
  let overcut = null;
  if (model === 'mean' && !noiseFloorK && !o.ar1 && !o.trend && !period && !o.log && p.changepoints.length >= 5 && values.length > 25) {
    const floorSd = 2 * localFitScale(values, 25, 1);
    if (floorSd > sigma) {
      const refit = pelt(values, { model: 'mean', penalty, minSegment, sigma: floorSd });
      if (refit.changepoints.length * 2 <= p.changepoints.length) overcut = { cuts: p.changepoints.length, refitCuts: refit.changepoints.length, floorSd: round(floorSd), refitAt: refit.changepoints.map((i) => labels[i]) };
    }
  }
  const overcutWarning = overcut ? `${overcut.cuts} steps may be over-cutting a smooth or trending series: with the noise floor set to twice the scatter about a local line (--noise-floor 2 --noise-floor-local 25; page: smooth or trending series) the same search keeps ${overcut.refitCuts}${overcut.refitCuts ? ` (${overcut.refitAt.slice(0, 8).join(', ')}${overcut.refitCuts > 8 ? ', ...' : ''})` : ''}. On 31 labelled real series (Turing Change Point Dataset) that floor matched the annotators better on 27 of 28 that it changed; neither setting reliably beat reporting no change, so check the dates.` : null;
  return { clumping, rangeWarning, driftWarning, cycleWarning, overcut, overcutWarning };
}

/**
 * Significance-tested slope breaks (slope-breaks.mjs): a sup-Wald test on the differences, so a bend in a drifting
 * series is dated and tested, not only fitted. `values` are the logged values when --log is set. `opt` is true or the
 * most breaks to report (1 to 3). Needs 40 or more points: below that the bar (calibrated for n >= 100) is not honest.
 */
export function slopeBreakReport(values, labels, opt) {
  const maxKnots = typeof opt === 'number' ? Math.max(1, Math.min(3, Math.floor(opt))) : 3;
  if (values.length < 40) throw new Error(`The slope-break test needs at least 40 points; got ${values.length}.`);
  const r = slopeBreaks(values, { maxKnots });
  return {
    critical: r.critical,
    note: 'Sup-Wald test on the differences; the bar is calibrated for 100 or more points, so on fewer it is only a guide. Weak by construction: a miss is not evidence of no break.',
    breaks: r.knots.map((k) => ({ index: k.index + 1, label: labels[k.index + 1] ?? String(k.index + 1), wald: Number(k.wald.toFixed(2)), slopeBefore: Number(k.before.toPrecision(4)), slopeAfter: Number(k.after.toPrecision(4)) })),
  };
}

/**
 * One change of slope tested on the levels (hinge-test.mjs): a sup-F over one continuous hinge with AR(1) noise and a
 * parametric bootstrap. Far more power than the differences test when the series wanders about a trend rather than
 * drifting (global temperature 1880-2024: knot 1976, p 0.001, where the differences test gives 0.80), and it refuses
 * when the residuals about a line look like a unit root (log GDP, productivity), the case the differences test is for.
 * `opt` is true or { reps, seed }. 30 to 600 points (the bootstrap reruns the whole scan, which is quadratic in n).
 */
export function hingeTestReport(values, labels, opt, { log = false } = {}) {
  const n = values.length;
  if (n < 30) throw new Error(`The hinge test needs at least 30 points; got ${n}.`);
  if (n > 600) throw new Error(`The hinge test takes at most 600 points (its bootstrap is quadratic in length); got ${n}. Aggregate first (monthly to yearly).`);
  const o = typeof opt === 'object' && opt ? opt : {};
  const h = hingeTest(values, { reps: Number(o.reps) || 499, seed: Number(o.seed) || 1 });
  // With logs on (`--log`), `values` are already logged, so the test runs on the logs and a slope is a growth rate
  // (0.02 a step is about 2% a step). Measured on 2026-11-15 (eval/hinge-log-prereg-2026-11-15.md): size holds at n 40,
  // but logs admitted neither short growth series the levels test refuses (gas, electricity), so no refusal suggests it.
  const scale = log ? 'on the logs (values were logged first, so a slope is a growth rate: 0.02 a step is about 2% a step)' : 'on the levels';
  const note = 'One change of slope against a straight line, ' + scale + ', assuming AR(1) noise about the trend; the p-value is from a parametric bootstrap. A level step can pass for a hinge (on the Nile it rejects with a knot in 1913, though the change is the 1898 drop; a step of 2 noise sd made it reject in 14-42% of synthetic series), so run the step models too; a small p says the straight line is wrong, not that exactly one bend is right.';
  if (h.refused) return { refused: true, reason: h.reason, note, scale: log ? 'log' : 'levels' };
  return {
    refused: false, scale: log ? 'log' : 'levels', index: h.index, label: labels[h.index] ?? String(h.index), f: Number(h.f.toFixed(2)), bar95: Number(h.bar95.toFixed(2)),
    p: Number(h.p.toFixed(4)), reps: h.reps, rho: Number(h.rho.toFixed(3)),
    slopeBefore: Number(h.slopeBefore.toPrecision(4)), slopeAfter: Number(h.slopeAfter.toPrecision(4)), significant: h.p <= 0.05, note,
    ...(h.admittedByCut ? { admittedByCut: true, rhoLine: Number(h.rhoLine.toFixed(3)), rhoHinge: Number(h.rhoHinge.toFixed(3)), cutBar: Number(h.cutBar.toFixed(3)) } : {}),
  };
}

/**
 * A step and a change of slope at a date the user names (known-date.mjs; README "A date you name", round 5 ships):
 * segmented regression with AR(1) noise and a parametric bootstrap, the CLI's `--known-date` settings. `opt` is the
 * label of the first row after the change, or { date, reps, seed }. `values` are already logged when `log` is on.
 * A series let through only by the random-walk cut comes back `calibrated: false`: round 6 (README, "Round 6") found
 * that neither round 5's p nor a bootstrap conditioned on the cut tells a real step from noise on those series.
 */
export function knownDateReport(values, labels, opt, { log = false, period = 0 } = {}) {
  const o = typeof opt === 'object' && opt ? opt : { date: opt };
  const date = String(o.date ?? '').trim();
  const k = labels.findIndex((l) => String(l) === date);
  if (k < 0) throw new Error(`Known date ${date}: no row has that label (labels run ${labels[0]} to ${labels[labels.length - 1]}; give the first row after the change).`);
  const h = knownDateTest(values, k, { period, reps: Number(o.reps) || 499, seed: Number(o.seed) || 1, rhoGenMethod: 'gated', gateRho: 0.5 });
  const scale = log ? 'log' : 'levels';
  const note = 'Segmented regression at the date you named: a line before it, a step and a change of slope at it, AR(1) noise, p-values from a parametric bootstrap (pre-registered over five rounds; at p 0.05 it flagged 1.0-5.8% of simulated no-change lines of 40-120 points). A small p says the line before the date does not carry on through it, not what caused the change; a control series the change should not touch is the best check.';
  const base = { date, firstAfter: labels[k] ?? String(k), lastBefore: k > 0 ? labels[k - 1] ?? String(k - 1) : null, scale, note };
  if (h.refused) return { refused: true, reason: h.reason, ...base };
  const r3 = (v) => Number(Number(v).toPrecision(3)), r4 = (v) => Number(v.toFixed(4));
  return {
    refused: false, ...base, k, period: h.period, reps: h.reps,
    step: r3(h.step), stepRange95: h.stepRange95.map(r3), pStep: r4(h.pStep),
    slopeBefore: r3(h.slopeBefore), slopeChange: r3(h.slopeChange), slopeChangeRange95: h.slopeChangeRange95.map(r3), pSlope: r4(h.pSlope),
    p: r4(h.p), pTable: r4(h.pTable), effectAverage: r3(h.effectAverage), effectAtEnd: r3(h.effectAtEnd),
    rho: Number(h.rho.toFixed(3)), gated: !!h.gated, rhoGen: h.rhoGen.map((v) => Number(v.toFixed(3))),
    calibrated: !h.admittedByCut, significant: !h.admittedByCut && h.p <= 0.05,
    ...(h.admittedByCut ? { admittedByCut: true, rhoLine: Number(h.rhoLine.toFixed(3)), cutBar: Number(h.cutBar.toFixed(3)) } : {}),
    ...(o.placebo === false ? {} : { placebo: placeboFields(values, k, labels, period, Number(o.seed) || 1, Math.min(199, Number(o.reps) || 499)) }),
  };
}

// In-time placebos beside the named-date test (README "In-time placebos", eval/known-date-prereg-placebo-2026-11-17.md):
// the same test on the before-period only, at up to three dates; `warn` when 2 or more give p <= 0.05. Off with
// knownDate: { placebo: false }.
function placeboFields(values, k, labels, period, seed, reps) {
  const pc = placeboCheck(values, k, { period, seed, reps });
  return { dates: pc.dates.map((d) => (d.refused ? { label: labels[d.k] ?? String(d.k), refused: true } : { label: labels[d.k] ?? String(d.k), refused: false, p: Number(d.p.toFixed(4)) })), tested: pc.tested, fired: pc.fired, warn: pc.warn };
}

/**
 * Two changes of slope against a straight line, on the levels (two-hinge.mjs; README "Two changes of slope", pre-registered
 * 2026-11-16, eval/two-hinge-prereg-2026-11-16.md): the hinge test with a second knot, for a series that speeds up and
 * levels off, or rises, holds and falls. Same AR(1) noise, bootstrap and rho-cut guard. 30 to 300 points (the scan
 * over knot pairs is cubic in n). `opt` is true or { reps, seed }.
 */
export function twoHingeTestReport(values, labels, opt, { log = false } = {}) {
  const n = values.length;
  if (n < 30) throw new Error(`The two-hinge test needs at least 30 points; got ${n}.`);
  if (n > 300) throw new Error(`The two-hinge test takes at most 300 points (its bootstrap scans every pair of knots); got ${n}. Aggregate first (monthly to yearly).`);
  const o = typeof opt === 'object' && opt ? opt : {};
  const h = twoHingeTest(values, { reps: Number(o.reps) || 499, seed: Number(o.seed) || 1 });
  const scale = log ? 'on the logs (a slope is a growth rate per step)' : 'on the levels';
  const note = 'Two changes of slope against a straight line, ' + scale + ', assuming AR(1) noise about the trend; the p-value is from a parametric bootstrap. A level step can pass for two close bends (on the Nile it rejects with knots in 1892 and 1907, a 15-year plunge standing in for the 1898 drop), so run the step models too. A small p says the straight line is wrong, not that exactly two bends are right; under 60 points it refuses most sticky series.';
  if (h.refused) return { refused: true, reason: h.reason, note, scale: log ? 'log' : 'levels' };
  const lab = (i) => labels[i] ?? String(i);
  return {
    refused: false, scale: log ? 'log' : 'levels', index1: h.index1, index2: h.index2, label1: lab(h.index1), label2: lab(h.index2),
    f: Number(h.f.toFixed(2)), bar95: Number(h.bar95.toFixed(2)), p: Number(h.p.toFixed(4)), reps: h.reps, rho: Number(h.rho.toFixed(3)),
    slopes: h.slopes.map((v) => Number(v.toPrecision(4))), significant: h.p <= 0.05, note,
    ...(h.admittedByCut ? { admittedByCut: true, rhoLine: Number(h.rhoLine.toFixed(3)), rhoTwo: Number(h.rhoTwo.toFixed(3)), cutBar: Number(h.cutBar.toFixed(3)) } : {}),
  };
}

/**
 * Where exactly did a change happen? A credible range for each PELT change date: with the neighbouring changes held
 * fixed, every start k of the later segment is weighted exp(-(cost(k) - min cost) / 2) (the profile likelihood, since
 * the cost is -2 log-likelihood), and the most likely starts that together hold `level` of the weight are returned as
 * the first and last of them. It is a likelihood range under the fitted model, not an exact frequentist interval;
 * eval/change-interval.mjs measures how often it holds the planted date.
 */
export function changeIntervals(changepoints, n, cost, { minSegment = 2, level = 0.95 } = {}) {
  const ms = Math.max(1, Math.floor(minSegment));
  return changepoints.map((c, j) => {
    const a = j ? changepoints[j - 1] : 0;
    const b = j + 1 < changepoints.length ? changepoints[j + 1] : n;
    const lo = a + ms, hi = b - ms;
    if (hi < lo) return { index: c, from: c, to: c, level };
    const ks = [], cs = [];
    for (let k = lo; k <= hi; k++) { ks.push(k); cs.push(cost(a, k) + cost(k, b)); }
    const m = Math.min(...cs);
    const w = cs.map((v) => Math.exp(-(v - m) / 2));
    const tot = w.reduce((u, v) => u + v, 0);
    const order = w.map((_, i) => i).sort((u, v) => w[v] - w[u]);
    let acc = 0, from = Infinity, to = -Infinity;
    for (const i of order) { acc += w[i] / tot; from = Math.min(from, ks[i]); to = Math.max(to, ks[i]); if (acc >= level) break; }
    return { index: c, from, to, level };
  });
}

/**
 * Burst episodes in fitted count changes: an up-step followed within `maxLen` points by a down-step (or the
 * reverse) where the level on the far sides differs by well under half the episode's own jump (log scale) is one
 * episode, not two regime changes. Labels only: the changes themselves are not altered.
 * `cps` are the changes from analyze() (index, meanBefore, meanAfter); n is the series length.
 */
export function findEpisodes(cps, n, { maxLen = Math.max(5, Math.round(n / 10)), maxNet = 0.5 } = {}) {
  const out = [];
  for (let k = 0; k + 1 < cps.length; k++) {
    const a = cps[k], b = cps[k + 1];
    const len = b.index - a.index;
    const up = a.meanAfter > a.meanBefore && b.meanAfter < b.meanBefore;
    const down = a.meanAfter < a.meanBefore && b.meanAfter > b.meanBefore;
    if (len > maxLen || !(up || down)) continue;
    const lo = Math.max(a.meanBefore, 1e-9), hi = Math.max(b.meanAfter, 1e-9), mid = Math.max(a.meanAfter, 1e-9);
    const jump = Math.abs(Math.log(mid / lo)), net = Math.abs(Math.log(hi / lo));
    if (net >= maxNet * jump) continue;
    out.push({ kind: up ? 'burst' : 'dip', startIndex: a.index, endIndex: b.index - 1, length: len, level: a.meanAfter, baseBefore: a.meanBefore, baseAfter: b.meanAfter, jumpFactor: Math.round(Math.exp(jump) * 100) / 100, netFactor: Math.round(Math.exp(net) * 100) / 100 });
    k++;
  }
  return out;
}

/**
 * Spikes in a continuous series: a run of adjacent changes that spans at most `maxSpan` points and leaves the
 * level where it began (the level after the last change within `maxNet` of the excursion of the level before the
 * first) is one outlier, not a regime. A bad price or a one-day shock is reported by the mean model as a pair or
 * triple of changes either side of it. Labels only: the changes themselves are not altered.
 * `cps` are the changes from analyze() (index, meanBefore, meanAfter); sd is the noise sd; n the series length.
 * The excursion must be at least `minSd` noise sd, so a small wobble is not labelled.
 */
export function findSpikes(cps, sd, { maxSpan = 5, maxNet = 0.5, minSd = 3 } = {}) {
  const out = [];
  for (let k = 0; k + 1 < cps.length;) {
    let best = -1;
    for (let j = k + 1; j < cps.length && cps[j].index - cps[k].index <= maxSpan; j++) {
      const base = cps[k].meanBefore, end = cps[j].meanAfter;
      let ex = 0, sign = 0;
      for (let m = k; m < j; m++) { const d = cps[m].meanAfter - base; if (Math.abs(d) > Math.abs(ex)) { ex = d; sign = Math.sign(d); } }
      if (Math.abs(ex) >= minSd * sd && Math.abs(end - base) < maxNet * Math.abs(ex)) best = j;
    }
    if (best < 0) { k++; continue; }
    const base = cps[k].meanBefore;
    let ex = 0;
    for (let m = k; m < best; m++) { const d = cps[m].meanAfter - base; if (Math.abs(d) > Math.abs(ex)) ex = d; }
    out.push({ kind: ex > 0 ? 'spike' : 'dip', startIndex: cps[k].index, endIndex: cps[best].index - 1, length: cps[best].index - cps[k].index, changes: best - k + 1, base, baseAfter: cps[best].meanAfter, excursion: ex, excursionInNoiseSd: sd > 0 ? ex / sd : null });
    k = best + 1;
  }
  return out;
}

/** Least-squares line through x[s..t): slope per index, residual sd, and the fitted value at any index. */
/**
 * Burst or two steps? With counts, a temporary excursion (a rate that jumps and then returns to where it was) is read by
 * PELT as two level changes with narrow, over-confident ranges. For each pair of neighbouring changes a < b with a short
 * segment between them, test whether the rate before a and the rate after b are one rate (Poisson likelihood ratio, 1 df,
 * 3.84 = 95%): if they are, the pair is one excursion on a steady baseline. Returned as a note beside the changes; the
 * changes themselves are not altered. `exposure` is the seasonal/holiday expected-share per point when there is one.
 */
export function findExcursions(x, cps, { exposure = null, maxFraction = 0.25, critical = 3.84 } = {}) {
  const n = x.length, e = (t) => (exposure ? exposure[t] : 1);
  const sum = (lo, hi) => { let c = 0, w = 0; for (let t = lo; t < hi; t++) { c += x[t]; w += e(t); } return { c, w }; };
  const ll = (c, w, r) => (c > 0 ? c * Math.log(r * w) : 0) - r * w;
  const out = [];
  for (let k = 0; k + 1 < cps.length; k++) {
    const a = cps[k], b = cps[k + 1];
    if (b - a > maxFraction * n) continue;
    const L = sum(k ? cps[k - 1] : 0, a), M = sum(a, b), R = sum(b, k + 2 < cps.length ? cps[k + 2] : n);
    if (!L.w || !R.w || !M.w) continue;
    const rL = L.c / L.w, rR = R.c / R.w, rM = M.c / M.w, rP = (L.c + R.c) / (L.w + R.w);
    const lr = 2 * (ll(L.c, L.w, rL) + ll(R.c, R.w, rR) - ll(L.c, L.w, rP) - ll(R.c, R.w, rP));
    // the middle must sit clearly on one side of both neighbours (a burst up or a dip down)
    if (!((rM > rL && rM > rR) || (rM < rL && rM < rR))) continue;
    if (lr < critical) out.push({ fromIndex: a, toIndex: b - 1, length: b - a, baselineRate: rP, excursionRate: rM, ratio: rP > 0 ? rM / rP : null, sameBaselineLR: lr, direction: rM > rP ? 'up' : 'down' });
  }
  return out;
}

function lineFit(x, s, t) {
  const m = t - s;
  let st = 0, sx = 0;
  for (let i = s; i < t; i++) { st += i; sx += x[i]; }
  const tb = st / m, xb = sx / m;
  let sxx = 0, sxy = 0;
  for (let i = s; i < t; i++) { sxx += (i - tb) ** 2; sxy += (i - tb) * (x[i] - xb); }
  const slope = sxx > 0 ? sxy / sxx : 0;
  let rss = 0;
  for (let i = s; i < t; i++) rss += (x[i] - xb - slope * (i - tb)) ** 2;
  return { slope, sd: Math.sqrt(rss / Math.max(1, m - 2)), at: (i) => xb + slope * (i - tb) };
}

function summarize({ n, column, model, changes, det, labels, skipped }) {
  const what = model === 'meanvar' ? 'level or volatility' : model === 'poisson' ? 'rate' : model === 'trend' ? 'level or slope' : 'level';
  const lines = [];
  if (!changes.length) {
    lines.push(`PELT finds no change in ${what} across the ${n} points of ${column}: one segment explains the data better than any split, after the penalty.`);
  } else {
    lines.push(`PELT splits the ${n} points of ${column} into ${changes.length + 1} segments (${changes.length} change${changes.length > 1 ? 's' : ''} in ${what}).`);
    for (const c of changes) {
      const dir = c.shift > 0 ? 'up' : 'down';
      if (model === 'trend') {
        lines.push(`From ${c.label} (after ${c.lastBefore}) the line jumps ${c.jump > 0 ? 'up' : 'down'} by ${fmt(Math.abs(c.jump))} and its slope goes from ${fmt(c.slopeBefore)} to ${fmt(c.slopeAfter)} per point; the Bayesian method (level changes only, on the series minus its median slope) puts ${Math.round(c.bocpdProbWithin3 * 100)}% probability on a change within 3 points of it.`);
        continue;
      }
      lines.push(`From ${c.label} (after ${c.lastBefore}) the mean moves ${dir} from ${fmt(c.meanBefore)} to ${fmt(c.meanAfter)}, ${fmt(Math.abs(c.shiftInNoiseSd))} noise standard deviations; the Bayesian method puts ${Math.round(c.bocpdProbWithin3 * 100)}% probability on a change within 3 points of it.`);
    }
  }
  const extra = det.filter((i) => !changes.some((c) => Math.abs(c.index - i) <= 3));
  if (extra.length) lines.push(`The Bayesian method also flags ${extra.map((i) => labels[i]).join(', ')}, which PELT's penalty did not keep: worth a look, weaker evidence.`);
  if (skipped) lines.push(`${skipped} row${skipped > 1 ? 's were' : ' was'} skipped as blank or not numeric.`);
  return lines.join(' ');
}
