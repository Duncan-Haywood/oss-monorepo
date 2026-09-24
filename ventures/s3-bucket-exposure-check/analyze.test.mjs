import test from 'node:test';
import assert from 'node:assert/strict';
import { extractKeys, extractGroupGrants, buildReport } from './analyze.mjs';

const LISTING_XML =
  '<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>demo</Name>' +
  '<Contents><Key>backup-2026-01.sql</Key></Contents>' +
  '<Contents><Key>customer-export.csv</Key></Contents></ListBucketResult>';

const ACCESS_DENIED_XML = '<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>';
const NO_SUCH_BUCKET_XML = '<Error><Code>NoSuchBucket</Code></Error>';

function grantXml(...grants) {
  const body = grants
    .map(({ uri, permission }) => `<Grant><Grantee><URI>${uri}</URI></Grantee><Permission>${permission}</Permission></Grant>`)
    .join('');
  return `<AccessControlPolicy><Owner/><AccessControlList>${body}</AccessControlList></AccessControlPolicy>`;
}

const ALL_USERS = 'http://acs.amazonaws.com/groups/global/AllUsers';
const AUTH_USERS = 'http://acs.amazonaws.com/groups/global/AuthenticatedUsers';

test('extractKeys returns key names only, in order', () => {
  assert.deepEqual(extractKeys(LISTING_XML), ['backup-2026-01.sql', 'customer-export.csv']);
});

test('extractKeys never returns anything for non-XML or empty input', () => {
  assert.deepEqual(extractKeys(''), []);
  assert.deepEqual(extractKeys(null), []);
  assert.deepEqual(extractKeys('not xml at all'), []);
});

test('extractGroupGrants ignores canonical-user (individual account) grants', () => {
  const xml =
    '<AccessControlPolicy><AccessControlList>' +
    '<Grant><Grantee><ID>abc123</ID></Grantee><Permission>FULL_CONTROL</Permission></Grant>' +
    '</AccessControlList></AccessControlPolicy>';
  const { allUsers, authenticatedUsers } = extractGroupGrants(xml);
  assert.deepEqual(allUsers, []);
  assert.deepEqual(authenticatedUsers, []);
});

test('extractGroupGrants finds an AllUsers grant', () => {
  const { allUsers } = extractGroupGrants(grantXml({ uri: ALL_USERS, permission: 'READ' }));
  assert.deepEqual(allUsers, ['READ']);
});

test('extractGroupGrants finds an AuthenticatedUsers grant separately from AllUsers', () => {
  const { allUsers, authenticatedUsers } = extractGroupGrants(
    grantXml({ uri: AUTH_USERS, permission: 'READ' }),
  );
  assert.deepEqual(allUsers, []);
  assert.deepEqual(authenticatedUsers, ['READ']);
});

test('buildReport with a clean private bucket (both requests denied) is ok', () => {
  const report = buildReport('demo', {
    listing: { ok: false, status: 403, text: ACCESS_DENIED_XML, error: 'HTTP 403' },
    acl: { ok: false, status: 403, text: ACCESS_DENIED_XML, error: 'HTTP 403' },
  });
  assert.equal(report.ok, true);
  assert.equal(report.findings.length, 0);
  assert.equal(report.blockedCount, 2);
});

test('buildReport flags public-list when the listing succeeds', () => {
  const report = buildReport('demo', {
    listing: { ok: true, status: 200, text: LISTING_XML, error: null },
    acl: { ok: false, status: 403, text: ACCESS_DENIED_XML, error: 'HTTP 403' },
  });
  assert.equal(report.ok, false);
  const finding = report.findings.find((f) => f.id === 'public-list');
  assert.ok(finding);
  assert.equal(finding.severity, 'critical');
  assert.deepEqual(finding.sampleKeys, ['backup-2026-01.sql', 'customer-export.csv']);
});

