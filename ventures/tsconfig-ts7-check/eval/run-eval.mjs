#!/usr/bin/env node
// Checks the checker against the real compilers.
//
//   TSC6=/path/to/typescript@6.0.3/bin/tsc TSC7=/path/to/typescript@7.0.2/bin/tsc \
//     node eval/run-eval.mjs [--repo <monorepo root>]
//
// For every config in eval/corpus/ (and, with --repo, every tracked
// tsconfig*.json in the monorepo) it:
//   1. runs tsc 6 and tsc 7 on the config (extends dropped, sources replaced by
//      one stub file in src/) and collects the diagnostics reported against
//      tsconfig.json;
//   2. compares the options tsc 7 says "have been removed" with the options
//      checkConfig() reports as errors, and TS5011 (rootDir) with the rootDir
//      finding;
//   3. writes the suggested compilerOptions back and runs both compilers
//      again, expecting no deprecation or removal diagnostics.
// Results go to eval/results.json (read by eval.test.mjs) and eval/RESULTS.md.
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseJsonc, checkConfig, suggestOptions } from '../tsconfig7.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const { TSC6, TSC7 } = process.env;
if (!TSC6 || !TSC7) { console.error('Set TSC6 and TSC7 to the tsc binaries of typescript@6.0.3 and @7.0.2.'); process.exit(2); }
const version = (bin) => execFileSync(bin, ['-v'], { encoding: 'utf8' }).trim();
const repoIdx = process.argv.indexOf('--repo');
const repo = repoIdx > 0 ? process.argv[repoIdx + 1] : null;

const corpus = [];
for (const group of readdirSync(join(HERE, 'corpus')).sort()) {
  for (const f of readdirSync(join(HERE, 'corpus', group)).sort()) {
    corpus.push({ id: `${group}/${f}`, text: readFileSync(join(HERE, 'corpus', group, f), 'utf8') });
  }
}
if (repo) {
  const files = execFileSync('git', ['ls-files', '*tsconfig*.json'], { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter((p) => /(^|\/)tsconfig[^/]*\.json$/.test(p) && !p.includes('node_modules') && !p.includes('/eval/corpus/'));
  for (const p of files) corpus.push({ id: `repo/${p}`, text: readFileSync(join(repo, p), 'utf8') });
}

const DIAG = /^tsconfig\.json\(\d+,\d+\): error (TS\d+): (.*)$/;
function runTsc(bin, config) {
  const dir = mkdtempSync(join(tmpdir(), 'ts7eval-'));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'a.ts'), 'export const a: number = 1;\n');
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(config, null, 2));
  const p = spawnSync(bin, ['-p', '.'], { cwd: dir, encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  const diags = [];
  for (const line of (p.stdout + p.stderr).split('\n')) {
    const m = DIAG.exec(line);
    if (m) diags.push({ code: m[1], text: m[2] });
  }
  return diags;
}
// What tsc 7 rejects, keyed "option:code": removed (TS5102/TS5108), unknown
// (TS5023) and invalid value (TS6046).
function rejectedBy(diags) {
  const out = [];
  for (const d of diags) {
    let m;
    if ((d.code === 'TS5102' || d.code === 'TS5108') && (m = /Option '([^'=]+)/.exec(d.text))) out.push(`${m[1]}:${d.code}`);
    else if (d.code === 'TS5023' && (m = /Unknown compiler option '([^']+)'/.exec(d.text))) out.push(`${m[1]}:${d.code}`);
    else if (d.code === 'TS6046' && (m = /Argument for '--([^']+)' option/.exec(d.text))) out.push(`${m[1]}:${d.code}`);
  }
  return [...new Set(out)].sort();
}
const deprecatedBy = (diags) => diags.filter((d) => d.code === 'TS5101' || d.code === 'TS5107')
  .map((d) => /Option '([^'=]+)/.exec(d.text)).filter(Boolean).map((m) => m[1]).sort();

function prepare(cfg, compilerOptions) {
  const out = { ...cfg, compilerOptions: { ...compilerOptions } };
  delete out.extends; delete out.files; delete out.$schema; delete out.display; delete out._version;
  out.include = ['src'];
  if (Array.isArray(out.references)) out.references = out.references.filter((r) => r && r.prepend); // keep only what is checked
  delete out.compilerOptions.plugins; // editor plugins never affect tsc
  return out;
}

const rows = [];
for (const c of corpus) {
  const parsed = parseJsonc(c.text);
  if (parsed.error) { rows.push({ id: c.id, parseError: parsed.error }); continue; }
  const cfg = parsed.value;
  const prepared = prepare(cfg, cfg.compilerOptions || {});
  const r = checkConfig(prepared);
  const predicted = [...new Set(r.findings.filter((f) => f.ts7Code).map((f) => `${f.option}:${f.ts7Code}`))].sort();
  const predictsRootDir = r.findings.some((f) => f.id === 'default:rootDir');
  const d6 = runTsc(TSC6, prepared);
  const d7 = runTsc(TSC7, prepared);
  const sug = suggestOptions(prepared, r.effective);
  const after = prepare(cfg, sug.compilerOptions);
  const a6 = runTsc(TSC6, after);
  const a7 = runTsc(TSC7, after);
  const removed7 = rejectedBy(d7);
  const row = {
    id: c.id,
    predicted, tsc7Removed: removed7, tsc6Deprecated: deprecatedBy(d6), tsc6Rejected: rejectedBy(d6),
    removedMatch: JSON.stringify(predicted) === JSON.stringify(removed7),
    predictsRootDir, tsc7RootDirError: d7.some((d) => d.code === 'TS5011'),
    findings: r.findings.map((f) => `${f.severity}:${f.id}`),
    suggestion: sug.compilerOptions,
    afterTsc6: a6.map((d) => d.code), afterTsc7: a7.map((d) => d.code),
    suggestionClean: !a6.length && !a7.length,
  };
  row.rootDirMatch = row.predictsRootDir === row.tsc7RootDirError;
  rows.push(row);
  console.log(`${row.removedMatch && row.rootDirMatch ? 'ok  ' : 'DIFF'} ${row.suggestionClean ? 'clean' : 'DIRTY'} ${c.id}  predicted=[${predicted}] tsc7=[${removed7}]${row.suggestionClean ? '' : ` after: tsc6 ${a6.map((d) => `${d.code} ${d.text}`).join('; ')} tsc7 ${a7.map((d) => `${d.code} ${d.text}`).join('; ')}`}`);
}

const ok = rows.filter((r) => r.removedMatch && r.rootDirMatch).length;
const clean = rows.filter((r) => r.suggestionClean).length;
const withRemoved = rows.filter((r) => r.tsc7Removed?.length).length;
const summary = { date: new Date().toISOString().slice(0, 10), tsc6: version(TSC6), tsc7: version(TSC7), configs: rows.length, agree: ok, suggestionsClean: clean, configsTsc7Rejects: withRemoved };
writeFileSync(join(HERE, 'results.json'), JSON.stringify({ summary, rows }, null, 1) + '\n');
console.log(summary);
