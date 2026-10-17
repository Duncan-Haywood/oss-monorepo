import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseInput, rowFromRegistryResponse, summarizeReport, mapWithConcurrency, registryUrl,
} from './engine.mjs';

test('parseInput: lockfile v3 "packages" map yields exact versions, root and links skipped', () => {
  const lock = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "": { name: "my-app" },
      "node_modules/vite": { version: "8.3.1" },
      "node_modules/@scope/pkg": { version: "1.0.0" },
      "node_modules/nested/node_modules/@scope/pkg2": { version: "2.0.0" },
      "packages/workspace-a": { link: true, resolved: "packages/workspace-a" },
    },
  });
  const entries = parseInput(lock);
  assert.deepEqual(
    entries.sort((a, b) => a.name.localeCompare(b.name)),
    [
      { name: "@scope/pkg", version: "1.0.0" },
      { name: "@scope/pkg2", version: "2.0.0" },
      { name: "vite", version: "8.3.1" },
    ],
  );
});

test('parseInput: lockfile v1 "dependencies" map, including nested deps', () => {
  const lock = JSON.stringify({
    lockfileVersion: 1,
    dependencies: {
      "left-pad": { version: "1.3.0" },
      "wrapper": {
        version: "1.0.0",
        dependencies: { "inner-dep": { version: "0.9.0" } },
      },
    },
  });
  const entries = parseInput(lock).sort((a, b) => a.name.localeCompare(b.name));
  assert.deepEqual(entries, [
    { name: "inner-dep", version: "0.9.0" },
    { name: "left-pad", version: "1.3.0" },
    { name: "wrapper", version: "1.0.0" },
  ]);
});

test('parseInput: package.json dependencies are unpinned (version null)', () => {
  const pkg = JSON.stringify({
    name: "my-app",
    dependencies: { vite: "^8.0.0", "@scope/pkg": "1.x" },
    devDependencies: { eslint: "*" },
  });
  const entries = parseInput(pkg).sort((a, b) => a.name.localeCompare(b.name));
  assert.deepEqual(entries, [
    { name: "@scope/pkg", version: null },
    { name: "eslint", version: null },
    { name: "vite", version: null },
  ]);
});

test('parseInput: a lockfile entry wins over an unpinned mention of the same name', () => {
  // Not a realistic single input, but exercises addSeen's merge rule, which
  // both the freeform-list path and a lockfile-plus-dedup future path rely on.
  const entries = parseInput('vite\nvite@8.3.1\nvite');
  assert.deepEqual(entries, [{ name: "vite", version: "8.3.1" }]);
});

test('parseInput: freeform list, one per line, name or name@version, comments and bullets ignored', () => {
  const entries = parseInput(`
    # my deps
    - vite@8.3.1
    * eslint
    @scope/pkg@1.0.0
  `);
  assert.deepEqual(entries.sort((a, b) => a.name.localeCompare(b.name)), [
    { name: "@scope/pkg", version: "1.0.0" },
    { name: "eslint", version: null },
    { name: "vite", version: "8.3.1" },
  ]);
});

test('parseInput: empty input yields an empty list, not an error', () => {
  assert.deepEqual(parseInput(''), []);
  assert.deepEqual(parseInput('   \n  '), []);
});

test('parseInput: freeform list with no recognisable name throws', () => {
  assert.throws(() => parseInput('!!! not a package name'), /couldn't find a package name/i);
});

test('parseInput: JSON that is neither a lockfile nor a package.json throws', () => {
  assert.throws(() => parseInput('{"hello":"world"}'), /not a package-lock\.json/i);
});

test('rowFromRegistryResponse: provenance present', () => {
  const row = rowFromRegistryResponse({ name: 'vite', version: '8.3.1' }, {
    httpStatus: 200,
    body: {
      version: '8.3.1',
      dist: { attestations: { url: 'https://registry.npmjs.org/-/npm/v1/attestations/vite@8.3.1', provenance: { predicateType: 'https://slsa.dev/provenance/v1' } } },
    },
  });
  assert.equal(row.status, 'ok');
  assert.equal(row.hasProvenance, true);
  assert.equal(row.attestationUrl, 'https://registry.npmjs.org/-/npm/v1/attestations/vite@8.3.1');
});

test('rowFromRegistryResponse: no attestations field at all means no provenance', () => {
  const row = rowFromRegistryResponse({ name: 'eslint', version: '10.11.0' }, {
    httpStatus: 200,
    body: { version: '10.11.0', dist: { shasum: 'x' } },
  });
  assert.equal(row.status, 'ok');
  assert.equal(row.hasProvenance, false);
  assert.equal(row.attestationUrl, null);
});

test('rowFromRegistryResponse: 404 is reported as not-found, not a generic error', () => {
  const row = rowFromRegistryResponse({ name: 'left-pad-but-typo-xyz', version: '1.0.0' }, { httpStatus: 404, body: null });
  assert.equal(row.status, 'not-found');
  assert.match(row.detail, /not found/i);
});

test('rowFromRegistryResponse: a thrown fetch error is reported as an error row, not a crash', () => {
  const row = rowFromRegistryResponse({ name: 'vite', version: null }, { error: new Error('network down') });
  assert.equal(row.status, 'error');
  assert.match(row.detail, /network down/);
});

test('summarizeReport counts each status bucket exactly once per row', () => {
  const rows = [
    rowFromRegistryResponse({ name: 'a', version: '1' }, { httpStatus: 200, body: { version: '1', dist: { attestations: { provenance: {} } } } }),
    rowFromRegistryResponse({ name: 'b', version: '1' }, { httpStatus: 200, body: { version: '1', dist: {} } }),
    rowFromRegistryResponse({ name: 'c', version: '1' }, { httpStatus: 404, body: null }),
    rowFromRegistryResponse({ name: 'd', version: '1' }, { error: new Error('boom') }),
  ];
  assert.deepEqual(summarizeReport(rows), { total: 4, withProvenance: 1, withoutProvenance: 1, notFound: 1, errors: 1 });
});

test('mapWithConcurrency runs every item exactly once and preserves order', async () => {
  const seenConcurrent = { current: 0, max: 0 };
  const items = Array.from({ length: 12 }, (_, i) => i);
  const results = await mapWithConcurrency(items, 3, async (i) => {
    seenConcurrent.current += 1;
    seenConcurrent.max = Math.max(seenConcurrent.max, seenConcurrent.current);
    await new Promise((r) => setTimeout(r, 1));
    seenConcurrent.current -= 1;
    return i * 2;
  });
  assert.deepEqual(results, items.map((i) => i * 2));
  assert.ok(seenConcurrent.max <= 3, `expected at most 3 concurrent, saw ${seenConcurrent.max}`);
});

test('mapWithConcurrency with fewer items than the concurrency cap still runs them all', async () => {
  const results = await mapWithConcurrency([1, 2], 5, async (i) => i);
  assert.deepEqual(results, [1, 2]);
});

test('registryUrl builds the exact-version doc URL, scoped and unscoped', () => {
  assert.equal(registryUrl('vite', '8.3.1'), 'https://registry.npmjs.org/vite/8.3.1');
  assert.equal(registryUrl('@scope/pkg', '1.0.0'), 'https://registry.npmjs.org/%40scope/pkg/1.0.0');
  assert.equal(registryUrl('eslint', null), 'https://registry.npmjs.org/eslint/latest');
});
