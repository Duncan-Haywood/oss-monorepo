import test from 'node:test';
import assert from 'node:assert/strict';
import {
  unquoteTxtData, parseTagList,
  selectSpfRecords, parseSpfMechanisms, walkSpfChain,
  analyzeDkimSelector, analyzeDkim,
  selectDmarcRecords, analyzeDmarc,
  selectBimiRecords, analyzeBimi, dmarcSufficientForBimi,
  buildReport,
} from './analyze.mjs';

// A real 2048-bit RSA SubjectPublicKeyInfo, generated for these fixtures.
const KEY_2048 = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs3RRsQ+XR0yBvYuIEVsLTafn0dS6TJNTVJm0v2RFmb5re8QfScXDWj4Qfply8QSCWlFhpurSGTlizKt4xb6xmTB4Dowfv5831ZZaegt/QzcGs1C/Z0q11Ostet1J3tfJLV2teRon2zScjMEVDuGU7INx14uieYR+12MPJSz+nTkirv30d3YWngBxGhbfrq3A89tHmL+1VaYXqa/MC+hwHOThbPylGbcLzFyfIuVXRXn/hIu3rHNfE3I+4cTAoMBEb53WzzNfqZxPJ+0bBaebFP4H8CEos46k/pOIgS0QP0nPBEC19SNLRrps9aftgubevMfrKrAW5GtyIGChZu3O7QIDAQAB';

// ---------------------------------------------------------------------------
// TXT presentation-format helpers
// ---------------------------------------------------------------------------

test('unquoteTxtData strips one quoted chunk', () => {
  assert.equal(unquoteTxtData('"v=spf1 -all"'), 'v=spf1 -all');
});

test('unquoteTxtData joins several quoted chunks (a >255-byte TXT record)', () => {
  assert.equal(unquoteTxtData('"v=spf1 " "include:_spf.example.com " "-all"'), 'v=spf1 include:_spf.example.com -all');
});

test('unquoteTxtData passes through an already-unquoted string', () => {
  assert.equal(unquoteTxtData('v=spf1 -all'), 'v=spf1 -all');
});

test('parseTagList splits tags and reports duplicates', () => {
  const { tags, duplicates } = parseTagList('v=DMARC1; p=reject; p=none; pct=50');
  assert.equal(tags.get('p'), 'none'); // last one wins, matching every real parser
  assert.deepEqual(duplicates, ['p']);
});

// ---------------------------------------------------------------------------
// SPF: record selection and single-record parsing
// ---------------------------------------------------------------------------

test('selectSpfRecords picks out only the v=spf1 record among unrelated TXT records', () => {
  const records = selectSpfRecords([
    'google-site-verification=abc123',
    'v=spf1 include:_spf.google.com ~all',
    'some-other-txt-record',
  ]);
  assert.deepEqual(records, ['v=spf1 include:_spf.google.com ~all']);
});

test('parseSpfMechanisms finds include/a/mx/ptr/exists as lookup terms, ip4/ip6 as not', () => {
  const parsed = parseSpfMechanisms(
    'v=spf1 ip4:192.0.2.0/24 include:_spf.example.com a mx ptr exists:%{i}.example.com ip6:2001:db8::/32 -all',
  );
  assert.deepEqual(
    parsed.lookupTerms.map((t) => t.mechanism),
    ['include', 'a', 'mx', 'ptr', 'exists'],
  );
  assert.equal(parsed.allQualifier, '-');
  assert.equal(parsed.malformed.length, 0);
});

test('parseSpfMechanisms reads the qualifier on "all" (+/-/~/? and bare)', () => {
  assert.equal(parseSpfMechanisms('v=spf1 +all').allQualifier, '+');
  assert.equal(parseSpfMechanisms('v=spf1 all').allQualifier, '+');
  assert.equal(parseSpfMechanisms('v=spf1 -all').allQualifier, '-');
  assert.equal(parseSpfMechanisms('v=spf1 ~all').allQualifier, '~');
  assert.equal(parseSpfMechanisms('v=spf1 ?all').allQualifier, '?');
});

