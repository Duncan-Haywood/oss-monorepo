#!/usr/bin/env node
// sql-migration-lock-check -- will this migration lock the table and take the
// application down?
//
// Zero dependencies, Node's standard library only, and no network or database
// access of any kind: it reads the .sql you point it at and nothing else. That
// is what makes it safe to run against the migration you are about to apply to
// production -- it has no connection string, so there is nothing to point at
// the wrong database.

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { analyzeSources, summaryLine, CHECKS } from './engine.mjs';

const SQL_EXT = new Set(['.sql']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', '.terraform', 'dist', 'build']);

const USAGE = `sql-migration-lock-check — will this migration lock the table and take the app down?

Usage:
  node check.mjs [path ...]        check these files, or scan these directories
  node check.mjs                   scan the current directory

Options:
  --format text|json   output format (default: text)
  --fail-on-risk       exit 2 when any statement can block the table
  --list-checks        print every check this tool runs, then exit
  -h, --help           this message

Exit codes:
  0  no findings, or findings but --fail-on-risk was not given
  1  a path could not be read, or an argument was invalid
  2  --fail-on-risk was given and at least one risk-level finding was found

Reads .sql text only. Makes no network calls and needs no database connection.`;

async function collectFiles(target) {
  const info = await stat(target);
  // Anything that is not a directory is read as one input, so
  // `pg_dump --schema-only | node check.mjs /dev/stdin` works: a FIFO is not
  // a regular file, and an `isFile()` test here would fall through to readdir
  // and exit 1 with ENOTDIR without ever reading the migration.
  if (!info.isDirectory()) return [target];
  const out = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        await walk(path.join(dir, entry.name));
      } else if (SQL_EXT.has(path.extname(entry.name).toLowerCase())) {
        out.push(path.join(dir, entry.name));
      }
    }
  };
  await walk(target);
  // Sorted so a migrations directory is reported in filename order, which for
  // every common naming scheme is also apply order.
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
  const withFindings = result.files.filter((f) => f.counts.risk || f.counts.warn);
  if (result.files.length > 1) {
    lines.push(`Read ${result.files.length} file(s); ${withFindings.length} with findings.`);
  }
  let currentFile = null;
  for (const f of result.findings) {
    lines.push('');
    if (f.file !== currentFile) {
      currentFile = f.file;
      lines.push(`${currentFile}`);
    }
    // The heading and the quoted SQL are wrapped too, not just the prose.
    // Several check titles run past 100 characters on their own, and a
    // statement is quoted up to 160 -- so leaving either unwrapped puts a line
    // in a CI log that the reader has to scroll sideways to finish, which in
    // practice means the finding does not get read. Caught by this venture's
    // own `renderText wraps prose so a CI log stays readable` test.
    lines.push(hang(`${BULLET[f.severity]} [${f.severity}] line ${f.line}: ${f.title}`, 4));
    lines.push(`    sql:   ${wrap(f.statement, 11)}`);
    lines.push(`    why:   ${wrap(f.impact, 11)}`);
    lines.push(`    fix:   ${wrap(f.fix, 11)}`);
  }
  if (result.verdict === 'clean') {
    lines.push('');
    lines.push('Note: a clean result means these specific checks found nothing. It is not a');
    lines.push('guarantee that the migration is safe — see --list-checks for exactly what was');
    lines.push('asked, and remember that no static check can see your table sizes or your');
    lines.push('traffic.');
  }
  return lines.join('\n');
}

/**
 * Wrap an already-prefixed line to 88 columns, hanging continuations by
 * `indent`. Unlike `wrap`, the first line's own length is counted, because
 * here the prefix is part of the string rather than written separately.
 */
function hang(text, indent) {
  const pad = ' '.repeat(indent);
  const out = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    const limit = out.length === 0 ? 88 : 88 - indent;
    if (line && line.length + 1 + word.length > limit) {
      out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(line);
  return out.map((l, i) => (i === 0 ? l : pad + l)).join('\n');
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
    try {
      sources.push({ name: file, text: await readFile(file, 'utf8') });
    } catch (err) {
      io.error(`cannot read ${file}: ${err.message}`);
      return 1;
    }
  }
  const result = analyzeSources(sources);

  if (opts.format === 'json') {
    io.log(JSON.stringify({ ...result, filesChecked: files.length }, null, 2));
  } else {
    if (files.length === 0) {
      io.log('No .sql files found.');
      return 0;
    }
    io.log(renderText(result));
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
