#!/usr/bin/env node
// Find changepoints in a time series from the command line.
//
//   node cli.mjs series.csv                       # last numeric column, change in level
//   node cli.mjs series.csv --column sales --model meanvar
//   cat series.csv | node cli.mjs --json          # machine-readable
//   node cli.mjs sensors.csv --columns temp,co2  # several columns at once
//   node cli.mjs --example                        # Nile river flow, 1871-1970
//
// Zero dependencies, no network. Same engine as the web page.

import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { availableParallelism } from 'node:os';
import { analyze, parseSeries, DEFAULTS, PAPERS } from './engine.mjs';
import { NILE_CSV } from './example-data.mjs';

const USAGE = `Find when a time series changed level or volatility (PELT + Bayesian online changepoint detection).

Usage:
  node cli.mjs [options] [file.csv]      (reads stdin when no file is given)

Options:
  --column <name|index>     value column (default: last numeric column)
  --label-column <name|i>   label/date column (default: first column)
  --model mean|meanvar|trend|poisson|drift  change in level, in level and volatility, in level or slope of a trending series, in the rate of counts, or (drift) jumps on a level that wanders as a random walk between them, so a smooth or drifting series is not read as a staircase (default: mean; drift takes --penalty <number>, --min-segment, --drift-slope and --drift-noise only)
  --penalty bic|aic|hannan-quinn|<number>   PELT penalty per change (default: bic)
  --dispersion              with --model meanvar: scale the penalty by the dispersion of the squared residuals (fewer false alarms on heavy tails or clustered volatility)
  --robust                  with --model meanvar: Laplace noise instead of Gaussian, so heavy tails are not read as volatility changes
  --min-segment <n>         shortest segment (default: 2 for mean, 10 for meanvar)
  --period <n>              remove a seasonal cycle of n points first (12 monthly, 7 daily-weekly); mean/meanvar subtract it, poisson fits multiplicative factors
  --holidays <a,b,...>      with --model poisson: row labels (dates, or 1-based row numbers) of known holidays; one fitted factor on their rate, so a holiday dip is not read as a step; write label=kind (e.g. 2026-12-25=closed) to fit one factor per kind
  --bursts [ratio]          with --model poisson: single days far above both neighbours' level (default 2.5x and a Poisson-sized excess) are cut back to it before fitting, so a spike is not read as two changes; listed in the result
  --spikes [n]              with a mean or meanvar model (with --log, excursions are log ratios): label a run of changes within n points (default 5) that returns to the starting level (a bad price, a one-day shock) as one spike or dip, listed in the result; the changes are unchanged
  --episodes [n]            with --model poisson: label an up-step followed within n points (default a tenth of the series) by a step back to about the old level as one burst episode, listed in the result; the changes are unchanged
  --burst-runs n            with --bursts: also cut back runs of 2 to n days (default off) that sit 2x above the same-phase level on both sides
  --log                     take natural logs first (positive values; mean, meanvar, trend): a steady percentage growth is a straight line, not a staircase; segments also show the geometric mean and each change its ratio
  --multiplicative           with --period (mean/meanvar): the season is a factor, not an amount, so it scales with the level (positive values only; not with --drift)
  --drift                   with --period: let the seasonal shape change over time (growing amplitude, moving peak)
  --trend [bend|bends|quad]        fit one linear trend under the steps and remove it (a ramp is not read as many small changes);
                            'bend' lets the slope change once, 'bends' up to three times, chosen by BIC (counts, --model poisson: a change of growth rate, 'bends' up to two);
                            with --model poisson, a common log-linear growth rate (multiplicative, composes with --period)
  --slope-breaks [n]        test for up to n (default 3) changes of the growth rate on the differences (use with --log for a percentage growth): each break is dated and has a Wald statistic against a calibrated bar of 11; 40 or more points
  --knot-margin f          with --trend bend(s): keep this fraction of the series clear at each end when looking for knots (default 0.1 = knots at 10 to 90%; 0.2 = the old 20 to 80%)
  --joint-knots             with --trend bends: also score every pair of knots, not only the greedy search's (slower, about 2 s per 240 points)
  --bootstrap               with --model meanvar, mean or poisson: set the penalty from block-resampled residuals (much fewer false alarms on heavy tails, clustered volatility or autocorrelated noise; a little less power at n = 100)
  --overdispersion [phi|nb] counts (nb: a negative-binomial cost for independent clumpy counts, also with --period and --trend; in the Bayesian pass without them): scale the penalty by the counts' dispersion (variance over mean, estimated from block totals, or the number given), so sticky or clumped counts are not cut into many steps
  --ar1 [joint]             allow for lag-1 autocorrelation (mean model): widen the noise scale, or
                            'joint' to fit the means and rho together (more power on small shifts)
  --hazard <n>              Bayesian expected points between changes (default: ${DEFAULTS.hazardLambda})
  --threshold <p>           report Bayesian changes at or above p (default: ${DEFAULTS.threshold})
  --example                 run on the bundled Nile river flow series
  --noise-floor [k]         the noise scale is at least k (default 1) times the median absolute step between neighbours, so a smooth low-noise drift is not cut at every bend (off by default)
  --noise-floor-diff2/-diff3  take that floor from second or third differences instead
  --noise-floor-local [w]   take it from residuals of centred w-point line fits (default 7)
  --noise-floor-quad [w]    the same with centred w-point quadratic fits
  --consensus [n]           run six settings (level, level under a trend with AR(1), the same with joint AR(1), noise floor, trend, trend with floor) and list each change by how many agree (changes within n points, default 2% of the series, are one); takes --log, --period, --penalty, --min-segment, --column
  --columns [a,b,...]       several columns measured at the same points: each column's agreed changes, merged, plus one segmentation for all columns (--model mean or meanvar); no list = every numeric column; takes --label-column, --penalty, --min-segment, --consensus n as the tolerance; the per-column panels run on worker threads
  --joint-floor auto|off|k  with --columns and the level model: each column's noise for the one segmentation. auto (default) floors only a column whose own level fit over-cuts; k floors every column at k x the local-line scatter; off is the plain fit
  --drift-slope             with --model drift: take out the series' median step first, so a steady growth (population, prices) is not paid for as wander
  --drift-noise ml|lags     with --model drift: how the wander is sized. ml (default) chooses it together with the changes, so one big step is not absorbed as wander; lags is the earlier estimate from lag differences alone
  --joint-ar1               with --columns and the level model: each column's sd raised to its AR(1) long-run sd
  --no-agreed               with the level model: skip the six-setting panel that leads the text output with the changes every setting agrees on (runs on worker threads; skipped anyway above 10000 points)
  --json                    print the full result as JSON
  -h, --help                this help

Methods (please cite them if you use the results):
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}. ${p.url}`).join('\n')}

