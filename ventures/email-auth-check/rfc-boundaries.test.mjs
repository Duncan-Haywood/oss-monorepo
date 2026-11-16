// Boundary tests for the RFC rules the 2026-11-15 quality audit found
// untested or wrong (portfolio/quality/audits/2026-11-15-email-auth-check.json,
// defects 2, 4, 5, 7, 9, 10): each fixture sits on the exact edge of a rule,
// so moving a threshold by one or dropping a branch fails a test here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  walkSpfChain, analyzeDkimSelector, analyzeDkim, analyzeDmarc, analyzeBimi,
  buildReport, rsaModulusBits, decodeBase64, SCOPE_NOTE,
} from './analyze.mjs';

// Real keys generated with node:crypto for these fixtures (public halves only).
const RSA_512 = 'MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBALmSdZOdBf/EXgSouKqltd5vlb/8YtRw2VHl7k5PoyFKrcq6tm17OJ6rHCrY5SBg9YQDCDcVggJDx1OgsaUt4sMCAwEAAQ==';
const RSA_1024 = 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDiUWc0Gur/mHgC1BwRsxCGKqBANh9cXnXZNVdmkMc0+JpxlLYOd8ReX7vvwQ7EVHZw6c6zhFHSL43YZtc3eagxMIMIYmcFc5ACB2S5yEHkHgbMLSTa3eSAq3NOMbJUpoynCfG/4Y6v3HihCWsShjto3OhZmYtlHoiGsVkJ5TmrXQIDAQAB';
const RSA_2048 = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs3RRsQ+XR0yBvYuIEVsLTafn0dS6TJNTVJm0v2RFmb5re8QfScXDWj4Qfply8QSCWlFhpurSGTlizKt4xb6xmTB4Dowfv5831ZZaegt/QzcGs1C/Z0q11Ostet1J3tfJLV2teRon2zScjMEVDuGU7INx14uieYR+12MPJSz+nTkirv30d3YWngBxGhbfrq3A89tHmL+1VaYXqa/MC+hwHOThbPylGbcLzFyfIuVXRXn/hIu3rHNfE3I+4cTAoMBEb53WzzNfqZxPJ+0bBaebFP4H8CEos46k/pOIgS0QP0nPBEC19SNLRrps9aftgubevMfrKrAW5GtyIGChZu3O7QIDAQAB';
const RSA_1024_PKCS1 = 'MIGJAoGBAJRcyibggFEJ7rUnhTBKuODJh6HXsqc5HfhUgVZUVXtcazea1HboMcYxaS50G+KJyssgMQKjK7LgaMqajbVSwiY1c31t0gPsAxTM/yRnmH2WqrSrOX1YrsPD1IS9TgBvfP5K0MLVZeanV4EXcYpXCM7mEhNrbkPbmEyyT6wn9doHAgMBAAE=';
const ED25519 = 'WOY60Ns/8EOjzno//y2bJn99es/FlmyRLtUjfHU483A=';

const ids = (report) => report.findings.map((f) => `${f.id}:${f.severity}`);
const report = (domain, records, dmarcTxt = ['v=DMARC1; p=reject; rua=mailto:d@x.example']) => {
  const dmarc = analyzeDmarc(dmarcTxt);
  return buildReport(domain, { spfWalk: walkSpfChain(domain, records), dkim: analyzeDkim([]), dmarc, bimi: analyzeBimi([], dmarc) });
};

// A root record with n include: terms, each to a leaf with no lookups.
function chainOf(n, extra = '') {
  const recs = { 'r.example': [`v=spf1 ${Array.from({ length: n }, (_, i) => `include:i${i}.example`).join(' ')} ${extra}-all`] };
  for (let i = 0; i < n; i += 1) recs[`i${i}.example`] = ['v=spf1 ip4:192.0.2.1 -all'];
  return recs;
}

// --- SPF lookup budget: RFC 7208 s4.6.4 -----------------------------------

test('exactly 10 lookups is within the limit; 11 exceeds it', () => {
  assert.equal(walkSpfChain('r.example', chainOf(10)).totalLookups, 10);
  assert.equal(walkSpfChain('r.example', chainOf(10)).exceedsLookupLimit, false);
  assert.equal(walkSpfChain('r.example', chainOf(11)).exceedsLookupLimit, true);
  assert.ok(!ids(report('r.example', chainOf(10))).includes('spf-too-many-lookups:danger'));
  assert.ok(ids(report('r.example', chainOf(11))).includes('spf-too-many-lookups:danger'));
});

