import test from 'node:test';
import assert from 'node:assert/strict';
import { runCheck, parseArgs, resolveFromArgs } from './check.mjs';

const resolved = { ok: true, provider: 's3', bucket: 'example', account: null, probeUrl: 'https://s3.amazonaws.com/example' };

test('runCheck calls the injected probeFn with the resolved target and builds a report', async () => {
  let calledWith = null;
  const probeFn = async (target) => {
    calledWith = target;
    return { ok: true, status: 404, provider: 's3', bodySample: '<Error><Code>NoSuchBucket</Code></Error>', error: null };
  };
  const report = await runCheck(resolved, { probeFn });
  assert.equal(calledWith, resolved);
  assert.equal(report.target, resolved.probeUrl);
  assert.equal(report.state, 'not-found');
  assert.equal(report.ok, true);
});

test('runCheck surfaces a danger finding produced from a public-listing probe result', async () => {
  const probeFn = async () => ({
    ok: true,
    status: 200,
    provider: 's3',
    bodySample: '<ListBucketResult><Contents><Key>secret.csv</Key></Contents></ListBucketResult>',
    error: null,
  });
  const report = await runCheck(resolved, { probeFn });
  assert.equal(report.ok, false);
  assert.ok(report.dangerCount >= 1);
  assert.ok(report.findings.some((f) => f.id === 'bucket-publicly-listable'));
});

test('runCheck passes timeoutMs through to the probe function only when given', async () => {
  const seen = [];
  const probeFn = async (target, opts) => {
    seen.push(opts);
    return { ok: true, status: 404, provider: 's3', bodySample: '', error: null };
  };
  await runCheck(resolved, { probeFn });
  await runCheck(resolved, { probeFn, timeoutMs: 5000 });
  assert.deepEqual(seen[0], {});
  assert.deepEqual(seen[1], { timeoutMs: 5000 });
});

test('runCheck defaults to the real runProbe when no probeFn is injected', async () => {
  // Point at a port nothing listens on so this resolves fast as a network
  // failure rather than actually reaching anywhere.
  const report = await runCheck({ provider: 's3', probeUrl: 'http://127.0.0.1:1/' }, {});
  assert.equal(report.incomplete, true);
  assert.equal(report.ok, false);
});

// -- parseArgs --------------------------------------------------------------

test('parseArgs reads a bare URL as the target', () => {
  const args = parseArgs(['https://example-bucket.s3.amazonaws.com/']);
  assert.equal(args.target, 'https://example-bucket.s3.amazonaws.com/');
  assert.equal(args.json, false);
});

test('parseArgs reads --json, --timeout, and the explicit provider/bucket/account flags', () => {
  const args = parseArgs(['--provider', 'azure', '--bucket', 'mycontainer', '--account', 'myacct', '--json', '--timeout', '2000']);
  assert.equal(args.provider, 'azure');
  assert.equal(args.bucket, 'mycontainer');
  assert.equal(args.account, 'myacct');
  assert.equal(args.json, true);
  assert.equal(args.timeoutMs, 2000);
});

// -- resolveFromArgs ----------------------------------------------------------

test('resolveFromArgs prefers the explicit provider/bucket form when given', () => {
  const r = resolveFromArgs({ provider: 's3', bucket: 'example', account: null, target: null });
  assert.equal(r.ok, true);
  assert.equal(r.probeUrl, 'https://s3.amazonaws.com/example');
});

test('resolveFromArgs falls back to parsing a target URL', () => {
  const r = resolveFromArgs({ provider: null, bucket: null, account: null, target: 'https://storage.googleapis.com/example/' });
  assert.equal(r.ok, true);
  assert.equal(r.provider, 'gcs');
});

test('resolveFromArgs reports a usage error when nothing at all was given', () => {
  const r = resolveFromArgs({ provider: null, bucket: null, account: null, target: null });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'usage-error');
});

test('resolveFromArgs rejects a partial explicit form (provider without bucket)', () => {
  const r = resolveFromArgs({ provider: 's3', bucket: null, account: null, target: null });
  assert.equal(r.ok, false);
  assert.match(r.error, /must both be given/);
});
