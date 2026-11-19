#!/usr/bin/env node
// entry-order: load every JavaScript module that sits on an import cycle as
// the first module, each in a fresh Node process, and report the ones that
// throw. An ES module cycle is harmless until one module reads another's
// top-level binding while that other module is still loading; which module
// is "still loading" depends on which one the program imports first. A test
// that always enters the cycle from the same file never sees the failure;
// a page, worker or new test that enters from another one does
// ("ReferenceError: Cannot access 'X' before initialization").
//
// cyclehound finds the cycles (statically, in Rust); this script only runs
// the files on them, so it costs one Node start per file on a cycle, not per
// file in the tree.
//
// It RUNS the modules' top-level code. Point it at code you trust (your own
// repository), never at a download.
//
// Usage:
//   node tools/entry-order.mjs [--bin PATH] [--timeout MS] [--json] DIR
//   cyclehound --json --no-type --no-dynamic DIR > c.json
//   node tools/entry-order.mjs --from c.json DIR
//
// Exit 1 when any file fails with a temporal-dead-zone ReferenceError (the
// cycle-order bug); other load errors (a module that needs a browser, say)
// are listed but do not fail the run unless --strict.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RUNNABLE = /\.(mjs|js|cjs)$/;
const TDZ = /before initialization|is not defined.*circular/i;

export function parseArgs(argv) {
  const o = { bin: null, timeout: 30000, json: false, strict: false, from: null, dir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--bin') o.bin = argv[++i];
    else if (a === '--timeout') o.timeout = Number(argv[++i]);
    else if (a === '--json') o.json = true;
    else if (a === '--strict') o.strict = true;
    else if (a === '--from') o.from = argv[++i];
    else if (a === '-h' || a === '--help') o.help = true;
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
    else o.dir = a;
  }
  if (!o.help && !o.dir) throw new Error('give the folder cyclehound scanned');
  if (!Number.isFinite(o.timeout) || o.timeout <= 0) throw new Error('--timeout takes a positive number of milliseconds');
  return o;
}

/** The cyclehound binary: --bin, then target/release, then PATH. */
function findBin(given) {
  if (given) return given;
  const here = dirname(fileURLToPath(import.meta.url));
  const built = join(here, '..', 'target', 'release', 'cyclehound');
  return existsSync(built) ? built : 'cyclehound';
}

/** Files on a cycle, from cyclehound's --json report, resolved against dir. */
export function cycleFiles(report, dir) {
  const seen = new Set();
  for (const c of report.components || []) for (const f of c.files || []) seen.add(resolve(dir, f));
  return [...seen].filter((f) => RUNNABLE.test(f)).sort();
}

/** Import one file first, in its own process. */
export function enter(file, timeout) {
  const code = `import(${JSON.stringify(pathToFileURL(file).href)}).then(() => process.exit(0), (e) => { process.stderr.write(String(e && e.name) + ': ' + String(e && e.message)); process.exit(3); });`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: dirname(file), timeout, encoding: 'utf8' });
  if (r.error && r.error.code === 'ETIMEDOUT') return { file, ok: false, kind: 'timeout', message: `still loading after ${timeout} ms` };
  if (r.status === 0) return { file, ok: true };
  const message = (r.stderr || '').trim().split('\n').pop().slice(0, 300);
  return { file, ok: false, kind: TDZ.test(message) ? 'tdz' : 'other', message };
}

export function run(opts) {
  const dir = resolve(opts.dir);
  let report;
  if (opts.from) report = JSON.parse(readFileSync(opts.from, 'utf8'));
  else {
    const r = spawnSync(findBin(opts.bin), ['--json', '--no-type', '--no-dynamic', '--warn', dir], { encoding: 'utf8', maxBuffer: 1 << 28 });
    if (r.error) throw new Error(`could not run cyclehound (${r.error.message}); build it with cargo build --release or pass --bin`);
    report = JSON.parse(r.stdout);
  }
  const files = cycleFiles(report, dir);
  const results = files.map((f) => enter(f, opts.timeout));
  return { dir, components: (report.components || []).length, files: files.length, results };
}

function main() {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`entry-order: ${e.message}`); process.exit(2); }
  if (opts.help) { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n')); return; }
  let out;
  try { out = run(opts); } catch (e) { console.error(`entry-order: ${e.message}`); process.exit(2); }
  const bad = out.results.filter((r) => !r.ok);
  const tdz = bad.filter((r) => r.kind === 'tdz');
  if (opts.json) console.log(JSON.stringify(out, null, 2));
  else {
    const rel = (f) => f.startsWith(out.dir + '/') ? f.slice(out.dir.length + 1) : f;
    for (const r of bad) console.log(`${r.kind === 'tdz' ? 'CYCLE ORDER' : r.kind}  ${rel(r.file)}: ${r.message}`);
    console.log(`${out.files} runnable files on ${out.components} import cycles, each loaded first: ${tdz.length} cycle-order failures, ${bad.length - tdz.length} other load errors`);
  }
  process.exit(tdz.length || (opts.strict && bad.length) ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