test('the near-limit notice starts at 8 lookups, not 7', () => {
  assert.ok(!ids(report('r.example', chainOf(7))).some((x) => x.startsWith('spf-near-lookup-limit')));
  assert.ok(ids(report('r.example', chainOf(8))).includes('spf-near-lookup-limit:notice'));
  assert.ok(ids(report('r.example', chainOf(10))).includes('spf-near-lookup-limit:notice'));
});

test('redirect= costs exactly one lookup and is walked', () => {
  const w = walkSpfChain('r.example', { 'r.example': ['v=spf1 a mx redirect=_spf.r.example'], '_spf.r.example': ['v=spf1 include:x.example -all'], 'x.example': ['v=spf1 -all'] });
  assert.equal(w.totalLookups, 4); // a, mx, redirect, include
  assert.deepEqual(w.chain.map((c) => c.domain), ['r.example', '_spf.r.example', 'x.example']);
});

test('redirect= is ignored when the record also has "all" (RFC 7208 s6.1)', () => {
  const recs = chainOf(10, 'redirect=big.example ');
  recs['big.example'] = ['v=spf1 include:a.example include:b.example -all'];
  const w = walkSpfChain('r.example', recs);
  assert.equal(w.totalLookups, 10); // the redirect is neither counted nor followed
  assert.equal(w.exceedsLookupLimit, false);
  assert.ok(!w.chain.some((c) => c.domain === 'big.example'));
  const r = ids(report('r.example', recs));
  assert.ok(r.includes('spf-redirect-ignored:notice'));
  assert.ok(!r.includes('spf-too-many-lookups:danger'));
});

test('a redirect-only root takes its "all" from the redirect target', () => {
  const r = report('hub.example', { 'hub.example': ['v=spf1 ip4:192.0.2.0/24 redirect=_spf.hub.example'], '_spf.hub.example': ['v=spf1 -all'] });
  const f = r.findings.find((x) => x.id === 'spf-hardfail-all');
  assert.ok(f, 'hardfail read through the redirect');
  assert.match(f.detail, /through redirect= to _spf\.hub\.example/);
  assert.ok(!ids(r).some((x) => x.startsWith('spf-no-all-no-redirect')));
});

test('ptr is flagged (RFC 7208 s5.5: SHOULD NOT be published)', () => {
  assert.ok(ids(report('p.example', { 'p.example': ['v=spf1 ptr -all'] })).includes('spf-ptr:notice'));
  assert.ok(!ids(report('p.example', { 'p.example': ['v=spf1 a -all'] })).some((x) => x.startsWith('spf-ptr')));
});

test('the scope note no longer claims mx address lookups count toward the 10', () => {
  assert.doesNotMatch(SCOPE_NOTE, /may cost slightly more/);
  assert.match(SCOPE_NOTE, /do\s+not count toward it/);
});

test('the over-limit text does not claim every message fails', () => {
  const f = report('r.example', chainOf(11)).findings.find((x) => x.id === 'spf-too-many-lookups');
  assert.doesNotMatch(f.detail, /EVERY message/);
  assert.match(f.detail, /can still pass/);
});

// --- DMARC pct boundary and tag validation (RFC 7489 s6.3, s6.6.3) ---------

test('pct=99 is partial enforcement; pct=100 is not', () => {
  const partial = (pct) => ids(report('d.example', { 'd.example': ['v=spf1 -all'] }, [`v=DMARC1; p=reject; pct=${pct}`])).includes('dmarc-pct-partial:notice');
  assert.equal(partial(99), true);
  assert.equal(partial(100), false);
});

test('pct with trailing junk is malformed, not read as the leading number', () => {
  const d = analyzeDmarc(['v=DMARC1; p=reject; pct=50abc']);
  assert.equal(d.pct, 100);
  assert.ok(d.malformed.some((m) => m.includes('pct=')));
});

test('an invalid sp= is flagged and the record falls back to p=none when rua is set', () => {
  const d = analyzeDmarc(['v=DMARC1; p=reject; sp=bogus; rua=mailto:d@x.example']);
  assert.ok(d.malformed.some((m) => m.startsWith('sp=')));
  assert.equal(d.appliedPolicy, 'none');
  assert.equal(analyzeDmarc(['v=DMARC1; p=reject; sp=bogus']).appliedPolicy, null);
});

