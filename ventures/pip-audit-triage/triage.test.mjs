import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName, importNamesFor, extractImports, isTestPath, parseAudit, triage, summaryLine } from './triage.mjs';

const audit = { dependencies: [
  { name: 'PyYAML', version: '5.3', vulns: [{ id: 'PYSEC-2020-96', aliases: ['CVE-2020-14343'], fix_versions: ['5.4'], description: 'arbitrary code execution' }] },
  { name: 'Pillow', version: '8.0', vulns: [
    { id: 'PYSEC-1', aliases: [], fix_versions: ['8.1'], description: 'a' }, { id: 'PYSEC-2', aliases: [], fix_versions: ['9.0'], description: 'b' }] },
  { name: 'pytest-mock', version: '1.0', vulns: [{ id: 'PYSEC-3', aliases: [], fix_versions: ['1.1'], description: 'c' }] },
  { name: 'Flask_Cors', version: '3.0', vulns: [{ id: 'PYSEC-4', aliases: [], fix_versions: [], description: 'd' }] },
  { name: 'safe-pkg', version: '1.0', vulns: [] },
  { name: 'ghost', version: '0.1', vulns: [{ id: 'PYSEC-5', aliases: [], fix_versions: ['0.2'], description: 'e' }] },
] };
const files = [
  { path: 'app/main.py', text: 'import yaml\nfrom PIL import Image\nfrom flask_cors import CORS\n# import ghost\n"""\nimport ghost\n"""\n' },
  { path: 'tests/test_main.py', text: 'import pytest_mock\nimport yaml' },
];

test('normalizeName follows PEP 503', () => {
  assert.equal(normalizeName('Flask_Cors'), 'flask-cors');
  assert.equal(normalizeName('zope.interface'), 'zope-interface');
});

test('importNamesFor maps distributions whose import name differs', () => {
  assert.ok(importNamesFor('PyYAML').has('yaml'));
  assert.ok(importNamesFor('Pillow').has('pil'));
  assert.ok(importNamesFor('Flask-Cors').has('flask_cors'));
  assert.ok(importNamesFor('scikit-learn').has('sklearn'));
});

test('extractImports reads import / from / import_module, skips relatives, comments and docstrings', () => {
  const s = extractImports("import os, a.b as c\nfrom d.e import f\nfrom . import g\nfrom .h import i\nx = importlib.import_module('j.k')\ny = __import__('l')\n# import m\n'''\nimport n\n'''\n  import o");
  assert.deepEqual([...s].sort(), ['a', 'd', 'j', 'l', 'o', 'os']);
});

test('isTestPath separates tests and tooling from runtime code', () => {
  assert.ok(isTestPath('tests/test_a.py'));
  assert.ok(isTestPath('pkg/test_a.py'));
  assert.ok(isTestPath('pkg/a_test.py'));
  assert.ok(isTestPath('conftest.py'));
  assert.ok(isTestPath('noxfile.py'));
  assert.ok(isTestPath('docs/conf.py'));
  assert.ok(!isTestPath('app/main.py'));
  assert.ok(!isTestPath('app/contest.py'));
});

test('parseAudit reads both shapes, drops clean packages, rejects junk', () => {
  assert.equal(parseAudit(JSON.stringify(audit)).entries.length, 5);
  assert.equal(parseAudit(JSON.stringify(audit.dependencies)).entries.length, 5);
  assert.ok(parseAudit('nope').error);
  assert.ok(parseAudit('{"a":1}').error);
  assert.deepEqual(parseAudit('{"dependencies":[]}').entries, []);
});

test('triage buckets by import name, ranks imported first, multi-advisory above single', () => {
  const r = triage(JSON.stringify(audit), files);
  const by = Object.fromEntries(r.items.map((i) => [i.name, i]));
  assert.equal(by.PyYAML.bucket, 'imported');
  assert.equal(by.Pillow.bucket, 'imported');
  assert.equal(by.Flask_Cors.bucket, 'imported');
  assert.equal(by['pytest-mock'].bucket, 'test-only');
  assert.equal(by.ghost.bucket, 'not-referenced');
  assert.equal(r.items[0].name, 'Pillow');
  assert.equal(r.items.at(-1).name, 'ghost');
  assert.equal(r.urgent.length, 3);
  assert.match(by.Pillow.fix, /8\.1 or 9\.0/);
  assert.match(by.Flask_Cors.fix, /no fix/);
});

test('package imported only from tests is test-only even when a runtime file mentions it in a comment', () => {
  const r = triage(JSON.stringify(audit), [{ path: 'a.py', text: '# import pytest_mock' }, { path: 'tests/t.py', text: 'import pytest_mock' }]);
  assert.equal(r.items.find((i) => i.name === 'pytest-mock').bucket, 'test-only');
});

test('summaryLine handles empty and populated results', () => {
  assert.match(summaryLine(triage('{"dependencies":[]}', [])), /no vulnerable/);
  assert.match(summaryLine(triage(JSON.stringify(audit), files)), /5 vulnerable package\(s\): 3 imported/);
  assert.ok(triage('x', []).error);
});
