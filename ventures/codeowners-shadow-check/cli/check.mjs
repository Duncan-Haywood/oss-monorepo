#!/usr/bin/env node
// Zero-dependency CLI: finds your repo's CODEOWNERS file (the three
// locations GitHub itself checks, in the same order) and the repo's
// tracked file list (via `git ls-files`), then prints one JSON object
// ready to paste into index.html's report viewer. Nothing here talks to
// any network -- it only reads files already on this machine.
//
//   node cli/check.mjs                    # auto-detect, print JSON
//   node cli/check.mjs path/to/CODEOWNERS # use this file instead
//   node cli/check.mjs --paths files.txt  # use this newline list instead of git ls-files

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const CANDIDATE_LOCATIONS = ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS'];

export function findCodeownersPath(explicit) {
  if (explicit) {
    if (!existsSync(explicit)) throw new Error(`no such file: ${explicit}`);
    return explicit;
  }
  for (const candidate of CANDIDATE_LOCATIONS) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `no CODEOWNERS file found at ${CANDIDATE_LOCATIONS.join(', ')} -- pass a path explicitly: node cli/check.mjs <path>`,
  );
}

function gitTrackedPaths() {
  try {
    const out = execFileSync('git', ['ls-files'], { encoding: 'utf8' });
    return out.split('\n').filter((p) => p.length > 0);
  } catch (err) {
    throw new Error(
      `could not run "git ls-files" (${err.message}). Not a git repository, or git is not installed -- ` +
        'pass your own file list with --paths <file>, one path per line.',
    );
  }
}

export function parseArgs(argv) {
  const args = { codeownersPath: null, pathsFile: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--paths') {
      args.pathsFile = argv[++i];
    } else if (!args.codeownersPath) {
      args.codeownersPath = argv[i];
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const codeownersPath = findCodeownersPath(args.codeownersPath);
  const codeowners = readFileSync(codeownersPath, 'utf8');
  const paths = args.pathsFile
    ? readFileSync(args.pathsFile, 'utf8').split('\n').filter((p) => p.trim().length > 0)
    : gitTrackedPaths();
  const payload = { codeownersPath, codeowners, paths };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

// Only run as a CLI when executed directly -- importing this module (the
// test file does) must not shell out to git or touch the filesystem.
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`codeowners-shadow-check: ${err.message}\n`);
    process.exitCode = 1;
  }
}
