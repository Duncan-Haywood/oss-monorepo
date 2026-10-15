import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCacheControl, buildReport } from './analyze.mjs';

function findingIds(report) {
  return report.findings.map((f) => f.id);
}

test('parseCacheControl reads boolean and valued directives, case-insensitively by name', () => {
  const cc = parseCacheControl('Public, Max-Age=3600, must-revalidate');
  assert.equal(cc.public, true);
  assert.equal(cc['max-age'], '3600');
  assert.equal(cc['must-revalidate'], true);
});

test('parseCacheControl returns an empty object for an absent or blank header', () => {
  assert.deepEqual(parseCacheControl(null), {});
  assert.deepEqual(parseCacheControl(''), {});
  assert.deepEqual(parseCacheControl('   '), {});
});

test('buildReport reports incomplete when the probe failed', () => {
  const report = buildReport('https://example.com/', { ok: false, error: 'timed out' });
  assert.equal(report.incomplete, true);
  assert.equal(report.ok, false);
  assert.deepEqual(report.findings, []);
});

test('vary-star fires as a danger finding', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/api/data',
    headers: { vary: '*' }, setCookie: [],
  });
  assert.deepEqual(findingIds(report), ['vary-star']);
  assert.equal(report.findings[0].severity, 'danger');
  assert.equal(report.ok, false);
});

test('a normal Vary list (not *) does not fire vary-star', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/api/data',
    headers: { vary: 'Accept-Encoding, Accept-Language', 'cache-control': 'public, max-age=60' }, setCookie: [],
  });
  assert.ok(!findingIds(report).includes('vary-star'));
});

test('public-with-set-cookie fires when Cache-Control: public accompanies a Set-Cookie header', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/dashboard',
    headers: { 'cache-control': 'public, max-age=300' },
    setCookie: ['session=abc123; Path=/'],
  });
  assert.deepEqual(findingIds(report), ['public-with-set-cookie']);
  assert.equal(report.findings[0].severity, 'danger');
  assert.equal(report.ok, false);
});

test('a private response with a Set-Cookie header does not fire public-with-set-cookie', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/dashboard',
    headers: { 'cache-control': 'private, max-age=300' },
    setCookie: ['session=abc123; Path=/'],
  });
  assert.ok(!findingIds(report).includes('public-with-set-cookie'));
});

test('a public response with no cookies does not fire public-with-set-cookie', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/',
    headers: { 'cache-control': 'public, max-age=300' },
    setCookie: [],
  });
  assert.ok(!findingIds(report).includes('public-with-set-cookie'));
});

test('no-store-with-max-age fires as a notice when both directives are present', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/secret',
    headers: { 'cache-control': 'no-store, max-age=0' }, setCookie: [],
  });
  assert.ok(findingIds(report).includes('no-store-with-max-age'));
  assert.equal(report.findings.find((f) => f.id === 'no-store-with-max-age').severity, 'notice');
  assert.equal(report.ok, true); // notices do not fail the overall verdict
});

test('no-store alone does not fire no-store-with-max-age', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/secret',
    headers: { 'cache-control': 'no-store' }, setCookie: [],
  });
  assert.ok(!findingIds(report).includes('no-store-with-max-age'));
});

test('expires-overridden-by-max-age fires when both Expires and Cache-Control max-age are present', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/page',
    headers: {
      'cache-control': 'public, max-age=600',
      expires: 'Wed, 21 Oct 2026 07:28:00 GMT',
      date: 'Wed, 21 Oct 2026 06:28:00 GMT',
    },
    setCookie: [],
  });
  assert.ok(findingIds(report).includes('expires-overridden-by-max-age'));
});

test('expires-before-date fires when Expires is at or before the response Date, with no max-age', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/page',
    headers: {
      expires: 'Wed, 21 Oct 2026 06:00:00 GMT',
      date: 'Wed, 21 Oct 2026 06:28:00 GMT',
    },
    setCookie: [],
  });
  assert.ok(findingIds(report).includes('expires-before-date'));
});

test('expires-before-date does not fire when Expires is safely in the future', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/page',
    headers: {
      expires: 'Wed, 21 Oct 2026 08:00:00 GMT',
      date: 'Wed, 21 Oct 2026 06:28:00 GMT',
    },
    setCookie: [],
  });
  assert.ok(!findingIds(report).includes('expires-before-date'));
});

