import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { discoverGenerators, commandFor, REGENERATE_ALL } from './regen.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

test('discovery finds every generator in this directory, not a hardcoded list', async () => {
  const found = await discoverGenerators();

  // The two that exist today. Named explicitly because the failure this file
  // guards against is discovery silently matching *nothing* — a regex that
  // stops matching would otherwise turn `regen.mjs` into a no-op that reports
  // success, which is worse than the staleness it fixes.
  assert.ok(
    found.includes('front-door.mjs'),
    `discoverGenerators() missed front-door.mjs — got ${JSON.stringify(found)}`,
  );
  assert.ok(
    found.includes('front-door-tools.mjs'),
    `discoverGenerators() missed front-door-tools.mjs — got ${JSON.stringify(found)}`,
  );

  // And it must not be *only* those two if someone adds a third: walk the
  // directory independently and check nothing with a --write mode was skipped.
  const entries = await fs.readdir(HERE, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.mjs')) continue;
    if (entry.name.endsWith('.test.mjs') || entry.name === 'regen.mjs') continue;
    const source = await fs.readFile(path.join(HERE, entry.name), 'utf8');
    if (!source.includes('--write')) continue;
    assert.ok(
      found.includes(entry.name),
      `${entry.name} has a --write mode but regen.mjs would not run it. ` +
        `Either it follows a different CLI convention (fix WRITE_MODE in regen.mjs) ` +
        `or it is not a served-surface generator (say so in a comment).`,
    );
  }

  assert.deepEqual(found, [...found].sort(), 'generators must run in a reproducible order');
});

test('--check lists every discovered generator and writes nothing', async () => {
  const found = await discoverGenerators();
  const result = spawnSync(process.execPath, [path.join(HERE, 'regen.mjs'), '--check'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  for (const name of found) {
    assert.ok(
      result.stdout.includes(commandFor(name)),
      `--check did not mention ${name}:\n${result.stdout}`,
    );
  }
});

test('no staleness hint sends a session at a single generator', async () => {
  // This is the regression guard, and it is the whole point of regen.mjs.
  //
  // On 2026-09-05 three sessions in three minutes each shipped half a fix.
  // #3256 added a venture page and regenerated nothing; #3257 and #3258 each
  // hit the mirror tests, ran the one command those tests named
  // (`front-door-tools.mjs --write`), watched their own test go green, and
  // reported success. `main` was red on six tests afterwards and the apex's
  // sitemap was missing the page #3256 had added.
  //
  // Nobody was careless. Each session ran exactly the command it was handed.
  // A per-generator fix hint is what made a half-fix indistinguishable from a
  // whole one, so a staleness message must never name one generator again.
  const entries = await fs.readdir(HERE, { withFileTypes: true });
  const offenders = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.test.mjs')) continue;
    if (entry.name === path.basename(fileURLToPath(import.meta.url))) continue;
    const lines = (await fs.readFile(path.join(HERE, entry.name), 'utf8')).split('\n');
    lines.forEach((line, i) => {
      // Only assertion messages, so the prose above and in regen.mjs may
      // still name the individual generators when explaining the history.
      if (!/is stale|is missing from the commit|no longer rendered/.test(line)) return;
      const named = line.match(/node platform\/marketing\/([a-z-]+)\.mjs\s+--write/);
      if (named) offenders.push(`${entry.name}:${i + 1} names ${named[1]}.mjs alone`);
    });
  }

  assert.deepEqual(
    offenders,
    [],
    `A staleness hint must name \`${REGENERATE_ALL}\`, which runs every generator, ` +
      `not one of them:\n  ${offenders.join('\n  ')}`,
  );
});
