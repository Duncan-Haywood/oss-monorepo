import test from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from './check.mjs';

function fakeProbe(overrides = {}) {
  return {
    target: 'https://example.com/',
    head: { ok: true, status: 404, url: 'https://example.com/.git/HEAD', bodySample: 'Not Found', truncated: false, error: null },
    config: { ok: true, status: 404, url: 'https://example.com/.git/config', bodySample: 'Not Found', truncated: false, error: null },
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
  const probeFn = async () => fakeProbe({
    head: { ok: true, status: 200, url: 'https://example.com/.git/HEAD', bodySample: 'ref: refs/heads/main\n', truncated: false, error: null },
    config: { ok: true, status: 200, url: 'https://example.com/.git/config', bodySample: '[core]\n', truncated: false, error: null },
  });
  const report = await runCheck('https://example.com/', { probeFn });
  assert.equal(report.ok, false);
  assert.ok(report.dangerCount >= 1);
  assert.ok(report.findings.some((f) => f.id === 'git-directory-exposed'));
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
