#!/usr/bin/env node
// One command before you merge a new venture: the repository-wide invariants
// that the venture's own tests cannot see (P001). It reuses the existing
// checks and adds no logic of its own:
//
//   1. launched.json: the slug has a date, and the file is in key order
//      (`launched.mjs`, the same refresh `--write` runs).
//   2. Build the Pages site and run `check.mjs` over it: page integrity,
//      inline-script parse, [hidden] CSS, links, disclaimers, feed dates.
//   3. The hand-written counts a new venture or workflow moves
//      (`sync_tree_counts.py`, `publish_surface.py`, each with `--check`),
//      run right after step 1 so they fail in seconds, not minutes. Three CI
//      rounds on one venture came from these (publish-kit NEXT.md, 2026-10-21).
//      The apex-mirror check that used to sit here left with `gitops/` on
//      2026-10-30.
//      Also the front matter of the posts this branch adds or edits
//      (`check_post_frontmatter.py` on just those files): runs kept learning
//      the 160-character description and 70-character seo_title limits from
//      the build five minutes in (three run records on 2026-11-12 alone).
//      Also `inherited_keys.py <slug>` (a lookup of user input in an
//      object map without an own-key check; ventures-tests fails on a new
//      one) and where build.mjs files the slug: a trade tool that no
//      SUBCATEGORY_RULES keyword claims fails build.test.mjs, which this
//      preflight skips, and a slug in the catch-all section is printed as a
//      note, or fails when it would take that section past build.mjs's
//      CATCH_ALL_MAX (build.test.mjs fails there; #17406 met it in CI). New-venture runs met all three only in CI (run records
//      2026-11-11 explore #14822, 2026-11-12 explore #14962).
//      Also `portfolio/router/validate.py` (3 s) when the branch edits
//      portfolio/flagships.yaml or a VENTURE.yaml: a flagship `next:` over its
//      2000-character cap failed CI for runs that appended to it (three run
//      records on 2026-11-13).
//      Also every argument-free platform/ci/check_*.py, through
//      `main_health.py --checks-only` (about 45 s on 4 cores; its platform/ci
//      unit tests too when the branch edits platform/ci): the elevator-traffic run
//      (#15700, 2026-11-14) passed this preflight and then failed CI on
//      check_step_grid.py and check_doc_counts.py, two of the ~60 tree checks
//      CI runs that the steps above did not.
//   4. The site's own tests, the same `node --test "*.test.mjs"
//      "cloudflare/*.test.mjs"` glob CI's "Test the site builder" step runs,
//      minus the two files that build the whole site (SITE_BUILD_TESTS, about
//      five minutes and more each). The rest are source scans of every
//      venture page (FAQ markup shown on the page, heading order, schema,
//      post rules): 1,249 tests in about 35 s on 4 cores. A preflight that
//      passed while CI failed faq-visible.test.mjs on the new page cost a
//      ventures run a CI round (run record, 2026-11-12). Also
//      platform/privacy/*.test.mjs (112 tests, about 5 s), which CI's validate
//      job runs over every venture's source (share-location.test.mjs failed
//      #15700 in CI only).
//
//   Also, in step 1b, the git-ignored untracked files under ventures/<slug>
//   that the local build would publish (copyTree's rules), printed as a note:
//   CI's fresh checkout has none of them, so a check.mjs failure on one is
//   local only and is demoted to a note in step 2. A fetched eval set inside
//   the venture (changepoint-detector's utsa-data/, a .ppt in it) failed a
//   preflight that CI would have passed (run record, 2026-11-15). Ignore rules
//   in the root .gitignore that name a ventures/ path are build outputs CI
//   makes too (einvoice-preflight/browser/), so they are not counted.
//
//   node platform/pages/venture-preflight.mjs <slug> [--skip-build] [--fail-fast]
//
// One pass reports every stage. The build starts in the background at once
// (its output goes to files, so the synchronous steps never block it) and
// steps 1, 1b and 1c run beside it; their problems print as soon as they are
// known, so you can fix them while the build finishes. Before 2026-11-21 any
// step-1 problem stopped the run before the site tests and the build, and a
// branch with problems in three stages took three ~6-minute runs to see them
// all (run records 2026-11-13, 11-17, 11-18, 11-21). `--fail-fast` keeps
// that old order: the build starts only when the quick checks pass.
//
// Takes about six and a half minutes (the build is most of it). Exit 0: clean for this
// slug. Exit 1: a problem names the slug, the launch date / counts are
// wrong, or a site test fails (CI runs the same tests on the PR, so a red
// one fails it whoever caused it; the message says whether it names the slug).
// Problems check.mjs finds on other slugs are printed as notes and do not fail you.
// `--skip-build` runs steps 1, 3 and 4 only (98 s on an idle 4-core container, 2026-11-18).

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAUNCHED_FILE, loadLaunchDates, refreshLaunchDates } from './launched.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function run(args) {
  return spawnSync('node', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
}

