import test from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from './check.mjs';

function fakeChain(map) {
  return async (hostname) => map[hostname] ?? { chain: [hostname], finalTarget: null, truncated: false, error: null };
}

test('runCheck reports ok:true and sends no probe when the hostname has no risky CNAME', async () => {
  let probeCalled = false;
  const report = await runCheck(['example.com'], {
    resolveCnameChainFn: fakeChain({}),
    fetchHostnameFn: async () => { probeCalled = true; return { ok: true, status: 200, text: '', error: null }; },
  });
  assert.equal(report.ok, true);
  assert.equal(probeCalled, false, 'no point probing a hostname that matched no provider');
});

test('runCheck sends a probe and confirms a finding for a matched, dangling target', async () => {
  const report = await runCheck(['blog.example.com'], {
    resolveCnameChainFn: fakeChain({
      'blog.example.com': { chain: ['blog.example.com', 'old-app.herokuapp.com'], finalTarget: 'old-app.herokuapp.com', truncated: false, error: null },
    }),
    fetchHostnameFn: async () => ({ ok: true, status: 404, text: 'No such app', error: null }),
  });
  assert.equal(report.ok, false);
  assert.equal(report.confirmedCount, 1);
});

test('runCheck reports unconfirmed when the matched target is actually in use', async () => {
  const report = await runCheck(['blog.example.com'], {
    resolveCnameChainFn: fakeChain({
      'blog.example.com': { chain: ['blog.example.com', 'old-app.herokuapp.com'], finalTarget: 'old-app.herokuapp.com', truncated: false, error: null },
    }),
    fetchHostnameFn: async () => ({ ok: true, status: 200, text: '<html><body>real app</body></html>', error: null }),
  });
  assert.equal(report.ok, false);
  assert.equal(report.confirmedCount, 0);
  assert.equal(report.unconfirmedCount, 1);
});

test('runCheck skips the probe (and reports lookup-error) when the DNS lookup itself failed', async () => {
  let probeCalled = false;
  const report = await runCheck(['example.com'], {
    resolveCnameChainFn: fakeChain({
      'example.com': { chain: ['example.com'], finalTarget: null, truncated: false, error: 'timed out' },
    }),
    fetchHostnameFn: async () => { probeCalled = true; return { ok: true, status: 200, text: '', error: null }; },
  });
  assert.equal(probeCalled, false);
  assert.equal(report.errors.length, 1);
});

test('runCheck handles multiple hostnames independently and in parallel', async () => {
  const report = await runCheck(['safe.example.com', 'danger.example.com'], {
    resolveCnameChainFn: fakeChain({
      'danger.example.com': { chain: ['danger.example.com', 'old-app.herokuapp.com'], finalTarget: 'old-app.herokuapp.com', truncated: false, error: null },
    }),
    fetchHostnameFn: async () => ({ ok: true, status: 404, text: 'No such app', error: null }),
  });
  assert.equal(report.hostnamesChecked, 2);
  assert.equal(report.confirmedCount, 1);
});

test('runCheck passes a custom timeout through to both the lookup and the probe', async () => {
  let seenLookupTimeout = null;
  let seenProbeTimeout = null;
  await runCheck(['blog.example.com'], {
    resolveCnameChainFn: async (hostname, opts) => {
      seenLookupTimeout = opts?.timeoutMs;
      return { chain: [hostname, 'old-app.herokuapp.com'], finalTarget: 'old-app.herokuapp.com', truncated: false, error: null };
    },
    fetchHostnameFn: async (hostname, opts) => {
      seenProbeTimeout = opts?.timeoutMs;
      return { ok: true, status: 404, text: 'No such app', error: null };
    },
    timeoutMs: 1234,
  });
  assert.equal(seenLookupTimeout, 1234);
  assert.equal(seenProbeTimeout, 1234);
});