test('parseSpfMechanisms flags an include: with no domain as malformed', () => {
  const parsed = parseSpfMechanisms('v=spf1 include -all');
  assert.ok(parsed.malformed.some((m) => /include/.test(m)));
});

test('parseSpfMechanisms flags a genuinely unrecognized term', () => {
  const parsed = parseSpfMechanisms('v=spf1 bananas -all');
  assert.ok(parsed.malformed.some((m) => /Unrecognized term/.test(m)));
});

test('parseSpfMechanisms reads redirect= as a modifier, not a mechanism', () => {
  const parsed = parseSpfMechanisms('v=spf1 redirect=_spf.example.com');
  assert.equal(parsed.redirect, '_spf.example.com');
  assert.equal(parsed.allQualifier, null);
  assert.equal(parsed.lookupTerms.length, 0);
});

test('parseSpfMechanisms flags terms placed after "all" as unreachable', () => {
  const parsed = parseSpfMechanisms('v=spf1 -all include:_spf.example.com');
  assert.equal(parsed.allNotLast, true);
});

// ---------------------------------------------------------------------------
// SPF: recursive chain walking against a fixture DNS map (no network)
// ---------------------------------------------------------------------------

test('walkSpfChain counts a simple record with no includes', () => {
  const walk = walkSpfChain('example.com', {
    'example.com': ['v=spf1 ip4:203.0.113.0/24 -all'],
  });
  assert.equal(walk.totalLookups, 0);
  assert.equal(walk.exceedsLookupLimit, false);
  assert.equal(walk.root.allQualifier, '-');
});

test('walkSpfChain follows include: recursively and sums lookups across the whole chain', () => {
  const records = {
    'example.com': ['v=spf1 include:a.example.net include:b.example.net -all'],
    'a.example.net': ['v=spf1 include:a1.example.net include:a2.example.net include:a3.example.net include:a4.example.net -all'],
    'b.example.net': ['v=spf1 include:b1.example.net include:b2.example.net include:b3.example.net include:b4.example.net -all'],
    'a1.example.net': ['v=spf1 include:a1sub.example.net -all'],
    'a1sub.example.net': ['v=spf1 -all'],
    'a2.example.net': ['v=spf1 -all'],
    'a3.example.net': ['v=spf1 -all'],
    'a4.example.net': ['v=spf1 -all'],
    'b1.example.net': ['v=spf1 -all'],
    'b2.example.net': ['v=spf1 -all'],
    'b3.example.net': ['v=spf1 -all'],
    'b4.example.net': ['v=spf1 -all'],
  };
  // root: 2, a.example.net: 4, b.example.net: 4, a1.example.net: 1 => 11 total
  const walk = walkSpfChain('example.com', records);
  assert.equal(walk.totalLookups, 11);
  assert.equal(walk.exceedsLookupLimit, true);
  assert.equal(walk.truncated, false);
  assert.equal(walk.loopDetected, false);
});

test('walkSpfChain detects a circular include chain instead of recursing forever', () => {
  const walk = walkSpfChain('loopy.example', {
    'loopy.example': ['v=spf1 include:loopy.example -all'],
  });
  assert.equal(walk.loopDetected, true);
  assert.equal(walk.totalLookups, 1);
});

test('walkSpfChain reports a referenced domain the caller never fetched as truncated, not "no SPF"', () => {
  const walk = walkSpfChain('example.com', {
    'example.com': ['v=spf1 include:missing.example.net -all'],
  });
  assert.equal(walk.truncated, true);
  assert.deepEqual(walk.unresolved, ['missing.example.net']);
});

test('walkSpfChain flags multiple SPF records at the same name', () => {
  const walk = walkSpfChain('example.com', {
    'example.com': ['v=spf1 -all', 'v=spf1 ~all'],
  });
  assert.equal(walk.root.multiple, true);
});

test('walkSpfChain reports "found: false" for a domain with no SPF record at all', () => {
  const walk = walkSpfChain('example.com', { 'example.com': ['unrelated-txt-record'] });
  assert.equal(walk.root.found, false);
});