export async function launchedProblems(slug, file = LAUNCHED_FILE) {
  const problems = [];
  const existing = await loadLaunchDates(file);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(existing[slug] ?? '')) {
    problems.push(`${slug} has no launch date in launched.json: run \`node platform/pages/launched.mjs --write\``);
  }
  const keys = Object.keys(existing);
  const sorted = Object.keys((await refreshLaunchDates([], { existing })).launched);
  if (keys.join('\n') !== sorted.join('\n')) {
    problems.push('launched.json keys are out of order: run `node platform/pages/launched.mjs --write`');
  }
  return problems;
}

/** The cheap `--check` scripts, each with the command that fixes its drift. */
export const COUNT_CHECKS = [
  { script: 'platform/ci/sync_tree_counts.py', fix: 'python3 platform/ci/sync_tree_counts.py' },
  { script: 'platform/ci/publish_surface.py', fix: 'python3 platform/ci/publish_surface.py --write' },
];

/** Posts this branch adds or edits: `git diff --name-only` against origin/main
 * (HEAD when that ref is missing) plus untracked files, as newline-separated text. */
export function changedPostPaths(...outputs) {
  const seen = new Set();
  for (const out of outputs) {
    for (const line of (out || '').split('\n')) {
      const p = line.trim();
      if (/^docs\/posts\/[^/]+\.md$/.test(p)) seen.add(p);
    }
  }
  return [...seen].sort();
}

/** Paths under `pathspecs` this branch adds or edits (`filter`: git's --diff-filter), as diff + untracked text. */
function changedText(...pathspecs) {
  return changedTextFiltered('AM', ...pathspecs);
}

