import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSetCookieHeader, buildReport } from './analyze.mjs';

test('parseSetCookieHeader reads the name, value, and attributes', () => {
  const cookie = parseSetCookieHeader('sid=abc123; Path=/; HttpOnly; Secure; SameSite=Lax');
  assert.equal(cookie.name, 'sid');
  assert.equal(cookie.value, 'abc123');
  assert.equal(cookie.attrs.path, '/');
  assert.equal(cookie.attrs.httponly, true);
  assert.equal(cookie.attrs.secure, true);
  assert.equal(cookie.attrs.samesite, 'Lax');
});

test('parseSetCookieHeader does not split on the comma inside an Expires date', () => {
  const cookie = parseSetCookieHeader('sid=abc123; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/');
  // The raw string handed in is already one whole Set-Cookie value -- Node's
  // http client never joins multiple headers before this module sees them --
  // so the comma inside Expires must stay inside the attribute, not be read
  // as a second cookie or a truncated one.
  assert.equal(cookie.name, 'sid');
  assert.equal(cookie.attrs.expires, 'Wed, 21 Oct 2026 07:28:00 GMT');
});

test('parseSetCookieHeader handles a cookie with no attributes at all', () => {
  const cookie = parseSetCookieHeader('theme=dark');
  assert.equal(cookie.name, 'theme');
  assert.equal(cookie.value, 'dark');
  assert.deepEqual(cookie.attrs, {});
});

function httpsProbe(setCookie) {
  return { ok: true, status: 200, protocol: 'https:', setCookie, error: null };
}

test('buildReport is incomplete and finding-free when the probe failed', () => {
  const report = buildReport('https://example.com/', { ok: false, error: 'timed out' });
  assert.equal(report.incomplete, true);
  assert.equal(report.ok, false);
  assert.deepEqual(report.findings, []);
  assert.equal(report.probe.error, 'timed out');
});

test('buildReport with no Set-Cookie header at all produces no findings', () => {
  const report = buildReport('https://example.com/', httpsProbe([]));
  assert.equal(report.ok, true);
  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.cookies, []);
});

test('SameSite=None without Secure is a danger finding', () => {
  const report = buildReport('https://example.com/', httpsProbe(['sid=abc; SameSite=None']));
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((f) => f.id === 'samesite-none-without-secure' && f.severity === 'danger'));
});

test('SameSite=None with Secure present is not flagged for that pattern', () => {
  const report = buildReport('https://example.com/', httpsProbe(['sid=abc; SameSite=None; Secure; HttpOnly']));
  assert.ok(!report.findings.some((f) => f.id === 'samesite-none-without-secure'));
});

test('SameSite=None is case-insensitively recognised', () => {
  const report = buildReport('https://example.com/', httpsProbe(['sid=abc; samesite=none']));
  assert.ok(report.findings.some((f) => f.id === 'samesite-none-without-secure'));
});

test('a __Host- cookie missing Secure, with a Domain, and a non-root Path fails all three checks in one finding', () => {
  const report = buildReport('https://example.com/', httpsProbe(['__Host-session=abc; Domain=example.com; Path=/app']));
  const finding = report.findings.find((f) => f.id === 'host-prefix-violated');
  assert.ok(finding, 'expected a host-prefix-violated finding');
  assert.equal(finding.severity, 'danger');
  assert.match(finding.detail, /no Secure attribute/);
  assert.match(finding.title, /__Host-session/);
});

test('a correctly formed __Host- cookie is not flagged', () => {
  const report = buildReport('https://example.com/', httpsProbe(['__Host-session=abc; Path=/; Secure; HttpOnly; SameSite=Strict']));
  assert.ok(!report.findings.some((f) => f.id === 'host-prefix-violated'));
  assert.equal(report.ok, true);
});

test('a __Secure- cookie missing Secure is a danger finding, and is not double-counted as missing-secure', () => {
  const report = buildReport('https://example.com/', httpsProbe(['__Secure-token=abc; HttpOnly; SameSite=Strict']));
  assert.ok(report.findings.some((f) => f.id === 'secure-prefix-violated'));
  assert.ok(!report.findings.some((f) => f.id === 'missing-secure'), 'the prefix finding already covers the missing Secure attribute');
});

test('a correctly formed __Secure- cookie is not flagged for the prefix rule', () => {
  const report = buildReport('https://example.com/', httpsProbe(['__Secure-token=abc; Secure; HttpOnly; SameSite=Strict']));
  assert.ok(!report.findings.some((f) => f.id === 'secure-prefix-violated'));
});

test('missing Secure on HTTPS (ordinary cookie name) is a notice', () => {
  const report = buildReport('https://example.com/', httpsProbe(['sid=abc; HttpOnly; SameSite=Lax']));
  const finding = report.findings.find((f) => f.id === 'missing-secure');
  assert.ok(finding);
  assert.equal(finding.severity, 'notice');
});

test('missing Secure is not flagged on a plain HTTP response', () => {
  const report = buildReport('http://example.com/', { ok: true, status: 200, protocol: 'http:', setCookie: ['sid=abc; HttpOnly; SameSite=Lax'], error: null });
  assert.ok(!report.findings.some((f) => f.id === 'missing-secure'));
});

test('missing HttpOnly is a notice', () => {
  const report = buildReport('https://example.com/', httpsProbe(['sid=abc; Secure; SameSite=Lax']));
  const finding = report.findings.find((f) => f.id === 'missing-httponly');
  assert.ok(finding);
  assert.equal(finding.severity, 'notice');
});

test('missing SameSite entirely is a notice', () => {
  const report = buildReport('https://example.com/', httpsProbe(['sid=abc; Secure; HttpOnly']));
  const finding = report.findings.find((f) => f.id === 'missing-samesite');
  assert.ok(finding);
  assert.equal(finding.severity, 'notice');
});

test('a fully correct cookie produces no findings at all', () => {
  const report = buildReport('https://example.com/', httpsProbe(['sid=abc; Secure; HttpOnly; SameSite=Lax; Path=/']));
  assert.deepEqual(report.findings, []);
  assert.equal(report.ok, true);
  assert.equal(report.dangerCount, 0);
  assert.equal(report.noticeCount, 0);
});

test('multiple cookies on one response are each classified independently', () => {
  const report = buildReport(
    'https://example.com/',
    httpsProbe(['good=1; Secure; HttpOnly; SameSite=Lax', 'bad=2; SameSite=None']),
  );
  assert.equal(report.cookies.length, 2);
  assert.equal(report.dangerCount, 1);
  assert.ok(report.findings.some((f) => f.id === 'samesite-none-without-secure'));
});

test('dangerCount and noticeCount reflect severities across all cookies', () => {
  const report = buildReport(
    'https://example.com/',
    httpsProbe(['a=1; SameSite=None', 'b=2']),
    // a: danger (samesite-none-without-secure) + notice (missing-secure) + notice (missing-httponly)
    // b: notice (missing-secure) + notice (missing-httponly) + notice (missing-samesite)
  );
  assert.equal(report.dangerCount, 1);
  assert.equal(report.noticeCount, 5);
  assert.equal(report.ok, false);
});
