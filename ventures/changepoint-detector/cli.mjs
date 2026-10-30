#!/usr/bin/env node
// Find changepoints in a time series from the command line.
//
//   node cli.mjs series.csv                       # last numeric column, change in level
//   node cli.mjs series.csv --column sales --model meanvar
//   cat series.csv | node cli.mjs --json          # machine-readable
//   node cli.mjs --example                        # Nile river flow, 1871-1970
//
// Zero dependencies, no network. Same engine as the web page.

import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { analyze, DEFAULTS, PAPERS } from './engine.mjs';

const USAGE = `Find when a time series changed level or volatility (PELT + Bayesian online changepoint detection).

Usage:
  node cli.mjs [options] [file.csv]      (reads stdin when no file is given)

Options:
  --column <name|index>     value column (default: last numeric column)
  --label-column <name|i>   label/date column (default: first column)
  --model mean|meanvar|trend|poisson  change in level, in level and volatility, in level or slope of a trending series, or in the rate of counts (default: mean)
  --penalty bic|aic|hannan-quinn|<number>   PELT penalty per change (default: bic)
  --dispersion              with --model meanvar: scale the penalty by the dispersion of the squared residuals (fewer false alarms on heavy tails or clustered volatility)
  --robust                  with --model meanvar: Laplace noise instead of Gaussian, so heavy tails are not read as volatility changes
  --min-segment <n>         shortest segment (default: 2 for mean, 10 for meanvar)
  --period <n>              remove a seasonal cycle of n points first (12 monthly, 7 daily-weekly); mean/meanvar subtract it, poisson fits multiplicative factors
  --holidays <a,b,...>      with --model poisson: row labels (dates, or 1-based row numbers) of known holidays; one fitted factor on their rate, so a holiday dip is not read as a step; write label=kind (e.g. 2026-12-25=closed) to fit one factor per kind
  --bursts [ratio]          with --model poisson: single days far above both neighbours' level (default 2.5x and a Poisson-sized excess) are cut back to it before fitting, so a spike is not read as two changes; listed in the result
  --episodes [n]            with --model poisson: label an up-step followed within n points (default a tenth of the series) by a step back to about the old level as one burst episode, listed in the result; the changes are unchanged
  --burst-runs n            with --bursts: also cut back runs of 2 to n days (default off) that sit 2x above the same-phase level on both sides
  --log                     take natural logs first (positive values; mean, meanvar, trend): a steady percentage growth is a straight line, not a staircase; segments also show the geometric mean and each change its ratio
  --multiplicative           with --period (mean/meanvar): the season is a factor, not an amount, so it scales with the level (positive values only; not with --drift)
  --drift                   with --period: let the seasonal shape change over time (growing amplitude, moving peak)
  --trend [bend|bends]          fit one linear trend under the steps and remove it (a ramp is not read as many small changes);
                            'bend' lets the slope change once, 'bends' up to three times, chosen by BIC (counts, --model poisson: a change of growth rate, 'bends' up to two);
                            with --model poisson, a common log-linear growth rate (multiplicative, composes with --period)
  --knot-margin f          with --trend bend(s): keep this fraction of the series clear at each end when looking for knots (default 0.1 = knots at 10 to 90%; 0.2 = the old 20 to 80%)
  --joint-knots             with --trend bends: also score every pair of knots, not only the greedy search's (slower, about 2 s per 240 points)
  --bootstrap               with --model meanvar, mean or poisson: set the penalty from block-resampled residuals (much fewer false alarms on heavy tails, clustered volatility or autocorrelated noise; a little less power at n = 100)
  --overdispersion [phi|nb] counts (nb: a negative-binomial cost for independent clumpy counts, also with --period and --trend; in the Bayesian pass without them): scale the penalty by the counts' dispersion (variance over mean, estimated from block totals, or the number given), so sticky or clumped counts are not cut into many steps
  --ar1 [joint]             allow for lag-1 autocorrelation (mean model): widen the noise scale, or
                            'joint' to fit the means and rho together (more power on small shifts)
  --hazard <n>              Bayesian expected points between changes (default: ${DEFAULTS.hazardLambda})
  --threshold <p>           report Bayesian changes at or above p (default: ${DEFAULTS.threshold})
  --example                 run on the bundled Nile river flow series
  --json                    print the full result as JSON
  -h, --help                this help

Methods (please cite them if you use the results):
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}. ${p.url}`).join('\n')}

