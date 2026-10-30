// Is the DAX volatility rise (README "A real volatility rise: DAX returns") a German feature or a common one?
// The same 1,859 trading days of R's EuStockMarkets carry SMI, CAC and FTSE too (data/*-returns.csv; rows are shared,
// so a cut at the same row is the same day). Each index goes through the same four `meanvar` setups as the DAX.
// usage: node eval/eu-markets.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const load = (f) => { const r = readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(',')); return { labels: r.map((x) => x[0]), values: r.map((x) => +x[1]) }; };
const sd = (a) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
for (const [name, file] of [['DAX', 'dax-returns.csv'], ['SMI', 'smi-returns.csv'], ['CAC', 'cac-returns.csv'], ['FTSE', 'ftse-returns.csv']]) {
  const { labels, values } = load(file);
  console.log(`\n${name}: n ${values.length}; sd rows 2-1481 ${sd(values.slice(0, 1480)).toFixed(2)}, rows 1482-1860 ${sd(values.slice(1480)).toFixed(2)}`);
  for (const [v, opt] of [['plain', {}], ['--bootstrap', { bootstrap: true }], ['--dispersion', { dispersion: true }], ['--robust', { robust: true }]]) {
    const cps = analyze({ values, labels, model: 'meanvar', ...opt }).pelt.changepoints;
    console.log(`  ${v.padEnd(12)} ${cps.map((c) => c.label).join(', ') || 'none'}`);
  }
}