// ---------------------------------------------------------------------------
// DKIM
// ---------------------------------------------------------------------------

test('analyzeDkimSelector: a selector with a real public key is valid', () => {
  const r = analyzeDkimSelector({ selector: 'google', txtRecords: ['v=DKIM1; k=rsa; p='+KEY_2048] });
  assert.equal(r.found, true);
  assert.equal(r.hasPublicKey, true);
  assert.equal(r.revoked, false);
});

test('analyzeDkimSelector: an empty p= tag means the key was revoked', () => {
  const r = analyzeDkimSelector({ selector: 'default', txtRecords: ['v=DKIM1; k=rsa; p='] });
  assert.equal(r.found, true);
  assert.equal(r.hasPublicKey, false);
  assert.equal(r.revoked, true);
});

test('analyzeDkimSelector: a TXT record with no p= tag at all is malformed, not revoked', () => {
  const r = analyzeDkimSelector({ selector: 'mail', txtRecords: ['some-unrelated-value'] });
  assert.equal(r.found, true);
  assert.equal(r.revoked, false);
  assert.ok(r.malformed.length > 0);
});

test('analyzeDkimSelector: null txtRecords (NXDOMAIN) is simply not found', () => {
  const r = analyzeDkimSelector({ selector: 's1', txtRecords: null });
  assert.equal(r.found, false);
});

test('analyzeDkim summarizes across every selector checked', () => {
  const dkim = analyzeDkim([
    { selector: 'google', txtRecords: ['v=DKIM1; p=' + KEY_2048] },
    { selector: 'selector1', txtRecords: null },
    { selector: 'default', txtRecords: ['v=DKIM1; p='] },
  ]);
  assert.equal(dkim.anyFound, true);
  assert.equal(dkim.anyValid, true);
  assert.equal(dkim.anyRevoked, true);
  assert.equal(dkim.checkedCount, 3);
  assert.equal(dkim.foundCount, 2);
});

// ---------------------------------------------------------------------------
// DMARC
// ---------------------------------------------------------------------------

test('selectDmarcRecords ignores non-DMARC TXT records at _dmarc', () => {
  assert.deepEqual(
    selectDmarcRecords(['unrelated', 'v=DMARC1; p=none']),
    ['v=DMARC1; p=none'],
  );
});

test('analyzeDmarc: missing entirely', () => {
  const d = analyzeDmarc([]);
  assert.equal(d.found, false);
});

test('analyzeDmarc: p=none is monitor-only', () => {
  const d = analyzeDmarc(['v=DMARC1; p=none; rua=mailto:dmarc@example.com']);
  assert.equal(d.policy, 'none');
});

test('analyzeDmarc: p=reject with pct=100 and reporting is fully enforced', () => {
  const d = analyzeDmarc(['v=DMARC1; p=reject; pct=100; rua=mailto:dmarc@example.com']);
  assert.equal(d.policy, 'reject');
  assert.equal(d.pct, 100);
  assert.equal(d.hasReporting, true);
});

test('analyzeDmarc: pct defaults to 100 when absent', () => {
  const d = analyzeDmarc(['v=DMARC1; p=reject']);
  assert.equal(d.pct, 100);
});

test('analyzeDmarc: pct less than 100 is read correctly', () => {
  const d = analyzeDmarc(['v=DMARC1; p=quarantine; pct=25']);
  assert.equal(d.pct, 25);
});

test('analyzeDmarc: no rua/ruf means no reporting', () => {
  const d = analyzeDmarc(['v=DMARC1; p=reject']);
  assert.equal(d.hasReporting, false);
});

test('analyzeDmarc: multiple records at _dmarc is flagged', () => {
  const d = analyzeDmarc(['v=DMARC1; p=none', 'v=DMARC1; p=reject']);
  assert.equal(d.multiple, true);
});

test('analyzeDmarc: a record with no p= tag is malformed', () => {
  const d = analyzeDmarc(['v=DMARC1; pct=100']);
  assert.ok(d.malformed.some((m) => /p=/.test(m)));
});

