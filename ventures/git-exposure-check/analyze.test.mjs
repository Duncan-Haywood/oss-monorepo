import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, looksLikeGitHead, looksLikeGitConfig } from './analyze.mjs';

function probeResult(overrides = {}) {
  return {
    ok: true,
    status: 404,
    url: 'https://example.com/.git/HEAD',
    bodySample: 'Not Found',
    truncated: false,
    error: null,
    ...overrides,
  };
}

// --- looksLikeGitHead ------------------------------------------------------

test('looksLikeGitHead accepts the ordinary symbolic-ref form', () => {
  assert.equal(looksLikeGitHead('ref: refs/heads/main\n'), true);
  assert.equal(looksLikeGitHead('ref: refs/heads/feature/some-branch'), true);
});

test('looksLikeGitHead accepts a detached-HEAD 40-hex-char SHA', () => {
  // SHA-1 of the empty string -- a real, well-known 40-hex-char commit id.
  assert.equal(looksLikeGitHead('da39a3ee5e6b4b0d3255bfef95601890afd80709\n'), true);
});

test('looksLikeGitHead rejects an HTML error page even when it returns 200', () => {
  assert.equal(looksLikeGitHead('<html><body>404 Not Found</body></html>'), false);
});

test('looksLikeGitHead rejects an empty or near-miss body', () => {
  assert.equal(looksLikeGitHead(''), false);
  assert.equal(looksLikeGitHead('ref: not-a-real-ref-path'), false);
  assert.equal(looksLikeGitHead('a1b2c3'), false); // too short to be a SHA
});

// --- looksLikeGitConfig -----------------------------------------------------

test('looksLikeGitConfig accepts a real git config opening section', () => {
  assert.equal(looksLikeGitConfig('[core]\n\trepositoryformatversion = 0\n'), true);
});

test('looksLikeGitConfig rejects content with no [core] section', () => {
  assert.equal(looksLikeGitConfig('<html>nope</html>'), false);
  assert.equal(looksLikeGitConfig(''), false);
});

// --- buildReport -------------------------------------------------------------

test('both HEAD and config matching produces the combined danger finding', () => {
  const report = buildReport('https://example.com/', {
    head: probeResult({ status: 200, bodySample: 'ref: refs/heads/main\n' }),
    config: probeResult({ status: 200, bodySample: '[core]\n\trepositoryformatversion = 0\n', url: 'https://example.com/.git/config' }),
  });
  assert.equal(report.ok, false);
  assert.equal(report.dangerCount, 1);
  assert.equal(report.findings[0].id, 'git-directory-exposed');
});

test('HEAD matching alone (config not confirming) still raises a danger finding', () => {
  const report = buildReport('https://example.com/', {
    head: probeResult({ status: 200, bodySample: 'ref: refs/heads/main\n' }),
    config: probeResult({ status: 403, bodySample: 'Forbidden' }),
  });
  assert.equal(report.ok, false);
  assert.equal(report.findings[0].id, 'git-head-exposed');
});

test('config matching alone (HEAD not confirming) still raises a danger finding', () => {
  const report = buildReport('https://example.com/', {
    head: probeResult({ status: 403, bodySample: 'Forbidden' }),
    config: probeResult({ status: 200, bodySample: '[core]\n\trepositoryformatversion = 0\n' }),
  });
  assert.equal(report.ok, false);
  assert.equal(report.findings[0].id, 'git-config-exposed');
});

test('a 404 on both paths is a clean report with no findings', () => {
  const report = buildReport('https://example.com/', {
    head: probeResult({ status: 404, bodySample: 'Not Found' }),
    config: probeResult({ status: 404, bodySample: 'Not Found' }),
  });
  assert.equal(report.ok, true);
  assert.equal(report.dangerCount, 0);
  assert.equal(report.findings.length, 0);
});

test('a soft-404 (200 status, generic HTML body) is NOT reported as exposed', () => {
  const report = buildReport('https://example.com/', {
    head: probeResult({ status: 200, bodySample: '<html><body>Page not found</body></html>' }),
    config: probeResult({ status: 200, bodySample: '<html><body>Page not found</body></html>' }),
  });
  assert.equal(report.ok, true);
  assert.equal(report.dangerCount, 0);
  assert.equal(report.findings.length, 0, 'a status-200 error page must not be classified as exposure');
});

test('a 403 (blocked) is a clean report, not a finding', () => {
  const report = buildReport('https://example.com/', {
    head: probeResult({ status: 403, bodySample: 'Forbidden' }),
    config: probeResult({ status: 403, bodySample: 'Forbidden' }),
  });
  assert.equal(report.ok, true);
  assert.equal(report.findings.length, 0);
});

test('both probes failing at the network level is incomplete, not a clean report', () => {
  const report = buildReport('https://example.com/', {
    head: probeResult({ ok: false, status: null, bodySample: '', error: 'timed out' }),
    config: probeResult({ ok: false, status: null, bodySample: '', error: 'timed out' }),
  });
  assert.equal(report.incomplete, true);
  assert.equal(report.ok, false);
  assert.equal(report.findings.length, 0);
});

test('one probe failing while the other succeeds is not incomplete', () => {
  const report = buildReport('https://example.com/', {
    head: probeResult({ ok: false, status: null, bodySample: '', error: 'timed out' }),
    config: probeResult({ ok: true, status: 404, bodySample: 'Not Found' }),
  });
  assert.equal(report.incomplete, false);
  assert.equal(report.ok, true);
});

test('a missing probe object does not throw', () => {
  assert.doesNotThrow(() => buildReport('https://example.com/', {}));
  assert.doesNotThrow(() => buildReport('https://example.com/', null));
  const report = buildReport('https://example.com/', null);
  // Neither head nor config was ever an explicit `ok:false` probe result, so
  // this reads as "nothing to report" rather than "the network failed" --
  // matching buildReport's own `p.ok !== false` default (see probeSummary).
  assert.equal(report.findings.length, 0);
});
