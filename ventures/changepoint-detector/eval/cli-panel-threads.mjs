// The CLI's agreed-changes panel on worker threads vs one thread (README "Agreed changes on
// worker threads in the CLI"). For each input: wall clock of `node cli.mjs file` (panel on
// threads, main analysis meanwhile), of the same with --no-agreed, and of consensus() on one
// thread after the main analysis (what the CLI did before, minus process start), and whether
// the threaded panel's text equals the one-thread one. Inputs are data/treering.csv cut to
// length unless files are given.
//   node eval/cli-panel-threads.mjs [file.csv ...]
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, availableParallelism } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../engine.mjs';
import { consensus, agreedText } from '../consensus.mjs';

const here = dirname(dirname(fileURLToPath(import.meta.url)));
const tmp = mkdtempSync(join(tmpdir(), 'cpd-threads-'));
let inputs = process.argv.slice(2).map((f) => ({ name: f, path: f }));
if (!inputs.length) {
  const lines = readFileSync(join(here, 'data/treering.csv'), 'utf8').trim().split('\n');
  inputs = [1000, 2000, 4000, 7980].map((n) => {
    const path = join(tmp, `treering-${n}.csv`);
    writeFileSync(path, [lines[0], ...lines.slice(1, n + 1)].join('\n') + '\n');
    return { name: `treering, first ${n} points`, path };
  });
}
const wall = (args) => {
  const t = performance.now();
  const p = spawnSync(process.execPath, [join(here, 'cli.mjs'), ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (p.status !== 0) throw new Error(p.stderr);
  return { s: (performance.now() - t) / 1000, out: p.stdout };
};
console.log(`cores ${availableParallelism()}, node ${process.version}`);
for (const { name, path } of inputs) {
  const csv = readFileSync(path, 'utf8');
  const threaded = wall([path]);
  const plain = wall(['--no-agreed', path]);
  const t = performance.now();
  analyze({ csv });
  const one = consensus({ csv });
  const oneThread = (performance.now() - t) / 1000;
  const line = threaded.out.split('\n')[0];
  const ran = line.startsWith('Agreed changes: Every') || line.startsWith('Agreed changes: No change');
  const same = ran ? line === `Agreed changes: ${agreedText(one)}` : 'panel not run';
  console.log(`${name} (${basename(path)}): cli with panel on threads ${threaded.s.toFixed(1)} s; --no-agreed ${plain.s.toFixed(1)} s; main + one-thread panel in-process ${oneThread.toFixed(1)} s; text equals one-thread: ${same}`);
}
rmSync(tmp, { recursive: true, force: true });