function changedTextFiltered(filter, ...pathspecs) {
  const git = (args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  // --merge-base: from where the branch left main, not main's tip. Once
  // origin/main moves on, a plain `diff origin/main` lists main's own new files
  // as this branch's: on an untouched branch it named 30 platform/ci files, so
  // treeCheckArgs ran all 174 unit-test files anyway (2026-11-18). A shallow
  // clone often has no merge base: then the tip diff (over-inclusive, so only
  // slower), then HEAD.
  let diff = git(['diff', '--name-only', `--diff-filter=${filter}`, '--merge-base', 'origin/main', '--', ...pathspecs]);
  if (diff.status !== 0) diff = git(['diff', '--name-only', `--diff-filter=${filter}`, 'origin/main', '--', ...pathspecs]);
  if (diff.status !== 0) diff = git(['diff', '--name-only', `--diff-filter=${filter}`, 'HEAD', '--', ...pathspecs]);
  const untracked = git(['ls-files', '--others', '--exclude-standard', '--', ...pathspecs]);
  return [diff.stdout, untracked.stdout];
}

function changedPosts() {
  return changedPostPaths(...changedText('docs/posts')).filter((p) => fs.existsSync(path.join(ROOT, p)));
}

/** Whether the diff text names portfolio/flagships.yaml or a ventures/<slug>/VENTURE.yaml. */
export function touchesRouterInputs(...outputs) {
  return outputs.some((out) => (out || '').split('\n').some((line) =>
    /^(portfolio\/flagships\.yaml|ventures\/[^/]+\/VENTURE\.yaml)$/.test(line.trim())));
}

/**
 * main_health.py's arguments for this branch. Its 174 platform/ci/test_*.py
 * files test the platform/ci modules, and CI runs each only when a PR touches
 * that module (their workflows' path filters), so a venture branch that leaves
 * platform/ci alone gets `--checks-only`: the 98 tree checks, the part that
 * reads ventures/. Measured 2026-11-18 on an idle 4-core container: 43 s with
 * the flag against several minutes without it, which made `--skip-build`
 * ("about a minute") take about 5 (run record 2026-11-18T09:20).
 */
export function treeCheckArgs(...outputs) {
  const touches = outputs.some((out) => (out || '').split('\n').some((line) => line.trim().startsWith('platform/ci/')));
  return touches ? [] : ['--checks-only'];
}

/** null when validate.py passed; else its output. */
export function routerProblem(status, output) {
  if (status === 0) return null;
  return `portfolio/router/validate.py (flagships.yaml / VENTURE.yaml):\n${output.trim().split('\n').map((l) => `      ${l}`).join('\n')}`;
}

export function postProblem(status, output) {
  if (status === 0) return null;
  return `post front matter (check_post_frontmatter.py):\n${output.trim().split('\n').map((l) => `      ${l}`).join('\n')}`;
}

/** null when inherited_keys.py passed on the slug; else its output and the fix. */
export function inheritedKeysProblem(status, output) {
  if (status === 0) return null;
  const body = output.trim().split('\n').map((l) => `      ${l}`).join('\n');
  return `inherited_keys.py (use \`Object.hasOwn(MAP, key) ? MAP[key] : fallback\`; ventures-tests fails on a new hit):\n${body}`;
}

/**
 * Where build.mjs files the slug. `categoryFor` / `subcategoryFor` are passed
 * in (build.mjs's own) so the preflight cannot drift from the site. A trade
 * tool in the trades catch-all sub-group fails build.test.mjs ("every
 * published trade tool lands in a named sub-group"); a slug in the site-wide
 * catch-all is allowed, so it is only a note.
 */
export function placementProblems(slug, { categoryFor, subcategoryFor, CATCH_ALL_MAX }, catchAll = null) {
  const category = categoryFor(slug);
  const sub = subcategoryFor(slug);
  const failures = [];
  const notes = [];
  if (sub && /-other$/.test(sub.id)) {
    failures.push(`${slug} lands in the ${sub.id} catch-all sub-group, which build.test.mjs fails: add a keyword for it to SUBCATEGORY_RULES.${category.id} in platform/pages/build.mjs`);
  }
  if (category.id === 'more') {
    // `catchAll`: the slugs discoverSurfaces files there now. build.test.mjs
    // ('the catch-all holds only what no section claims') fails past
    // CATCH_ALL_MAX, and this preflight skips build.test.mjs, so a note let
    // csp-policy-check through as the sixth tool and cost #17406 a CI round.
    const members = new Set([...(catchAll || []), slug]);
    if (catchAll && CATCH_ALL_MAX !== undefined && members.size > CATCH_ALL_MAX) {
      failures.push(`${slug} lands in the catch-all "${category.title}" section, which would then hold ${members.size} tools `
        + `(build.test.mjs fails past ${CATCH_ALL_MAX}; now: ${[...members].filter((s) => s !== slug).join(', ')}): `
        + 'add a keyword for it to a named section in CATEGORY_RULES in platform/pages/build.mjs');
    } else {
      notes.push(`${slug} lands in the catch-all "${category.title}" section; if a named section fits, add a keyword to CATEGORY_RULES in platform/pages/build.mjs`);
    }
  }
  return { category: category.id, subcategory: sub?.id ?? null, failures, notes };
}

/**
 * Git-ignored, untracked paths under ventures/<slug> the local build would
 * publish. `checkIgnoreOutput` is `git check-ignore -v --no-index --stdin`
 * over `git ls-files --others --ignored --exclude-standard --directory`:
 * lines `source:line:pattern<TAB>path`, a directory path ending in `/`.
 * Paths whose rule is a root .gitignore line naming `ventures/` are CI build
 * outputs and are dropped; so are paths copyTree skips (`copiesDir`,
 * `isPublishable`). `listDir(dir)` expands an ignored directory to its files
 * (repo-relative); the return is the sorted repo-relative files.
 */
export function localOnlyFiles(checkIgnoreOutput, slug, { copiesDir, isPublishable, listDir }) {
  const base = `ventures/${slug}/`;
  const files = new Set();
  const publishes = (rel, isDir) => {
    const parts = rel.slice(base.length).split('/').filter(Boolean);
    const dirs = isDir ? parts : parts.slice(0, -1);
    if (!dirs.every(copiesDir)) return false;
    return isDir || isPublishable(parts[parts.length - 1]);
  };
  for (const line of (checkIgnoreOutput || '').split('\n')) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const rule = line.slice(0, tab);
    const rel = line.slice(tab + 1).trim();
    if (!rel.startsWith(base)) continue;
    const [source, , ...pattern] = rule.split(':');
    if (source === '.gitignore' && pattern.join(':').includes('ventures/')) continue;
    const isDir = rel.endsWith('/');
    if (!publishes(rel, isDir)) continue;
    if (!isDir) { files.add(rel); continue; }
    for (const f of listDir(rel)) if (publishes(f, false)) files.add(f);
  }
  return [...files].sort();
}