Statistical analysis of data you supply, not advice. MIT licence.`;

export async function main(argv, { stdin = process.stdin, out = (s) => process.stdout.write(s) } = {}) {
  const opt = {};
  let file = null;
  let json = false;
  let example = false;
  const flags = { '--column': 'column', '--label-column': 'labelColumn', '--model': 'model', '--penalty': 'penalty', '--min-segment': 'minSegment', '--hazard': 'hazardLambda', '--threshold': 'threshold', '--period': 'period', '--knot-margin': 'knotMargin', '--holidays': 'holidays' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { out(USAGE + '\n'); return 0; }
    else if (a === '--json') json = true;
    else if (a === '--example') example = true;
    else if (a === '--drift') opt.drift = true;
    else if (a === '--log') opt.log = true;
    else if (a === '--multiplicative') opt.seasonMode = 'multiplicative';
    else if (a === '--robust') opt.robust = true;
    else if (a === '--dispersion') opt.dispersion = true;
    else if (a === '--bootstrap') opt.bootstrap = true;
    else if (a === '--overdispersion') opt.overdispersion = argv[i + 1] === 'nb' ? (i++, 'nb') : argv[i + 1] && /^\d+(\.\d+)?$/.test(argv[i + 1]) ? Number(argv[++i]) : true;
    else if (a === '--bursts') opt.bursts = argv[i + 1] && /^\d+(\.\d+)?$/.test(argv[i + 1]) ? Number(argv[++i]) : true;
    else if (a === '--episodes') opt.episodes = argv[i + 1] && /^\d+$/.test(argv[i + 1]) ? Number(argv[++i]) : true;
    else if (a === '--burst-runs') opt.burstRuns = Number(argv[++i]);
    else if (a === '--joint-knots') opt.jointKnots = true;
    else if (a === '--trend') opt.trend = argv[i + 1] === 'bend' || argv[i + 1] === 'bends' ? argv[++i] : true;
    else if (a === '--ar1') opt.ar1 = argv[i + 1] === 'joint' ? (i++, 'joint') : true;
    else if (flags[a]) {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      opt[flags[a]] = argv[++i];
    } else if (a.startsWith('-')) throw new Error(`Unknown option ${a}. Try --help.`);
    else file = a;
  }
  for (const k of ['minSegment', 'hazardLambda', 'threshold', 'period', 'knotMargin']) if (opt[k] != null) opt[k] = Number(opt[k]);
  if (opt.hazardLambda != null && !(opt.hazardLambda >= 1)) throw new Error('--hazard (expected points between changes) must be a number of at least 1.');
  if (opt.threshold != null && !(opt.threshold > 0 && opt.threshold <= 1)) throw new Error('--threshold must be a probability above 0 and at most 1.');
  if (!example) {
    if (file) opt.csv = await readFile(file, 'utf8');
    else {
      let s = '';
      for await (const chunk of stdin) s += chunk;
      opt.csv = s;
    }
  }
  if (typeof opt.holidays === 'string') opt.holidays = opt.holidays.split(',').map((h) => h.trim()).filter(Boolean);
  const r = analyze(opt);
  if (json) { out(JSON.stringify(r, null, 2) + '\n'); return 0; }
  const lines = [r.summary, ''];
  lines.push('Segments (PELT):');
  for (const s of r.pelt.segments) lines.push(`  ${s.from} – ${s.to}  n=${s.n}  mean=${s.mean}  ${s.geometricMean !== undefined ? `geometric mean=${s.geometricMean}  ` : ''}${s.slope !== undefined ? `slope=${s.slope}  ` : ''}sd=${s.sd}`);
  const ch = r.pelt.changepoints.filter((x) => x.range95);
  if (ch.length) {
    lines.push('', 'Likely range for each change (95%, neighbouring changes held fixed):');
    if (r.rangeWarning) lines.push(`  (${r.rangeWarning})`);
    if (r.driftWarning) lines.push(`  (${r.driftWarning})`);
    if (r.cycleWarning) lines.push(`  (${r.cycleWarning})`);
    for (const x of ch) lines.push(`  ${x.label}: ${x.range95.from === x.range95.to ? 'that point only' : `${x.range95.from} – ${x.range95.to}`}`);
  }
  if (r.trend && r.trend.growthChangeRange95) {
    lines.push('', 'Likely range for each change of growth rate (95%, other bends held fixed):');
    for (const x of r.trend.growthChangeRange95) lines.push(`  ${x.at}: ${x.from === x.to ? 'that point only' : `${x.from} – ${x.to}`}`);
    if (r.trend.growthChangeRangeNote) lines.push(`  (${r.trend.growthChangeRangeNote})`);
  }
  if (r.trend && r.trend.slopeChangeRange95) {
    lines.push('', 'Likely range for each slope change (95%, other bends held fixed):');
    for (const x of r.trend.slopeChangeRange95) lines.push(`  ${x.at}: ${x.from === x.to ? 'that point only' : `${x.from} – ${x.to}`}`);
  }
  if (r.episodes && r.episodes.length) {
    lines.push('', 'Episodes (a step and its step back, read as one burst):');
    for (const e of r.episodes) lines.push(`  ${e.from} – ${e.to}: ${e.kind} at ${e.level}/point against ${e.baseBefore} before and ${e.baseAfter} after (${e.jumpFactor}x episode, ${e.netFactor}x net)`);
  } else if (r.episodes) lines.push('', 'Episodes: none.');
  if (r.bocpd.detections.length) {
    lines.push('', `Bayesian changes (probability >= ${r.bocpd.threshold}):`);
    for (const d of r.bocpd.detections) lines.push(`  ${d.label}  ${(d.probability * 100).toFixed(0)}%`);
  }
  out(lines.join('\n') + '\n');
  return 0;
}

const invoked = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invoked) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { process.stderr.write(`error: ${e.message}\n`); process.exit(2); });
}