test('adkim=x is reported as ignored (relaxed) instead of silently accepted', () => {
  const d = analyzeDmarc(['v=DMARC1; p=reject; adkim=x']);
  assert.equal(d.adkim, 'relaxed');
  assert.equal(d.tagWarnings.length, 1);
  assert.ok(ids(report('d.example', { 'd.example': ['v=spf1 -all'] }, ['v=DMARC1; p=reject; adkim=x'])).includes('dmarc-tag-ignored:notice'));
  assert.equal(analyzeDmarc(['v=DMARC1; p=reject; adkim=s; aspf=r']).tagWarnings.length, 0);
});

// --- DKIM key checks (RFC 6376 s3.6.1, RFC 8301, RFC 8463) -----------------

test('rsaModulusBits reads SPKI and PKCS#1 keys at their real sizes', () => {
  assert.equal(rsaModulusBits(decodeBase64(RSA_512)), 512);
  assert.equal(rsaModulusBits(decodeBase64(RSA_1024)), 1024);
  assert.equal(rsaModulusBits(decodeBase64(RSA_2048)), 2048);
  assert.equal(rsaModulusBits(decodeBase64(RSA_1024_PKCS1)), 1024);
  assert.equal(rsaModulusBits(decodeBase64(RSA_2048.slice(0, 60))), null); // truncated
});

const sel = (rec) => analyzeDkimSelector({ selector: 's', txtRecords: [rec] });
const dkimIds = (rec) => buildReport('k.example', { spfWalk: walkSpfChain('k.example', { 'k.example': ['v=spf1 -all'] }), dkim: analyzeDkim([{ selector: 's', txtRecords: [rec] }]), dmarc: analyzeDmarc([]), bimi: analyzeBimi([], analyzeDmarc([])) })
  .findings.filter((f) => f.id.startsWith('dkim')).map((f) => `${f.id}:${f.severity}`);

test('a key under 1024 bits is a danger (RFC 8301 s3.2); 1024 is valid; 2048 is valid', () => {
  assert.deepEqual(dkimIds(`v=DKIM1; k=rsa; p=${RSA_512}`), ['dkim-weak-key:danger']);
  assert.deepEqual(dkimIds(`v=DKIM1; k=rsa; p=${RSA_1024}`), ['dkim-valid-key:info']);
  assert.deepEqual(dkimIds(`v=DKIM1; p=${RSA_2048}`), ['dkim-valid-key:info']);
  assert.equal(sel(`v=DKIM1; p=${RSA_2048}`).keyBits, 2048);
  assert.equal(analyzeDkim([{ selector: 's', txtRecords: [`p=${RSA_512}`] }]).anyValid, false);
});

test('the 1024-bit key carries a rotation note; the 2048-bit one does not', () => {
  const detail = (rec) => buildReport('k.example', { spfWalk: walkSpfChain('k.example', { 'k.example': ['v=spf1 -all'] }), dkim: analyzeDkim([{ selector: 's', txtRecords: [rec] }]), dmarc: analyzeDmarc([]), bimi: analyzeBimi([], analyzeDmarc([])) })
    .findings.find((f) => f.id === 'dkim-valid-key').detail;
  assert.match(detail(`p=${RSA_1024}`), /1024-bit RSA.*plan a rotation/);
  assert.doesNotMatch(detail(`p=${RSA_2048}`), /rotation/);
});

test('a key with folding whitespace inside p= still parses', () => {
  assert.equal(sel(`v=DKIM1; p=${RSA_2048.slice(0, 100)} ${RSA_2048.slice(100)}`).keyBits, 2048);
});

test('ed25519 keys are 32 raw bytes (RFC 8463)', () => {
  assert.equal(sel(`v=DKIM1; k=ed25519; p=${ED25519}`).hasPublicKey, true);
  assert.equal(sel(`v=DKIM1; k=ed25519; p=${RSA_2048}`).hasPublicKey, false);
});

test('non-base64 p=, v=DKIM2 and k=dsa are not reported as valid keys', () => {
  for (const rec of [`v=DKIM1; p=not*base64!`, `v=DKIM2; p=${RSA_2048}`, `v=DKIM1; k=dsa; p=${RSA_2048}`, 'v=DKIM1; p=abc123']) {
    assert.equal(sel(rec).hasPublicKey, false, rec);
    assert.deepEqual(dkimIds(rec), ['dkim-malformed:notice'], rec);
  }
});

test('a base64 length that cannot be valid (4n+1 chars) is rejected, not thrown', () => {
  assert.equal(decodeBase64('abcde'), null);
  assert.equal(sel('v=DKIM1; p=abcde').hasPublicKey, false);
});