/**
 * One line naming where the local-only files sit, by their first two
 * directory levels below the venture, with a count each (most first, at most
 * `limit`), so a fetched corpus of hundreds of files reads as one entry.
 * Listing the files buried the preflight's real result (three run records,
 * 2026-11-19: 834 eval/IDS files from the venture's own fetch script).
 */
export function localOnlySummary(localFiles, slug, limit = 5) {
  const base = `ventures/${slug}/`;
  const counts = new Map();
  for (const f of localFiles) {
    const parts = f.slice(base.length).split('/');
    const dirs = parts.slice(0, -1).slice(0, 2);
    const key = dirs.length ? `${dirs.join('/')}/` : parts[0];
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const rows = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const shown = rows.slice(0, limit).map(([k, n]) => `${k} (${n})`);
  if (rows.length > limit) shown.push(`+${rows.length - limit} more`);
  return `Where: ${shown.join(', ')}.`;
}

/** Recursively list a repo-relative directory's files, repo-relative, skipping what copyTree skips. */
function listRepoDir(rel, copiesDir) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const child = `${dir.replace(/\/$/, '')}/${e.name}`;
      if (e.isDirectory()) { if (copiesDir(e.name)) walk(child); } else if (e.isFile()) out.push(child);
    }
  };
  walk(rel);
  return out;
}

