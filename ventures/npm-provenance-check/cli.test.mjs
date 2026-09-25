import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { run } from './cli.mjs';

const LOCKFILE = JSON.stringify({
  lockfileVersion: 3,
  packages: {
    "": { name: "example-app" },
    "node_modules/has-provenance": { version: "1.0.0" },
    "node_modules/no-provenance": { version: "2.0.0" },
  },
});

function fakeFetch(responses) {
  return async (url) => {
    const hit = Object.entries(responses).find(([name]) => url.includes(encodeURIComponent(name).replace(/%40/g, '@')) || url.includes(name));
    if (!hit) return { ok: false, status: 404, json: async () => ({}) };
    const [, entry] = hit;
    if (entry === 'error') throw new Error('simulated network failure');
    return { ok: true, status: 200, json: async () => entry };
  };
}

test('run: prints usage and exits 1 with no arguments', async () => {
  const { exitCode, output } = await run([]);
  assert.equal(exitCode, 1);
  assert.match(output, /Usage:/);
});

test('run: --help exits 0', async () => {
  const { exitCode, output } = await run(['--help']);
  assert.equal(exitCode, 0);
  assert.match(output, /Usage:/);
});

test('run: missing file exits 2 with a readable error', async () => {
  const { exitCode, output } = await run(['does-not-exist.json']);
  assert.equal(exitCode, 2);
  assert.match(output, /Error:/);
});

test('run: reports provenance and no-provenance packages from a lockfile', async () => {
  const fetchImpl = fakeFetch({
    'has-provenance': { version: '1.0.0', dist: { attestations: { url: 'https://x/1', provenance: {} } } },
    'no-provenance': { version: '2.0.0', dist: {} },
  });
  const { exitCode, output } = await run(['lock.json'], {
    readFile: async () => LOCKFILE,
    fetchImpl,
  });
  assert.equal(exitCode, 0);
  assert.match(output, /1 of 2 package\(s\) have a provenance attestation\./);
  assert.match(output, /PROVENANCE\s+has-provenance@1\.0\.0/);
  assert.match(output, /none\s+no-provenance@2\.0\.0/);
});

test('run: --json emits a machine-readable summary and rows', async () => {
  const fetchImpl = fakeFetch({
    'has-provenance': { version: '1.0.0', dist: { attestations: { url: 'https://x/1', provenance: {} } } },
    'no-provenance': { version: '2.0.0', dist: {} },
  });
  const { exitCode, output } = await run(['lock.json', '--json'], {
    readFile: async () => LOCKFILE,
    fetchImpl,
  });
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(output);
  assert.equal(parsed.summary.total, 2);
  assert.equal(parsed.summary.withProvenance, 1);
  assert.equal(parsed.rows.length, 2);
});

test('run: --without-provenance-only filters the rows but not the summary', async () => {
  const fetchImpl = fakeFetch({
    'has-provenance': { version: '1.0.0', dist: { attestations: { url: 'https://x/1', provenance: {} } } },
    'no-provenance': { version: '2.0.0', dist: {} },
  });
  const { output } = await run(['lock.json', '--json', '--without-provenance-only'], {
    readFile: async () => LOCKFILE,
    fetchImpl,
  });
  const parsed = JSON.parse(output);
  assert.equal(parsed.summary.total, 2, 'summary still counts everything checked');
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].name, 'no-provenance');
});

test('run: a network failure on one package is reported as an error row, not a crash', async () => {
  const fetchImpl = fakeFetch({ 'has-provenance': 'error', 'no-provenance': { version: '2.0.0', dist: {} } });
  const { exitCode, output } = await run(['lock.json', '--json'], {
    readFile: async () => LOCKFILE,
    fetchImpl,
  });
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(output);
  assert.equal(parsed.summary.errors, 1);
});

test('run: reads a freeform list from stdin when given "-"', async () => {
  const fetchImpl = fakeFetch({ vite: { version: '8.3.1', dist: { attestations: { url: 'https://x/1', provenance: {} } } } });
  const stdin = Readable.from(['vite@8.3.1\n']);
  const { exitCode, output } = await run(['-', '--json'], { stdin, fetchImpl });
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(output);
  assert.equal(parsed.summary.total, 1);
  assert.equal(parsed.summary.withProvenance, 1);
});

test('run: a file with no packages in it exits 2', async () => {
  const { exitCode, output } = await run(['empty.json'], { readFile: async () => '   ' });
  assert.equal(exitCode, 2);
  assert.match(output, /no packages found/i);
});
