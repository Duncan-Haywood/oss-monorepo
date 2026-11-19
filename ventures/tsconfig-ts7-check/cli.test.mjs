import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
function project(files) {
  const dir = mkdtempSync(join(tmpdir(), 'ts7cli-'));
  for (const [p, c] of Object.entries(files)) { mkdirSync(join(dir, p, '..'), { recursive: true }); writeFileSync(join(dir, p), typeof c === 'string' ? c : JSON.stringify(c)); }
  return dir;
}

test('exit 1 when TypeScript 7 would reject the config; 0 when it would not', () => {
  const bad = project({ 'tsconfig.json': '{ // legacy\n "compilerOptions": { "target": "es5", "strict": true, "types": [] } }' });
  const r = run([], bad);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /target.*es5.*TS5108/);
  const ok = project({ 'tsconfig.json': { compilerOptions: { target: 'es2022', module: 'nodenext', strict: true, types: ['node'] } } });
  assert.equal(run([], ok).status, 0);
});

test('--strict fails on warnings; bad flags and unreadable files exit 2', () => {
  const dir = project({ 'tsconfig.json': { compilerOptions: { target: 'es2022', module: 'nodenext' } } });
  assert.equal(run([], dir).status, 0);
  assert.equal(run(['--strict'], dir).status, 1);
  assert.equal(run(['--nope'], dir).status, 2);
  assert.equal(run(['missing.json'], dir).status, 2);
  const broken = project({ 'tsconfig.json': '{ "compilerOptions": { "a": 1 "b": 2 } }' });
  const r = run([], broken);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /tsconfig\.json:1:\d+: Expected ','/);
});

test('follows relative and node_modules extends, nearest config winning', () => {
  const dir = project({
    'node_modules/@acme/tsconfig/package.json': { name: '@acme/tsconfig', tsconfig: 'base.json' },
    'node_modules/@acme/tsconfig/base.json': { compilerOptions: { baseUrl: '.', moduleResolution: 'node' } },
    'configs/strict.json': { extends: '@acme/tsconfig', compilerOptions: { strict: true, moduleResolution: 'bundler' } },
    'tsconfig.json': { extends: './configs/strict', compilerOptions: { types: [] } },
  });
  const r = JSON.parse(run(['--json'], dir).stdout)[0];
  const ids = r.findings.map((f) => f.id);
  assert.ok(ids.includes('removed:baseUrl'), ids.join());
  assert.ok(!ids.some((i) => i.startsWith('removed:moduleResolution')), 'bundler from the nearer base wins');
  assert.ok(!ids.includes('default:strict'));
  assert.match(r.findings.find((f) => f.id === 'removed:baseUrl').message, /set in @acme\/tsconfig/);
});

test('an extends it cannot find softens default warnings and says so', () => {
  const dir = project({ 'tsconfig.json': { extends: '@nowhere/tsconfig', compilerOptions: {} } });
  const r = JSON.parse(run(['--json'], dir).stdout)[0];
  assert.equal(r.warnings, 0);
  assert.ok(r.findings.some((f) => f.id === 'extends-unresolved'));
});

test('names the @types packages the new "types" default stops loading', () => {
  const dir = project({ 'node_modules/@types/node/index.d.ts': '', 'node_modules/@types/jest/index.d.ts': '', 'tsconfig.json': { compilerOptions: { strict: true } } });
  const r = JSON.parse(run(['--json'], dir).stdout)[0];
  const f = r.findings.find((x) => x.id === 'default:types');
  assert.equal(f.severity, 'warning');
  assert.match(f.message, /@types\/jest, @types\/node/);
  const none = project({ 'tsconfig.json': { compilerOptions: { strict: true } } });
  assert.equal(JSON.parse(run(['--json'], none).stdout)[0].findings.find((x) => x.id === 'default:types').severity, 'info');
});

test('--suggest prints compilerOptions without the removed options', () => {
  const dir = project({ 'tsconfig.json': { compilerOptions: { target: 'es5', baseUrl: 'src', paths: { '~/*': ['*'] }, outDir: 'dist' } } });
  const r = JSON.parse(run(['--json', '--suggest'], dir).stdout)[0];
  const o = r.suggested.compilerOptions;
  assert.equal(o.target, 'es2015');
  assert.ok(!('baseUrl' in o));
  assert.deepEqual(o.paths, { '~/*': ['./src/*'] });
  assert.equal(o.rootDir, './src');
});
