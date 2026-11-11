#!/usr/bin/env node
// Command line: estimate in-place strength from a logger CSV and lab breaks.
//
//   node cli.mjs logger.csv --cal breaks.txt [--target 3000] [--method equivalent-age]
//                [--datum 0] [--energy 40000] [--reference 20] [--lab 23]
//                [--model auto|logarithmic|hyperbolic|exponential]
//                [--unit auto|C|F] [--future 10] [--index] [--json] [--csv out.csv]
//
// breaks.txt holds one specimen per line: "age_days, strength" (cured at --lab
// deg C), or "maturity, strength" with --index. Not engineering advice: check
// every estimate against field-cured specimens or other in-place tests.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseLoggerCsv, parseCalibrationText, calibrationPoints, fitStrength, estimate, indexUnit, toCsv, exampleCsv, EXAMPLE_CALIBRATION } from './maturity.mjs';

export function parseArgs(argv) {
  const a = { file: null, cal: null, target: null, method: 'nurse-saul', model: 'auto', unit: 'auto', json: false, index: false, csv: null, example: false };
  const num = { '--target': 'target', '--datum': 'datumC', '--energy': 'activationEnergy', '--reference': 'referenceC', '--lab': 'labCuringC', '--future': 'futureC' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k in num) a[num[k]] = Number(argv[++i]);
    else if (k === '--cal') a.cal = argv[++i];
    else if (k === '--method') a.method = argv[++i];
    else if (k === '--model') a.model = argv[++i];
    else if (k === '--unit') a.unit = argv[++i];
    else if (k === '--csv') a.csv = argv[++i];
    else if (k === '--json') a.json = true;
    else if (k === '--index') a.index = true;
    else if (k === '--example') a.example = true;
    else if (k === '-h' || k === '--help') a.help = true;
    else a.file = k;
  }
  return a;
}

export function run(a, read = p => readFileSync(p, 'utf8')) {
  const opts = { method: a.method };
  for (const k of ['datumC', 'activationEnergy', 'referenceC', 'labCuringC']) if (Number.isFinite(a[k])) opts[k] = a[k];
  const logger = parseLoggerCsv(a.example ? exampleCsv() : read(a.file), { unit: a.unit });
  if (logger.errors.length) return { error: logger.errors.join(' ') };
  const cal = parseCalibrationText(a.example ? EXAMPLE_CALIBRATION : read(a.cal), { column: a.index ? 'index' : 'age' });
  const fit = fitStrength(calibrationPoints(cal.rows, opts), a.model);
  if (!fit.chosen) return { error: `No usable strength-maturity fit: ${fit.fits.map(f => `${f.name} ${f.reason}`).join('; ')}.` };
  const result = estimate(logger.sensors, fit.chosen, { ...opts, target: a.target, futureC: a.futureC, range: fit.range });
  return { opts, logger, cal, fit, result };
}

export function report(r, strengthUnit = 'psi') {
  const u = indexUnit(r.opts);
  const lines = [];
  lines.push(`Fit: ${r.fit.chosen.label}  (R² ${r.fit.chosen.r2.toFixed(3)}, RMSE ${r.fit.chosen.rmse.toFixed(0)} ${strengthUnit}, ${r.fit.n} specimens)`);
  for (const s of r.result.sensors) {
    lines.push(`\n${s.name}: ${s.readings} readings over ${(s.spanHours / 24).toFixed(1)} days, ${s.minC.toFixed(1)} to ${s.maxC.toFixed(1)} °C`);
    lines.push(`  maturity now ${s.maturityNow.toFixed(0)} ${u}; estimated strength ${s.strengthNow.toFixed(0)} ${strengthUnit}`);
    if (s.reached?.status === 'reached') lines.push(`  target reached at hour ${s.reached.hour.toFixed(1)}`);
    if (s.reached?.status === 'unreachable') lines.push('  target is above the fitted curve\'s limit');
    if (s.projected?.status === 'projected') lines.push(`  target not yet reached; about ${s.projected.hoursMore.toFixed(0)} h more at ${s.projected.assumedC.toFixed(1)} °C`);
    if (s.projected?.status === 'stalled') lines.push(`  target not yet reached and no maturity is gained at ${s.projected.assumedC.toFixed(1)} °C`);
    for (const w of s.warnings) lines.push(`  ! ${w}`);
  }
  if (r.result.governing) lines.push(`\nLowest estimate: ${r.result.governing}`);
  lines.push('\nAn estimate, not engineering advice: confirm with field-cured specimens or other in-place tests before stripping forms or stressing tendons.');
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = parseArgs(process.argv.slice(2));
  if (a.help || (!a.example && (!a.file || !a.cal))) {
    console.log('usage: node cli.mjs logger.csv --cal breaks.txt [--target 3000] [--method nurse-saul|equivalent-age] [--json] [--csv out.csv]\n       node cli.mjs --example --target 3000');
    process.exit(a.help ? 0 : 2);
  }
  const r = run(a);
  if (r.error) { console.error(r.error); process.exit(1); }
  if (a.csv) writeFileSync(a.csv, toCsv(r.result, 'psi', r.opts));
  console.log(a.json ? JSON.stringify({ fit: r.fit, result: r.result }, null, 2) : report(r));
}
