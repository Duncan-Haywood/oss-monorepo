#!/usr/bin/env node
// k8s-rollout-safety-check -- does this Deployment drop live requests when it
// rolls out?
//
// Zero dependencies, Node's standard library only, and no network calls of any
// kind: it reads the YAML you point it at and nothing else. That is what makes
// it safe to run against production manifests in CI without granting it
// cluster access -- it never has any.

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { analyzeSources, summaryLine, CHECKS, RISK } from './engine.mjs';

const YAML_EXT = new Set(['.yaml', '.yml']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', '.terraform']);

const USAGE = `k8s-rollout-safety-check — will this Kubernetes rollout drop live requests?

Usage:
  node check.mjs [path ...]        check these files, or scan these directories
  node check.mjs                   scan the current directory

Options:
  --format text|json   output format (default: text)
  --fail-on-risk       exit 2 when any finding can drop requests
  --list-checks        print every check this tool runs, then exit
  -h, --help           this message

Exit codes:
  0  no findings, or findings but --fail-on-risk was not given
  1  a path could not be read, an argument was invalid, or a file could not be
     parsed as YAML (an unparsed file is unchecked, never clean)
  2  --fail-on-risk was given and at least one risk-level finding was found

Reads YAML only. Makes no network calls and needs no cluster access.`;

async function collectFiles(target) {
  const info = await stat(target);
  // Anything that is not a directory is read as one input. `isFile()` was too
  // narrow: `helm template ./chart | node check.mjs /dev/stdin` -- the exact
  // pipeline the README documents -- gives a FIFO while the pipe is open, so
  // `isFile()` is false and this fell through to `readdir`, exiting 1 with
  // ENOTDIR without ever reading the manifest. Character devices and sockets
  // land here for the same reason: if the caller named it, read it.
  if (!info.isDirectory()) return [target];
  const out = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        await walk(path.join(dir, entry.name));
      } else if (YAML_EXT.has(path.extname(entry.name))) {
        out.push(path.join(dir, entry.name));
      }
    }
  };
  await walk(target);
  return out.sort();
}

export function parseArgs(argv) {
  const opts = { paths: [], format: 'text', failOnRisk: false, help: false, listChecks: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') opts.help = true;
    else if (arg === '--fail-on-risk') opts.failOnRisk = true;
    else if (arg === '--list-checks') opts.listChecks = true;
    else if (arg === '--format') {
      const value = argv[i + 1];
      if (value !== 'text' && value !== 'json') {
        throw new Error(`--format expects "text" or "json", got ${value ?? '(nothing)'}`);
      }
      opts.format = value;
      i += 1;
    } else if (arg.startsWith('--format=')) {
      const value = arg.slice('--format='.length);
      if (value !== 'text' && value !== 'json') throw new Error(`--format expects "text" or "json", got ${value}`);
      opts.format = value;
    } else if (arg.startsWith('-')) {
      throw new Error(`unknown option: ${arg}`);
    } else {
      opts.paths.push(arg);
    }
  }
  if (opts.paths.length === 0) opts.paths.push('.');
  return opts;
}

const BULLET = { risk: '✗', warn: '!' };

export function renderText(result) {
  const lines = [];
  lines.push(summaryLine(result));
  if (result.deployments.length) {
    lines.push(`Checked: ${result.deployments.join(', ')}`);
  }
  if (result.skipped.length) {
    lines.push(`Not checked (this tool reads Deployments and PodDisruptionBudgets): ${result.skipped.join(', ')}`);
  }
  for (const err of result.errors ?? []) {
    lines.push(`  ! ${err.name}: could not be read as YAML — ${err.message}`);
  }
  for (const f of result.findings) {
    lines.push('');
    lines.push(`${BULLET[f.severity]} [${f.severity}] ${f.title}`);
    lines.push(`    where: ${f.resource}${f.container ? ` container ${f.container}` : ''}`);
    lines.push(`    why:   ${wrap(f.impact, 11)}`);
    lines.push(`    fix:   ${wrap(f.fix, 11)}`);
  }
  if (result.verdict === 'clean') {
    lines.push('');
    lines.push('Note: a clean result means these specific checks found nothing. It is not a');
    lines.push('guarantee of a zero-downtime deploy — see --list-checks for exactly what was asked.');
  }
  return lines.join('\n');
}

/** Wrap prose to 88 columns, indenting continuation lines so the `why:` and
 * `fix:` labels stay readable in a CI log. */
function wrap(text, indent) {
  const width = 88 - indent;
  const pad = ' '.repeat(indent);
  const out = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    if (line && line.length + 1 + word.length > width) {
      out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(line);
  return out.join(`\n${pad}`);
}

export async function main(argv, io = console) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    io.error(err.message);
    return 1;
  }
  if (opts.help) {
    io.log(USAGE);
    return 0;
  }
  if (opts.listChecks) {
    for (const check of CHECKS) io.log(`${check.severity.padEnd(4)} ${check.id.padEnd(34)} ${check.title}`);
    return 0;
  }

  const files = [];
  for (const target of opts.paths) {
    try {
      files.push(...await collectFiles(target));
    } catch (err) {
      io.error(`cannot read ${target}: ${err.message}`);
      return 1;
    }
  }

  const sources = [];
  for (const file of files) {
    sources.push({ name: file, text: await readFile(file, 'utf8') });
  }
  const result = analyzeSources(sources);

  if (opts.format === 'json') {
    io.log(JSON.stringify({ ...result, filesChecked: files.length }, null, 2));
  } else {
    if (files.length === 0) {
      io.log('No .yaml or .yml files found.');
      return 0;
    }
    io.log(renderText(result));
  }

  // A file that could not be parsed was never analysed, so a 0 here would mean
  // "this gate passed" when the honest answer is "this gate did not run". That
  // is the failure this whole tool exists to make visible, and a CI gate that
  // goes green because it could not read its input is the worst version of it.
  // Reported independently of the risk count, and independently of
  // --fail-on-risk, because the risk count is exactly what is unknown.
  if (result.errors.length) {
    io.error(
      `${result.errors.length} file(s) could not be read as YAML, so they were not analysed. ` +
      'Exiting non-zero: an unparsed file is an unchecked file, not a clean one.',
    );
    return 1;
  }
  if (opts.failOnRisk && result.counts.risk > 0) return 2;
  return 0;
}

// `import.meta.main` is not available on every Node this should run on, so
// compare the resolved entry path instead. `fileURLToPath` rather than
// `new URL(...).pathname`: the raw pathname keeps percent-escapes, so a
// checkout under a directory with a space in its name would never match
// argv[1] -- and on Windows it carries an extra leading slash before the
// drive letter. Either way the CLI would exit 0 printing nothing at all,
// which for a gate is the worst possible way to fail.
const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  process.exitCode = await main(process.argv.slice(2));
}
