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
//
//   node platform/pages/venture-preflight.mjs <slug> [--skip-build]
//
// Takes about five minutes (the build is most of it); the cheap checks fail first, in seconds. Exit 0: clean for this
// slug. Exit 1: a problem names the slug, or the launch date / counts are
// wrong. Problems from other slugs are printed as notes and do not fail you.
// `--skip-build` runs steps 1 and 3 only (about 15 s).

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
  console.log('1b/3 hand-written counts (--check)');
  for (const check of COUNT_CHECKS) {
    const r = spawnSync('python3', [check.script, '--check'], { cwd: ROOT, encoding: 'utf8' });
    const problem = countProblem(check, r.status);
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
