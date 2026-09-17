import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ARTIFACT_ROOT,
  commandFor,
  compareTrees,
  discoverGenerators,
  hashTree,
  REGENERATE_ALL,
} from './regen.mjs';

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

// --- `--verify` ------------------------------------------------------------
//
// The mode exists because the authoritative staleness answer cost 86 seconds
// and the fix costs 7, and CLAUDE.md records which side of that asymmetry a
// session picks: #5007, #5012 and #5020 each shipped a venture fix on
// 2026-09-17 and left the apex serving the pre-fix copy. These tests pin the
// two properties that make a 9-second answer worth trusting — it puts the tree
// back exactly, and it never reports "stale" when what it means is "I could
// not tell".

test('compareTrees names what changed, what appeared and what went away', () => {
  const before = new Map([
    ['kustomization.yaml', 'aaa'],
    ['a__index.html.gz', 'bbb'],
    ['gone__index.html.gz', 'ccc'],
  ]);
  const after = new Map([
    ['kustomization.yaml', 'zzz'],
    ['a__index.html.gz', 'bbb'],
    ['new__index.html.gz', 'ddd'],
  ]);

  const report = compareTrees(before, after);

  assert.deepEqual(report.changed, ['kustomization.yaml']);
  assert.deepEqual(report.added, ['new__index.html.gz']);
  assert.deepEqual(report.removed, ['gone__index.html.gz']);
  assert.equal(report.stale, 3);

  // The case that must read as green, because it is the answer on nearly every
  // run and a mode that cried stale would be turned off within a day.
  assert.equal(compareTrees(before, new Map(before)).stale, 0);
});

test('hashTree reads every file under a directory and nothing above it', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'regen-hashtree-'));
  await fs.mkdir(path.join(dir, 'shard'), { recursive: true });
  await fs.writeFile(path.join(dir, 'kustomization.yaml'), 'one');
  await fs.writeFile(path.join(dir, 'shard', 'a.html.gz'), 'two');
  await fs.writeFile(path.join(dir, 'shard', 'b.html.gz'), 'two');

  const tree = await hashTree(dir);

  assert.deepEqual([...tree.keys()].sort(), ['kustomization.yaml', 'shard/a.html.gz', 'shard/b.html.gz']);
  // Same bytes, same hash: that is what makes the mirror's byte-identical
  // duplicates (see dedupeMirror) compare as unchanged rather than as churn.
  assert.equal(tree.get('shard/a.html.gz'), tree.get('shard/b.html.gz'));
  assert.notEqual(tree.get('kustomization.yaml'), tree.get('shard/a.html.gz'));

  // A missing directory is empty, not a throw: `--verify` runs the generators
  // *after* snapshotting, so a root that does not exist yet is a first write
  // rather than an error.
  assert.equal((await hashTree(path.join(dir, 'absent'))).size, 0);

  await fs.rm(dir, { recursive: true, force: true });
});

test('every generator writes under ARTIFACT_ROOT, so --verify can put it back', async () => {
  // The guard ARTIFACT_ROOT's own comment promises. `--verify` snapshots one
  // coarse directory instead of a derived list of output paths; the cost of
  // that choice is that a generator writing somewhere else would be invisible
  // to the snapshot and unrestorable. This is where that becomes visible, by
  // name, rather than in a session's dirty working tree.
  const generators = await discoverGenerators();
  const offenders = [];

  for (const name of generators) {
    const module = await import(path.join(HERE, name));
    for (const [exported, value] of Object.entries(module)) {
      if (typeof value !== 'string') continue;
      if (!path.isAbsolute(value)) continue;
      // Inputs are exported the same way outputs are (VENTURES_DIR,
      // LAUNCHED_FILE), so the question asked is narrower and checkable:
      // anything this tree *deploys* has to be somewhere --verify looked.
      const rel = path.relative(REPO_ROOT, value);
      if (!rel.startsWith(`gitops${path.sep}`)) continue;
      if (value === ARTIFACT_ROOT) continue;
      if (!value.startsWith(`${ARTIFACT_ROOT}${path.sep}`)) {
        offenders.push(`${name} exports ${exported} = ${rel}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `These paths are under gitops/ but outside ARTIFACT_ROOT (${path.relative(REPO_ROOT, ARTIFACT_ROOT)}), ` +
      `so \`regen.mjs --verify\` would not snapshot them and could not restore them:\n  ` +
      `${offenders.join('\n  ')}\nWiden ARTIFACT_ROOT in regen.mjs to cover them.`,
  );
});

test('--verify answers in one of two ways and leaves the tree byte-identical', async () => {
  // Deliberately NOT asserting exit 0. Whether the committed surface is current
  // is `front-door-tools.test.mjs`'s and `front-door.test.mjs`'s question, and
  // duplicating it here would make this file go red for a stale commit rather
  // than for a bug in `--verify` — two different results wearing one costume,
  // which is the thing this whole area of the repo keeps paying for.
  //
  // What is asserted is the contract that makes the mode trustworthy: exit 2
  // is reserved for "could not answer", and the tree comes back as it was.
  const before = await hashTree(ARTIFACT_ROOT);

  const result = spawnSync(process.execPath, [path.join(HERE, 'regen.mjs'), '--verify'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  const output = `${result.stdout}${result.stderr}`;
  assert.notEqual(
    result.status,
    2,
    `--verify could not answer, which is a bug here rather than a stale commit:\n${output}`,
  );
  assert.ok(
    result.status === 0 || result.status === 1,
    `--verify exited ${result.status}, and only 0 (current) and 1 (stale) are answers:\n${output}`,
  );

  if (result.status === 1) {
    assert.ok(
      output.includes(REGENERATE_ALL),
      `a stale verdict must hand over the one command that fixes it:\n${output}`,
    );
  }

  const after = await hashTree(ARTIFACT_ROOT);
  assert.deepEqual(
    compareTrees(before, after),
    { changed: [], added: [], removed: [], stale: 0 },
    '--verify ran the generators and did not put the artifact root back. That is the ' +
      'promise that makes it safe to run mid-change; without it the mode is just ' +
      '`regen.mjs` with an exit code.',
  );
});
