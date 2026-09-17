import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, parseSecurityTxt, parseExpires, unwrapSignature, WELL_KNOWN_PATH } from './engine.mjs';

// Every test that touches Expires pins `now`, so the suite does not start
// failing on a date. A validator whose tests expire is the exact defect this
// tool exists to report.
const NOW = new Date('2026-09-16T12:00:00Z');

const GOOD = [
  'Contact: mailto:security@example.com',
  'Expires: 2027-01-31T23:59:00.000Z',
  'Preferred-Languages: en, nl',
  'Canonical: https://example.com/.well-known/security.txt',
].join('\n');

function ids(report) {
  return report.findings.map((f) => f.id);
}

test('a conforming file produces no findings', () => {
  const report = buildReport({ text: GOOD, now: NOW });
  assert.deepEqual(ids(report), []);
  assert.equal(report.ok, true);
  assert.equal(report.dangerCount, 0);
});

test('a paste is reported incomplete, because location and media type cannot be seen', () => {
  assert.equal(buildReport({ text: GOOD, now: NOW }).incomplete, true);
  assert.equal(
    buildReport({ text: GOOD, now: NOW, servedFrom: `https://example.com${WELL_KNOWN_PATH}` }).incomplete,
    false,
  );
});

test('an expired file is a danger, not a notice', () => {
  const report = buildReport({
    text: 'Contact: mailto:s@example.com\nExpires: 2025-01-01T00:00:00Z',
    now: NOW,
  });
  assert.ok(ids(report).includes('expires-past'));
  assert.equal(report.findings.find((f) => f.id === 'expires-past').severity, 'danger');
  assert.equal(report.ok, false);
});

test('an Expires less than 30 days out warns without failing the run', () => {
  const report = buildReport({
    text: 'Contact: mailto:s@example.com\nExpires: 2026-10-01T00:00:00Z',
    now: NOW,
  });
  assert.ok(ids(report).includes('expires-soon'));
  assert.equal(report.ok, true, 'a file about to expire is still valid today');
});

test('an Expires more than a year out is a notice', () => {
  const report = buildReport({
    text: 'Contact: mailto:s@example.com\nExpires: 2030-01-01T00:00:00Z',
    now: NOW,
  });
  assert.ok(ids(report).includes('expires-far'));
  assert.equal(report.ok, true);
});

test('a missing Contact and a missing Expires are both dangers', () => {
  const report = buildReport({ text: 'Policy: https://example.com/policy', now: NOW });
  assert.ok(ids(report).includes('contact-missing'));
  assert.ok(ids(report).includes('expires-missing'));
  assert.equal(report.dangerCount, 2);
});

test('Expires must appear exactly once', () => {
  const report = buildReport({
    text: 'Contact: mailto:s@example.com\nExpires: 2027-01-01T00:00:00Z\nExpires: 2027-06-01T00:00:00Z',
    now: NOW,
  });
  assert.ok(ids(report).includes('expires-duplicate'));
});

test('a bare email address in Contact is rejected: RFC 9116 wants a URI', () => {
  const report = buildReport({
    text: 'Contact: security@example.com\nExpires: 2027-01-01T00:00:00Z',
    now: NOW,
  });
  assert.ok(ids(report).includes('contact-not-uri'));
});

test('an http: Contact is a danger', () => {
  const report = buildReport({
    text: 'Contact: http://example.com/report\nExpires: 2027-01-01T00:00:00Z',
    now: NOW,
  });
  const f = report.findings.find((x) => x.id === 'contact-insecure');
  assert.ok(f);
  assert.equal(f.severity, 'danger');
});

test('a PGP key pasted into the file is flagged', () => {
  const report = buildReport({
    text: [
      'Contact: mailto:s@example.com',
      'Expires: 2027-01-01T00:00:00Z',
      '-----BEGIN PGP PUBLIC KEY BLOCK-----',
      'mQINBGA...',
      '-----END PGP PUBLIC KEY BLOCK-----',
    ].join('\n'),
    now: NOW,
  });
  assert.ok(ids(report).includes('encryption-inline-key'));
});

test('the British spelling of Acknowledgments is named specifically', () => {
  const report = buildReport({
    text: 'Contact: mailto:s@example.com\nExpires: 2027-01-01T00:00:00Z\nAcknowledgements: https://example.com/thanks',
    now: NOW,
  });
  const f = report.findings.find((x) => x.id === 'field-misspelled');
  assert.ok(f, 'expected a misspelling finding');
  assert.match(f.title, /Acknowledgments/);
});