test('analyzeDmarc: adkim=s / aspf=s read as strict, default reads as relaxed', () => {
  assert.equal(analyzeDmarc(['v=DMARC1; p=reject; adkim=s']).adkim, 'strict');
  assert.equal(analyzeDmarc(['v=DMARC1; p=reject']).adkim, 'relaxed');
  assert.equal(analyzeDmarc(['v=DMARC1; p=reject; aspf=s']).aspf, 'strict');
});

// ---------------------------------------------------------------------------
// BIMI
// ---------------------------------------------------------------------------

test('selectBimiRecords picks the v=BIMI1 record', () => {
  assert.deepEqual(selectBimiRecords(['unrelated', 'v=BIMI1; l=https://example.com/logo.svg']), ['v=BIMI1; l=https://example.com/logo.svg']);
});

test('dmarcSufficientForBimi requires quarantine/reject AND pct=100', () => {
  assert.equal(dmarcSufficientForBimi(analyzeDmarc(['v=DMARC1; p=reject; pct=100'])), true);
  assert.equal(dmarcSufficientForBimi(analyzeDmarc(['v=DMARC1; p=reject; pct=50'])), false);
  assert.equal(dmarcSufficientForBimi(analyzeDmarc(['v=DMARC1; p=none'])), false);
  assert.equal(dmarcSufficientForBimi(analyzeDmarc([])), false);
});

test('analyzeBimi: absent is a normal, informational result', () => {
  const b = analyzeBimi([], analyzeDmarc(['v=DMARC1; p=none']));
  assert.equal(b.found, false);
});

test('analyzeBimi: present with strong DMARC is honored by mailbox providers', () => {
  const dmarc = analyzeDmarc(['v=DMARC1; p=reject; pct=100']);
  const b = analyzeBimi(['v=BIMI1; l=https://example.com/logo.svg'], dmarc);
  assert.equal(b.found, true);
  assert.equal(b.dmarcSufficient, true);
});

test('analyzeBimi: present but DMARC too weak is not honored', () => {
  const dmarc = analyzeDmarc(['v=DMARC1; p=none']);
  const b = analyzeBimi(['v=BIMI1; l=https://example.com/logo.svg'], dmarc);
  assert.equal(b.found, true);
  assert.equal(b.dmarcSufficient, false);
});

test('analyzeBimi: a record with no l= tag is malformed', () => {
  const b = analyzeBimi(['v=BIMI1; a=https://example.com/vmc.pem'], analyzeDmarc(['v=DMARC1; p=reject; pct=100']));
  assert.ok(b.malformed.some((m) => /l=/.test(m)));
});

// ---------------------------------------------------------------------------
// buildReport: the combined, evidence-first report
// ---------------------------------------------------------------------------

test('buildReport flags +all and a missing DMARC record as danger findings', () => {
  const spfWalk = walkSpfChain('vulnerable.example', { 'vulnerable.example': ['v=spf1 +all'] });
  const dkim = analyzeDkim([{ selector: 'google', txtRecords: null }]);
  const dmarc = analyzeDmarc([]);
  const bimi = analyzeBimi([], dmarc);

  const report = buildReport('vulnerable.example', { spfWalk, dkim, dmarc, bimi });

  assert.equal(report.ok, false);
  assert.ok(report.dangerCount >= 2);
  assert.ok(report.findings.some((f) => f.id === 'spf-plus-all' && f.severity === 'danger'));
  assert.ok(report.findings.some((f) => f.id === 'dmarc-missing' && f.severity === 'danger'));
  // Every finding names the exact record or tag it read -- evidence-first,
  // never a bare pass/fail score.
  for (const f of report.findings) {
    assert.equal(typeof f.evidence, 'string');
    assert.ok(f.evidence.length > 0);
  }
});

