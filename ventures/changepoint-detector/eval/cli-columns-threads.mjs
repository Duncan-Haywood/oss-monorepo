// The several-column CLI (--columns) with every column's six-setting panel on worker threads vs
// the same analysis on one thread (README "Several columns on worker threads in the CLI"). For each
// input: wall clock of a whole `node cli.mjs file --columns` run (panels on threads), of
// analyzeMulti() in-process on one thread (what the CLI did before, minus process start), and
// whether the CLI's text equals the one-thread text.
//   node eval/cli-columns-threads.mjs
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, availableParallelism } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeMulti, multiText } from '../multivariate.mjs';

const here = dirname(dirname(fileURLToPath(import.meta.url)));
const tmp = mkdtempSync(join(tmpdir(), 'cpd-columns-'));
// The four European index return series (EuStockMarkets, rows aligned) joined into one file.
const idx = ['dax', 'cac', 'ftse', 'smi'].map((k) => readFileSync(join(here, `data/${k}-returns.csv`), 'utf8').trim().split('\n').slice(1).map((l) => l.split(',')));
const eu = join(tmp, 'eu-indices.csv');
writeFileSync(eu, 'row,dax,cac,ftse,smi\n' + idx[0].map((r, i) => [r[0], ...idx.map((s) => s[i][1])].join(',')).join('\n') + '\n');
const inputs = [
  { name: 'German unemployment, 2 columns', path: join(here, 'data/german-unemployment.csv'), args: [] },
  { name: 'currency returns, 3 columns', path: join(here, 'data/fx-daily-returns.csv'), args: [] },
  { name: 'currency returns, 3 columns, level and volatility', path: join(here, 'data/fx-daily-returns.csv'), args: ['--model', 'meanvar'] },
  { name: 'European index returns, 4 columns', path: eu, args: [] },
];
console.log(`cores ${availableParallelism()}, node ${process.version}`);
for (const { name, path, args } of inputs) {
  const t0 = performance.now();
  const p = spawnSync(process.execPath, [join(here, 'cli.mjs'), path, '--columns', ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (p.status !== 0) throw new Error(p.stderr);
  const cli = (performance.now() - t0) / 1000;
  const csv = readFileSync(path, 'utf8');
  const t1 = performance.now();
  const r = analyzeMulti({ csv, model: args.includes('meanvar') ? 'meanvar' : 'mean' });
  const one = (performance.now() - t1) / 1000;
  console.log(`${name} (${r.n} points): cli, panels on threads ${cli.toFixed(1)} s; one thread in-process ${one.toFixed(1)} s; text equals one-thread: ${p.stdout === multiText(r) + '\n'}`);
}
rmSync(tmp, { recursive: true, force: true });
