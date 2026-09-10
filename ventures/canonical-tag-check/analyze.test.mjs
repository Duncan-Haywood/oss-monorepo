import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from './analyze.mjs';

function page(overrides = {}) {
  return {
    requestedUrl: 'https://example.com/page/',
    finalUrl: 'https://example.com/page/',
    redirectCount: 0,
    ok: true,
    status: 200,
    error: null,
    xRobotsTag: null,
    metaRobots: null,
    canonicalLinks: [],
    ...overrides,
  };
}

test('a fetch failure is reported as incomplete with no findings', () => {
  const report = buildReport('https://example.com/', { ok: false, error: 'timed out' }, null);
  assert.equal(report.incomplete, true);
  assert.equal(report.ok, false);
  assert.deepEqual(report.findings, []);
});

test('no canonical tag at all is a notice', () => {
  const report = buildReport('https://example.com/page/', page({ canonicalLinks: [] }));
  assert.ok(report.findings.some((f) => f.id === 'no-canonical-tag' && f.severity === 'notice'));
  assert.equal(report.dangerCount, 0);
});

test('a clean self-referencing absolute canonical produces no findings', () => {
  const report = buildReport(
    'https://example.com/page/',
    page({ canonicalLinks: [{ href: 'https://example.com/page/', raw: '' }] }),
  );
  assert.deepEqual(report.findings, []);
  assert.equal(report.ok, true);
});

test('two canonical tags naming different URLs is a danger finding', () => {
  const report = buildReport(
    'https://example.com/page/',
    page({
      canonicalLinks: [
        { href: 'https://example.com/a/', raw: '' },
        { href: 'https://example.com/b/', raw: '' },
      ],
    }),
  );
  const finding = report.findings.find((f) => f.id === 'multiple-conflicting-canonical');
  assert.ok(finding);
  assert.equal(finding.severity, 'danger');
  assert.equal(report.ok, false);
});

test('two canonical tags naming the same URL (after trailing-slash normalization) is not flagged as conflicting', () => {
  const report = buildReport(
    'https://example.com/page/',
    page({
      canonicalLinks: [
        { href: 'https://example.com/page/', raw: '' },
        { href: 'https://example.com/page', raw: '' },
      ],
    }),
  );
  assert.ok(!report.findings.some((f) => f.id === 'multiple-conflicting-canonical'));
});

test('a relative canonical href is a notice', () => {
  const report = buildReport('https://example.com/page/', page({ canonicalLinks: [{ href: '/page/', raw: '' }] }));
  const finding = report.findings.find((f) => f.id === 'relative-canonical-url');
  assert.ok(finding);
  assert.equal(finding.severity, 'notice');
});

test('an absolute canonical is not flagged as relative', () => {
  const report = buildReport(
    'https://example.com/page/',
    page({ canonicalLinks: [{ href: 'https://example.com/page/', raw: '' }] }),
  );
  assert.ok(!report.findings.some((f) => f.id === 'relative-canonical-url'));
});

test('a protocol mismatch between the page and its canonical is a notice', () => {
  const report = buildReport(
    'https://example.com/page/',
    page({ canonicalLinks: [{ href: 'http://example.com/page/', raw: '' }] }),
  );
  const finding = report.findings.find((f) => f.id === 'protocol-mismatch-canonical');
  assert.ok(finding);
  assert.equal(finding.severity, 'notice');
});

test('a cross-domain canonical is a notice naming both hosts', () => {
  const report = buildReport(
    'https://example.com/page/',
    page({ canonicalLinks: [{ href: 'https://other-site.example/page/', raw: '' }] }),
  );
  const finding = report.findings.find((f) => f.id === 'cross-domain-canonical');
  assert.ok(finding);
  assert.equal(finding.severity, 'notice');
  assert.match(finding.evidence, /example\.com/);
  assert.match(finding.evidence, /other-site\.example/);
});

test('a subdomain canonical (same registrable domain) is not flagged as cross-domain', () => {
  const report = buildReport(
    'https://www.example.com/page/',
    page({ finalUrl: 'https://www.example.com/page/', canonicalLinks: [{ href: 'https://example.com/page/', raw: '' }] }),
  );
  assert.ok(!report.findings.some((f) => f.id === 'cross-domain-canonical'));
});

test('a two-label public suffix (github.io) is compared at the third label', () => {
  const report = buildReport(
    'https://duncan-haywood.github.io/page/',
    page({
      finalUrl: 'https://duncan-haywood.github.io/page/',
      canonicalLinks: [{ href: 'https://someone-else.github.io/page/', raw: '' }],
    }),
  );
  assert.ok(report.findings.some((f) => f.id === 'cross-domain-canonical'));
});

