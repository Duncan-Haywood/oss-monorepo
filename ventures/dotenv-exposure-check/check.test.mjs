import test from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from './check.mjs';

function fakeCheckSiteFn(results) {
  return async () => ({ results });
}

test('runCheck reports ok=true when nothing is exposed', async () => {
  const report = await runCheck('https://x.example/', {
    checkSiteFn: fakeCheckSiteFn([
      { path: '.env', ok: false, status: 404, text: null, error: null, url: 'https://x.example/.env' },
    ]),
  });
  assert.equal(report.ok, true);
});

test('runCheck reports ok=false and a critical finding for an exposed secret-shaped key', async () => {
  const report = await runCheck('https://x.example/', {
    checkSiteFn: fakeCheckSiteFn([
      { path: '.env', ok: true, status: 200, text: 'API_KEY=abc123\n', error: null, url: 'https://x.example/.env' },
    ]),
  });
  assert.equal(report.ok, false);
  assert.equal(report.criticalCount, 1);
});

test('runCheck passes the timeout through to checkSiteFn', async () => {
  let seenOpts;
  await runCheck('https://x.example/', {
    checkSiteFn: async (url, opts) => {
      seenOpts = opts;
      return { results: [] };
    },
    timeoutMs: 1234,
  });
  assert.equal(seenOpts.timeoutMs, 1234);
});
