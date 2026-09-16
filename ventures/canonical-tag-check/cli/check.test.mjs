import test from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from './check.mjs';

function fakeResult(overrides = {}) {
  return {
    target: 'https://example.com/page/',
    page: {
      requestedUrl: 'https://example.com/page/',
      finalUrl: 'https://example.com/page/',
      redirectCount: 0,
      ok: true,
      status: 200,
      error: null,
      xRobotsTag: null,
      metaRobots: null,
      canonicalLinks: [{ href: 'https://example.com/page/', raw: '' }],
    },
    canonicalTarget: null,
    ...overrides,
  };
}

test('runCheck calls the injected probeFn with the target and builds a report from its result', async () => {
  let calledWith = null;
  const probeFn = async (target) => {
    calledWith = target;
    return fakeResult({ target });
  };
  const report = await runCheck('https://example.com/page/', { probeFn });
  assert.equal(calledWith, 'https://example.com/page/');
  assert.equal(report.target, 'https://example.com/page/');
  assert.equal(report.ok, true);
});

test('runCheck surfaces a danger finding produced from the probe result', async () => {
  const probeFn = async () => fakeResult({
    page: { ...fakeResult().page, canonicalLinks: [
      { href: 'https://example.com/a/', raw: '' },
      { href: 'https://example.com/b/', raw: '' },
    ] },
  });
  const report = await runCheck('https://example.com/page/', { probeFn });
  assert.equal(report.ok, false);
  assert.equal(report.dangerCount, 1);
  assert.equal(report.findings[0].id, 'multiple-conflicting-canonical');
});

test('runCheck reports incomplete when the probe reports the fetch failed', async () => {
  const probeFn = async () => fakeResult({ page: { ok: false, error: 'timed out' } });
  const report = await runCheck('https://example.com/page/', { probeFn });
  assert.equal(report.incomplete, true);
  assert.equal(report.ok, false);
});

test('runCheck passes timeoutMs through to the probe function only when given', async () => {
  const seen = [];
  const probeFn = async (target, opts) => {
    seen.push(opts);
    return fakeResult();
  };
  await runCheck('https://example.com/page/', { probeFn });
  await runCheck('https://example.com/page/', { probeFn, timeoutMs: 5000 });
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