test('the RFC spelling of Acknowledgments is accepted', () => {
  const report = buildReport({
    text: 'Contact: mailto:s@example.com\nExpires: 2027-01-01T00:00:00Z\nAcknowledgments: https://example.com/thanks',
    now: NOW,
  });
  assert.deepEqual(ids(report), []);
});

test('Preferred-Languages may not repeat, and language names are not language tags', () => {
  const dup = buildReport({
    text: 'Contact: mailto:s@example.com\nExpires: 2027-01-01T00:00:00Z\nPreferred-Languages: en\nPreferred-Languages: nl',
    now: NOW,
  });
  assert.ok(ids(dup).includes('languages-duplicate'));

  const named = buildReport({
    text: 'Contact: mailto:s@example.com\nExpires: 2027-01-01T00:00:00Z\nPreferred-Languages: English, Dutch',
    now: NOW,
  });
  assert.ok(ids(named).includes('languages-invalid'));
});

test('field names are case-insensitive, values are not', () => {
  const report = buildReport({
    text: 'CONTACT: mailto:s@example.com\nexpires: 2027-01-01T00:00:00Z',
    now: NOW,
  });
  assert.deepEqual(ids(report), []);
});

test('a known field name with the colon missing is named, not reported as an unknown field', () => {
  const report = buildReport({
    text: 'Contact: mailto:s@example.com\nExpires: 2027-01-01T00:00:00Z\nPolicy https://example.com/vdp',
    now: NOW,
  });
  const f = report.findings.find((x) => x.id === 'field-missing-colon');
  assert.ok(f, 'expected the missing-colon diagnosis');
  assert.equal(f.severity, 'danger');
  assert.match(f.title, /Policy/);
  assert.ok(!ids(report).includes('field-unknown'), 'must not also report "Policy https" as an unknown field');
});

test('a genuinely unknown field is still reported as unknown', () => {
  const report = buildReport({
    text: 'Contact: mailto:s@example.com\nExpires: 2027-01-01T00:00:00Z\nBounty: https://example.com/bounty',
    now: NOW,
  });
  assert.ok(ids(report).includes('field-unknown'));
  assert.ok(!ids(report).includes('field-missing-colon'));
});

test('a line with no colon is a danger, and comments and blanks are not', () => {
  const report = buildReport({
    text: '# a comment\n\nContact: mailto:s@example.com\nthis line has no colon\nExpires: 2027-01-01T00:00:00Z',
    now: NOW,
  });
  const f = report.findings.find((x) => x.id === 'malformed-line');
  assert.ok(f);
  assert.equal(f.line, 4);
  assert.equal(report.findings.filter((x) => x.id === 'malformed-line').length, 1);
});

test('an empty file is a single, specific danger', () => {
  const report = buildReport({ text: '   \n\n', now: NOW });
  assert.deepEqual(ids(report), ['empty']);
  assert.equal(report.ok, false);
});

test('serving from the site root rather than /.well-known/ is reported', () => {
  const report = buildReport({
    text: GOOD,
    now: NOW,
    servedFrom: 'https://example.com/security.txt',
  });
  assert.ok(ids(report).includes('wrong-location'));
});

test('a Canonical that does not name where the file was fetched from is reported', () => {
  const report = buildReport({
    text: 'Contact: mailto:s@example.com\nExpires: 2027-01-01T00:00:00Z\nCanonical: https://other.example/.well-known/security.txt',
    now: NOW,
    servedFrom: `https://example.com${WELL_KNOWN_PATH}`,
  });
  assert.ok(ids(report).includes('canonical-mismatch'));
});

test('a Canonical that does name it, trailing slash aside, is accepted', () => {
  const report = buildReport({
    text: GOOD,
    now: NOW,
    servedFrom: `https://example.com${WELL_KNOWN_PATH}`,
  });
  assert.deepEqual(ids(report), []);
});

