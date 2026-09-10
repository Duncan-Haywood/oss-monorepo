import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, parseCsp } from './analyze.mjs';

function probe(overrides = {}) {
  return {
    ok: true,
    status: 200,
    protocol: 'https:',
    headers: {
      'content-security-policy': null,
      'content-security-policy-report-only': null,
      'x-frame-options': null,
      'strict-transport-security': null,
      ...overrides,
    },
    error: null,
  };
}

function findingIds(report) {
  return report.findings.map((f) => f.id);
}

// --- parseCsp -----------------------------------------------------------

test('parseCsp splits directives on ; and tokens on whitespace, lowercased', () => {
  const csp = parseCsp("default-src 'self'; Script-Src 'self' 'unsafe-inline'  https://cdn.example.com");
  assert.deepEqual(csp.get('default-src'), ["'self'"]);
  assert.deepEqual(csp.get('script-src'), ["'self'", "'unsafe-inline'", 'https://cdn.example.com']);
});

test('parseCsp keeps only the first occurrence of a duplicated directive', () => {
  const csp = parseCsp("script-src 'self'; script-src *");
  assert.deepEqual(csp.get('script-src'), ["'self'"]);
});

test('parseCsp returns an empty map for a blank or missing header', () => {
  assert.equal(parseCsp('').size, 0);
  assert.equal(parseCsp(null).size, 0);
  assert.equal(parseCsp(undefined).size, 0);
});

// --- incomplete probe -----------------------------------------------------

test('a failed probe produces no findings and is marked incomplete', () => {
  const report = buildReport('https://example.com/', { ok: false, error: 'timed out' });
  assert.equal(report.incomplete, true);
  assert.equal(report.ok, false);
  assert.deepEqual(report.findings, []);
});

// --- clickjacking / frame protection --------------------------------------

test('missing-frame-protection fires when neither frame-ancestors nor X-Frame-Options is present', () => {
  const report = buildReport('https://example.com/', probe());
  assert.ok(findingIds(report).includes('missing-frame-protection'));
});

test('no frame finding when X-Frame-Options: DENY is present', () => {
  const report = buildReport('https://example.com/', probe({ 'x-frame-options': 'DENY' }));
  assert.ok(!findingIds(report).includes('missing-frame-protection'));
  assert.ok(!findingIds(report).includes('frame-options-allow-from-ignored'));
});

test('no frame finding when X-Frame-Options: SAMEORIGIN is present', () => {
  const report = buildReport('https://example.com/', probe({ 'x-frame-options': 'SAMEORIGIN' }));
  assert.ok(!findingIds(report).includes('missing-frame-protection'));
});

test('frame-options-allow-from-ignored fires for ALLOW-FROM with no CSP frame-ancestors', () => {
  const report = buildReport(
    'https://example.com/',
    probe({ 'x-frame-options': 'ALLOW-FROM https://partner.example.com' }),
  );
  assert.ok(findingIds(report).includes('frame-options-allow-from-ignored'));
  assert.equal(report.findings.find((f) => f.id === 'frame-options-allow-from-ignored').severity, 'danger');
});

test('frame-ancestors present overrides everything, even with ALLOW-FROM also set', () => {
  const report = buildReport(
    'https://example.com/',
    probe({
      'content-security-policy': "frame-ancestors 'self'",
      'x-frame-options': 'ALLOW-FROM https://partner.example.com',
    }),
  );
  assert.ok(!findingIds(report).includes('missing-frame-protection'));
  assert.ok(!findingIds(report).includes('frame-options-allow-from-ignored'));
});

test('frame-ancestors alone (no X-Frame-Options at all) is protected', () => {
  const report = buildReport(
    'https://example.com/',
    probe({ 'content-security-policy': "default-src 'self'; frame-ancestors 'none'" }),
  );
  assert.ok(!findingIds(report).includes('missing-frame-protection'));
});

test('default-src alone does NOT protect against clickjacking (no fallback for frame-ancestors)', () => {
  const report = buildReport('https://example.com/', probe({ 'content-security-policy': "default-src 'self'" }));
  assert.ok(findingIds(report).includes('missing-frame-protection'));
});

// --- CSP presence / report-only -------------------------------------------

test('missing-csp fires when neither CSP header is present', () => {
  const report = buildReport('https://example.com/', probe({ 'x-frame-options': 'DENY' }));
  assert.ok(findingIds(report).includes('missing-csp'));
});

test('csp-report-only-not-enforced fires when only the report-only header is set', () => {
  const report = buildReport(
    'https://example.com/',
    probe({ 'x-frame-options': 'DENY', 'content-security-policy-report-only': "default-src 'self'" }),
  );
  assert.ok(findingIds(report).includes('csp-report-only-not-enforced'));
  assert.ok(!findingIds(report).includes('missing-csp'));
});

