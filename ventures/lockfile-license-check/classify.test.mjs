import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { categorizeId, categorizeExpression, normalizeLicense, analyze, summaryLine, CATEGORIES } from './classify.mjs';

const fixture = readFileSync(new URL('./fixture.json', import.meta.url), 'utf8');
const cli = new URL('./license-check.mjs', import.meta.url).pathname;
const fixPath = new URL('./fixture.json', import.meta.url).pathname;

test('single identifiers are categorised', () => {
  assert.equal(categorizeId('MIT'), 'permissive');
  assert.equal(categorizeId('BSD-3-Clause'), 'permissive');
  assert.equal(categorizeId('LGPL-3.0'), 'weak-copyleft');
  assert.equal(categorizeId('MPL-2.0'), 'weak-copyleft');
  assert.equal(categorizeId('GPL-3.0-only'), 'strong-copyleft');
  assert.equal(categorizeId('AGPL-3.0-or-later'), 'strong-copyleft');
  assert.equal(categorizeId('UNLICENSED'), 'unlicensed');
  assert.equal(categorizeId('SEE LICENSE IN LICENSE.md'), 'unlicensed');
  assert.equal(categorizeId('Weird-1.0'), 'unknown');
});

test('OR takes the best choice, AND the worst, parentheses nest', () => {
  assert.equal(categorizeExpression('(MIT OR GPL-3.0)'), 'permissive');
  assert.equal(categorizeExpression('MIT AND GPL-2.0'), 'strong-copyleft');
  assert.equal(categorizeExpression('(MIT OR GPL-3.0) AND LGPL-2.1'), 'weak-copyleft');
  assert.equal(categorizeExpression('Apache-2.0 WITH LLVM-exception'), 'permissive');
  assert.equal(categorizeExpression(''), 'unknown');
});

test('legacy license shapes normalise', () => {
  assert.equal(normalizeLicense({ type: 'MIT', url: 'x' }), 'MIT');
  assert.equal(normalizeLicense([{ type: 'MIT' }, { type: 'Apache-2.0' }]), '(MIT OR Apache-2.0)');
  assert.equal(normalizeLicense(undefined), null);
});

test('fixture: worst first, links and root skipped, nested names resolved', () => {
  const r = analyze(fixture);
  assert.equal(r.total, 9);
  assert.deepEqual(r.counts, { 'strong-copyleft': 2, 'weak-copyleft': 1, unlicensed: 1, unknown: 1, permissive: 4 });
  assert.equal(r.flagged[0].name, 'closed');
  assert.ok(r.flagged.every((f) => f.category !== 'permissive'));
  assert.ok(analyze(fixture).licenses.some((l) => l.license === 'ISC'));
  assert.match(summaryLine(r), /2 strong-copyleft, 1 unlicensed, 1 weak-copyleft, 1 unknown to review/);
});

test('--no-dev style option drops dev packages', () => {
  assert.equal(analyze(fixture, { includeDev: false }).total, 8);
});

test('deny list matches whole tokens only', () => {
  const r = analyze(fixture, { deny: ['GPL-3.0-only'] });
  assert.deepEqual(r.denied.map((d) => d.name), ['dual']);
  assert.equal(analyze(fixture, { deny: ['GPL'] }).denied.length, 0);
});

test('bad input yields errors, v1 lockfiles explain themselves', () => {
  assert.ok(analyze('not json').error);
  assert.match(analyze('{"lockfileVersion":1,"dependencies":{}}').error, /lockfileVersion 1/);
  assert.ok(analyze('{"packages":{"":{}}}').error);
  for (const c of CATEGORIES) assert.equal(typeof analyze(fixture).counts[c], 'number');
});

test('CLI exit codes follow --fail-on and --deny', () => {
  const run = (...a) => spawnSync('node', [cli, fixPath, ...a], { encoding: 'utf8' });
  assert.equal(run().status, 0);
  assert.equal(run('--fail-on', 'copyleft').status, 1);
  assert.equal(run('--fail-on', 'any', '--no-dev').status, 1);
  assert.equal(run('--deny', 'AGPL-3.0-or-later').status, 1);
  assert.equal(run('--deny', 'Nothing-1.0').status, 0);
  assert.equal(spawnSync('node', [cli, '/nonexistent'], { encoding: 'utf8' }).status, 2);
  assert.deepEqual(JSON.parse(execFileSync('node', [cli, fixPath, '--json'], { encoding: 'utf8' })), analyze(fixture));
});