test('buildReport is clean (ok: true, zero danger findings) for a well-configured domain', () => {
  const spfWalk = walkSpfChain('clean.example', {
    'clean.example': ['v=spf1 include:_spf.google.com -all'],
    '_spf.google.com': ['v=spf1 ip4:203.0.113.0/24 -all'],
  });
  const dkim = analyzeDkim([
    { selector: 'google', txtRecords: ['v=DKIM1; k=rsa; p='+KEY_2048] },
    { selector: 'selector1', txtRecords: null },
  ]);
  const dmarc = analyzeDmarc(['v=DMARC1; p=reject; pct=100; rua=mailto:dmarc@clean.example']);
  const bimi = analyzeBimi([], dmarc);

  const report = buildReport('clean.example', { spfWalk, dkim, dmarc, bimi });

  assert.equal(report.dangerCount, 0);
  assert.equal(report.ok, true);
  assert.equal(report.incomplete, false);
});

test('buildReport surfaces a transport error as a notice, not a false "missing" finding', () => {
  const report = buildReport('example.com', {
    spfWalk: { domain: 'example.com' },
    spfError: 'timed out',
    dkim: analyzeDkim([]),
    dmarc: analyzeDmarc([]),
    dmarcError: 'timed out',
    bimi: analyzeBimi([], analyzeDmarc([])),
  });
  assert.equal(report.incomplete, true);
  assert.ok(report.findings.some((f) => f.id === 'spf-lookup-failed'));
  assert.ok(report.findings.some((f) => f.id === 'dmarc-lookup-failed'));
  assert.ok(!report.findings.some((f) => f.id === 'spf-missing'));
  assert.ok(!report.findings.some((f) => f.id === 'dmarc-missing'));
});

test('buildReport: BIMI present but under-enforced DMARC is a notice, not silence', () => {
  const spfWalk = walkSpfChain('brand.example', { 'brand.example': ['v=spf1 -all'] });
  const dkim = analyzeDkim([]);
  const dmarc = analyzeDmarc(['v=DMARC1; p=none']);
  const bimi = analyzeBimi(['v=BIMI1; l=https://brand.example/logo.svg'], dmarc);

  const report = buildReport('brand.example', { spfWalk, dkim, dmarc, bimi });
  assert.ok(report.findings.some((f) => f.id === 'bimi-present-not-honored' && f.severity === 'notice'));
});

test('buildReport: 3 void lookups is a danger, 1 is a notice, 0 is silent', () => {
  const base = walkSpfChain('v.example', { 'v.example': ['v=spf1 -all'] });
  const ids = (voidLookups) =>
    buildReport('v.example', { spfWalk: { ...base, voidLookups }, dkim: analyzeDkim([]), dmarc: analyzeDmarc([]), bimi: analyzeBimi([], analyzeDmarc([])) })
      .findings.filter((f) => f.id.includes('void')).map((f) => `${f.id}:${f.severity}`);
  const v = (i) => ({ domain: 'v.example', mechanism: 'a', target: `x${i}.example` });
  assert.deepEqual(ids([]), []);
  assert.deepEqual(ids([v(1)]), ['spf-void-lookup:notice']);
  assert.deepEqual(ids([v(1), v(2), v(3)]), ['spf-too-many-void-lookups:danger']);
});

test('an include: whose target has no SPF record is a PermError (RFC 7208 s5.2), not a clean pass', async () => {
  const { walkSpfChain, buildReport, analyzeDkim, analyzeDmarc, analyzeBimi } = await import('./analyze.mjs');
  const report = (records) => {
    const w = walkSpfChain('ex.com', records);
    const d = analyzeDmarc(['v=DMARC1; p=reject; rua=mailto:a@ex.com']);
    return buildReport('ex.com', { spfWalk: w, dkim: analyzeDkim([]), dmarc: d, bimi: analyzeBimi([], d) });
  };
  const retired = report({ 'ex.com': ['v=spf1 include:retired-vendor.example -all'], 'retired-vendor.example': [] });
  assert.equal(retired.ok, false);
  assert.ok(retired.findings.some((f) => f.id === 'spf-include-broken'));
  const doubled = report({ 'ex.com': ['v=spf1 redirect=_spf.ex.com'], '_spf.ex.com': ['v=spf1 -all', 'v=spf1 ~all'] });
  assert.ok(doubled.findings.some((f) => f.id === 'spf-include-broken'));
  const healthy = report({ 'ex.com': ['v=spf1 include:_spf.ex.com -all'], '_spf.ex.com': ['v=spf1 ip4:192.0.2.0/24 -all'] });
  assert.ok(!healthy.findings.some((f) => f.id === 'spf-include-broken'));
});

