#!/usr/bin/env node
// One command before you merge a new venture: the repository-wide invariants
// that the venture's own tests cannot see (P001). It reuses the existing
// checks and adds no logic of its own:
//
//   1. launched.json: the slug has a date, and the file is in key order
//      (`launched.mjs`, the same refresh `--write` runs).
//   2. Build the Pages site and run `check.mjs` over it: page integrity,
//      inline-script parse, [hidden] CSS, links, disclaimers, feed dates.
//   3. `platform/marketing/regen.mjs --verify`: is the committed mirror stale?
//
//   node platform/pages/venture-preflight.mjs <slug> [--skip-build]
//
// Takes about five minutes (the build is most of it). Exit 0: clean for this
// slug. Exit 1: a problem names the slug, or the launch date / mirror is
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

  if (!argv.includes('--skip-build')) {
    console.log('2/3 build + check.mjs (about 5 minutes)');
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-'));
    try {
      const built = run(['platform/pages/build.mjs', `--out=${out}`]);
      if (built.status !== 0) {
        failures.push(`build.mjs failed:\n${(built.stderr || built.stdout).slice(-2000)}`);
      } else {
        const checked = run(['platform/pages/check.mjs', out]);
        if (checked.status !== 0) {
          const lines = (checked.stdout + checked.stderr).split('\n').filter((l) => /^\s+\S/.test(l));
          const mine = lines.filter((l) => l.includes(`${slug}/`) || l.includes(slug));
          const other = lines.filter((l) => !mine.includes(l));
          failures.push(...mine.map((l) => l.trim()));
          if (other.length) console.log(`   note: ${other.length} problem(s) on other slugs (not yours):\n${other.join('\n')}`);
          if (!lines.length) failures.push(`check.mjs failed:\n${(checked.stdout + checked.stderr).slice(-2000)}`);
        }
      }
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  } else {
    console.log('2/3 build + check.mjs skipped');
  }

  console.log('3/3 marketing mirror (regen.mjs --verify)');
  const verify = run(['platform/marketing/regen.mjs', '--verify']);
  if (verify.status === 1) failures.push('front-door mirror is stale: run `node platform/marketing/regen.mjs` and commit what it rewrites');
  else if (verify.status !== 0) failures.push(`regen.mjs --verify could not answer (exit ${verify.status})`);

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