function gitLocalOnlyFiles(slug, site) {
  const git = (args, input) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', input, maxBuffer: 1 << 26 });
  const listed = git(['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '--', `ventures/${slug}`]);
  if (listed.status !== 0 || !listed.stdout.trim()) return [];
  const rules = git(['check-ignore', '-v', '--no-index', '--stdin'], listed.stdout);
  return localOnlyFiles(rules.stdout, slug, { ...site, listDir: (rel) => listRepoDir(rel, site.copiesDir) });
}

/**
 * Split this slug's check.mjs failures into real ones and ones on a local-only
 * file. A failure line starts with the published path `<slug>/<rest>`; it is
 * local only when `<rest>` is a local-only file's path below ventures/<slug>
 * (or below a subdirectory the venture publishes from).
 */
export function splitLocalOnly(failures, slug, localFiles) {
  const tails = localFiles.map((f) => f.slice(`ventures/${slug}/`.length));
  const local = [];
  const real = [];
  for (const f of failures) {
    const m = f.match(new RegExp(`^${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^:\\s]+)`));
    const rest = m?.[1];
    if (rest && tails.some((t) => t === rest || t.endsWith(`/${rest}`))) local.push(f); else real.push(f);
  }
  return { real, local };
}

export function countProblem({ script, fix }, status) {
  if (status === 0) return null;
  return `${script} --check exited ${status}: run \`${fix}\` and commit the result`;
}

export function buildProblem(built) {
  if (built.status === 0) return null;
  return `build.mjs failed:\n${(built.stderr || built.stdout).slice(-2000)}`;
}

// Split check.mjs output into problems that name this slug (whole path
// segment, so `tax` does not claim `tax-calc/`) and problems on other slugs.
export function checkProblems(checked, slug) {
  const output = checked.stdout + checked.stderr;
  const lines = output.split('\n').filter((l) => /^\s+\S/.test(l));
  const named = new RegExp(`(^|[^A-Za-z0-9_-])${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_-])`);
  const mine = lines.filter((l) => named.test(l));
  const other = lines.filter((l) => !mine.includes(l));
  const failures = mine.map((l) => l.trim());
  if (!lines.length) failures.push(`check.mjs failed:\n${output.slice(-2000)}`);
  return { failures, other };
}

/**
 * null when main_health.py passed; else each red check's block (its
 * `FAIL|TIME <name> (exit n)` line and the output tail main_health prints under
 * it) and whether the slug is named, as for the site tests.
 */
export function treeCheckProblem(status, output, slug) {
  if (status === 0) return null;
  const lines = (output || '').split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^(FAIL|TIME)\s+\S+ \(exit -?\d+\)$/.test(lines[i])) continue;
    const block = [lines[i]];
    // A block runs to the next red header or the summary line; a check's own
    // output can hold blank lines (check_step_grid.py puts one after its count).
    for (let j = i + 1; j < lines.length && !/^(FAIL|TIME)\s+\S+ \(exit -?\d+\)$|^\d+\/\d+ checks pass\b/.test(lines[j]); j++) {
      if (lines[j].trim()) block.push(lines[j]);
    }
    blocks.push(block);
  }
  const named = new RegExp(`(^|[^A-Za-z0-9_-])${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_-])`).test(output);
  const who = named
    ? `the output names ${slug}`
    : `none of the output names ${slug}; if main fails the same way it is not yours, but CI will still be red`;
  const body = blocks.length
    ? blocks.map((b) => b.map((l) => `      ${l}`).join('\n')).join('\n')
    : (output || '').trim().split('\n').slice(-15).map((l) => `      ${l}`).join('\n');
  return `repository checks failed (platform/ci/main_health.py; ${who}); rerun one with \`python3 platform/ci/<name>\`:\n${body}`;
}

/** Site tests that build the whole site; the preflight's own build covers that ground. */
export const SITE_BUILD_TESTS = ['build.test.mjs', 'custom-domain.test.mjs'];

/** CI's site-test glob (`*.test.mjs`, `cloudflare/*.test.mjs` in platform/pages), minus SITE_BUILD_TESTS. */
export function siteTestFiles(dir = path.join(ROOT, 'platform', 'pages')) {
  const top = fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs') && !SITE_BUILD_TESTS.includes(f));
  const cf = path.join(dir, 'cloudflare');
  const nested = fs.existsSync(cf)
    ? fs.readdirSync(cf).filter((f) => f.endsWith('.test.mjs')).map((f) => `cloudflare/${f}`)
    : [];
  return [...top, ...nested].sort();
}

/** null when the site tests passed; else the failing tests (TAP `not ok` lines) and the rerun command. */
export function siteTestProblem(r, slug) {
  if (r.status === 0) return null;
  const output = (r.stdout || '') + (r.stderr || '');
  const failing = [...new Set(output.split('\n')
    .map((l) => l.match(/^\s*not ok \d+ - (.+)$/)?.[1]?.trim())
    .filter(Boolean))];
  const named = new RegExp(`(^|[^A-Za-z0-9_-])${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_-])`).test(output);
  // TAP puts each failure's `location: '<path>/x.test.mjs:12:1'` in its YAML block.
  const files = [...new Set([...output.matchAll(/location: '[^']*?((?:cloudflare\/)?[\w.-]+\.test\.mjs):\d+/g)].map((m) => m[1]))];
  const who = named
    ? `the output names ${slug}`
    : `none of the output names ${slug}; if main fails the same way it is not yours, but CI will still be red`;
  const list = failing.length
    ? failing.slice(0, 15).map((t) => `      not ok: ${t}`).join('\n')
    : output.slice(-1500).split('\n').map((l) => `      ${l}`).join('\n');
  const rerun = `cd platform/pages && node --test ${files.length ? files.join(' ') : '<file>'}`;
  return `site tests failed (${who}); rerun with \`${rerun}\`:\n${list}`;
}

