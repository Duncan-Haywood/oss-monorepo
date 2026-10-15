import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SAMPLE } from './sample.mjs';

const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const run = (args, input) => spawnSync(process.execPath, [cli, ...args], { input, encoding: 'utf8' });

test('reads stdin and writes CSV', () => {
  const r = run(['-'], SAMPLE);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^ID,Section,Requirement/);
  assert.match(r.stdout, /REQ-020/);
});

test('json and md formats', () => {
  assert.equal(JSON.parse(run(['-', '--format', 'json'], SAMPLE).stdout).counts.total, 20);
  assert.match(run(['-', '--format', 'md'], SAMPLE).stdout, /^\| ID \|/);
});

test('bad usage exits 2', () => {
  assert.equal(run([]).status, 2);
  assert.equal(run(['-', '--format', 'xml'], 'x').status, 2);
});