test('neither missing-csp nor report-only-not-enforced fires when an enforcing CSP is present', () => {
  const report = buildReport(
    'https://example.com/',
    probe({ 'content-security-policy': "default-src 'self'; frame-ancestors 'self'" }),
  );
  assert.ok(!findingIds(report).includes('missing-csp'));
  assert.ok(!findingIds(report).includes('csp-report-only-not-enforced'));
});

// --- unsafe-inline ----------------------------------------------------------

test("csp-unsafe-inline-script fires when script-src allows 'unsafe-inline' with no nonce/hash", () => {
  const report = buildReport(
    'https://example.com/',
    probe({ 'content-security-policy': "frame-ancestors 'self'; script-src 'self' 'unsafe-inline'" }),
  );
  assert.ok(findingIds(report).includes('csp-unsafe-inline-script'));
});

test("csp-unsafe-inline-script does NOT fire when a nonce is also present", () => {
  const report = buildReport(
    'https://example.com/',
    probe({
      'content-security-policy':
        "frame-ancestors 'self'; script-src 'self' 'unsafe-inline' 'nonce-abc123DEF'",
    }),
  );
  assert.ok(!findingIds(report).includes('csp-unsafe-inline-script'));
});

test("csp-unsafe-inline-script does NOT fire when a hash source is also present", () => {
  const report = buildReport(
    'https://example.com/',
    probe({
      'content-security-policy':
        "frame-ancestors 'self'; script-src 'self' 'unsafe-inline' 'sha256-abc123=='",
    }),
  );
  assert.ok(!findingIds(report).includes('csp-unsafe-inline-script'));
});

test("csp-unsafe-inline-script checks default-src when script-src is absent", () => {
  const report = buildReport(
    'https://example.com/',
    probe({ 'content-security-policy': "frame-ancestors 'self'; default-src 'self' 'unsafe-inline'" }),
  );
  const finding = report.findings.find((f) => f.id === 'csp-unsafe-inline-script');
  assert.ok(finding);
  assert.match(finding.title, /default-src/);
});

test('no unsafe-inline finding on a policy with no unsafe-inline at all', () => {
  const report = buildReport(
    'https://example.com/',
    probe({ 'content-security-policy': "frame-ancestors 'self'; script-src 'self'" }),
  );
  assert.ok(!findingIds(report).includes('csp-unsafe-inline-script'));
});

// --- wildcard script-src ----------------------------------------------------

for (const token of ['*', 'https:', 'http:', 'data:']) {
  test(`csp-wildcard-script-src fires for a bare "${token}" token in script-src`, () => {
    const report = buildReport(
      'https://example.com/',
      probe({ 'content-security-policy': `frame-ancestors 'self'; script-src 'self' ${token}` }),
    );
    assert.ok(findingIds(report).includes('csp-wildcard-script-src'));
  });
}

test('csp-wildcard-script-src does not fire for a specific host, even with a wildcard subdomain', () => {
  const report = buildReport(
    'https://example.com/',
    probe({ 'content-security-policy': "frame-ancestors 'self'; script-src 'self' https://*.cdn.example.com" }),
  );
  assert.ok(!findingIds(report).includes('csp-wildcard-script-src'));
});

// --- HSTS --------------------------------------------------------------------

test('missing-hsts fires on an https response with no Strict-Transport-Security', () => {
  const report = buildReport('https://example.com/', probe({ 'x-frame-options': 'DENY' }));
  assert.ok(findingIds(report).includes('missing-hsts'));
});

test('missing-hsts does not fire when the header is present', () => {
  const report = buildReport(
    'https://example.com/',
    probe({ 'x-frame-options': 'DENY', 'strict-transport-security': 'max-age=63072000; includeSubDomains' }),
  );
  assert.ok(!findingIds(report).includes('missing-hsts'));
});

test('missing-hsts does not fire on a plain http response', () => {
  const clean = buildReport('http://example.com/', {
    ok: true, status: 200, protocol: 'http:',
    headers: { 'x-frame-options': 'DENY', 'content-security-policy': null, 'content-security-policy-report-only': null, 'strict-transport-security': null },
    error: null,
  });
  assert.ok(!findingIds(clean).includes('missing-hsts'));
});

// --- overall counts / ok ------------------------------------------------------

test('a fully hardened response produces zero findings and ok: true', () => {
  const report = buildReport(
    'https://example.com/',
    probe({
      'content-security-policy': "default-src 'self'; frame-ancestors 'self'; script-src 'self' 'nonce-abc123DEF'",
      'x-frame-options': 'SAMEORIGIN',
      'strict-transport-security': 'max-age=63072000',
    }),
  );
  assert.deepEqual(report.findings, []);
  assert.equal(report.dangerCount, 0);
  assert.equal(report.noticeCount, 0);
  assert.equal(report.ok, true);
});

test('a maximally weak response produces multiple danger findings and ok: false', () => {
  const report = buildReport(
    'https://example.com/',
    probe({
      'content-security-policy': "script-src 'unsafe-inline' *",
      'x-frame-options': 'ALLOW-FROM https://partner.example.com',
    }),
  );
  assert.ok(report.dangerCount >= 3);
  assert.equal(report.ok, false);
});
