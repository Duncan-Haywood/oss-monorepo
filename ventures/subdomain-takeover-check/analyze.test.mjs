import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, buildReport, verdictFor } from './analyze.mjs';

test('classify reports lookup-error when the DNS lookup itself failed', () => {
  const result = classify('example.com', { chain: ['example.com'], finalTarget: null, truncated: false, error: 'timed out' }, null);
  assert.equal(result.category, 'lookup-error');
  assert.equal(result.error, 'timed out');
});

test('classify reports no-cname when the hostname has no CNAME record', () => {
  const result = classify('example.com', { chain: ['example.com'], finalTarget: null, truncated: false, error: null }, null);
  assert.equal(result.category, 'no-cname');
});

test('classify reports not-risky when the CNAME target matches no known provider', () => {
  const result = classify(
    'mail.example.com',
    { chain: ['mail.example.com', 'mail.example.com.cust.hosted-elsewhere.example'], finalTarget: 'mail.example.com.cust.hosted-elsewhere.example', truncated: false, error: null },
    null,
  );
  assert.equal(result.category, 'not-risky');
});

test('classify reports risky-unconfirmed when the CNAME matches a provider but no probe was run', () => {
  const result = classify(
    'blog.example.com',
    { chain: ['blog.example.com', 'old-app.herokuapp.com'], finalTarget: 'old-app.herokuapp.com', truncated: false, error: null },
    null,
  );
  assert.equal(result.category, 'risky-unconfirmed');
  assert.equal(result.provider.id, 'heroku');
});

test('classify reports risky-unconfirmed when the probe could not complete (e.g. CORS)', () => {
  const result = classify(
    'blog.example.com',
    { chain: ['blog.example.com', 'old-app.herokuapp.com'], finalTarget: 'old-app.herokuapp.com', truncated: false, error: null },
    { ok: false, status: null, text: null, error: 'Failed to fetch' },
  );
  assert.equal(result.category, 'risky-unconfirmed');
  assert.equal(result.error, 'Failed to fetch');
});

test('classify reports risky-unconfirmed (not dangling-confirmed) when the probe completed but the body does not match the fingerprint', () => {
  // The target is legitimately in use -- a real app is running there.
  const result = classify(
    'blog.example.com',
    { chain: ['blog.example.com', 'old-app.herokuapp.com'], finalTarget: 'old-app.herokuapp.com', truncated: false, error: null },
    { ok: true, status: 200, text: '<html><body>Welcome to our real app</body></html>', error: null },
  );
  assert.equal(result.category, 'risky-unconfirmed');
});

test('classify reports dangling-confirmed when the probe body matches the provider fingerprint', () => {
  const result = classify(
    'blog.example.com',
    { chain: ['blog.example.com', 'old-app.herokuapp.com'], finalTarget: 'old-app.herokuapp.com', truncated: false, error: null },
    { ok: true, status: 404, text: 'No such app', error: null },
  );
  assert.equal(result.category, 'dangling-confirmed');
  assert.equal(result.provider.id, 'heroku');
});

test('classify never confirms a takeover from DNS alone, even for a highly vulnerable provider', () => {
  // This is the core safety property: a DNS match is never enough on its
  // own, regardless of how confident this tool is that the provider is
  // vulnerable (see fingerprints.mjs's `vulnerable: true` on 'heroku').
  const dnsOnly = classify(
    'blog.example.com',
    { chain: ['blog.example.com', 'old-app.herokuapp.com'], finalTarget: 'old-app.herokuapp.com', truncated: false, error: null },
    null,
  );
  assert.notEqual(dnsOnly.category, 'dangling-confirmed');
});

test('buildReport produces a critical finding for a confirmed dangling CNAME', () => {
  const result = classify(
    'blog.example.com',
    { chain: ['blog.example.com', 'some-bucket.s3-website-us-east-1.amazonaws.com'], finalTarget: 'some-bucket.s3-website-us-east-1.amazonaws.com', truncated: false, error: null },
    { ok: true, status: 404, text: '<Error><Code>NoSuchBucket</Code></Error>', error: null },
  );
  const report = buildReport(['blog.example.com'], [result]);
  assert.equal(report.ok, false);
  assert.equal(report.confirmedCount, 1);
  assert.equal(report.unconfirmedCount, 0);
  assert.equal(report.findings[0].severity, 'critical');
  assert.match(report.findings[0].title, /confirmed dangling CNAME/);
});

test('buildReport produces a warning finding for an unconfirmed risky match', () => {
  const result = classify(
    'blog.example.com',
    { chain: ['blog.example.com', 'old-app.herokuapp.com'], finalTarget: 'old-app.herokuapp.com', truncated: false, error: null },
    null,
  );
  const report = buildReport(['blog.example.com'], [result]);
  assert.equal(report.ok, false);
  assert.equal(report.confirmedCount, 0);
  assert.equal(report.unconfirmedCount, 1);
  assert.equal(report.findings[0].severity, 'warning');
});

test('buildReport is clean (ok: true, no findings) for a not-risky hostname', () => {
  const result = classify('example.com', { chain: ['example.com'], finalTarget: null, truncated: false, error: null }, null);
  const report = buildReport(['example.com'], [result]);
  assert.equal(report.ok, true);
  assert.equal(report.findings.length, 0);
});

