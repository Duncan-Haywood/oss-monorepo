import test from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from './check.mjs';

function fakeProbeFn(baseUrl, results, schemaError = null) {
  return async () => ({ baseUrl, results, schemaError, truncated: false });
}

test('runCheck reports ok=true when every table is blocked', async () => {
  const report = await runCheck('https://x.supabase.co', 'anon-key', {
    probeFn: fakeProbeFn('https://x.supabase.co', [
      { table: 'a', ok: false, status: 401, rowsReturned: 0, totalCount: null, columns: [] },
    ]),
  });
  assert.equal(report.ok, true);
});

test('runCheck reports ok=false and a finding when a table is exposed', async () => {
  const report = await runCheck('https://x.supabase.co', 'anon-key', {
    probeFn: fakeProbeFn('https://x.supabase.co', [
      { table: 'profiles', ok: true, status: 200, rowsReturned: 1, totalCount: 3, columns: ['id', 'email'] },
    ]),
  });
  assert.equal(report.ok, false);
  assert.equal(report.dangerCount, 1);
  assert.equal(report.findings[0].table, 'profiles');
});

test('runCheck surfaces a schemaError as an incomplete, not-ok report', async () => {
  const report = await runCheck('https://x.supabase.co', 'bad-key', {
    probeFn: fakeProbeFn('https://x.supabase.co', [], 'HTTP 401 reading the schema root'),
  });
  assert.equal(report.ok, false);
  assert.equal(report.incomplete, true);
});

test('runCheck passes the timeout through to the probe function', async () => {
  let seenOpts;
  const report = await runCheck('https://x.supabase.co', 'anon-key', {
    probeFn: async (url, key, opts) => {
      seenOpts = opts;
      return { baseUrl: url, results: [], schemaError: null, truncated: false };
    },
    timeoutMs: 1234,
  });
  assert.equal(seenOpts.timeoutMs, 1234);
  assert.equal(report.tablesChecked, 0);
});
