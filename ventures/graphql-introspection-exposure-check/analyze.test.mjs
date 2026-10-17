import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from './analyze.mjs';

function schemaProbe(schema, { status = 200 } = {}) {
  return { ok: true, status, error: null, parseError: null, body: { data: { __schema: schema } } };
}

test('a network failure produces an incomplete report, not a crash', () => {
  const report = buildReport('https://api.example.com/graphql', { ok: false, error: 'timeout' });
  assert.equal(report.incomplete, true);
  assert.equal(report.introspectionEnabled, null);
  assert.equal(report.ok, false);
  assert.equal(report.error, 'timeout');
});

test('no probe result at all is handled the same way', () => {
  const report = buildReport('https://api.example.com/graphql', null);
  assert.equal(report.incomplete, true);
  assert.equal(report.ok, false);
});

test('a GraphQL error explicitly naming introspection is a clean, complete report', () => {
  const probe = { ok: true, status: 400, error: null, parseError: null, body: { errors: [{ message: 'GraphQL introspection is not allowed, but the query contained __schema' }] } };
  const report = buildReport('https://api.example.com/graphql', probe);
  assert.equal(report.introspectionEnabled, false);
  assert.equal(report.incomplete, false);
  assert.equal(report.introspectionBlockedExplicitly, true);
  assert.equal(report.ok, true);
  assert.equal(report.dangerCount, 0);
});

test('a GraphQL error not mentioning introspection is still a clean, complete report', () => {
  const probe = { ok: true, status: 400, error: null, parseError: null, body: { errors: [{ message: 'Syntax Error: Unexpected Name' }] } };
  const report = buildReport('https://api.example.com/graphql', probe);
  assert.equal(report.introspectionEnabled, false);
  assert.equal(report.incomplete, false);
  assert.equal(report.introspectionBlockedExplicitly, false);
  assert.equal(report.ok, true);
});

test('a response with neither "data" nor "errors" is incomplete -- not recognisably GraphQL', () => {
  const probe = { ok: true, status: 200, error: null, parseError: null, body: { unrelated: true } };
  const report = buildReport('https://api.example.com/graphql', probe);
  assert.equal(report.incomplete, true);
  assert.equal(report.ok, false);
});

test('a body that failed to parse as JSON is incomplete', () => {
  const probe = { ok: true, status: 200, error: null, parseError: 'Unexpected token', body: null };
  const report = buildReport('https://api.example.com/graphql', probe);
  assert.equal(report.incomplete, true);
  assert.match(report.error, /Unexpected token/);
});

test('introspection enabled with no mutation type is a notice, not a danger', () => {
  const probe = schemaProbe({
    queryType: { name: 'Query', fields: [{ name: 'me' }, { name: 'listPosts' }] },
    mutationType: null,
    subscriptionType: null,
    types: [{ name: 'Query', kind: 'OBJECT' }, { name: 'String', kind: 'SCALAR' }],
  });
  const report = buildReport('https://api.example.com/graphql', probe);
  assert.equal(report.introspectionEnabled, true);
  assert.equal(report.queryFieldCount, 2);
  assert.equal(report.mutationFieldCount, 0);
  assert.equal(report.dangerCount, 0);
  assert.equal(report.noticeCount, 1);
  assert.equal(report.findings[0].id, 'introspection-enabled');
  assert.equal(report.findings[0].severity, 'notice');
  assert.equal(report.ok, true);
});

test('introspection enabled with a mutation surface is a danger finding', () => {
  const probe = schemaProbe({
    queryType: { name: 'Query', fields: [{ name: 'me' }] },
    mutationType: { name: 'Mutation', fields: [{ name: 'updateProfile' }] },
    subscriptionType: null,
    types: [],
  });
  const report = buildReport('https://api.example.com/graphql', probe);
  assert.equal(report.dangerCount, 1);
  assert.equal(report.findings[0].severity, 'danger');
  assert.equal(report.ok, false);
});

test('sensitive-sounding mutation names are flagged as their own danger finding', () => {
  const probe = schemaProbe({
    queryType: { name: 'Query', fields: [] },
    mutationType: { name: 'Mutation', fields: [{ name: 'updateProfile' }, { name: 'deleteUser' }, { name: 'grantAdminRole' }] },
    subscriptionType: null,
    types: [],
  });
  const report = buildReport('https://api.example.com/graphql', probe);
  const finding = report.findings.find((f) => f.id === 'sensitive-mutation-names');
  assert.ok(finding, 'expected a sensitive-mutation-names finding');
  assert.equal(finding.severity, 'danger');
  assert.ok(finding.detail.includes('deleteUser'));
  assert.ok(finding.detail.includes('grantAdminRole'));
  assert.ok(!finding.detail.includes('updateProfile'), 'updateProfile does not match any sensitive word');
});

test('sensitive-sounding query names are flagged as a notice, separate from mutations', () => {
  const probe = schemaProbe({
    queryType: { name: 'Query', fields: [{ name: 'internalDebugInfo' }, { name: 'listPosts' }] },
    mutationType: null,
    subscriptionType: null,
    types: [],
  });
  const report = buildReport('https://api.example.com/graphql', probe);
  const finding = report.findings.find((f) => f.id === 'sensitive-query-names');
  assert.ok(finding);
  assert.equal(finding.severity, 'notice');
  assert.ok(finding.detail.includes('internalDebugInfo'));
});

test('customTypeCount excludes introspection meta-types and built-in scalars', () => {
  const probe = schemaProbe({
    queryType: { name: 'Query', fields: [] },
    mutationType: null,
    subscriptionType: null,
    types: [
      { name: '__Schema', kind: 'OBJECT' },
      { name: '__Type', kind: 'OBJECT' },
      { name: 'String', kind: 'SCALAR' },
      { name: 'Int', kind: 'SCALAR' },
      { name: 'User', kind: 'OBJECT' },
      { name: 'Role', kind: 'ENUM' },
    ],
  });
  const report = buildReport('https://api.example.com/graphql', probe);
  assert.equal(report.customTypeCount, 2); // User, Role
});

test('subscription fields are counted independently of query and mutation', () => {
  const probe = schemaProbe({
    queryType: { name: 'Query', fields: [{ name: 'a' }] },
    mutationType: { name: 'Mutation', fields: [{ name: 'b' }] },
    subscriptionType: { name: 'Subscription', fields: [{ name: 'onPostAdded' }, { name: 'onCommentAdded' }] },
    types: [],
  });
  const report = buildReport('https://api.example.com/graphql', probe);
  assert.equal(report.subscriptionFieldCount, 2);
  assert.deepEqual(report.subscriptionFields, ['onPostAdded', 'onCommentAdded']);
});

test('a schema with malformed field entries does not throw', () => {
  const probe = schemaProbe({
    queryType: { name: 'Query', fields: [{ name: 'ok' }, {}, null, { notName: 'x' }] },
    mutationType: null,
    subscriptionType: null,
    types: null,
  });
  assert.doesNotThrow(() => buildReport('https://api.example.com/graphql', probe));
  const report = buildReport('https://api.example.com/graphql', probe);
  assert.deepEqual(report.queryFields, ['ok']);
  assert.equal(report.customTypeCount, 0);
});
