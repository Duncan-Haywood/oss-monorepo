import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, summaryLine, overridesHint } from './dupes.mjs';

const lock = (packages) => JSON.stringify({ lockfileVersion: 3, packages: { '': { name: 'demo' }, ...packages } });

test('a package at one version is not a duplicate', () => {
  const r = analyze(lock({ 'node_modules/a': { version: '1.0.0' }, 'node_modules/b': { version: '2.0.0' } }));
  assert.equal(r.duplicates.length, 0);
  assert.equal(r.total, 2);
  assert.match(summaryLine(r), /No duplicated packages in 2/);
});

test('nested copy at a different version is found with its parent', () => {
  const r = analyze(lock({
    'node_modules/ms': { version: '2.1.3' },
    'node_modules/debug': { version: '4.3.4' },
    'node_modules/debug/node_modules/ms': { version: '2.0.0' },
  }));
  assert.equal(r.duplicates.length, 1);
  const d = r.duplicates[0];
  assert.equal(d.name, 'ms');
  assert.deepEqual(d.versions, ['2.0.0', '2.1.3']);
  assert.equal(d.kind, 'same-major');
  assert.deepEqual(d.byVersion['2.0.0'], ['debug']);
  assert.deepEqual(d.byVersion['2.1.3'], ['(root)']);
  assert.equal(r.extraCopies, 1);
});

test('different majors are cross-major and sorted after same-major', () => {
  const r = analyze(lock({
    'node_modules/x': { version: '1.0.0' },
    'node_modules/p/node_modules/x': { version: '2.0.0' },
    'node_modules/p': { version: '1.0.0' },
    'node_modules/y': { version: '3.1.0' },
    'node_modules/q/node_modules/y': { version: '3.2.0' },
    'node_modules/q': { version: '1.0.0' },
  }));
  assert.deepEqual(r.duplicates.map((d) => [d.name, d.kind]), [['y', 'same-major'], ['x', 'cross-major']]);
  assert.deepEqual(r.counts, { 'same-major': 1, 'cross-major': 1 });
});

test('scoped packages keep their scope in the name', () => {
  const r = analyze(lock({
    'node_modules/@s/pkg': { version: '1.0.0' },
    'node_modules/z/node_modules/@s/pkg': { version: '1.1.0' },
    'node_modules/z': { version: '1.0.0' },
  }));
  assert.equal(r.duplicates[0].name, '@s/pkg');
  assert.deepEqual(r.duplicates[0].byVersion['1.1.0'], ['z']);
});

test('same version installed twice is not a version duplicate', () => {
  const r = analyze(lock({
    'node_modules/a': { version: '1.0.0' },
    'node_modules/b/node_modules/a': { version: '1.0.0' },
    'node_modules/b': { version: '1.0.0' },
  }));
  assert.equal(r.duplicates.length, 0);
});

test('includeDev false skips dev copies; ignore skips named packages; links are skipped', () => {
  const p = {
    'node_modules/a': { version: '1.0.0' },
    'node_modules/b/node_modules/a': { version: '1.1.0', dev: true },
    'node_modules/b': { version: '1.0.0', dev: true },
    'node_modules/ws': { resolved: 'x', link: true },
  };
  assert.equal(analyze(lock(p)).duplicates.length, 1);
  assert.equal(analyze(lock(p), { includeDev: false }).duplicates.length, 0);
  assert.equal(analyze(lock(p), { ignore: ['a'] }).duplicates.length, 0);
});

test('lockfileVersion 1 nested dependencies are flattened', () => {
  const r = analyze(JSON.stringify({ lockfileVersion: 1, dependencies: {
    a: { version: '1.0.0' },
    b: { version: '1.0.0', dependencies: { a: { version: '2.0.0' } } },
  } }));
  assert.equal(r.duplicates.length, 1);
  assert.equal(r.duplicates[0].kind, 'cross-major');
  assert.deepEqual(r.duplicates[0].byVersion['2.0.0'], ['b']);
});

test('bad input returns an error instead of throwing', () => {
  assert.match(analyze('nope').error, /not valid JSON/);
  assert.match(analyze('{}').error, /no "packages"/);
  assert.match(analyze('[]').error, /no "packages"|not a lockfile/);
});

test('overrides hint pins the highest version', () => {
  assert.equal(overridesHint({ name: 'x', versions: ['1.0.0', '2.0.0'] }), '"overrides": { "x": "2.0.0" }');
});

test('versions sort numerically, so 10 is newer than 2', () => {
  const r = analyze(lock({
    'node_modules/a': { version: '10.0.0' },
    'node_modules/b/node_modules/a': { version: '2.0.0' },
    'node_modules/b': { version: '1.0.0' },
  }));
  assert.deepEqual(r.duplicates[0].versions, ['2.0.0', '10.0.0']);
});
