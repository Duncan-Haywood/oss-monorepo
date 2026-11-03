// Reads the daily usage files from the `usage-data` branch, where
// `.github/workflows/site-usage-pull.yml` commits them (main's ruleset takes
// changes only through a PR, so the workflow cannot push to main).
//
//   node platform/counter/usage-data.mjs status        # what the branch holds, per file
//   node platform/counter/usage-data.mjs show <file>   # print one file, e.g. site-visits.json
//   node platform/counter/usage-data.mjs sync          # copy them into portfolio/usage/
//
// `sync` is how the data reaches main: run it, commit portfolio/usage/*.json
// in the PR you were opening anyway. The branch copy wins (it is written by
// the same merging pull scripts), except that visit days and feedback records
// already on main are merged in, so nothing on file is dropped.
// See portfolio/usage/README.md, "Where the daily pull lands".

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeDays } from './pull.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
export const BRANCH = 'usage-data';
export const FILES = ['site-visits.json', 'site-feedback.json', 'github-traffic.json', 'cloudflare-analytics.json'];

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

export function fetchBranch() {
  try {
    git(['fetch', '-q', '--depth=1', 'origin', `${BRANCH}:refs/remotes/origin/${BRANCH}`]);
    return true;
  } catch (e) {
    console.error(`Could not fetch origin/${BRANCH}: ${String(e.stderr || e.message).trim()}`);
    return false;
  }
}

export function readBranchFile(name) {
  try { return JSON.parse(git(['show', `origin/${BRANCH}:${name}`])); } catch { return null; }
}

/**
 * Which copy to keep. The branch is written by the same merging pull scripts
 * and was seeded from main's files, so it wins; two files are merged anyway so
 * a session's hand-run pull on main is never lost: site-visits.json day by day
 * (larger count wins, as pull.mjs does) and site-feedback.json by record id.
 */
export function choose(name, local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  if (name === 'site-visits.json' && local.days && remote.days) {
    return { ...remote, days: mergeDays(local.days, remote.days) };
  }
  if (name === 'site-feedback.json' && Array.isArray(local.feedback) && Array.isArray(remote.feedback)) {
    const byId = new Map(local.feedback.map((r) => [r.id, r]));
    for (const r of remote.feedback) byId.set(r.id, r);
    const feedback = [...byId.values()].sort((x, y) => (x.id > y.id ? 1 : x.id < y.id ? -1 : 0));
    return { ...remote, feedback };
  }
  return remote;
}

/** One line on what a file covers, for `status`. */
export function describe(doc) {
  if (!doc) return 'absent';
  if (doc.days) { const d = Object.keys(doc.days).sort(); return d.length ? `${d.length} day(s), ${d[0]}..${d.at(-1)}` : '0 days'; }
  if (Array.isArray(doc.feedback)) return `${doc.feedback.length} message(s)`;
  if (doc.repos) return `${Object.keys(doc.repos).length} repo(s)`;
  if (doc.last_pull) return `last pull ${doc.last_pull.on}, ${doc.last_pull.errors?.length || 0} dataset error(s)`;
  return 'present';
}

function readLocal(name) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'portfolio', 'usage', name), 'utf8')); } catch { return null; }
}

function main(argv) {
  const [cmd = 'status', arg] = argv;
  if (!['status', 'show', 'sync'].includes(cmd)) {
    console.error('usage: node platform/counter/usage-data.mjs status | show <file> | sync');
    return 2;
  }
  if (!fetchBranch()) return 1;
  if (cmd === 'show') {
    if (!FILES.includes(arg)) { console.error(`show takes one of: ${FILES.join(', ')}`); return 2; }
    const doc = readBranchFile(arg);
    if (!doc) { console.error(`origin/${BRANCH} has no ${arg}`); return 1; }
    process.stdout.write(JSON.stringify(doc, null, 2) + '\n');
    return 0;
  }
  let changed = 0;
  for (const name of FILES) {
    const remote = readBranchFile(name);
    const local = readLocal(name);
    const line = `${name}: branch ${describe(remote)}; main ${describe(local)}`;
    if (cmd === 'status') { console.log(line); continue; }
    const out = choose(name, local, remote);
    if (!out || JSON.stringify(out) === JSON.stringify(local)) { console.log(`${line}: unchanged`); continue; }
    fs.writeFileSync(path.join(ROOT, 'portfolio', 'usage', name), JSON.stringify(out, null, 1) + '\n');
    changed += 1;
    console.log(`${line}: wrote portfolio/usage/${name}`);
  }
  if (cmd === 'sync') console.log(changed ? `${changed} file(s) updated; commit them in a PR.` : 'Nothing to copy.');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
