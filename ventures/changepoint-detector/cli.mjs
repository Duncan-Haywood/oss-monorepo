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
  --min-segment <n>         shortest segment (default: 2 for mean, 5 for meanvar)
  --period <n>              remove a seasonal cycle of n points first (12 monthly, 7 daily-weekly); mean/meanvar subtract it, poisson fits multiplicative factors
  --drift                   with --period: let the seasonal shape change over time (growing amplitude, moving peak)
  --trend [bend|bends]          fit one linear trend under the steps and remove it (a ramp is not read as many small changes);
                            'bend' lets the slope change once, 'bends' up to three times, chosen by BIC
  --knot-margin f          with --trend bend(s): keep this fraction of the series clear at each end when looking for knots (default 0.1 = knots at 10 to 90%; 0.2 = the old 20 to 80%)
  --joint-knots             with --trend bends: also score every pair of knots, not only the greedy search's (slower, about 2 s per 240 points)
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
  const flags = { '--column': 'column', '--label-column': 'labelColumn', '--model': 'model', '--penalty': 'penalty', '--min-segment': 'minSegment', '--hazard': 'hazardLambda', '--threshold': 'threshold', '--period': 'period', '--knot-margin': 'knotMargin' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { out(USAGE + '\n'); return 0; }
    else if (a === '--json') json = true;
    else if (a === '--example') example = true;
    else if (a === '--drift') opt.drift = true;
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
  if (!example) {
    if (file) opt.csv = await readFile(file, 'utf8');
    else {
      let s = '';
      for await (const chunk of stdin) s += chunk;
      opt.csv = s;
    }
  }
  const r = analyze(opt);
  if (json) { out(JSON.stringify(r, null, 2) + '\n'); return 0; }
  const lines = [r.summary, ''];
  lines.push('Segments (PELT):');
  for (const s of r.pelt.segments) lines.push(`  ${s.from} – ${s.to}  n=${s.n}  mean=${s.mean}  ${s.slope !== undefined ? `slope=${s.slope}  ` : ''}sd=${s.sd}`);
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
