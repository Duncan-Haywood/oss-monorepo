import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { collectWorkflowFiles, main } from './cli.mjs';

/** Run `main` with stdout/stderr captured. */
async function run(argv) {
  const chunks = { out: '', err: '' };
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (s) => ((chunks.out += s), true);
  process.stderr.write = (s) => ((chunks.err += s), true);
  try {
    const code = await main(argv);
    return { code, ...chunks };
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
}

async function fixtureDir(files) {
  const dir = await mkdtemp(path.join(tmpdir(), 'ame-'));
  for (const [name, body] of Object.entries(files)) {
    await writeFile(path.join(dir, name), body);
  }
  return dir;
}

const SIMPLE = `name: CI
on:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: npm test
`;

test('prints usage and exits 2 with no arguments', async () => {
  const { code, out } = await run([]);
  assert.equal(code, 2);
  assert.match(out, /Usage:/);
});

test('--help exits 0', async () => {
  const { code, out } = await run(['--help']);
  assert.equal(code, 0);
  assert.match(out, /--max-allowance-percent/);
});

test('rejects an unknown plan rather than silently using a default', async () => {
  const dir = await fixtureDir({ 'ci.yml': SIMPLE });
  const { code, err } = await run(['--plan', 'platinum', dir]);
  assert.equal(code, 2);
  assert.match(err, /unknown plan/);
});

test('estimates a directory of workflows', async () => {
  const dir = await fixtureDir({ 'ci.yml': SIMPLE });
  const { code, out } = await run(['--plan', 'team', '--minutes-per-job', '5', '--pushes', '100', dir]);
  assert.equal(code, 0);
  assert.match(out, /projected monthly cost/);
  assert.match(out, /Included minutes used\s+500 of 3,000/);
  assert.match(out, /Assumptions/);
});

test('collects only YAML files from a directory', async () => {
  const dir = await fixtureDir({ 'ci.yml': SIMPLE, 'b.yaml': SIMPLE, 'README.md': '# no' });
  const files = await collectWorkflowFiles([dir]);
  assert.equal(files.length, 2);
  assert.ok(files.every((f) => /\.ya?ml$/.test(f)));
});

test('names a file it could not read instead of dropping it silently', async () => {
  // A workflow that vanishes from the total makes the bill look smaller, which
  // is the one direction a cost tool must never be wrong in.
  const dir = await fixtureDir({ 'ci.yml': SIMPLE, 'notes.yml': 'just: some notes\n' });
  const { code, out } = await run([dir]);
  assert.equal(code, 0);
  assert.match(out, /Skipped/);
  assert.match(out, /notes\.yml/);
});

test('exits 2 when nothing in the paths is a workflow', async () => {
  const dir = await fixtureDir({ 'notes.yml': 'just: some notes\n' });
  const { code, err } = await run([dir]);
  assert.equal(code, 2);
  assert.match(err, /None of the given files could be read as a workflow/);
  assert.match(err, /notes\.yml/, 'the reason for each rejected file must be named');
});

test('--json emits parseable output carrying the totals and findings', async () => {
  const dir = await fixtureDir({ 'ci.yml': SIMPLE });
  const { code, out } = await run(['--json', dir]);
  assert.equal(code, 0);
  const parsed = JSON.parse(out);
  assert.ok(Number.isFinite(parsed.totals.includedMinutes));
  assert.ok(Array.isArray(parsed.findings));
  assert.ok(Array.isArray(parsed.skipped));
});

test('--max-allowance-percent fails the build when projected usage is over', async () => {
  // This is the form meant for CI: the only moment anyone finds out before the
  // allowance is gone rather than after.
  const dir = await fixtureDir({ 'ci.yml': SIMPLE });
  const over = await run([
    '--plan', 'free', '--minutes-per-job', '10', '--pushes', '300',
    '--max-allowance-percent', '80', dir,
  ]);
  assert.equal(over.code, 1);
  assert.match(over.err, /over the 80% budget/);

  const under = await run([
    '--plan', 'free', '--minutes-per-job', '1', '--pushes', '10',
    '--max-allowance-percent', '80', dir,
  ]);
  assert.equal(under.code, 0);
});

test('--path-filter-share changes the projection for a filtered workflow', async () => {
  const filtered = `name: CI
on:
  push:
    paths:
      - "src/**"
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: npm test
`;
  const dir = await fixtureDir({ 'ci.yml': filtered });
  const quarter = await run(['--json', '--pushes', '100', '--minutes-per-job', '1', '--path-filter-share', '0.25', dir]);
  const all = await run(['--json', '--pushes', '100', '--minutes-per-job', '1', '--path-filter-share', '1', dir]);
  assert.equal(JSON.parse(quarter.out).totals.includedMinutes, 25);
  assert.equal(JSON.parse(all.out).totals.includedMinutes, 100);
});

test('reports this repository\'s own workflows without crashing', async () => {
  const { code, out } = await run([
    new URL('../../.github/workflows', import.meta.url).pathname,
  ]);
  assert.equal(code, 0);
  assert.match(out, /projected monthly cost/);
});
