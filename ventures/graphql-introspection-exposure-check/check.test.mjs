import test from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from './check.mjs';

function stubProbe(result) {
  return async () => result;
}

test('runCheck derives a report from whatever probeFn returns, without touching the network', async () => {
  const probe = {
    ok: true, status: 200, error: null, parseError: null,
    body: { data: { __schema: { queryType: { name: 'Query', fields: [{ name: 'me' }] }, mutationType: null, subscriptionType: null, types: [] } } },
  };
  const { report } = await runCheck('https://api.example.com/graphql', { probeFn: stubProbe(probe) });
  assert.equal(report.introspectionEnabled, true);
  assert.equal(report.queryFieldCount, 1);
});

test('runCheck returns the raw probe alongside the report', async () => {
  const probe = { ok: true, status: 200, error: null, parseError: null, body: { errors: [{ message: 'introspection disabled' }] } };
  const { probe: returnedProbe, report } = await runCheck('https://api.example.com/graphql', { probeFn: stubProbe(probe) });
  assert.equal(returnedProbe, probe);
  assert.equal(report.introspectionEnabled, false);
});

test('a failed probe produces a non-ok report', async () => {
  const { report } = await runCheck('https://api.example.com/graphql', {
    probeFn: stubProbe({ ok: false, error: 'timeout', status: null, body: null }),
  });
  assert.equal(report.ok, false);
  assert.equal(report.incomplete, true);
});

test('a mutation-surface finding makes the report not-ok, which the CLI turns into exit code 1', async () => {
  const probe = {
    ok: true, status: 200, error: null, parseError: null,
    body: { data: { __schema: { queryType: { name: 'Query', fields: [] }, mutationType: { name: 'Mutation', fields: [{ name: 'deleteUser' }] }, subscriptionType: null, types: [] } } },
  };
  const { report } = await runCheck('https://api.example.com/graphql', { probeFn: stubProbe(probe) });
  assert.equal(report.ok, false);
  assert.ok(report.dangerCount >= 1);
});

test('runCheck passes headers through to probeFn', async () => {
  let seenHeaders;
  const probeFn = async (target, opts) => {
    seenHeaders = opts.headers;
    return { ok: true, status: 200, error: null, parseError: null, body: { errors: [] } };
  };
  await runCheck('https://api.example.com/graphql', { probeFn, headers: { 'X-Api-Key': 'abc' } });
  assert.deepEqual(seenHeaders, { 'X-Api-Key': 'abc' });
});
