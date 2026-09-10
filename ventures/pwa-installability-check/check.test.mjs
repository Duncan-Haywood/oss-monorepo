import test from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from './check.mjs';

function fakeProbe(overrides = {}) {
  return {
    page: { ok: true, status: 200, error: null },
    secure: true,
    manifestHref: '/manifest.json',
    manifestUrl: 'https://example.com/manifest.json',
    manifest: { ok: true, status: 200, error: null },
    manifestJson: {
      name: 'App',
      display: 'standalone',
      start_url: '/',
      theme_color: '#fff',
      icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
    },
    parseError: null,
    icons: [
      {
        src: '/icon-192.png',
        resolvedUrl: 'https://example.com/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: null,
        fetch: { ok: true, status: 200, contentType: 'image/png', error: null },
      },
    ],
    ...overrides,
  };
}

test('runCheck calls the injected probeFn with the target and builds a report from its result', async () => {
  let calledWith = null;
  const probeFn = async (target) => {
    calledWith = target;
    return fakeProbe();
  };
  const { report } = await runCheck('https://example.com/', { probeFn });
  assert.equal(calledWith, 'https://example.com/');
  assert.equal(report.target, 'https://example.com/');
  assert.equal(report.ok, true);
});

test('runCheck surfaces a danger finding produced from the probe result', async () => {
  const probeFn = async () => fakeProbe({ manifestJson: { name: 'App', icons: [] }, icons: [] });
  const { report } = await runCheck('https://example.com/', { probeFn });
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((f) => f.id === 'missing-display'));
  assert.ok(report.findings.some((f) => f.id === 'missing-192-icon'));
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
  const { report } = await runCheck('http://127.0.0.1:1/', { timeoutMs: 500 });
  assert.equal(report.incomplete, true);
  assert.equal(report.ok, false);
});
