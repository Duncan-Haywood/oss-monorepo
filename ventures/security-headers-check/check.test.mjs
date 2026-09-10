import test from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from './check.mjs';

function fakeProbe(overrides = {}) {
  return {
    ok: true,
    status: 200,
    protocol: 'https:',
    headers: {
      'content-security-policy': null,
      'content-security-policy-report-only': null,
      'x-frame-options': 'DENY',
      'strict-transport-security': 'max-age=63072000',
    },
    error: null,
    ...overrides,
  };
}

test('runCheck calls the injected probeFn with the target and builds a report from its result', async () => {
  let calledWith = null;
  const probeFn = async (target) => {
    calledWith = target;
    return fakeProbe();
  };
  const report = await runCheck('https://example.com/', { probeFn });
  assert.equal(calledWith, 'https://example.com/');
  assert.equal(report.target, 'https://example.com/');
  assert.equal(report.ok, true);
});

test('runCheck surfaces a danger finding produced from the probe result', async () => {
  const probeFn = async () => fakeProbe({ headers: { ...fakeProbe().headers, 'x-frame-options': null } });
  const report = await runCheck('https://example.com/', { probeFn });
  assert.equal(report.ok, false);
  assert.ok(report.dangerCount >= 1);
  assert.ok(report.findings.some((f) => f.id === 'missing-frame-protection'));
});

test('runCheck passes timeoutMs through to the probe function only when given', async () => {
  const seen = [];
  const probeFn = async (target, opts) => {
    seen.push(opts);
    return fakeProbe();
  };
  await runCheck('https://example.com/', { probeFn });
  await runCheck('https://example.com/', { probeFn, timeoutMs: 5000 });
  assert.deepEqual(seen[0], {});
  assert.deepEqual(seen[1], { timeoutMs: 5000 });
});

test('runCheck defaults to the real runProbe when no probeFn is injected', async () => {
  // Point at a port nothing listens on so this resolves fast as a network
  // failure rather than actually reaching anywhere -- confirms the default
  // wiring calls the real network layer without this test depending on the
  // network being up.
  const report = await runCheck('http://127.0.0.1:1/', {});
  assert.equal(report.incomplete, true);
  assert.equal(report.ok, false);
});
