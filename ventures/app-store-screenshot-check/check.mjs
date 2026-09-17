#!/usr/bin/env node
// CLI: check a directory (or a list of files) of store-listing images against
// a store's published requirements, and exit non-zero when something would
// block the upload.
//
// Node 18+, no dependencies, no network. It reads the header bytes of the
// files you name and nothing else -- it never opens a socket, never sends an
// image anywhere, and never writes to the files it reads.
//
//   node check.mjs ./fastlane/screenshots/en-US
//   node check.mjs --store play ./play/listing
//   node check.mjs --store ios icon.png shot1.png shot2.png
//   node check.mjs ./screenshots --json
//
// Options:
//   --store ios|play   which store's requirements to check (default: ios)
//   --json             machine-readable report on stdout
//   --strict           exit 1 on notices too, not just danger findings
//
// Exit codes: 0 clean, 1 a finding would block the upload (or --strict and any
// finding at all), 2 the arguments or the files could not be used.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { classifyAssets, hasBlockingFinding, roleFromName } from './engine.mjs';
import { readImageInfo } from './image.mjs';
import { SPEC_REVIEWED, specFor } from './spec.mjs';

const IMAGE_EXT = /\.(png|jpe?g|heic|heif|webp|avif|gif|bmp|tiff?)$/i;

function collectFiles(paths) {
  const files = [];
  for (const p of paths) {
    let st;
    try {
      st = statSync(p);
    } catch {
      throw new Error(`cannot read "${p}": no such file or directory`);
    }
    if (st.isDirectory()) {
      // One level only. Store assets are conventionally flat per locale, and
      // recursing would sweep in an entire `fastlane/` tree of unrelated
      // metadata and report it as a mixed set.
      for (const entry of readdirSync(p).sort()) {
        const full = join(p, entry);
        try {
          if (statSync(full).isFile() && IMAGE_EXT.test(entry)) files.push(full);
        } catch {
          // A dangling symlink in an asset directory is not this tool's
          // problem, and refusing the whole run over one would be unhelpful.
        }
      }
    } else {
      files.push(p);
    }
  }
  return files;
}

function parseArgs(argv) {
  const opts = { store: 'ios', json: false, strict: false, paths: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') opts.json = true;
    else if (arg === '--strict') opts.strict = true;
    else if (arg === '--store') {
      opts.store = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--store=')) opts.store = arg.slice('--store='.length);
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg.startsWith('-')) throw new Error(`unknown option "${arg}"`);
    else opts.paths.push(arg);
  }
  return opts;
}

const USAGE = `app-store-screenshot-check — validate store listing images before you upload

  node check.mjs [--store ios|play] [--json] [--strict] <dir-or-file>...

Checks pixel dimensions, image format, app-icon transparency, and whether a
screenshot set agrees with itself. Reads header bytes only; no network, no
upload, nothing written.`;

export function run(argv, { log = console.log, error = console.error } = {}) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    error(e.message);
    return 2;
  }
  if (opts.help) {
    log(USAGE);
    return 0;
  }
  if (opts.paths.length === 0) {
    error('give at least one directory or image file to check. --help for usage.');
    return 2;
  }

  let spec;
  try {
    spec = specFor(opts.store);
  } catch (e) {
    error(e.message);
    return 2;
  }

  let files;
  try {
    files = collectFiles(opts.paths);
  } catch (e) {
    error(e.message);
    return 2;
  }
  if (files.length === 0) {
    error('no image files found in the paths given.');
    return 2;
  }

  const assets = files.map((file) => {
    let info;
    try {
      info = readImageInfo(new Uint8Array(readFileSync(file)));
    } catch (e) {
      info = { format: 'unknown', error: `could not be opened: ${e.message}` };
    }
    return { name: file, role: roleFromName(file), info };
  });

  const report = classifyAssets(assets, { store: opts.store });

  if (opts.json) {
    log(JSON.stringify({ ...report, specReviewed: SPEC_REVIEWED, assets }, null, 2));
  } else {
    log(`${report.storeLabel} — ${files.length} file(s) checked`);
    log('');
    for (const a of assets) {
      const shape = a.info.error ? `unreadable (${a.info.error})` : `${a.info.format.toUpperCase()} ${a.info.width}x${a.info.height}`;
      log(`  ${a.role.padEnd(16)} ${shape.padEnd(28)} ${a.name}`);
    }
    log('');
    if (report.findings.length === 0) {
      log('No issues found against the rules this tool checks.');
    } else {
      for (const f of report.findings) {
        log(`${f.severity.toUpperCase()}: ${f.title}`);
        log(`  ${f.detail}`);
        log('');
      }
    }
    log(`Checked against: ${spec.source}`);
    log(`Size tables in this tool were last reviewed ${SPEC_REVIEWED}; the store's own current`);
    log('documentation is authoritative. This tool is not affiliated with Apple or Google.');
  }

  if (hasBlockingFinding(report)) return 1;
  if (opts.strict && report.findings.length > 0) return 1;
  return 0;
}

// `process.argv[1]` is this file only when it was run directly, so importing it
// from a test does not execute the CLI.
if (process.argv[1] && process.argv[1].endsWith('check.mjs')) {
  process.exit(run(process.argv.slice(2)));
}