Statistical analysis of data you supply, not advice. MIT licence.`;

// Measured 2026-11-10 on the tree-ring series: 1,000 points 1.6 s with the panel vs 0.6 s without,
// 2,000 points 5.3 s vs 1.1 s, 7,980 points 32 s vs 5.7 s. The text output stays quick on long series.
export const AGREED_MAX_POINTS = 10000;

export async function main(argv, { stdin = process.stdin, out = (s) => process.stdout.write(s), agreedMax = AGREED_MAX_POINTS } = {}) {
  const opt = {};
  let file = null;
  let json = false;
  let example = false;
  let agreed = true;
  const flags = { '--column': 'column', '--label-column': 'labelColumn', '--model': 'model', '--penalty': 'penalty', '--min-segment': 'minSegment', '--hazard': 'hazardLambda', '--threshold': 'threshold', '--period': 'period', '--knot-margin': 'knotMargin', '--holidays': 'holidays' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { out(USAGE + '\n'); return 0; }
    else if (a === '--json') json = true;
    else if (a === '--example') example = true;
    else if (a === '--no-agreed') agreed = false;
    else if (a === '--columns') opt.columns = argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[++i].split(',').map((c) => c.trim()).filter(Boolean) : [];
    else if (a === '--joint-floor') { const v = argv[++i]; if (v !== 'auto' && v !== 'off' && !(Number(v) > 0)) throw new Error('--joint-floor takes auto, off or a positive number.'); opt.jointFloor = v === 'auto' || v === 'off' ? v : Number(v); }
    else if (a === '--joint-ar1') opt.jointAr1 = true;
    else if (a === '--drift-slope') opt.driftSlope = true;
    else if (a === '--drift-noise') { const v = argv[++i]; if (v !== 'ml' && v !== 'lags') throw new Error('--drift-noise takes ml or lags.'); opt.driftNoise = v; }
    else if (a === '--drift') opt.drift = true;
    else if (a === '--log') opt.log = true;
    else if (a === '--multiplicative') opt.seasonMode = 'multiplicative';
    else if (a === '--robust') opt.robust = true;
    else if (a === '--dispersion') opt.dispersion = true;
    else if (a === '--bootstrap') opt.bootstrap = true;
    else if (a === '--overdispersion') opt.overdispersion = argv[i + 1] === 'nb' ? (i++, 'nb') : argv[i + 1] && /^\d+(\.\d+)?$/.test(argv[i + 1]) ? Number(argv[++i]) : true;
    else if (a === '--bursts') opt.bursts = argv[i + 1] && /^\d+(\.\d+)?$/.test(argv[i + 1]) ? Number(argv[++i]) : true;
    else if (a === '--spikes') opt.spikes = argv[i + 1] && /^\d+$/.test(argv[i + 1]) ? Number(argv[++i]) : true;
    else if (a === '--episodes') opt.episodes = argv[i + 1] && /^\d+$/.test(argv[i + 1]) ? Number(argv[++i]) : true;
    else if (a === '--burst-runs') opt.burstRuns = Number(argv[++i]);
    else if (a === '--slope-breaks') opt.slopeBreaks = argv[i + 1] && /^[1-3]$/.test(argv[i + 1]) ? Number(argv[++i]) : true;
    else if (a === '--joint-knots') opt.jointKnots = true;
    else if (a === '--trend') opt.trend = argv[i + 1] === 'bend' || argv[i + 1] === 'bends' || argv[i + 1] === 'quad' ? argv[++i] : true;
    else if (a === '--consensus') opt.consensus = argv[i + 1] && /^\d+$/.test(argv[i + 1]) ? Number(argv[++i]) : true;
    else if (a === '--ar1') opt.ar1 = argv[i + 1] === 'joint' ? (i++, 'joint') : true;
    else if (a === '--noise-floor-diff2') opt.noiseFloorOrder = 2;
    else if (a === '--noise-floor-diff3') opt.noiseFloorOrder = 3;
    else if (a === '--noise-floor-local') { opt.noiseFloorOrder = 'local'; if (argv[i + 1] && /^\d+$/.test(argv[i + 1])) opt.noiseFloorWindow = Number(argv[++i]); }
    else if (a === '--noise-floor-quad') { opt.noiseFloorOrder = 'local'; opt.noiseFloorDegree = 2; if (argv[i + 1] && /^\d+$/.test(argv[i + 1])) opt.noiseFloorWindow = Number(argv[++i]); }
    else if (a === '--noise-floor') opt.noiseFloor = argv[i + 1] && !argv[i + 1].startsWith('-') ? Number(argv[++i]) : true;
    else if (flags[a]) {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      opt[flags[a]] = argv[++i];
    } else if (a.startsWith('-')) throw new Error(`Unknown option ${a}. Try --help.`);
    else file = a;
  }
  // `--columns prices.csv` with no other file: the optional list swallowed the file name. A column
  // list of one name ending in .csv, .tsv or .txt is read as the file (decided by the name, not by
  // whether the file exists, so the command means the same in every folder).
  if (!file && opt.columns && opt.columns.length === 1 && /\.(csv|tsv|txt)$/i.test(opt.columns[0])) { file = opt.columns[0]; opt.columns = []; }
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
  if (opt.model === 'drift') {
    const { driftText, driftResult } = await import('./drift-cli.mjs');
    const r = driftResult({ csv: example ? NILE_CSV : opt.csv, column: opt.column, labelColumn: opt.labelColumn, penalty: opt.penalty, minSegment: opt.minSegment, slope: opt.driftSlope, noise: opt.driftNoise });
    out((json ? JSON.stringify(r, null, 2) : driftText(r)) + '\n');
    return 0;
  }
  if (opt.columns) {
    const { analyzeMulti, multiText, parseColumns } = await import('./multivariate.mjs');
    const { runColumnPanelsThreaded } = await import('./consensus-threads.mjs');
    // Each column's six-setting panel is most of the work (8.0 s of 8.2 s on the 1,751-day currency
    // example): those 6 x columns settings run on worker threads, then merge exactly as on one thread.
    const parsed = parseColumns(opt.csv, opt.columns, opt.labelColumn);
    const columnRuns = await runColumnPanelsThreaded(parsed.cols);
    const r = analyzeMulti({ ...parsed, columnRuns, model: opt.model, penalty: opt.penalty, minSegment: opt.minSegment, tolerance: typeof opt.consensus === 'number' ? opt.consensus : null, floor: opt.jointFloor, ar1: opt.jointAr1 });
    out((json ? JSON.stringify(r, null, 2) : multiText(r)) + '\n');
    return 0;
  }
  if (opt.consensus) {
    const { mergeConsensus, consensusText } = await import('./consensus.mjs');
    const { runPanelThreaded } = await import('./consensus-threads.mjs');
    const { consensus: tol, ...rest } = opt;
    const c = mergeConsensus(await runPanelThreaded(rest), { tolerance: tol === true ? null : tol });
    out((json ? JSON.stringify(c, null, 2) : consensusText(c)) + '\n');
    return 0;
  }
  // The level model's text leads with the settings panel (consensus.mjs), as the page does: on labelled
  // series held out from tuning, the changes every setting agrees on scored far above the level model alone.
  // The panel's settings start on worker threads (consensus-threads.mjs) before the main analysis, which
  // runs here meanwhile; when the options match, its result is the panel's "level" setting, so five run.
  const levelText = agreed && !json && (opt.model == null || opt.model === 'mean');
  let n = null;
  if (levelText) { try { n = parseSeries(opt.csv ?? DEFAULTS.csv, opt.column ?? null, opt.labelColumn ?? null).values.length; } catch { /* analyze reports it */ } }
  let panel = null;
  let reuseLevel = false;
  const base = Object.fromEntries(['csv', 'column', 'labelColumn', 'log', 'period', 'penalty', 'minSegment'].filter((k) => opt[k] != null).map((k) => [k, opt[k]]));
  if (levelText && n != null && n <= agreedMax) {
    const { levelRunFromMain } = await import('./consensus.mjs');
    const { runPanelThreaded } = await import('./consensus-threads.mjs');
    // labelColumn and minSegment go to both runs alike, so they do not stop the reuse.
    const { labelColumn: _l, minSegment: _m, ...rest } = opt;
    reuseLevel = levelRunFromMain({ ...rest, model: 'mean' }, { labels: [], pelt: { changepoints: [] } }) != null;
    // One core is left for the main analysis, which runs on this thread meanwhile.
    panel = runPanelThreaded(base, { skip: reuseLevel ? [0] : [], threads: Math.max(2, availableParallelism() - 1) });
    panel.catch(() => {}); // awaited below; a failure there only drops the panel
  }
  const r = analyze(opt);
  if (json) { out(JSON.stringify(r, null, 2) + '\n'); return 0; }
  const lines = [];
  if (levelText && n != null && n > agreedMax) {
    lines.push(`Agreed changes: not run on ${r.n} points (above ${agreedMax} the six-setting panel takes long even on several cores; add --consensus to run it).`, '');
  } else if (panel) {
    const { mergeConsensus, levelRunFromMain, agreedText } = await import('./consensus.mjs');
    try {
      const runs = await panel;
      if (reuseLevel) runs[0] = levelRunFromMain({ model: 'mean' }, r);
      lines.push(`Agreed changes: ${agreedText(mergeConsensus(runs))}`, '', 'Level model alone (the panel\'s first setting, with the options given):');
    } catch { /* the panel is extra; the analysis below already ran */ }
  }
  lines.push(r.summary, '');
  lines.push('Segments (PELT):');
  for (const s of r.pelt.segments) lines.push(`  ${s.from} – ${s.to}  n=${s.n}  mean=${s.mean}  ${s.geometricMean !== undefined ? `geometric mean=${s.geometricMean}  ` : ''}${s.slope !== undefined ? `slope=${s.slope}  ` : ''}sd=${s.sd}`);
  const ch = r.pelt.changepoints.filter((x) => x.range95);
  if (ch.length) {
    lines.push('', 'Likely range for each change (95%, neighbouring changes held fixed):');
    if (r.rangeWarning) lines.push(`  (${r.rangeWarning})`);
    if (r.driftWarning) lines.push(`  (${r.driftWarning})`);
    if (r.cycleWarning) lines.push(`  (${r.cycleWarning})`);
    if (r.overcutWarning) lines.push(`  (${r.overcutWarning})`);
    for (const x of ch) lines.push(`  ${x.label}: ${x.range95.from === x.range95.to ? 'that point only' : `${x.range95.from} – ${x.range95.to}`}`);
  }
  if (r.updateRateWarning) lines.push('', r.updateRateWarning);
  if (r.ramps) {
    lines.push('', 'Adjacent changes that look like one ramp (same direction, short segments between; the changes above are unchanged):');
    for (const x of r.ramps) lines.push(`  ${x.from} – ${x.to}: ${x.cuts} cuts, one ${x.direction} from ${x.meanBefore} to ${x.meanAfter} (${x.shift > 0 ? '+' : ''}${x.shift})`);
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
  if (r.slopeBreaks) {
    const sb = r.slopeBreaks;
    lines.push('', `Slope-break test on the differences (bar ${sb.critical}):`);
    if (!sb.breaks.length) lines.push('  No change of slope clears the bar (a weak test: this does not rule one out).');
    for (const b of sb.breaks) lines.push(`  ${b.label}: slope ${b.slopeBefore} -> ${b.slopeAfter} per step, Wald ${b.wald}`);
    lines.push(`  (${sb.note})`);
  }
  if (r.episodes && r.episodes.length) {
    lines.push('', 'Episodes (a step and its step back, read as one burst):');
    for (const e of r.episodes) lines.push(`  ${e.from} – ${e.to}: ${e.kind} at ${e.level}/point against ${e.baseBefore} before and ${e.baseAfter} after (${e.jumpFactor}x episode, ${e.netFactor}x net)`);
  } else if (r.episodes) lines.push('', 'Episodes: none.');
  if (r.spikes && r.spikes.length) {
    lines.push('', 'Spikes (changes that return to the starting level, read as one outlier):');
    for (const e of r.spikes) lines.push(`  ${e.from}${e.endIndex > e.startIndex ? ` – ${e.to}` : ''}: ${e.kind}, ${e.excursion} from a level of ${e.base} (${e.excursionInNoiseSd} noise sd), back to ${e.baseAfter}; ${e.changes} changes`);
  } else if (r.spikes) lines.push('', 'Spikes: none.');
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