// ---------------------------------------------------------------------------
// DMARC organizational-domain fallback and multiple records (RFC 7489 s6.6.3)
// ---------------------------------------------------------------------------

test('analyzeDmarc: an inherited record applies the parent sp= to the subdomain, else p=', () => {
  const withSp = analyzeDmarc(['v=DMARC1; p=reject; sp=none'], { foundAt: 'example.com', domain: 'mail.example.com' });
  assert.equal(withSp.inheritedFrom, 'example.com');
  assert.equal(withSp.appliedPolicy, 'none');
  const noSp = analyzeDmarc(['v=DMARC1; p=quarantine'], { foundAt: 'example.com', domain: 'mail.example.com' });
  assert.equal(noSp.appliedPolicy, 'quarantine');
  const own = analyzeDmarc(['v=DMARC1; p=reject; sp=none'], { foundAt: 'example.com', domain: 'example.com' });
  assert.equal(own.inheritedFrom, null);
  assert.equal(own.appliedPolicy, 'reject');
});

test('buildReport: an inherited sp=none is reported as monitor-only for the subdomain, naming the parent record', () => {
  const dmarc = analyzeDmarc(['v=DMARC1; p=reject; sp=none; rua=mailto:d@example.com'], { foundAt: 'example.com', domain: 'mail.example.com' });
  const report = buildReport('mail.example.com', { spfWalk: walkSpfChain('mail.example.com', new Map([['mail.example.com', ['v=spf1 -all']]])), dkim: analyzeDkim([]), dmarc, bimi: analyzeBimi([], dmarc) });
  const none = report.findings.find((f) => f.id === 'dmarc-policy-none');
  assert.ok(none, report.findings.map((f) => f.id).join(','));
  assert.match(none.title, /sp=none/);
  assert.match(none.evidence, /_dmarc\.example\.com/);
  assert.ok(!report.findings.some((f) => f.id === 'dmarc-policy-reject'));
});

test('buildReport: with two DMARC records no policy is reported as in force', () => {
  const dmarc = analyzeDmarc(['v=DMARC1; p=reject', 'v=DMARC1; p=none']);
  assert.equal(dmarc.appliedPolicy, null);
  assert.equal(dmarcSufficientForBimi(dmarc), false);
  const report = buildReport('example.com', { spfWalk: walkSpfChain('example.com', new Map([['example.com', ['v=spf1 -all']]])), dkim: analyzeDkim([]), dmarc, bimi: analyzeBimi([], dmarc) });
  const ids = report.findings.map((f) => f.id);
  assert.ok(ids.includes('dmarc-multiple-records'));
  assert.ok(!ids.some((id) => id.startsWith('dmarc-policy-')), ids.join(','));
});

test('BIMI-absent finding does not promise a logo from DMARC alone (Gmail needs a VMC or CMC)', () => {
  const dmarc = analyzeDmarc(['v=DMARC1; p=reject; pct=100']);
  const report = buildReport('example.com', { spfWalk: walkSpfChain('example.com', new Map([['example.com', ['v=spf1 -all']]])), dkim: analyzeDkim([]), dmarc, bimi: analyzeBimi([], dmarc) });
  const f = report.findings.find((x) => x.id.startsWith('bimi-') && /VMC|Verified Mark/.test(x.detail ?? x.message ?? JSON.stringify(x)));
  assert.ok(f, JSON.stringify(report.findings.filter((x) => x.id.startsWith('bimi'))));
});

// ---------------------------------------------------------------------------
// Red-team 2026-11-16: modifiers after "all", unevaluated mechanisms, budget
// ---------------------------------------------------------------------------

