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
  const r = analyzeDkimSelector({ selector: 'google', txtRecords: ['v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA'] });
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
    { selector: 'google', txtRecords: ['v=DKIM1; p=abc123'] },
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
    { selector: 'google', txtRecords: ['v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA'] },
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
