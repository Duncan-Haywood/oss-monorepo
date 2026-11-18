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

// Real defect found 2026-11-12 (red team): README and check.mjs promise exit
// 1 "when ... a request could not be completed at all", but the CLI exited 0
// when every request failed, so a CI gate on it passed on a dead target.
test('the CLI exits 1 when no request could complete', async () => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const cli = fileURLToPath(new URL('./check.mjs', import.meta.url));
  // Port 1 on loopback refuses the connection at once: every path errors.
  const run = spawnSync(process.execPath, [cli, 'http://127.0.0.1:1/', '--json', '--timeout', '2000'], { encoding: 'utf8', timeout: 60000 });
  const report = JSON.parse(run.stdout);
  assert.equal(report.exposedCount, 0);
  assert.equal(report.incomplete, true);
  assert.equal(run.status, 1);
});