/**
 * Start build.mjs into `out` without waiting. stdout and stderr go to files,
 * not pipes: the steps that run meanwhile use spawnSync, which blocks the
 * event loop, and a build writing into a full pipe nobody drains would stall.
 * `done` resolves to the same { status, stdout, stderr } shape spawnSync gives.
 */
export function startBuild(out, args = ['platform/pages/build.mjs', `--out=${out}`]) {
  const logs = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-log-'));
  const files = { stdout: path.join(logs, 'stdout'), stderr: path.join(logs, 'stderr') };
  const fds = { stdout: fs.openSync(files.stdout, 'w'), stderr: fs.openSync(files.stderr, 'w') };
  const child = spawn('node', args, { cwd: ROOT, stdio: ['ignore', fds.stdout, fds.stderr] });
  fs.closeSync(fds.stdout);
  fs.closeSync(fds.stderr);
  const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
  const done = new Promise((resolve) => {
    const finish = (status, error) => {
      const r = { status, stdout: read(files.stdout), stderr: read(files.stderr) + (error ? `\n${error.message}` : '') };
      fs.rmSync(logs, { recursive: true, force: true });
      resolve(r);
    };
    child.on('error', (e) => finish(1, e));
    child.on('exit', (code, signal) => finish(code ?? (signal ? 1 : 0)));
  });
  return { child, done };
}

