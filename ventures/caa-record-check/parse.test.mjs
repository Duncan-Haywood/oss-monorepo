import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCaaData, parseIssueValue } from './parse.mjs';

test('parses the standard presentation format', () => {
  const r = parseCaaData('0 issue "letsencrypt.org"');
  assert.equal(r.ok, true);
  assert.equal(r.flag, 0);
  assert.equal(r.critical, false);
  assert.equal(r.tag, 'issue');
  assert.equal(r.value, 'letsencrypt.org');
});

test('sets critical when the flag byte is 128', () => {
  const r = parseCaaData('128 issue "letsencrypt.org"');
  assert.equal(r.ok, true);
  assert.equal(r.critical, true);
});

test('rejects a flag byte with a reserved bit set', () => {
  const r = parseCaaData('64 issue "letsencrypt.org"');
  assert.equal(r.ok, false);
  assert.match(r.error, /reserved bit/);
});

test('unescapes a backslash-escaped quote inside the value', () => {
  const r = parseCaaData('0 iodef "mailto:security@example.com"');
  assert.equal(r.ok, true);
  assert.equal(r.value, 'mailto:security@example.com');
});

test('a value containing RFC 8657 CA-account-authorization parameters parses whole', () => {
  const r = parseCaaData('0 issue "letsencrypt.org; validationmethods=dns-01; accounturi=https://acme-v02.api.letsencrypt.org/acme/acct/12345"');
  assert.equal(r.ok, true);
  assert.equal(r.value, 'letsencrypt.org; validationmethods=dns-01; accounturi=https://acme-v02.api.letsencrypt.org/acme/acct/12345');
});

test('decodes the RFC 3597 generic-hex form for "0 issue \\"ca.example\\""', () => {
  // flag byte + tag-length byte + tag bytes ("issue") + value bytes ("ca.example").
  const tagHex = Buffer.from('issue', 'ascii').toString('hex');
  const valueHex = Buffer.from('ca.example', 'ascii').toString('hex');
  const fullHex = '00' + '05' + tagHex + valueHex;
  const len = fullHex.length / 2;
  const r = parseCaaData(`\\# ${len} ${fullHex}`);
  assert.equal(r.ok, true);
  assert.equal(r.tag, 'issue');
  assert.equal(r.value, 'ca.example');
  assert.equal(r.critical, false);
});

test('generic-hex critical flag decodes correctly', () => {
  const tagHex = Buffer.from('issue', 'ascii').toString('hex');
  const valueHex = Buffer.from('ca.example', 'ascii').toString('hex');
  const fullHex = '80' + '05' + tagHex + valueHex;
  const len = fullHex.length / 2;
  const r = parseCaaData(`\\# ${len} ${fullHex}`);
  assert.equal(r.ok, true);
  assert.equal(r.critical, true);
});

test('generic-hex with a mismatched declared length is reported malformed, not guessed at', () => {
  const r = parseCaaData('\\# 99 0005697373756563612e6578616d706c65');
  assert.equal(r.ok, false);
  assert.match(r.error, /declares length/);
});

test('unrecognized data format is reported rather than crashing', () => {
  const r = parseCaaData('not a caa record at all');
  assert.equal(r.ok, false);
  assert.match(r.error, /neither/);
});

test('empty data is reported rather than crashing', () => {
  const r = parseCaaData('');
  assert.equal(r.ok, false);
});

test('parseIssueValue: a lone semicolon means disallow all', () => {
  const v = parseIssueValue(';');
  assert.equal(v.disallowAll, true);
  assert.equal(v.issuerDomain, null);
});

test('parseIssueValue: a bare issuer domain authorizes that CA with no restriction', () => {
  const v = parseIssueValue('letsencrypt.org');
  assert.equal(v.disallowAll, false);
  assert.equal(v.issuerDomain, 'letsencrypt.org');
  assert.deepEqual(v.parameters, {});
});

test('parseIssueValue: parses account-binding parameters without losing the issuer domain', () => {
  const v = parseIssueValue('letsencrypt.org; accounturi=https://acme-v02.api.letsencrypt.org/acme/acct/12345; validationmethods=dns-01');
  assert.equal(v.issuerDomain, 'letsencrypt.org');
  assert.equal(v.parameters.accounturi, 'https://acme-v02.api.letsencrypt.org/acme/acct/12345');
  assert.equal(v.parameters.validationmethods, 'dns-01');
});

test('parseIssueValue: is case-insensitive on the issuer domain', () => {
  const v = parseIssueValue('LetsEncrypt.org');
  assert.equal(v.issuerDomain, 'letsencrypt.org');
});
