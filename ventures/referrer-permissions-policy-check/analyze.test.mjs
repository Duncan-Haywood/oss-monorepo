import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseReferrerPolicy,
  parsePermissionsPolicyDirective,
  parsePermissionsPolicy,
  buildReport,
} from './analyze.mjs';

function findingIds(report) {
  return report.findings.map((f) => f.id);
}

// -- parseReferrerPolicy -----------------------------------------------

test('parseReferrerPolicy splits and lowercases comma-separated tokens', () => {
  assert.deepEqual(parseReferrerPolicy('No-Referrer, Unsafe-URL'), ['no-referrer', 'unsafe-url']);
});

test('parseReferrerPolicy returns an empty array for an absent or blank header', () => {
  assert.deepEqual(parseReferrerPolicy(null), []);
  assert.deepEqual(parseReferrerPolicy(''), []);
  assert.deepEqual(parseReferrerPolicy('   '), []);
});

// -- parsePermissionsPolicyDirective ------------------------------------

test('parsePermissionsPolicyDirective reads a wildcard directive', () => {
  const d = parsePermissionsPolicyDirective('camera=*');
  assert.equal(d.name, 'camera');
  assert.equal(d.valid, true);
  assert.equal(d.kind, 'wildcard');
});

test('parsePermissionsPolicyDirective reads an empty allowlist as a valid deny-all', () => {
  const d = parsePermissionsPolicyDirective('camera=()');
  assert.equal(d.valid, true);
  assert.equal(d.kind, 'empty');
  assert.deepEqual(d.items, []);
});

test('parsePermissionsPolicyDirective reads self and quoted origins', () => {
  const d = parsePermissionsPolicyDirective('geolocation=(self "https://example.com")');
  assert.equal(d.valid, true);
  assert.equal(d.kind, 'list');
  assert.deepEqual(d.items, ['self', 'https://example.com']);
});

test('parsePermissionsPolicyDirective flags a bare, unparenthesised origin as invalid', () => {
  const d = parsePermissionsPolicyDirective('camera=self');
  assert.equal(d.valid, false);
  assert.equal(d.kind, 'invalid');
});

test('parsePermissionsPolicyDirective flags an unquoted origin inside parens as invalid', () => {
  const d = parsePermissionsPolicyDirective('camera=(https://example.com)');
  assert.equal(d.valid, false);
});

test('parsePermissionsPolicyDirective flags unbalanced parens as invalid', () => {
  const d = parsePermissionsPolicyDirective('camera=(self');
  assert.equal(d.valid, false);
});

test('parsePermissionsPolicyDirective flags a directive with no "=" as invalid', () => {
  const d = parsePermissionsPolicyDirective('camera');
  assert.equal(d.valid, false);
  assert.equal(d.kind, 'invalid');
});

// -- parsePermissionsPolicy (splitting) ---------------------------------

test('parsePermissionsPolicy splits on top-level commas only, not commas inside parens', () => {
  const directives = parsePermissionsPolicy('geolocation=(self "https://a.example.com"), camera=()');
  assert.equal(directives.length, 2);
  assert.equal(directives[0].name, 'geolocation');
  assert.equal(directives[1].name, 'camera');
});

test('parsePermissionsPolicy returns an empty array for an absent or blank header', () => {
  assert.deepEqual(parsePermissionsPolicy(null), []);
  assert.deepEqual(parsePermissionsPolicy(''), []);
});

// -- buildReport: Referrer-Policy ---------------------------------------

test('buildReport reports incomplete when the probe failed', () => {
  const report = buildReport('https://example.com/', { ok: false, error: 'timed out' });
  assert.equal(report.incomplete, true);
  assert.equal(report.ok, false);
  assert.deepEqual(report.findings, []);
});

test('referrer-policy-missing fires as a notice when the header is absent', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/', headers: {},
  });
  assert.ok(findingIds(report).includes('referrer-policy-missing'));
  assert.equal(report.findings.find((f) => f.id === 'referrer-policy-missing').severity, 'notice');
});

test('referrer-policy-unsafe-url fires as a danger finding', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/',
    headers: { 'referrer-policy': 'unsafe-url' },
  });
  assert.ok(findingIds(report).includes('referrer-policy-unsafe-url'));
  assert.equal(report.findings.find((f) => f.id === 'referrer-policy-unsafe-url').severity, 'danger');
  assert.equal(report.ok, false);
});