test('a canonical target that 404s is a danger finding', () => {
  const report = buildReport(
    'https://example.com/page/',
    page({ canonicalLinks: [{ href: 'https://example.com/elsewhere/', raw: '' }] }),
    { requestedUrl: 'https://example.com/elsewhere/', finalUrl: 'https://example.com/elsewhere/', ok: true, status: 404, redirectCount: 0, error: null, metaRobots: null, xRobotsTag: null },
  );
  const finding = report.findings.find((f) => f.id === 'canonical-target-unreachable');
  assert.ok(finding);
  assert.equal(finding.severity, 'danger');
  assert.equal(report.ok, false);
});

test('a canonical target that fails to fetch at all is a danger finding', () => {
  const report = buildReport(
    'https://example.com/page/',
    page({ canonicalLinks: [{ href: 'https://example.com/elsewhere/', raw: '' }] }),
    { requestedUrl: 'https://example.com/elsewhere/', finalUrl: 'https://example.com/elsewhere/', ok: false, status: null, redirectCount: 0, error: 'timed out', metaRobots: null, xRobotsTag: null },
  );
  assert.ok(report.findings.some((f) => f.id === 'canonical-target-unreachable'));
});

test('a canonical target reached through a redirect is a notice, not a danger', () => {
  const report = buildReport(
    'https://example.com/page/',
    page({ canonicalLinks: [{ href: 'https://example.com/elsewhere/', raw: '' }] }),
    { requestedUrl: 'https://example.com/elsewhere/', finalUrl: 'https://example.com/final/', ok: true, status: 200, redirectCount: 2, error: null, metaRobots: null, xRobotsTag: null },
  );
  const finding = report.findings.find((f) => f.id === 'canonical-target-redirects');
  assert.ok(finding);
  assert.equal(finding.severity, 'notice');
  assert.equal(report.ok, true);
});

test('a canonical target with no redirects is not flagged for redirecting', () => {
  const report = buildReport(
    'https://example.com/page/',
    page({ canonicalLinks: [{ href: 'https://example.com/elsewhere/', raw: '' }] }),
    { requestedUrl: 'https://example.com/elsewhere/', finalUrl: 'https://example.com/elsewhere/', ok: true, status: 200, redirectCount: 0, error: null, metaRobots: null, xRobotsTag: null },
  );
  assert.ok(!report.findings.some((f) => f.id === 'canonical-target-redirects'));
});

test('a canonical target marked noindex via meta robots is a danger finding', () => {
  const report = buildReport(
    'https://example.com/page/',
    page({ canonicalLinks: [{ href: 'https://example.com/elsewhere/', raw: '' }] }),
    { requestedUrl: 'https://example.com/elsewhere/', finalUrl: 'https://example.com/elsewhere/', ok: true, status: 200, redirectCount: 0, error: null, metaRobots: 'noindex, follow', xRobotsTag: null },
  );
  const finding = report.findings.find((f) => f.id === 'canonical-target-noindex');
  assert.ok(finding);
  assert.equal(finding.severity, 'danger');
  assert.match(finding.evidence, /noindex/);
});

test('a canonical target marked noindex via X-Robots-Tag is also a danger finding', () => {
  const report = buildReport(
    'https://example.com/page/',
    page({ canonicalLinks: [{ href: 'https://example.com/elsewhere/', raw: '' }] }),
    { requestedUrl: 'https://example.com/elsewhere/', finalUrl: 'https://example.com/elsewhere/', ok: true, status: 200, redirectCount: 0, error: null, metaRobots: null, xRobotsTag: 'noindex' },
  );
  assert.ok(report.findings.some((f) => f.id === 'canonical-target-noindex'));
});

test('a canonical target that is indexable produces no target-side findings', () => {
  const report = buildReport(
    'https://example.com/page/',
    page({ canonicalLinks: [{ href: 'https://example.com/elsewhere/', raw: '' }] }),
    { requestedUrl: 'https://example.com/elsewhere/', finalUrl: 'https://example.com/elsewhere/', ok: true, status: 200, redirectCount: 0, error: null, metaRobots: 'index, follow', xRobotsTag: null },
  );
  assert.ok(!report.findings.some((f) => f.id.startsWith('canonical-target-')));
});

test('dangerCount and noticeCount are counted correctly across a mixed report', () => {
  const report = buildReport(
    'https://example.com/page/',
    page({ canonicalLinks: [{ href: 'http://other.example/page', raw: '' }] }),
  );
  assert.equal(report.dangerCount, 0);
  assert.ok(report.noticeCount >= 2, 'expected both protocol-mismatch and cross-domain notices');
  assert.equal(report.ok, true, 'notices alone do not fail the report');
});
