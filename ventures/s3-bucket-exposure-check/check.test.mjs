import test from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from './check.mjs';

function fakeCheckBucketFn(raw) {
  return async () => raw;
}

test('runCheck reports ok=true when both requests are denied', async () => {
  const report = await runCheck('demo', {
    checkBucketFn: fakeCheckBucketFn({
      listing: { ok: false, status: 403, text: '<Error><Code>AccessDenied</Code></Error>', error: 'HTTP 403' },
      acl: { ok: false, status: 403, text: '<Error><Code>AccessDenied</Code></Error>', error: 'HTTP 403' },
    }),
  });
  assert.equal(report.ok, true);
});

test('runCheck reports ok=false and a critical finding when listing is public', async () => {
  const report = await runCheck('demo', {
    checkBucketFn: fakeCheckBucketFn({
      listing: {
        ok: true,
        status: 200,
        text: '<ListBucketResult><Contents><Key>a.csv</Key></Contents></ListBucketResult>',
        error: null,
      },
      acl: { ok: false, status: 403, text: '<Error><Code>AccessDenied</Code></Error>', error: 'HTTP 403' },
    }),
  });
  assert.equal(report.ok, false);
  assert.equal(report.criticalCount, 1);
});

test('runCheck passes the timeout through to checkBucketFn', async () => {
  let seenOpts;
  await runCheck('demo', {
    checkBucketFn: async (bucket, opts) => {
      seenOpts = opts;
      return {
        listing: { ok: false, status: 403, text: '<Error><Code>AccessDenied</Code></Error>', error: 'HTTP 403' },
        acl: { ok: false, status: 403, text: '<Error><Code>AccessDenied</Code></Error>', error: 'HTTP 403' },
      };
    },
    timeoutMs: 1234,
  });
  assert.equal(seenOpts.timeoutMs, 1234);
});