test('the served media type is checked when known', () => {
  const html = buildReport({ text: GOOD, now: NOW, servedFrom: `https://example.com${WELL_KNOWN_PATH}`, contentType: 'text/html' });
  assert.ok(ids(html).includes('content-type'));

  const noCharset = buildReport({ text: GOOD, now: NOW, servedFrom: `https://example.com${WELL_KNOWN_PATH}`, contentType: 'text/plain' });
  assert.ok(ids(noCharset).includes('content-type-charset'));

  const good = buildReport({ text: GOOD, now: NOW, servedFrom: `https://example.com${WELL_KNOWN_PATH}`, contentType: 'text/plain; charset=utf-8' });
  assert.deepEqual(ids(good), []);
});

test('a byte-order mark is reported but does not break field parsing', () => {
  const report = buildReport({ text: `﻿${GOOD}`, now: NOW });
  assert.ok(ids(report).includes('bom'));
  assert.ok(!ids(report).includes('contact-missing'), 'the BOM must not hide the Contact field');
});

// --- Signed files --------------------------------------------------------

const SIGNED = [
  '-----BEGIN PGP SIGNED MESSAGE-----',
  'Hash: SHA256',
  '',
  'Contact: mailto:security@example.com',
  'Expires: 2027-01-31T23:59:00.000Z',
  '-----BEGIN PGP SIGNATURE-----',
  '',
  'iQIzBAEBCAAdFiEE...',
  '-----END PGP SIGNATURE-----',
].join('\n');

test('a cleartext-signed file is validated on its payload, not its armour', () => {
  const report = buildReport({ text: SIGNED, now: NOW });
  assert.equal(report.signed, true);
  assert.ok(!ids(report).includes('contact-missing'), 'the signed payload carries a Contact');
  assert.ok(!ids(report).includes('malformed-line'), 'armour lines must not be read as fields');
});

test('a signed file with no Canonical gets the RFC 9116 SHOULD as a notice', () => {
  const report = buildReport({ text: SIGNED, now: NOW });
  const f = report.findings.find((x) => x.id === 'signed-no-canonical');
  assert.ok(f);
  assert.equal(f.severity, 'notice');
});

test('dash-escaped lines in a signed payload are unescaped before parsing', () => {
  const { body } = unwrapSignature(SIGNED.replace('Contact:', '- Contact:'));
  assert.match(body, /- Contact:/, 'unwrap keeps the escape; the parser removes it');
  const report = buildReport({ text: SIGNED.replace('Contact:', '- Contact:'), now: NOW });
  assert.ok(!ids(report).includes('contact-missing'));
});

test('an unsigned file reports signed: false', () => {
  assert.equal(buildReport({ text: GOOD, now: NOW }).signed, false);
});

// --- parseExpires: the Date.parse trap ------------------------------------

test('parseExpires requires a full RFC 3339 timestamp, not a loose date', () => {
  assert.equal(parseExpires('2027-01-31T23:59:00Z').valid, true);
  assert.equal(parseExpires('2027-01-31T23:59:00.000Z').valid, true);
  assert.equal(parseExpires('2027-01-31T23:59:00+01:00').valid, true);
  assert.equal(parseExpires('2027-01-31').valid, false, 'a bare date has no time or offset');
  assert.equal(parseExpires('Jan 31 2027').valid, false);
  assert.equal(parseExpires('').valid, false);
  assert.equal(parseExpires(undefined).valid, false);
});

test('parseExpires rejects a calendar date Date.parse would silently roll over', () => {
  // Date.parse('2027-02-30T00:00:00Z') is NaN in Node, but the month-overflow
  // shape is the one a hand-rolled check misses, so both are pinned.
  assert.equal(parseExpires('2027-02-30T00:00:00Z').valid, false);
  assert.equal(parseExpires('2027-13-01T00:00:00Z').valid, false);
  assert.equal(parseExpires('2027-01-31T25:00:00Z').valid, false);
});

test('parseSecurityTxt records the line number of every field', () => {
  const { fields } = parseSecurityTxt('# c\nContact: mailto:a@b.c\n\nExpires: 2027-01-01T00:00:00Z');
  assert.deepEqual(fields.map((f) => [f.key, f.line]), [['contact', 2], ['expires', 4]]);
});

test('a value containing a colon keeps everything after the first one', () => {
  const { fields } = parseSecurityTxt('Contact: https://example.com/report?a=1:2');
  assert.equal(fields[0].value, 'https://example.com/report?a=1:2');
});

test('CRLF line endings parse the same as LF', () => {
  const crlf = buildReport({ text: GOOD.replace(/\n/g, '\r\n'), now: NOW });
  assert.deepEqual(ids(crlf), []);
});