test('weak-etag-with-range-support fires for a W/-prefixed ETag alongside Accept-Ranges: bytes', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/video.mp4',
    headers: { etag: 'W/"abc123"', 'accept-ranges': 'bytes' },
    setCookie: [],
  });
  assert.ok(findingIds(report).includes('weak-etag-with-range-support'));
});

test('a strong ETag with range support does not fire weak-etag-with-range-support', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/video.mp4',
    headers: { etag: '"abc123"', 'accept-ranges': 'bytes' },
    setCookie: [],
  });
  assert.ok(!findingIds(report).includes('weak-etag-with-range-support'));
});

test('a weak ETag with Accept-Ranges: none does not fire weak-etag-with-range-support', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/video.mp4',
    headers: { etag: 'W/"abc123"', 'accept-ranges': 'none' },
    setCookie: [],
  });
  assert.ok(!findingIds(report).includes('weak-etag-with-range-support'));
});

test('missing-cache-control-static-asset fires for a static-looking path with no caching headers', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/assets/app.js',
    headers: {}, setCookie: [],
  });
  assert.ok(findingIds(report).includes('missing-cache-control-static-asset'));
});

test('missing-cache-control-static-asset does not fire when Cache-Control is present', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/assets/app.js',
    headers: { 'cache-control': 'public, max-age=31536000, immutable' }, setCookie: [],
  });
  assert.ok(!findingIds(report).includes('missing-cache-control-static-asset'));
});

test('missing-cache-control-static-asset does not fire for a non-static path (e.g. an API route)', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/api/orders/42',
    headers: {}, setCookie: [],
  });
  assert.ok(!findingIds(report).includes('missing-cache-control-static-asset'));
});

test('missing-cache-control-static-asset ignores a query string when reading the extension', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/build/main.css?v=42',
    headers: {}, setCookie: [],
  });
  assert.ok(findingIds(report).includes('missing-cache-control-static-asset'));
});

test('a clean, well-cached static response produces no findings', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/assets/app.abc123.js',
    headers: { 'cache-control': 'public, max-age=31536000, immutable' },
    setCookie: [],
  });
  assert.deepEqual(report.findings, []);
  assert.equal(report.ok, true);
});

test('dangerCount and noticeCount are tallied separately, and a danger finding fails ok', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/dashboard',
    headers: { 'cache-control': 'public, no-store, max-age=60' },
    setCookie: ['session=abc; Path=/'],
  });
  assert.equal(report.dangerCount, 1);
  assert.equal(report.noticeCount, 1);
  assert.equal(report.ok, false);
});

test('buildReport echoes back the caching headers it read, normalised to null when absent', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/',
    headers: { 'cache-control': 'public, max-age=60' },
    setCookie: [],
  });
  assert.equal(report.probe.headers['cache-control'], 'public, max-age=60');
  assert.equal(report.probe.headers.vary, null);
  assert.equal(report.probe.headers.etag, null);
});

test('expires-before-date fires when Expires equals Date, and does not throw when Date is absent', () => {
  const base = { ok: true, status: 200, protocol: 'https:', path: '/', setCookie: [] };
  const same = buildReport('https://example.com/', {
    ...base, headers: { date: 'Wed, 01 Jan 2025 00:00:00 GMT', expires: 'Wed, 01 Jan 2025 00:00:00 GMT' },
  });
  assert.ok(findingIds(same).includes('expires-before-date'));
  const later = buildReport('https://example.com/', {
    ...base, headers: { date: 'Wed, 01 Jan 2025 00:00:00 GMT', expires: 'Wed, 01 Jan 2025 00:00:01 GMT' },
  });
  assert.ok(!findingIds(later).includes('expires-before-date'));
  const noDate = buildReport('https://example.com/', { ...base, headers: { expires: 'Wed, 01 Jan 2025 00:00:00 GMT' } });
  assert.ok(!findingIds(noDate).includes('expires-before-date'));
});

test('buildReport marks a successful probe as ok and a failed one as not ok in the echoed probe', () => {
  const good = buildReport('https://example.com/', { ok: true, headers: {}, setCookie: [] });
  assert.equal(good.probe.ok, true);
  assert.equal(good.ok, true);
  const bad = buildReport('https://example.com/', { ok: false, error: 'x' });
  assert.equal(bad.probe.ok, false);
});