async function main(argv) {
  const slug = argv.find((a) => !a.startsWith('--'));
  if (!slug) {
    console.error('usage: node platform/pages/venture-preflight.mjs <slug> [--skip-build]');
    return 2;
  }
  if (!fs.existsSync(path.join(ROOT, 'ventures', slug))) {
    console.error(`no ventures/${slug}`);
    return 2;
  }
  const skipBuild = argv.includes('--skip-build');
  const failFast = argv.includes('--fail-fast');
  const failures = [];
  let localFiles = [];
  const out = skipBuild ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-'));
  let build = null;
  if (!skipBuild && !failFast) {
    build = startBuild(out);
    console.log('2/3 build started in the background (about 5 minutes); steps 1 to 1c run beside it');
  }
  try {

  console.log('1/3 launched.json');
  failures.push(...(await launchedProblems(slug)));

  // The count checks take seconds and the build takes minutes, so answer
  // them first and stop early.
  console.log('1b/3 hand-written counts (--check), inherited keys, section placement, changed posts\' front matter, repository checks, router inputs');
  for (const check of COUNT_CHECKS) {
    const r = spawnSync('python3', [check.script, '--check'], { cwd: ROOT, encoding: 'utf8' });
    const problem = countProblem(check, r.status);
    if (problem) failures.push(problem);
  }
  {
    const r = spawnSync('python3', ['platform/ci/inherited_keys.py', slug], { cwd: ROOT, encoding: 'utf8' });
    const problem = inheritedKeysProblem(r.status, (r.stdout || '') + (r.stderr || ''));
    if (problem) failures.push(problem);
    const site = await import('./build.mjs');
    const surfaces = await site.discoverSurfaces(path.join(ROOT, 'ventures'));
    const catchAll = site.groupByCategory(surfaces).find((g) => g.category.id === 'more')?.items.map((s) => s.slug) ?? [];
    const placed = placementProblems(slug, site, catchAll);
    console.log(`   filed under ${placed.category}${placed.subcategory ? ` / ${placed.subcategory}` : ''}`);
    for (const note of placed.notes) console.log(`   note: ${note}`);
    failures.push(...placed.failures);
    localFiles = gitLocalOnlyFiles(slug, site);
    if (localFiles.length) {
      console.log(`   note (no action needed): ${localFiles.length} git-ignored file(s) under ventures/${slug}, `
        + `such as fetched eval data, that this local build publishes and CI's checkout lacks; check.mjs problems on them are not counted. `
        + localOnlySummary(localFiles, slug));
    }
  }
  const posts = changedPosts();
  if (posts.length) {
    const r = spawnSync('python3', ['platform/ci/check_post_frontmatter.py', ...posts], { cwd: ROOT, encoding: 'utf8' });
    const problem = postProblem(r.status, (r.stdout || '') + (r.stderr || ''));
    if (problem) failures.push(problem);
  }
  {
    const extra = treeCheckArgs(...changedTextFiltered('ACDMR', 'platform/ci'));
    console.log(extra.length
      ? '   repository checks (platform/ci/main_health.py --checks-only, about 45 s; this branch leaves platform/ci alone)'
      : '   repository checks (platform/ci/main_health.py with its platform/ci unit tests, since this branch edits platform/ci; a few minutes)');
    const r = spawnSync('python3', ['platform/ci/main_health.py', ...extra], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
    const problem = treeCheckProblem(r.status, (r.stdout || '') + (r.stderr || ''), slug);
    if (problem) failures.push(problem);
  }
  if (touchesRouterInputs(...changedText('portfolio/flagships.yaml', 'ventures/*/VENTURE.yaml'))) {
    const r = spawnSync('python3', ['portfolio/router/validate.py'], { cwd: ROOT, encoding: 'utf8' });
    const problem = routerProblem(r.status, (r.stdout || '') + (r.stderr || ''));
    if (problem) failures.push(problem);
  }
  if (!failures.length || !failFast) {
    console.log(`1c/3 site tests (${siteTestFiles().length} files, CI's glob minus ${SITE_BUILD_TESTS.join(', ')}; about 35 s)`);
    const r = spawnSync('node', ['--test', '--test-reporter=tap', ...siteTestFiles()], {
      cwd: path.join(ROOT, 'platform', 'pages'), encoding: 'utf8', maxBuffer: 1 << 28,
    });
    const problem = siteTestProblem(r, slug);
    if (problem) failures.push(problem);
    console.log('   privacy tests (platform/privacy/*.test.mjs, about 5 s)');
    const privacy = fs.readdirSync(path.join(ROOT, 'platform', 'privacy'))
      .filter((f) => f.endsWith('.test.mjs')).sort().map((f) => `platform/privacy/${f}`);
    const pr = spawnSync('node', ['--test', '--test-reporter=tap', ...privacy], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
    const privacyProblem = siteTestProblem(pr, slug);
    if (privacyProblem) failures.push(privacyProblem.replace('site tests failed', 'privacy tests failed').replace('cd platform/pages && ', 'cd platform/privacy && '));
  }
  if (failures.length && !build) {
    console.log(`\nPREFLIGHT FAILED for ${slug} (stopped before the build${skipBuild ? ', which --skip-build leaves out' : ' (--fail-fast)'}; fix, then rerun):`);
    for (const f of failures) console.log(`  - ${f}`);
    return 1;
  }
  if (failures.length) {
    console.log(`\n${failures.length} problem(s) from steps 1 to 1c, listed again at the end; fix them while the build finishes:`);
    for (const f of failures) console.log(`  - ${f}`);
    console.log('');
  }

  if (!skipBuild) {
    if (!build) build = startBuild(out);
    console.log('2/3 build + check.mjs (waiting for the build)');
    {
      const built = await build.done;
      build = null;
      const buildFailure = buildProblem(built);
      if (buildFailure) {
        failures.push(buildFailure);
      } else {
        const checked = run(['platform/pages/check.mjs', out]);
        if (checked.status !== 0) {
          const { failures: mine, other } = checkProblems(checked, slug);
          const { real, local } = splitLocalOnly(mine, slug, localFiles);
          failures.push(...real);
          if (local.length) console.log(`   note: ${local.length} problem(s) on git-ignored local files CI never sees (not counted):\n${local.map((l) => `      ${l}`).join('\n')}`);
          if (other.length) console.log(`   note: ${other.length} problem(s) on other slugs (not yours):\n${other.join('\n')}`);
        }
      }
    }
  } else {
    console.log('2/3 build + check.mjs skipped');
  }

  if (failures.length) {
    console.log(`\nPREFLIGHT FAILED for ${slug}:`);
    for (const f of failures) console.log(`  - ${f}`);
    return 1;
  }
  console.log(`\npreflight clean for ${slug}`);
  return 0;
  } finally {
    if (build) build.child.kill();
    if (out) fs.rmSync(out, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}
