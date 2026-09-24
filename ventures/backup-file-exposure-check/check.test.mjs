import test from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from './check.mjs';

function fakeCheckSiteFn(results) {
  return async () => ({ results });
}

test('runCheck reports ok=true when nothing is exposed', async () => {
  const report = await runCheck('https://x.example/', {
    checkSiteFn: fakeCheckSiteFn([
      { path: 'backup.zip', ok: false, status: 404, bytes: null, error: null, url: 'https://x.example/backup.zip' },
    ]),
  });
  assert.equal(report.ok, true);
});

test('runCheck reports ok=false and a critical finding for an exposed archive', async () => {
  const report = await runCheck('https://x.example/', {
    checkSiteFn: fakeCheckSiteFn([
      {
        path: 'backup.zip',
        ok: true,
        status: 200,
        bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
        error: null,
        url: 'https://x.example/backup.zip',
      },
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
