import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, buildReport } from './analyze.mjs';

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
