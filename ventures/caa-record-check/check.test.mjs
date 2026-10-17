import test from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from './check.mjs';

function fakeResolve(map) {
  return async (hostname) => map[hostname] ?? {
    ok: true, queriedName: hostname, canonicalName: hostname, foundAtName: null, records: [], walkedNames: [hostname], error: null,
  };
}

test('runCheck reports ok:true when no hostname has any CAA finding', async () => {
  const report = await runCheck(['example.com'], { resolveCaaSetFn: fakeResolve({}) });
  assert.equal(report.ok, true);
  assert.equal(report.cleanCount, 1);
});

test('runCheck reports a finding for a malformed record', async () => {
  const report = await runCheck(['example.com'], {
    resolveCaaSetFn: fakeResolve({
      'example.com': { ok: true, queriedName: 'example.com', canonicalName: 'example.com', foundAtName: 'example.com', records: [{ ok: false, error: 'bad', raw: 'x' }], walkedNames: ['example.com'], error: null },
    }),
  });
  assert.equal(report.ok, false);
  assert.equal(report.findingsCount, 1);
});

test('runCheck with --ca reports requested-ca-blocked when that CA is not authorized', async () => {
  const report = await runCheck(['example.com'], {
    resolveCaaSetFn: fakeResolve({
      'example.com': { ok: true, queriedName: 'example.com', canonicalName: 'example.com', foundAtName: 'example.com', records: [{ ok: true, flag: 0, critical: false, tag: 'issue', value: 'digicert.com' }], walkedNames: ['example.com'], error: null },
    }),
    ca: 'letsencrypt.org',
  });
  assert.equal(report.ok, false);
  assert.equal(report.blockedCount, 1);
});

test('runCheck with --ca reports clean when that CA is authorized', async () => {
  const report = await runCheck(['example.com'], {
    resolveCaaSetFn: fakeResolve({
      'example.com': { ok: true, queriedName: 'example.com', canonicalName: 'example.com', foundAtName: 'example.com', records: [{ ok: true, flag: 0, critical: false, tag: 'issue', value: 'letsencrypt.org' }], walkedNames: ['example.com'], error: null },
    }),
    ca: 'letsencrypt.org',
  });
  assert.equal(report.ok, true);
});

test('runCheck surfaces a lookup error rather than treating it as clean', async () => {
  const report = await runCheck(['example.com'], {
    resolveCaaSetFn: fakeResolve({ 'example.com': { ok: false, error: 'timed out' } }),
  });
  assert.equal(report.errors.length, 1);
});

test('runCheck handles multiple hostnames independently', async () => {
  const report = await runCheck(['a.com', 'b.com'], {
    resolveCaaSetFn: fakeResolve({
      'b.com': { ok: true, queriedName: 'b.com', canonicalName: 'b.com', foundAtName: 'b.com', records: [{ ok: false, error: 'bad', raw: 'x' }], walkedNames: ['b.com'], error: null },
    }),
  });
  assert.equal(report.hostnamesChecked, 2);
  assert.equal(report.findingsCount, 1);
  assert.equal(report.cleanCount, 1);
});

test('runCheck passes a custom timeout through to the resolver', async () => {
  let seenTimeout = null;
  await runCheck(['example.com'], {
    resolveCaaSetFn: async (hostname, opts) => {
      seenTimeout = opts?.timeoutMs;
      return { ok: true, queriedName: hostname, canonicalName: hostname, foundAtName: null, records: [], walkedNames: [hostname], error: null };
    },
    timeoutMs: 4321,
  });
  assert.equal(seenTimeout, 4321);
});
