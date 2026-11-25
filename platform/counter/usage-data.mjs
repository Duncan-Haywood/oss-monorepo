// Reads the daily usage files from the `usage-data` branch, where
// `.github/workflows/priv-site-usage-pull.yml` commits them (main's ruleset takes
// changes only through a PR, so the workflow cannot push to main).
//
//   node platform/counter/usage-data.mjs status        # what the branch holds, per file
//   node platform/counter/usage-data.mjs show <file>   # print one file, e.g. site-visits.json
//   node platform/counter/usage-data.mjs sync          # copy them into portfolio/usage/
//   node platform/counter/usage-data.mjs top [--days 14] [--n 20] [--tools] [--bots]
//                                                      # rank pages by page loads
//
// `sync` is how the data reaches main: run it, commit portfolio/usage/*.json
// in the PR you were opening anyway. The branch copy wins (it is written by
// the same merging pull scripts), except that visit days and feedback records
// already on main are merged in, so nothing on file is dropped.
// See portfolio/usage/README.md, "Where the daily pull lands".
//
// `top` answers "which pages do people load?" without hand-parsing the file
// (process critique, 2026-11-19: an explore run took three tries to rank human
// loads, because page keys sit beside prefixed breakdowns such as geo:, dev:
// and botpage:, and it read main's copy, which then stopped 16 days short of
// the branch's). It reads the branch copy merged with main's, falling back to
// main's alone with a warning when the branch cannot be fetched.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeDays } from './pull.mjs';
import { aggregate, pageKind, addDays } from './engagement-report.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
export const BRANCH = 'usage-data';
export const FILES = ['site-visits.json', 'site-feedback.json', 'github-traffic.json', 'cloudflare-analytics.json'];

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

export function fetchBranch() {
  try {
    // `+`: the workflow adds a commit a day, and a depth-1 fetch cannot see that
    // the new tip descends from the one already fetched, so without it git
    // rejects the update as non-fast-forward and every later run exits 1.
    git(['fetch', '-q', '--depth=1', 'origin', `+${BRANCH}:refs/remotes/origin/${BRANCH}`]);
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

/**
 * Pages ranked by loads over the `days` UTC days ending on the newest day in
 * `visits` (a site-visits.json `days` object). `bots` ranks crawler beacons
 * (botpage:) instead; `tools` keeps tool pages only. Returns the window, the
 * totals and the top `n` rows as [page, loads, days seen, kind].
 */
export function topPages(visits = {}, { days = 14, n = 20, tools = false, bots = false } = {}) {
  const all = Object.keys(visits).sort();
  if (!all.length) return { from: null, to: null, covered: 0, loads: 0, beacons: 0, rows: [] };
  const to = all.at(-1);
  const from = [addDays(to, 1 - days), all[0]].sort().at(-1);
  const window = all.filter((d) => d >= from && d <= to);
  const agg = aggregate(visits, window);
  const counts = bots ? agg.bot_pages : agg.pages;
  const seen = {};
  if (bots) for (const d of window) for (const k of Object.keys(visits[d] || {})) if (k.startsWith('botpage:')) seen[k.slice(8)] = (seen[k.slice(8)] || 0) + 1;
  const rows = Object.entries(counts)
    .filter(([k]) => !tools || pageKind(k) === 'tool')
    .map(([k, v]) => [k, v, (bots ? seen : agg.pageDays)[k] || 0, pageKind(k)])
    .sort((a, b) => b[1] - a[1] || b[2] - a[2] || (a[0] < b[0] ? -1 : 1));
  return { from, to, covered: window.length, loads: agg.loads, beacons: agg.botBeacons, pages: rows.length, rows: rows.slice(0, n) };
}

function topText(t, { days, bots, tools, source }) {
  if (!t.to) return `No visit days in ${source}.`;
  const what = bots ? 'crawler beacons (not page loads)' : `page loads${tools ? ' on tool pages' : ''} (not people; DNT/GPC browsers included from 2026-11-24)`;
  const lines = [
    `${source}: ${t.from}..${t.to}, ${t.covered} day(s) with a row in the last ${days}; ${t.loads} page loads, ${t.beacons} crawler beacons.`,
    `Top ${t.rows.length} of ${t.pages} pages by ${what}:`,
    '  loads  days  kind      page',
    ...t.rows.map(([k, v, d, kind]) => `  ${String(v).padStart(5)}  ${String(d).padStart(4)}  ${kind.padEnd(8)}  ${k}`),
  ];
  return lines.join('\n');
}

function topMain(args) {
  const opt = { days: 14, n: 20, tools: false, bots: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--tools') opt.tools = true;
    else if (a === '--bots') opt.bots = true;
    else if ((a === '--days' || a === '--n') && /^[1-9]\d*$/.test(args[i + 1] || '')) opt[a.slice(2)] = Number(args[++i]);
    else { console.error('usage: node platform/counter/usage-data.mjs top [--days N] [--n N] [--tools] [--bots]'); return 2; }
  }
  const local = readLocal('site-visits.json');
  let doc = local;
  let source = 'portfolio/usage/site-visits.json (main)';
  if (fetchBranch()) {
    const remote = readBranchFile('site-visits.json');
    if (remote) { doc = choose('site-visits.json', local, remote); source = `origin/${BRANCH} merged with main`; }
  } else if (local) {
    console.error(`warning: reading main's copy only (${describe(local)}); it can trail the branch by days`);
  }
  if (!doc) { console.error('no site-visits.json on the branch or in portfolio/usage/'); return 1; }
  console.log(topText(topPages(doc.days, opt), { ...opt, source }));
  return 0;
}

function readLocal(name) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'portfolio', 'usage', name), 'utf8')); } catch { return null; }
}

function main(argv) {
  const [cmd = 'status', arg] = argv;
  if (cmd === 'top') return topMain(argv.slice(1));
  if (!['status', 'show', 'sync'].includes(cmd)) {
    console.error('usage: node platform/counter/usage-data.mjs status | show <file> | sync | top [--days N] [--n N] [--tools] [--bots]');
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
