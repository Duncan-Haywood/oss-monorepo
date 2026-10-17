import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, parseEnvLines } from './analyze.mjs';

function raw(path, { ok = true, status = 200, text = '', error = null, url } = {}) {
  return { path, ok, status, text, error, url: url ?? `https://x.example/${path}` };
}

test('parseEnvLines returns key names only, never values', () => {
  const { keys, envLineCount, totalContentLines } = parseEnvLines(
    'DATABASE_URL=postgres://user:hunter2@host/db\n# a comment\n\nDEBUG=true\n',
  );
  assert.deepEqual(keys, ['DATABASE_URL', 'DEBUG']);
  assert.equal(envLineCount, 2);
  assert.equal(totalContentLines, 2);
  // Ensure no returned value anywhere contains the secret substring.
  const serialized = JSON.stringify({ keys, envLineCount, totalContentLines });
  assert.doesNotMatch(serialized, /hunter2/);
});

test('a real .env file with a secret-shaped key name is flagged critical', () => {
  const results = [
    raw('.env', { text: 'DATABASE_URL=postgres://u:p@h/db\nSTRIPE_SECRET_KEY=sk_live_abc\nDEBUG=true\n' }),
  ];
  const report = buildReport('https://x.example/', results);
  assert.equal(report.ok, false);
  assert.equal(report.criticalCount, 1);
  assert.equal(report.findings[0].secretLikeKeys.includes('STRIPE_SECRET_KEY'), true);
  // The value must never appear anywhere in the report.
  assert.doesNotMatch(JSON.stringify(report), /sk_live_abc/);
});

test('a real .env file with no secret-shaped key names is flagged danger, not critical', () => {
  const results = [raw('.env', { text: 'NODE_ENV=production\nPORT=3000\nLOG_LEVEL=info\n' })];
  const report = buildReport('https://x.example/', results);
  assert.equal(report.ok, false);
  assert.equal(report.criticalCount, 0);
  assert.equal(report.dangerCount, 1);
});

test('a clean site (everything 401/403/404) reports ok:true with nothing exposed', () => {
  const results = [
    raw('.env', { ok: false, status: 404, text: null }),
    raw('.env.local', { ok: false, status: 403, text: null }),
  ];
  const report = buildReport('https://x.example/', results);
  assert.equal(report.ok, true);
  assert.equal(report.exposedCount, 0);
  assert.equal(report.blocked.length, 2);
});

test('a soft-404 catch-all (200 for everything, but HTML) is not-env, not exposed', () => {
  const results = [raw('.env', { text: '<html><body>Welcome</body></html>' })];
  const report = buildReport('https://x.example/', results);
  assert.equal(report.ok, true);
  assert.equal(report.notEnv.length, 1);
});

test('a mostly-prose 200 response with one stray "=" is not misread as a dotenv file', () => {
  const results = [raw('.env', { text: 'This page moved. See x=y for details in our migration doc which explains everything.' })];
  const report = buildReport('https://x.example/', results);
  assert.equal(report.ok, true);
  assert.equal(report.notEnv.length, 1);
});

test('an empty 200 response is not-env, not exposed', () => {
  const results = [raw('.env', { text: '' })];
  const report = buildReport('https://x.example/', results);
  assert.equal(report.ok, true);
  assert.equal(report.notEnv.length, 1);
});

test('a network error is reported as error, never folded into exposed or blocked', () => {
  const results = [raw('.env', { ok: false, status: null, text: null, error: 'network error' })];
  const report = buildReport('https://x.example/', results);
  assert.equal(report.errors.length, 1);
  assert.equal(report.incomplete, true);
  assert.equal(report.exposedCount, 0);
});

test('sampleKeys is capped and never exceeds keyCount', () => {
  const lines = Array.from({ length: 20 }, (_, i) => `VAR_${i}=value${i}`).join('\n');
  const results = [raw('.env', { text: lines })];
  const report = buildReport('https://x.example/', results);
  assert.equal(report.findings[0].keyCount, 20);
  assert.ok(report.findings[0].sampleKeys.length <= 12);
});

test('buildReport handles an empty result set without throwing', () => {
  const report = buildReport('https://x.example/', []);
  assert.equal(report.ok, true);
  assert.equal(report.pathsChecked, 0);
});