test('buildReport surfaces lookup errors separately from findings', () => {
  const result = classify('example.com', { chain: ['example.com'], finalTarget: null, truncated: false, error: 'network error' }, null);
  const report = buildReport(['example.com'], [result]);
  assert.equal(report.errors.length, 1);
  assert.equal(report.incomplete, true);
  assert.equal(report.findings.length, 0);
});

test('buildReport handles multiple hostnames independently', () => {
  const clean = classify('safe.example.com', { chain: ['safe.example.com'], finalTarget: null, truncated: false, error: null }, null);
  const confirmed = classify(
    'danger.example.com',
    { chain: ['danger.example.com', 'old-app.herokuapp.com'], finalTarget: 'old-app.herokuapp.com', truncated: false, error: null },
    { ok: true, status: 404, text: 'No such app', error: null },
  );
  const report = buildReport(['safe.example.com', 'danger.example.com'], [clean, confirmed]);
  assert.equal(report.hostnamesChecked, 2);
  assert.equal(report.confirmedCount, 1);
});

test('a provider in the middle of the chain counts: S3 bucket that resolves on to an internal S3 name (quality audit 2026-11-12)', () => {
  const chain = ['x.example.com', 'gone.s3.amazonaws.com', 's3-1-w.amazonaws.com', 's3-w.us-east-1.amazonaws.com'];
  const r = classify('x.example.com', { chain, finalTarget: chain[3], truncated: false, error: null },
    { ok: true, status: 404, text: '<Error><Code>NoSuchBucket</Code></Error>' });
  assert.equal(r.category, 'dangling-confirmed');
});

// Red-team gaps 2026-11-12.
test('a two-hop finding names the provider hostname as its target, not the checked hostname', () => {
  const cname = { chain: ['blog.example.com', 'old-app.herokuapp.com'], finalTarget: 'old-app.herokuapp.com', truncated: false, error: null };
  const confirmed = classify('blog.example.com', cname, { ok: true, status: 404, text: 'No such app', error: null });
  const unconfirmed = classify('blog.example.com', cname, null);
  const report = buildReport(['blog.example.com', 'blog.example.com'], [confirmed, unconfirmed]);
  assert.deepEqual(report.findings.map((f) => f.target), ['old-app.herokuapp.com', 'old-app.herokuapp.com']);
});

test('a report with no lookup error is not marked incomplete', () => {
  const report = buildReport(['example.com'], [
    classify('example.com', { chain: ['example.com'], finalTarget: null, truncated: false, error: null }, null),
  ]);
  assert.equal(report.incomplete, false);
  assert.equal(report.errors.length, 0);
});

// Real defects found 2026-11-12 (red team).
test('a finding names the chain hop that matched the provider, not an internal name after it', () => {
  // <bucket>.s3.amazonaws.com resolves on to an internal S3 name no pattern
  // matches; the name to reclaim (and the one the detail says matched) is the bucket's.
  const cname = {
    chain: ['assets.example.com', 'my-bucket.s3.amazonaws.com', 's3-w.us-east-1.amazonaws.com'],
    finalTarget: 's3-w.us-east-1.amazonaws.com', truncated: false, error: null,
  };
  const result = classify('assets.example.com', cname, { ok: true, status: 404, text: '<Code>NoSuchBucket</Code>', error: null });
  const [finding] = buildReport(['assets.example.com'], [result]).findings;
  assert.equal(finding.target, 'my-bucket.s3.amazonaws.com');
  assert.match(finding.detail, /my-bucket\.s3\.amazonaws\.com, which matches Amazon S3/);
  assert.match(finding.detail, /\(the chain then ends at s3-w\.us-east-1\.amazonaws\.com\)/);
});

test('verdictFor never reads a failed lookup as a clean result', () => {
  const failed = buildReport(['example.com'], [
    classify('example.com', { chain: ['example.com'], finalTarget: null, truncated: false, error: 'timed out' }, null),
  ]);
  const v = verdictFor(failed);
  assert.equal(v.clean, false);
  assert.equal(v.exitCode, 1);
  assert.match(v.text, /1 hostname\(s\) could not be looked up/);
  assert.doesNotMatch(v.text, /No subdomain-takeover risk found/);
});

test('verdictFor: clean, unconfirmed and confirmed reports', () => {
  const none = buildReport(['example.com'], [
    classify('example.com', { chain: ['example.com'], finalTarget: null, truncated: false, error: null }, null),
  ]);
  assert.deepEqual(verdictFor(none), { clean: true, exitCode: 0, text: 'No subdomain-takeover risk found (1 hostname(s) checked).' });
  const cname = { chain: ['blog.example.com', 'old-app.herokuapp.com'], finalTarget: 'old-app.herokuapp.com', truncated: false, error: null };
  const unconfirmed = buildReport(['blog.example.com'], [classify('blog.example.com', cname, null)]);
  assert.equal(verdictFor(unconfirmed).exitCode, 1);
  assert.match(verdictFor(unconfirmed).text, /^1 hostname\(s\) point at a takeover-prone provider, unconfirmed\.$/);
  const confirmed = buildReport(['blog.example.com'], [classify('blog.example.com', cname, { ok: true, status: 404, text: 'No such app', error: null })]);
  assert.match(verdictFor(confirmed).text, /^1 confirmed dangling CNAME\(s\) found\.$/);
});
