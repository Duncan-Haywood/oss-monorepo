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
//      note. New-venture runs met all three only in CI (run records
//      2026-11-11 explore #14822, 2026-11-12 explore #14962).
//   4. The site's own tests, the same `node --test "*.test.mjs"
//      "cloudflare/*.test.mjs"` glob CI's "Test the site builder" step runs,
//      minus the two files that build the whole site (SITE_BUILD_TESTS, about
//      five minutes and more each). The rest are source scans of every
//      venture page (FAQ markup shown on the page, heading order, schema,
//      post rules): 1,249 tests in about 35 s on 4 cores. A preflight that
//      passed while CI failed faq-visible.test.mjs on the new page cost a
//      ventures run a CI round (run record, 2026-11-12).
//
//   node platform/pages/venture-preflight.mjs <slug> [--skip-build]
//
// Takes about six minutes (the build is most of it); the cheap checks fail first, in seconds. Exit 0: clean for this
// slug. Exit 1: a problem names the slug, the launch date / counts are
// wrong, or a site test fails (CI runs the same tests on the PR, so a red
// one fails it whoever caused it; the message says whether it names the slug).
// Problems check.mjs finds on other slugs are printed as notes and do not fail you.
// `--skip-build` runs steps 1, 3 and 4 only (under a minute).

import { spawnSync } from 'node:child_process';
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

function changedPosts() {
  const git = (args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  let diff = git(['diff', '--name-only', '--diff-filter=AM', 'origin/main', '--', 'docs/posts']);
  if (diff.status !== 0) diff = git(['diff', '--name-only', '--diff-filter=AM', 'HEAD', '--', 'docs/posts']);
  const untracked = git(['ls-files', '--others', '--exclude-standard', '--', 'docs/posts']);
  return changedPostPaths(diff.stdout, untracked.stdout).filter((p) => fs.existsSync(path.join(ROOT, p)));
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
export function placementProblems(slug, { categoryFor, subcategoryFor }) {
  const category = categoryFor(slug);
  const sub = subcategoryFor(slug);
  const failures = [];
  const notes = [];
  if (sub && /-other$/.test(sub.id)) {
    failures.push(`${slug} lands in the ${sub.id} catch-all sub-group, which build.test.mjs fails: add a keyword for it to SUBCATEGORY_RULES.${category.id} in platform/pages/build.mjs`);
  }
  if (category.id === 'more') {
    notes.push(`${slug} lands in the catch-all "${category.title}" section; if a named section fits, add a keyword to CATEGORY_RULES in platform/pages/build.mjs`);
  }
  return { category: category.id, subcategory: sub?.id ?? null, failures, notes };
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
  const failures = [];

  console.log('1/3 launched.json');
  failures.push(...(await launchedProblems(slug)));

  // The count checks take seconds and the build takes minutes, so answer
  // them first and stop early.
  console.log('1b/3 hand-written counts (--check), inherited keys, section placement, changed posts\' front matter');
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
    const placed = placementProblems(slug, site);
    console.log(`   filed under ${placed.category}${placed.subcategory ? ` / ${placed.subcategory}` : ''}`);
    for (const note of placed.notes) console.log(`   note: ${note}`);
    failures.push(...placed.failures);
  }
  const posts = changedPosts();
  if (posts.length) {
    const r = spawnSync('python3', ['platform/ci/check_post_frontmatter.py', ...posts], { cwd: ROOT, encoding: 'utf8' });
    const problem = postProblem(r.status, (r.stdout || '') + (r.stderr || ''));
    if (problem) failures.push(problem);
  }
  if (!failures.length) {
    console.log(`1c/3 site tests (${siteTestFiles().length} files, CI's glob minus ${SITE_BUILD_TESTS.join(', ')}; about 35 s)`);
    const r = spawnSync('node', ['--test', '--test-reporter=tap', ...siteTestFiles()], {
      cwd: path.join(ROOT, 'platform', 'pages'), encoding: 'utf8', maxBuffer: 1 << 28,
    });
    const problem = siteTestProblem(r, slug);
    if (problem) failures.push(problem);
  }
  if (failures.length) {
    console.log(`\nPREFLIGHT FAILED for ${slug} (stopped before the build; fix, then rerun):`);
    for (const f of failures) console.log(`  - ${f}`);
    return 1;
  }

  if (!argv.includes('--skip-build')) {
    console.log('2/3 build + check.mjs (about 5 minutes)');
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-'));
    try {
      const built = run(['platform/pages/build.mjs', `--out=${out}`]);
      const buildFailure = buildProblem(built);
      if (buildFailure) {
        failures.push(buildFailure);
      } else {
        const checked = run(['platform/pages/check.mjs', out]);
        if (checked.status !== 0) {
          const { failures: mine, other } = checkProblems(checked, slug);
          failures.push(...mine);
          if (other.length) console.log(`   note: ${other.length} problem(s) on other slugs (not yours):\n${other.join('\n')}`);
        }
      }
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
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
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
}