test('buildReport flags public-write-acl for a WRITE grant to AllUsers', () => {
  const report = buildReport('demo', {
    listing: { ok: false, status: 403, text: ACCESS_DENIED_XML, error: 'HTTP 403' },
    acl: { ok: true, status: 200, text: grantXml({ uri: ALL_USERS, permission: 'WRITE' }), error: null },
  });
  const finding = report.findings.find((f) => f.id === 'public-write-acl');
  assert.ok(finding);
  assert.equal(finding.severity, 'critical');
});

test('buildReport flags public-read-acl for a READ grant to AllUsers, separate from write', () => {
  const report = buildReport('demo', {
    listing: { ok: false, status: 403, text: ACCESS_DENIED_XML, error: 'HTTP 403' },
    acl: { ok: true, status: 200, text: grantXml({ uri: ALL_USERS, permission: 'READ' }), error: null },
  });
  assert.ok(report.findings.find((f) => f.id === 'public-read-acl'));
  assert.ok(!report.findings.find((f) => f.id === 'public-write-acl'));
});

test('buildReport flags authenticated-users-grant separately from AllUsers findings', () => {
  const report = buildReport('demo', {
    listing: { ok: false, status: 403, text: ACCESS_DENIED_XML, error: 'HTTP 403' },
    acl: { ok: true, status: 200, text: grantXml({ uri: AUTH_USERS, permission: 'READ' }), error: null },
  });
  const finding = report.findings.find((f) => f.id === 'authenticated-users-grant');
  assert.ok(finding);
  assert.equal(finding.severity, 'danger');
});

test('buildReport can report both public-list and a public-write-acl at once', () => {
  const report = buildReport('demo', {
    listing: { ok: true, status: 200, text: LISTING_XML, error: null },
    acl: { ok: true, status: 200, text: grantXml({ uri: ALL_USERS, permission: 'FULL_CONTROL' }), error: null },
  });
  // FULL_CONTROL on AllUsers satisfies both the write and read permission
  // sets, so it is correctly reported as three distinct critical findings
  // (public-list, public-write-acl, public-read-acl) rather than merged --
  // each names different evidence and a reader fixing only one should not
  // be told the others are already covered.
  assert.equal(report.criticalCount, 3);
  assert.ok(report.findings.find((f) => f.id === 'public-list'));
  assert.ok(report.findings.find((f) => f.id === 'public-write-acl'));
  assert.ok(report.findings.find((f) => f.id === 'public-read-acl'));
});

test('buildReport reports not-found for a NoSuchBucket response and no findings', () => {
  const report = buildReport('nope-not-real', {
    listing: { ok: false, status: 404, text: NO_SUCH_BUCKET_XML, error: 'HTTP 404' },
    acl: { ok: false, status: 404, text: NO_SUCH_BUCKET_XML, error: 'HTTP 404' },
  });
  assert.equal(report.notFound, true);
  assert.equal(report.findings.length, 0);
  assert.equal(report.ok, true);
});

test('buildReport reports an error, never a finding, for an unclassifiable response', () => {
  const report = buildReport('demo', {
    listing: { ok: false, status: null, text: null, error: 'network timeout' },
    acl: { ok: false, status: 403, text: ACCESS_DENIED_XML, error: 'HTTP 403' },
  });
  assert.equal(report.incomplete, true);
  assert.equal(report.findings.length, 0);
  assert.equal(report.errors[0], 'network timeout');
});

test('a finding never carries anything but key NAMES -- no object content field exists anywhere', () => {
  const report = buildReport('demo', {
    listing: { ok: true, status: 200, text: LISTING_XML, error: null },
    acl: { ok: false, status: 403, text: ACCESS_DENIED_XML, error: 'HTTP 403' },
  });
  const finding = report.findings.find((f) => f.id === 'public-list');
  assert.deepEqual(Object.keys(finding).sort(), ['detail', 'id', 'sampleKeys', 'severity', 'title']);
});