test('parseSpfMechanisms: a modifier after "all" (exp=, redirect=, unknown) is not an unreachable term', () => {
  // RFC 7208 s4.6.3/s6: modifiers may appear anywhere; only *mechanisms*
  // after "all" are never tested (s5.1).
  assert.equal(parseSpfMechanisms('v=spf1 ip4:192.0.2.1 -all exp=explain._spf.example.com').allNotLast, false);
  assert.equal(parseSpfMechanisms('v=spf1 -all foo=bar').allNotLast, false);
  assert.equal(parseSpfMechanisms('v=spf1 -all ip4:192.0.2.1').allNotLast, true);
});

test('buildReport: "-all exp=..." raises no spf-all-not-last notice', () => {
  const spfWalk = walkSpfChain('exp.example', { 'exp.example': ['v=spf1 ip4:192.0.2.1 -all exp=explain._spf.exp.example'] });
  const report = buildReport('exp.example', { spfWalk, dkim: analyzeDkim([]), dmarc: analyzeDmarc([]), bimi: analyzeBimi([], analyzeDmarc([])) });
  assert.equal(report.findings.some((f) => f.id === 'spf-all-not-last'), false);
});

test('walkSpfChain: mechanisms after "all" are never evaluated, so they cost no lookup and are not fetched', () => {
  const walk = walkSpfChain('late.example', {
    'late.example': ['v=spf1 include:a.example.net -all include:never.example.net mx a'],
    'a.example.net': ['v=spf1 -all'],
  });
  assert.equal(walk.totalLookups, 1);
  assert.equal(walk.root.lookupsHere, 1);
  assert.equal(walk.truncated, false, 'the never-evaluated include target must not be reported as unresolved');
  assert.equal(walk.root.allNotLast, true);
});

test('walkSpfChain: lookupsHere is the per-record count, and include/redirect each cost one', () => {
  const walk = walkSpfChain('per.example', {
    'per.example': ['v=spf1 a mx include:x.example.net redirect=y.example.net'],
    'x.example.net': ['v=spf1 ip4:192.0.2.1 ~all'],
    'y.example.net': ['v=spf1 exists:%{i}.z.example ~all'],
  });
  assert.deepEqual(walk.chain.map((c) => [c.domain, c.lookupsHere]), [
    ['per.example', 4], ['x.example.net', 0], ['y.example.net', 1],
  ]);
  assert.equal(walk.totalLookups, 5);
});

test('walkSpfChain: past the visit budget the walk is truncated, with the skipped domain unresolved', () => {
  const walk = walkSpfChain('deep.example', {
    'deep.example': ['v=spf1 include:one.example include:two.example -all'],
    'one.example': ['v=spf1 -all'],
    'two.example': ['v=spf1 -all'],
  }, { maxVisits: 2 });
  assert.equal(walk.truncated, true);
  assert.deepEqual(walk.unresolved, ['two.example']);
  assert.equal(walk.chain.at(-1).note, 'budget-exceeded');
});

test('buildReport: BIMI notice with DMARC pct omitted states the default pct=100', () => {
  const dmarc = analyzeDmarc(['v=DMARC1; p=none']);
  const report = buildReport('brand.example', {
    spfWalk: walkSpfChain('brand.example', { 'brand.example': ['v=spf1 -all'] }),
    dkim: analyzeDkim([]), dmarc, bimi: analyzeBimi(['v=BIMI1; l=https://brand.example/logo.svg'], dmarc),
  });
  const f = report.findings.find((x) => x.id === 'bimi-present-not-honored');
  assert.match(f.detail, /Current DMARC here is p=none pct=100\./);
});

test('parseSpfMechanisms: with two "all" terms the first decides, and the record is valid syntax', () => {
  // RFC 7208's ABNF allows any number of directives; evaluation stops at the
  // first "all" (s5.1), so "~all -all" is a softfail record, not a PermError.
  const parsed = parseSpfMechanisms('v=spf1 ip4:192.0.2.1 ~all -all');
  assert.equal(parsed.allQualifier, '~');
  assert.deepEqual(parsed.malformed, []);
  assert.equal(parsed.allNotLast, true);
});