test('referrer-policy-invalid-value fires when no comma-separated token is recognised', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/',
    headers: { 'referrer-policy': 'always' },
  });
  assert.ok(findingIds(report).includes('referrer-policy-invalid-value'));
});

test('a recognised Referrer-Policy value among an unrecognised fallback list does not fire invalid-value', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/',
    headers: { 'referrer-policy': 'made-up-value, strict-origin-when-cross-origin' },
  });
  assert.ok(!findingIds(report).includes('referrer-policy-invalid-value'));
});

test('referrer-policy-legacy-downgrade fires as a notice, not a danger', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/',
    headers: { 'referrer-policy': 'no-referrer-when-downgrade' },
  });
  assert.ok(findingIds(report).includes('referrer-policy-legacy-downgrade'));
  assert.equal(report.findings.find((f) => f.id === 'referrer-policy-legacy-downgrade').severity, 'notice');
});

test('strict-origin-when-cross-origin produces no Referrer-Policy findings', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/',
    headers: {
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'camera=(), microphone=()',
    },
  });
  assert.ok(!findingIds(report).some((id) => id.startsWith('referrer-policy')));
});

// -- buildReport: Permissions-Policy / Feature-Policy --------------------

test('permissions-policy-missing fires as a notice when the header is absent', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/',
    headers: { 'referrer-policy': 'strict-origin-when-cross-origin' },
  });
  assert.ok(findingIds(report).includes('permissions-policy-missing'));
});

test('feature-policy-only fires when Feature-Policy is set but Permissions-Policy is not', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/',
    headers: { 'feature-policy': "camera 'self'" },
  });
  assert.ok(findingIds(report).includes('feature-policy-only'));
});

test('feature-policy-only does not fire when Permissions-Policy is also present', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/',
    headers: { 'feature-policy': "camera 'self'", 'permissions-policy': 'camera=(self)' },
  });
  assert.ok(!findingIds(report).includes('feature-policy-only'));
});

test('a wildcard on a sensitive feature fires as a danger finding, named per directive', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/',
    headers: { 'permissions-policy': 'camera=*, microphone=(self)' },
  });
  assert.ok(findingIds(report).includes('permissions-policy-wildcard:camera'));
  assert.ok(!findingIds(report).includes('permissions-policy-wildcard:microphone'));
  assert.equal(report.findings.find((f) => f.id === 'permissions-policy-wildcard:camera').severity, 'danger');
});

test('a wildcard on a non-sensitive feature does not fire the wildcard finding', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/',
    headers: { 'permissions-policy': 'fullscreen=*' },
  });
  assert.ok(!findingIds(report).some((id) => id.startsWith('permissions-policy-wildcard')));
});

test('a malformed directive fires a syntax-error danger finding, named per directive', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/',
    headers: { 'permissions-policy': 'camera=self, microphone=(self)' },
  });
  assert.ok(findingIds(report).includes('permissions-policy-syntax-error:camera'));
  assert.equal(report.findings.find((f) => f.id === 'permissions-policy-syntax-error:camera').severity, 'danger');
  assert.ok(!findingIds(report).includes('permissions-policy-syntax-error:microphone'));
});

test('a clean report with explicit, well-formed headers produces no findings', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/',
    headers: {
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'camera=(), microphone=(), geolocation=(self)',
    },
  });
  assert.deepEqual(report.findings, []);
  assert.equal(report.ok, true);
});

test('dangerCount and noticeCount are tallied separately, and a danger finding fails ok', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/',
    headers: { 'referrer-policy': 'unsafe-url', 'permissions-policy': 'camera=*' },
  });
  assert.equal(report.dangerCount, 2);
  assert.equal(report.ok, false);
});

test('buildReport echoes back the checked headers, normalised to null when absent', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 200, protocol: 'https:', path: '/',
    headers: { 'referrer-policy': 'strict-origin-when-cross-origin' },
  });
  assert.equal(report.probe.headers['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.equal(report.probe.headers['permissions-policy'], null);
  assert.equal(report.probe.headers['feature-policy'], null);
});
