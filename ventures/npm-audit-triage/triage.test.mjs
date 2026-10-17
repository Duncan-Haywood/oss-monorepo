import test from 'node:test';
import assert from 'node:assert/strict';
import { packageOfSpecifier, extractImports, isTestPath, parseAudit, triage, summaryLine } from './triage.mjs';

const audit = {
  vulnerabilities: {
    lodash: { name: 'lodash', severity: 'high', isDirect: true, via: [{ source: 1, name: 'lodash', title: 'Prototype Pollution', url: 'https://example.test/1', severity: 'high', range: '<4.17.21' }], effects: [], fixAvailable: true },
    minimist: { name: 'minimist', severity: 'critical', isDirect: false, via: [{ source: 2, name: 'minimist', title: 'PP', url: 'u', severity: 'critical', range: '<1.2.6' }], effects: ['mkdirp'], fixAvailable: { name: 'mkdirp', version: '1.0.4', isSemVerMajor: true } },
    mkdirp: { name: 'mkdirp', severity: 'critical', isDirect: false, via: ['minimist'], effects: ['tooling-pkg'], fixAvailable: false },
    'tooling-pkg': { name: 'tooling-pkg', severity: 'high', isDirect: true, via: ['mkdirp'], effects: [], fixAvailable: false },
    jest: { name: 'jest', severity: 'high', isDirect: true, via: [{ title: 'x', severity: 'high' }], effects: [], fixAvailable: false },
    ghost: { name: 'ghost', severity: 'moderate', isDirect: false, via: [{ title: 'y', severity: 'moderate' }], effects: [], fixAvailable: false },
  },
};
const files = [
  { path: 'src/app.js', text: "import _ from 'lodash/fp';\n// const dead = require('ghost');\nconst x = require('@scope/pkg/sub');" },
  { path: 'src/cli.js', text: "const m = require('tooling-pkg');" },
  { path: 'test/app.test.js', text: "import { describe } from 'jest';" },
];

test('packageOfSpecifier handles scopes, subpaths, relatives and builtins', () => {
  assert.equal(packageOfSpecifier('lodash/fp'), 'lodash');
  assert.equal(packageOfSpecifier('@scope/pkg/sub'), '@scope/pkg');
  assert.equal(packageOfSpecifier('./local'), null);
  assert.equal(packageOfSpecifier('node:fs'), null);
  assert.equal(packageOfSpecifier('@scope'), null);
});

test('extractImports finds import, require, dynamic import and re-exports, ignores comments', () => {
  const s = extractImports("import a from 'a';\nimport 'b';\nimport {x} from \"c/d\";\nexport * from 'e';\nconst f = require('f');\nawait import('g');\n// require('h')\n/* import 'i' */");
  assert.deepEqual([...s].sort(), ['a', 'b', 'c', 'e', 'f', 'g']);
});

test('isTestPath separates tests and tooling configs from runtime code', () => {
  assert.ok(isTestPath('src/a.test.ts'));
  assert.ok(isTestPath('test/x.js'));
  assert.ok(isTestPath('webpack.config.js'));
  assert.ok(!isTestPath('src/app.js'));
});

test('parseAudit reads the npm 7+ shape and rejects junk', () => {
  const p = parseAudit(JSON.stringify(audit));
  assert.equal(p.entries.length, 6);
  assert.equal(p.entries.find((e) => e.name === 'lodash').fix, 'npm audit fix');
  assert.match(p.entries.find((e) => e.name === 'minimist').fix, /mkdirp@1\.0\.4 \(major\)/);
  assert.ok(parseAudit('not json').error);
  assert.ok(parseAudit('{"a":1}').error);
  assert.ok(parseAudit('{"error":{"summary":"boom"}}').error);
  assert.deepEqual(parseAudit('{"metadata":{"vulnerabilities":{}}}').entries, []);
});

test('parseAudit reads the npm 6 advisories shape and merges per package', () => {
  const v6 = { advisories: { 1: { module_name: 'a', severity: 'low', title: 't', vulnerable_versions: '<1', patched_versions: '>=1' }, 2: { module_name: 'a', severity: 'high', title: 'u', vulnerable_versions: '<2', patched_versions: '<0.0.0' } } };
  const p = parseAudit(v6);
  assert.equal(p.entries.length, 1);
  assert.equal(p.entries[0].severity, 'high');
  assert.equal(p.entries[0].advisories.length, 2);
});

test('triage buckets by reachability and ranks reachable criticals first', () => {
  const r = triage(audit, files);
  const b = Object.fromEntries(r.items.map((i) => [i.name, i.bucket]));
  assert.equal(b.lodash, 'imported');
  assert.equal(b['tooling-pkg'], 'imported');
  assert.equal(b.minimist, 'via-imported');
  assert.equal(b.mkdirp, 'via-imported');
  assert.equal(b.jest, 'test-only');
  assert.equal(b.ghost, 'not-referenced'); // only appears in a comment
  assert.equal(r.items[0].score >= r.items[r.items.length - 1].score, true);
  assert.equal(r.items.at(-1).name, 'ghost');
  assert.deepEqual(r.urgent.map((i) => i.name).sort(), ['lodash', 'minimist', 'mkdirp', 'tooling-pkg']);
  assert.match(summaryLine(r), /6 vulnerable package/);
});

test('a critical that nothing imports scores below a reachable high', () => {
  const r = triage({ vulnerabilities: { a: { name: 'a', severity: 'critical', via: [{ title: 't' }], effects: [] }, b: { name: 'b', severity: 'high', via: [{ title: 't' }], effects: [] } } }, [{ path: 'x.js', text: "require('b')" }]);
  assert.equal(r.items[0].name, 'b');
});

test('empty audit and error paths', () => {
  assert.equal(summaryLine(triage({ vulnerabilities: {} }, [])), 'npm audit found no vulnerabilities.');
  assert.ok(triage('nope', []).error);
});
