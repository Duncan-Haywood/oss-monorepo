import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCaaData } from './parse.mjs';
import { analyzeCaaSet, verdictForCustomCa, classify, buildReport, KNOWN_CAS } from './analyze.mjs';

function rec(text) {
  return parseCaaData(text);
}

test('no CAA records anywhere means every CA is authorized', () => {
  const a = analyzeCaaSet([]);
  assert.equal(a.noCaaAnywhere, true);
  for (const v of a.caVerdicts) {
    assert.equal(v.nonWildcard.authorized, true);
    assert.equal(v.wildcard.authorized, true);
  }
});

test('a single named CA is authorized for both wildcard and non-wildcard when issuewild is absent', () => {
  const a = analyzeCaaSet([rec('0 issue "letsencrypt.org"')]);
  const le = a.caVerdicts.find((v) => v.domain === 'letsencrypt.org');
  const dc = a.caVerdicts.find((v) => v.domain === 'digicert.com');
  assert.equal(le.nonWildcard.authorized, true);
  assert.equal(le.wildcard.authorized, true);
  assert.equal(dc.nonWildcard.authorized, false);
  assert.equal(dc.wildcard.authorized, false);
});

test('issuewild overrides issue for wildcard certs when present', () => {
  const a = analyzeCaaSet([rec('0 issue "letsencrypt.org"'), rec('0 issuewild "digicert.com"')]);
  const le = a.caVerdicts.find((v) => v.domain === 'letsencrypt.org');
  const dc = a.caVerdicts.find((v) => v.domain === 'digicert.com');
  assert.equal(le.nonWildcard.authorized, true);
  assert.equal(le.wildcard.authorized, false, 'issuewild is present, so issue no longer covers wildcards');
  assert.equal(dc.nonWildcard.authorized, false);
  assert.equal(dc.wildcard.authorized, true);
});

test('issue ";" disallows every CA from non-wildcard issuance', () => {
  const a = analyzeCaaSet([rec('0 issue ";"')]);
  assert.equal(a.nonWildcardDisallowAll, true);
  for (const v of a.caVerdicts) assert.equal(v.nonWildcard.authorized, false);
});

test('issuewild ";" disallows wildcard issuance while issue still authorizes non-wildcard', () => {
  const a = analyzeCaaSet([rec('0 issue "letsencrypt.org"'), rec('0 issuewild ";"')]);
  const le = a.caVerdicts.find((v) => v.domain === 'letsencrypt.org');
  assert.equal(le.nonWildcard.authorized, true);
  assert.equal(le.wildcard.authorized, false);
});

test('a critical unrecognized tag blocks every CA regardless of any issue records present', () => {
  const a = analyzeCaaSet([rec('0 issue "letsencrypt.org"'), rec('128 unknowntag "something"')]);
  assert.equal(a.criticalUnknown.length, 1);
  const le = a.caVerdicts.find((v) => v.domain === 'letsencrypt.org');
  assert.equal(le.nonWildcard.authorized, false);
  assert.equal(le.nonWildcard.reason, 'blocked-by-critical-unknown-tag');
});

test('a non-critical unrecognized tag does not block issuance', () => {
  const a = analyzeCaaSet([rec('0 issue "letsencrypt.org"'), rec('0 unknowntag "something"')]);
  assert.equal(a.criticalUnknown.length, 0);
  const le = a.caVerdicts.find((v) => v.domain === 'letsencrypt.org');
  assert.equal(le.nonWildcard.authorized, true);
});

test('malformed records are surfaced, not silently dropped from the report', () => {
  const a = analyzeCaaSet([rec('0 issue "letsencrypt.org"'), rec('not a record')]);
  assert.equal(a.malformed.length, 1);
  assert.equal(a.hasFindings, true);
});

test('iodef values are collected for display', () => {
  const a = analyzeCaaSet([rec('0 iodef "mailto:security@example.com"')]);
  assert.deepEqual(a.iodef, ['mailto:security@example.com']);
});

test('verdictForCustomCa handles a CA outside the known shortlist', () => {
  const a = analyzeCaaSet([rec('0 issue "some-other-ca.example"')]);
  const v = verdictForCustomCa(a, 'some-other-ca.example');
  assert.equal(v.nonWildcard.authorized, true);
  const blocked = verdictForCustomCa(a, 'letsencrypt.org');
  assert.equal(blocked.nonWildcard.authorized, false);
});

test('KNOWN_CAS is non-empty and every domain is lowercase', () => {
  assert.ok(KNOWN_CAS.length >= 5);
  for (const ca of KNOWN_CAS) assert.equal(ca.domain, ca.domain.toLowerCase());
});

test('classify reports a lookup error distinctly from an analyzed result', () => {
  const r = classify('example.com', { ok: false, error: 'timed out' }, null);
  assert.equal(r.category, 'lookup-error');
  assert.equal(r.analysis, null);
});

test('classify reports requested-ca-blocked when --ca names an unauthorized CA', () => {
  const lookup = { ok: true, queriedName: 'example.com', canonicalName: 'example.com', foundAtName: 'example.com', records: [rec('0 issue "digicert.com"')], walkedNames: ['example.com'], error: null };
  const r = classify('example.com', lookup, 'letsencrypt.org');
  assert.equal(r.category, 'requested-ca-blocked');
});

test('buildReport counts errors, findings, blocked, and clean results, and sets ok accordingly', () => {
  const cleanLookup = { ok: true, queriedName: 'a.com', canonicalName: 'a.com', foundAtName: null, records: [], walkedNames: ['a.com'], error: null };
  const clean = classify('a.com', cleanLookup, null);
  const err = classify('b.com', { ok: false, error: 'x' }, null);
  const report = buildReport(['a.com', 'b.com'], [clean, err]);
  assert.equal(report.cleanCount, 1);
  assert.equal(report.errors.length, 1);
  assert.equal(report.ok, false);
});
