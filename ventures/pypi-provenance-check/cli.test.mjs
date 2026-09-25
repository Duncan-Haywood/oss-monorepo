import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { run } from './cli.mjs';

const REQUIREMENTS = `has-provenance==1.0.0\nno-provenance==2.0.0\n`;

// packages: { name: { version, provenance: bool } | 'error' }
function fakeFetch(packages) {
  return async (url) => {
    const metaMatch = /\/pypi\/([^/]+)\/([^/]+)\/json$/.exec(url);
    if (metaMatch) {
      const [, name, version] = metaMatch;
      const entry = packages[name];
      if (entry === 'error') throw new Error('simulated network failure');
      if (!entry) return { ok: false, status: 404, json: async () => ({}) };
      return {
        ok: true, status: 200,
        json: async () => ({ info: { version }, urls: [{ filename: `${name}-${version}.whl`, packagetype: 'bdist_wheel' }] }),
      };
    }
    const provMatch = /\/integrity\/([^/]+)\/([^/]+)\/[^/]+\/provenance$/.exec(url);
    if (provMatch) {
      const [, name] = provMatch;
      const entry = packages[name];
      if (entry && entry.provenance) {
        return { status: 200, json: async () => ({ attestation_bundles: [{ publisher: { kind: 'GitHub', repository: `org/${name}` } }] }) };
      }
      return { status: 404, json: async () => ({ message: 'No provenance available' }) };
    }
    throw new Error(`unhandled URL in fake fetch: ${url}`);
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
  const { exitCode, output } = await run(['does-not-exist.txt']);
  assert.equal(exitCode, 2);
  assert.match(output, /Error:/);
});

test('run: reports provenance and no-provenance packages from a requirements.txt', async () => {
  const fetchImpl = fakeFetch({
    'has-provenance': { version: '1.0.0', provenance: true },
    'no-provenance': { version: '2.0.0', provenance: false },
  });
  const { exitCode, output } = await run(['requirements.txt'], { readFile: async () => REQUIREMENTS, fetchImpl });
  assert.equal(exitCode, 0);
  assert.match(output, /1 of 2 package\(s\) have a provenance attestation\./);
  assert.match(output, /PROVENANCE\s+has-provenance==1\.0\.0/);
  assert.match(output, /none\s+no-provenance==2\.0\.0/);
});

test('run: --json emits a machine-readable summary and rows', async () => {
  const fetchImpl = fakeFetch({
    'has-provenance': { version: '1.0.0', provenance: true },
    'no-provenance': { version: '2.0.0', provenance: false },
  });
  const { exitCode, output } = await run(['requirements.txt', '--json'], { readFile: async () => REQUIREMENTS, fetchImpl });
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(output);
  assert.equal(parsed.summary.total, 2);
  assert.equal(parsed.summary.withProvenance, 1);
  assert.equal(parsed.rows.length, 2);
});

test('run: --without-provenance-only filters the rows but not the summary', async () => {
  const fetchImpl = fakeFetch({
    'has-provenance': { version: '1.0.0', provenance: true },
    'no-provenance': { version: '2.0.0', provenance: false },
  });
  const { output } = await run(['requirements.txt', '--json', '--without-provenance-only'], { readFile: async () => REQUIREMENTS, fetchImpl });
  const parsed = JSON.parse(output);
  assert.equal(parsed.summary.total, 2, 'summary still counts everything checked');
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].name, 'no-provenance');
});

test('run: a network failure on one package is reported as an error row, not a crash', async () => {
  const fetchImpl = fakeFetch({ 'has-provenance': 'error', 'no-provenance': { version: '2.0.0', provenance: false } });
  const { exitCode, output } = await run(['requirements.txt', '--json'], { readFile: async () => REQUIREMENTS, fetchImpl });
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(output);
  assert.equal(parsed.summary.errors, 1);
});

test('run: reads a freeform list from stdin when given "-"', async () => {
  const fetchImpl = fakeFetch({ pip: { version: '26.2.1', provenance: true } });
  const stdin = Readable.from(['pip==26.2.1\n']);
  const { exitCode, output } = await run(['-', '--json'], { stdin, fetchImpl });
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(output);
  assert.equal(parsed.summary.total, 1);
  assert.equal(parsed.summary.withProvenance, 1);
});

test('run: a file with no packages in it exits 2', async () => {
  const { exitCode, output } = await run(['empty.txt'], { readFile: async () => '   ' });
  assert.equal(exitCode, 2);
  assert.match(output, /no packages found/i);
});

test('run: package not found is reported, not crashed on', async () => {
  const fetchImpl = fakeFetch({});
  const { exitCode, output } = await run(['requirements.txt', '--json'], {
    readFile: async () => 'totally-fake-package-xyz==1.0.0\n',
    fetchImpl,
  });
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(output);
  assert.equal(parsed.summary.notFound, 1);
});
