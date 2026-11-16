// Pure, dependency-free SPF / DKIM / DMARC / BIMI parsing and classification.
//
// This module never makes a network call -- it only reads DNS TXT answers
// it is handed (already-fetched, plain JS strings) and turns them into an
// evidence-first report: each finding names the exact record or tag it read
// and what that means, never a bare pass/fail score. `lookup.mjs` (the real
// DNS-over-HTTPS network layer, used identically by cli.mjs and index.html's
// <script type=module>) is the only thing that talks to the network; this is
// the file analyze.test.mjs exercises against fixture DNS responses, no live
// network required or possible.
//
// Scope, stated plainly rather than left to be discovered: SPF's DNS-lookup
// budget (RFC 7208 s4.6.4) is walked recursively through `include:` and
// `redirect=` -- the two terms that carry a nested SPF record this tool can
// fetch and keep counting through. `a`, `mx`, `ptr` and `exists` each cost
// exactly one lookup toward the same 10-lookup budget. The further address
// queries an `mx` or `ptr` triggers do NOT count toward the 10 (s4.6.4); they
// have their own cap instead -- more than 10 MX hosts (or PTR names) for one
// term is itself an error. This tool counts the 10-term budget exactly but
// does not check that per-term cap; see `SCOPE_NOTE`.

export const SCOPE_NOTE =
  'SPF lookup count includes include:/redirect= (walked recursively) plus one ' +
  'lookup for each a/mx/ptr/exists mechanism, which is how RFC 7208 s4.6.4 ' +
  'counts the 10-lookup budget; the address queries an mx or ptr then makes do ' +
  'not count toward it. Not checked here: the separate per-mechanism cap of 10 ' +
  'MX hosts (or PTR names) that s4.6.4 also sets.';

// ---------------------------------------------------------------------------
// Shared TXT presentation-format helpers
// ---------------------------------------------------------------------------

/**
 * DNS-over-HTTPS JSON APIs (and `dig`) hand back a TXT record's `data` field
 * in DNS presentation format: one or more double-quoted character-strings,
 * concatenated for a value over 255 bytes. This turns that back into the
 * single logical string DNS actually stores. A fixture (or a resolver) that
 * already hands back a plain, unquoted string is passed through unchanged.
 */
export function unquoteTxtData(data) {
  const value = String(data ?? '').trim();
  const chunks = value.match(/"(?:[^"\\]|\\.)*"/g);
  if (!chunks) return value;
  return chunks.map((c) => c.slice(1, -1).replace(/\\(.)/g, '$1')).join('');
}

/**
 * Splits a `tag=value; tag2=value2` record body (DKIM/DMARC/BIMI all use
 * this shape) into an ordered tag map. Later duplicate tags win, matching
 * how every real parser (and the RFCs' own ABNF, which does not forbid a
 * repeated tag) resolves the ambiguity -- but a duplicate is also reported
 * back to the caller, since two `p=` tags on one record is itself evidence
 * worth showing.
 */
export function parseTagList(record) {
  const tags = new Map();
  const duplicates = [];
  const seen = new Set();
  for (const part of String(record ?? '').split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const name = trimmed.slice(0, eq).trim().toLowerCase();
    const value = trimmed.slice(eq + 1).trim();
    if (seen.has(name)) duplicates.push(name);
    seen.add(name);
    tags.set(name, value);
  }
  return { tags, duplicates };
}

export function normalizeDomainKey(domain) {
  return String(domain ?? '').trim().toLowerCase().replace(/\.$/, '');
}

// ---------------------------------------------------------------------------
// SPF
// ---------------------------------------------------------------------------

const SPF_LOOKUP_MECHANISMS = new Set(['include', 'a', 'mx', 'ptr', 'exists']);
const SPF_TERM_RE = /^([+\-~?]?)(all|include|a|mx|ptr|ip4|ip6|exists)(?::([^/]+))?(?:\/\S+)?$/i;

/** From a raw TXT-record set (strings), the ones that are SPF records. */
export function selectSpfRecords(txtRecords) {
  return (txtRecords || []).filter(
    (r) => typeof r === 'string' && /^v=spf1(\s|$)/i.test(r.trim()),
  );
}

/**
 * Parses one `v=spf1 ...` record into its terms.
 * @returns {{
 *   lookupTerms: Array<{mechanism: string, domain: string|null, qualifier: string, raw: string}>,
 *   allQualifier: '+'|'-'|'~'|'?'|null,
 *   allNotLast: boolean,
 *   redirect: string|null,
 *   malformed: string[],
 * }}
 */
export function parseSpfMechanisms(record) {
  const malformed = [];
  const body = String(record ?? '').replace(/^v=spf1\s*/i, '').trim();
  const rawTerms = body.length ? body.split(/\s+/) : [];
  const lookupTerms = [];
  let allQualifier = null;
  let allIndex = -1;
  let redirect = null;
  let redirectSeen = false;

  rawTerms.forEach((raw, index) => {
    if (/^redirect=/i.test(raw)) {
      if (redirectSeen) malformed.push(`More than one redirect= modifier ("${raw}")`);
      redirectSeen = true;
      redirect = raw.slice('redirect='.length) || null;
      if (!redirect) malformed.push('redirect= modifier with no domain');
      return;
    }
    if (/^exp=/i.test(raw)) return; // explanation modifier: no DNS-lookup cost, nothing to classify

    const m = raw.match(SPF_TERM_RE);
    if (!m) {
      // An unrecognized `name=value` modifier (ip6 macros, a vendor
      // extension) is valid SPF and costs no lookup; only flag it as
      // malformed when it isn't even shaped like a modifier.
      if (!/^[a-zA-Z][a-zA-Z0-9\-_.]*=\S+$/.test(raw)) {
        malformed.push(`Unrecognized term: "${raw}"`);
      }
      return;
    }
    const qualifier = m[1] || '+';
    const mechanism = m[2].toLowerCase();
    const value = m[3] ?? null;

    if (mechanism === 'all') {
      if (allQualifier !== null) malformed.push('More than one "all" mechanism');
      allQualifier = qualifier;
      allIndex = index;
      return;
    }
    if (SPF_LOOKUP_MECHANISMS.has(mechanism)) {
      if ((mechanism === 'include' || mechanism === 'exists') && !value) {
        malformed.push(`${mechanism}: mechanism with no domain ("${raw}")`);
      }
      lookupTerms.push({ mechanism, domain: value, qualifier, raw });
    }
    // ip4 / ip6: address literals, no DNS lookup, nothing further to record.
  });

  const allNotLast = allIndex !== -1 && allIndex !== rawTerms.length - 1;

  return { lookupTerms, allQualifier, allNotLast, redirect, malformed };
}

/**
 * Recursively walks a domain's SPF record through `include:`/`redirect=`,
 * counting every lookup-costing mechanism in the whole chain (RFC 7208
 * s4.6.4's 10-lookup budget), against DNS answers the caller already
 * fetched -- this function does no I/O itself, so a fixture map is enough
 * to test the real counting logic with no network involved.
 *
 * @param {string} rootDomain
 * @param {Map<string,string[]>|Record<string,string[]>} recordsByDomain
 *   domain (lowercase, no trailing dot) -> that name's raw TXT record
 *   strings. A domain the caller never fetched is simply absent from the
 *   map (or `undefined` on a plain object) -- distinct from a domain that
 *   was fetched and came back with zero TXT records (present, `[]`).
 */
export function walkSpfChain(rootDomain, recordsByDomain, { maxVisits = 40 } = {}) {
  const domain = normalizeDomainKey(rootDomain);
  const chain = [];
  const unresolvedSet = new Set();
  let totalLookups = 0;
  let loopDetected = false;
  let truncated = false;
  let visitCount = 0;

  const get = (d) =>
    recordsByDomain instanceof Map
      ? recordsByDomain.get(d)
      : Object.prototype.hasOwnProperty.call(recordsByDomain || {}, d)
        ? recordsByDomain[d]
        : undefined;

  // `path` is the chain of ancestors on the *current* branch of recursion,
  // not a global "already seen" set -- two different includes legitimately
  // reference the same target domain (a shared ESP under two parent
  // records), and each reference is its own lookup that must still be
  // counted. Only a domain that includes one of its own ancestors is a
  // true cycle.
  function visit(rawDomain, via, path) {
    const key = normalizeDomainKey(rawDomain);
    if (!key) {
      chain.push({ domain: rawDomain ?? '', via, found: false, malformed: ['empty domain'], note: 'invalid' });
      return;
    }
    if (path.has(key)) {
      loopDetected = true;
      chain.push({ domain: key, via, found: null, malformed: [], note: 'loop' });
      return;
    }
    visitCount += 1;
    if (visitCount > maxVisits) {
      truncated = true;
      unresolvedSet.add(key);
      chain.push({ domain: key, via, found: null, malformed: [], note: 'budget-exceeded' });
      return;
    }

    const txt = get(key);
    if (txt === undefined) {
      truncated = true;
      unresolvedSet.add(key);
      chain.push({ domain: key, via, found: null, malformed: [], note: 'not-fetched' });
      return;
    }

    const records = selectSpfRecords(txt);
    const entry = {
      domain: key,
      via,
      found: records.length > 0,
      multiple: records.length > 1,
      record: records[0] ?? null,
      lookupsHere: 0,
      malformed: [],
    };
    chain.push(entry);
    if (records.length === 0) return;

    const parsed = parseSpfMechanisms(records[0]);
    entry.malformed = parsed.malformed;
    entry.allQualifier = parsed.allQualifier;
    entry.allNotLast = parsed.allNotLast;
    entry.redirect = parsed.redirect;
    // RFC 7208 s6.1: a redirect= in a record that also has an "all"
    // mechanism is ignored -- "all" always matches first -- so it is
    // neither fetched nor counted.
    entry.redirectIgnored = !!parsed.redirect && parsed.allQualifier !== null;

    const nextPath = new Set(path);
    nextPath.add(key);

    for (const term of parsed.lookupTerms) {
      totalLookups += 1;
      entry.lookupsHere += 1;
      if (term.mechanism === 'include' && term.domain) visit(term.domain, key, nextPath);
    }
    if (parsed.redirect && !entry.redirectIgnored) {
      totalLookups += 1;
      entry.lookupsHere += 1;
      visit(parsed.redirect, key, nextPath);
    }
  }

  visit(domain, null, new Set());
  const root = chain[0] ?? null;

  return {
    domain,
    root,
    chain,
    totalLookups,
    exceedsLookupLimit: totalLookups > 10,
    loopDetected,
    truncated,
    unresolved: [...unresolvedSet],
  };
}

// ---------------------------------------------------------------------------
// DKIM
// ---------------------------------------------------------------------------

/**
 * @param {{selector: string, txtRecords: string[]|null}} input
 *   `txtRecords` is `null` when the name did not resolve at all (NXDOMAIN /
 *   no TXT records) -- distinct from `[]`, which cannot happen for a real
 *   answer but is treated the same as `null` defensively.
 */
export function analyzeDkimSelector({ selector, txtRecords }) {
  const records = (txtRecords || []).filter((r) => typeof r === 'string' && r.trim().length);
  if (records.length === 0) {
    return { selector, found: false, record: null, hasVersionTag: false, hasPublicKey: false, revoked: false, keyType: null, keyBits: null, malformed: [] };
  }
  // Prefer a record that actually has a p= tag if more than one TXT string
  // lives at this name (a selector name colliding with an unrelated TXT
  // record is rare but not impossible).
  const withKey = records.find((r) => parseTagList(r).tags.has('p'));
  const record = withKey ?? records[0];
  const { tags, duplicates } = parseTagList(record);
  const malformed = duplicates.map((d) => `Duplicate ${d}= tag`);

  const hasVersionTag = (tags.get('v') || '').toUpperCase() === 'DKIM1';
  // RFC 6376 s3.6.1: v= is optional, but when present it MUST be "DKIM1";
  // a verifier discards a key record carrying any other version.
  if (tags.has('p') && tags.has('v') && !hasVersionTag) malformed.push(`v= tag is "${tags.get('v')}"; RFC 6376 s3.6.1 accepts only v=DKIM1`);
  const hasPTag = tags.has('p');
  // Base64 in a TXT record may carry folding whitespace (RFC 6376 s3.6.1).
  const pValue = (tags.get('p') || '').replace(/\s+/g, '');
  const revoked = hasPTag && pValue.length === 0;

  if (!hasPTag) malformed.push('No p= (public key) tag found -- this does not look like a DKIM key record');

  // k= defaults to rsa; RFC 8463 adds ed25519. Anything else (dsa, a typo)
  // is a key type no verifier implements, so no signature can verify.
  const keyType = (tags.get('k') || 'rsa').trim().toLowerCase();
  if (!['rsa', 'ed25519'].includes(keyType)) malformed.push(`k= tag is "${tags.get('k')}"; verifiers support only k=rsa (RFC 6376) and k=ed25519 (RFC 8463)`);

  let keyBits = null;
  if (hasPTag && !revoked) {
    const bytes = decodeBase64(pValue);
    if (!bytes) {
      malformed.push('p= is not valid base64, so no verifier can read the key');
    } else if (keyType === 'rsa') {
      keyBits = rsaModulusBits(bytes);
      if (keyBits === null) malformed.push('p= does not decode to an RSA public key (truncated or wrong key type?)');
    } else if (keyType === 'ed25519') {
      if (bytes.length === 32) keyBits = 256;
      else malformed.push(`an ed25519 p= must be 32 raw key bytes (RFC 8463 s4.2); this one is ${bytes.length}`);
    }
  }
  const hasPublicKey = hasPTag && !revoked && malformed.length === 0;

  return {
    selector,
    found: true,
    record,
    hasVersionTag,
    hasPublicKey,
    revoked,
    keyType,
    keyBits,
    malformed,
  };
}

/** Strict base64 (standard alphabet, optional padding) to bytes, or null. */
export function decodeBase64(text) {
  const s = String(text ?? '');
  if (!s.length || !/^[A-Za-z0-9+/]+={0,2}$/.test(s) || s.replace(/=+$/, '').length % 4 === 1) return null;
  const bin = atob(s.replace(/=+$/, '') + '='.repeat((4 - (s.replace(/=+$/, '').length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

// One DER tag-length-value at `off`, or null when it runs past the buffer.
function derAt(bytes, off) {
  if (off + 2 > bytes.length) return null;
  const tag = bytes[off];
  let len = bytes[off + 1];
  let start = off + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4 || start + n > bytes.length) return null;
    len = 0;
    for (let i = 0; i < n; i += 1) len = len * 256 + bytes[start + i];
    start += n;
  }
  if (start + len > bytes.length) return null;
  return { tag, start, end: start + len };
}

/**
 * Bit length of the RSA modulus in a DKIM p= value: a SubjectPublicKeyInfo
 * (what RFC 6376 s3.6.1 specifies) or a bare PKCS#1 RSAPublicKey (which some
 * publishers use and common verifiers accept). Null if neither parses.
 */
export function rsaModulusBits(bytes) {
  const outer = derAt(bytes, 0);
  if (!outer || outer.tag !== 0x30) return null;
  let first = derAt(bytes, outer.start);
  if (!first) return null;
  let modulus = null;
  if (first.tag === 0x30) {
    // SPKI: AlgorithmIdentifier, then BIT STRING { 0x00, RSAPublicKey }
    const bits = derAt(bytes, first.end);
    if (!bits || bits.tag !== 0x03 || bytes[bits.start] !== 0) return null;
    const rsa = derAt(bytes, bits.start + 1);
    if (!rsa || rsa.tag !== 0x30) return null;
    modulus = derAt(bytes, rsa.start);
  } else if (first.tag === 0x02) {
    modulus = first;
  }
  if (!modulus || modulus.tag !== 0x02) return null;
  let i = modulus.start;
  while (i < modulus.end && bytes[i] === 0) i += 1;
  if (i >= modulus.end) return null;
  return (modulus.end - i - 1) * 8 + (32 - Math.clz32(bytes[i]));
}

export function analyzeDkim(selectorResults) {
  const results = (selectorResults || []).map(analyzeDkimSelector);
  return {
    results,
    anyFound: results.some((r) => r.found),
    anyValid: results.some((r) => r.found && r.hasPublicKey && !(r.keyType === 'rsa' && r.keyBits < 1024)),
    anyRevoked: results.some((r) => r.found && r.revoked),
    checkedCount: results.length,
    foundCount: results.filter((r) => r.found).length,
  };
}

// ---------------------------------------------------------------------------
// DMARC
// ---------------------------------------------------------------------------

export function selectDmarcRecords(txtRecords) {
  return (txtRecords || []).filter(
    (r) => typeof r === 'string' && /^v=dmarc1(\s|;|$)/i.test(r.trim()),
  );
}

/**
 * `opts.foundAt` is the name whose _dmarc TXT answer this is, and
 * `opts.domain` the domain being checked. When they differ the record was
 * found by walking up to a parent (RFC 7489 s6.6.3 step 3, the
 * organizational-domain fallback; the DMARCbis DNS tree walk), and the
 * policy that applies to the checked domain is the parent's sp= when
 * present, else its p= (RFC 7489 s6.3, "sp"). `appliedPolicy` is that
 * policy; it is null when no policy applies, including when more than one
 * DMARC record is published (s6.6.3 step 5: policy discovery terminates).
 */
export function analyzeDmarc(txtRecords, { foundAt = null, domain = null } = {}) {
  const records = selectDmarcRecords(txtRecords);
  const fromKey = foundAt ? normalizeDomainKey(foundAt) : null;
  const inheritedFrom = fromKey && domain && fromKey !== normalizeDomainKey(domain) ? fromKey : null;
  if (records.length === 0) {
    return { found: false, multiple: false, record: null, tags: {}, policy: null, appliedPolicy: null, inheritedFrom: null, pct: null, hasReporting: false, malformed: [] };
  }
  const record = records[0];
  const { tags, duplicates } = parseTagList(record);
  const malformed = duplicates.map((d) => `Duplicate ${d}= tag`);

  const policy = (tags.get('p') || '').toLowerCase() || null;
  if (!policy || !['none', 'quarantine', 'reject'].includes(policy)) {
    malformed.push(policy ? `p= tag is "${tags.get('p')}", expected none/quarantine/reject` : 'No p= (policy) tag found -- required by RFC 7489');
  }
  const subdomainPolicy = (tags.get('sp') || '').toLowerCase() || null;
  if (tags.has('sp') && !['none', 'quarantine', 'reject'].includes(subdomainPolicy)) {
    malformed.push(`sp= tag is "${tags.get('sp')}", expected none/quarantine/reject`);
  }
  const tagWarnings = [];
  for (const t of ['adkim', 'aspf']) {
    if (tags.has(t) && !['r', 's'].includes(tags.get(t).trim().toLowerCase())) {
      tagWarnings.push(`${t}= tag is "${tags.get(t)}", expected r or s (RFC 7489 s6.3), so receivers fall back to relaxed`);
    }
  }

  let pct = 100;
  if (tags.has('pct')) {
    const raw = tags.get('pct').trim();
    const parsed = /^\d{1,3}$/.test(raw) ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) pct = parsed;
    else malformed.push(`pct= tag is "${tags.get('pct')}", expected an integer 0-100`);
  }

  const rua = tags.has('rua') ? tags.get('rua').split(',').map((s) => s.trim()).filter(Boolean) : [];
  const ruf = tags.has('ruf') ? tags.get('ruf').split(',').map((s) => s.trim()).filter(Boolean) : [];

  const adkim = (tags.get('adkim') || 'r').trim().toLowerCase() === 's' ? 'strict' : 'relaxed';
  const aspf = (tags.get('aspf') || 'r').trim().toLowerCase() === 's' ? 'strict' : 'relaxed';

  const multiple = records.length > 1;
  const validPolicy = (v) => (['none', 'quarantine', 'reject'].includes(v) ? v : null);
  let appliedPolicy = validPolicy(policy);
  if (inheritedFrom && validPolicy(subdomainPolicy)) appliedPolicy = subdomainPolicy;
  // RFC 7489 s6.6.3 step 6: an invalid sp= makes the receiver act as if
  // the record said p=none when it has a valid rua=, else apply no DMARC.
  const badSp = tags.has('sp') && !validPolicy(subdomainPolicy);
  if (badSp) appliedPolicy = rua.length ? 'none' : null;
  if (multiple) appliedPolicy = null;

  return {
    found: true,
    multiple,
    record,
    tags: Object.fromEntries(tags),
    policy,
    appliedPolicy,
    inheritedFrom,
    subdomainPolicy,
    pct,
    rua,
    ruf,
    hasReporting: rua.length > 0 || ruf.length > 0,
    adkim,
    aspf,
    malformed,
    tagWarnings,
  };
}

// ---------------------------------------------------------------------------
// BIMI
// ---------------------------------------------------------------------------

export function selectBimiRecords(txtRecords) {
  return (txtRecords || []).filter(
    (r) => typeof r === 'string' && /^v=bimi1(\s|;|$)/i.test(r.trim()),
  );
}

/** Is DMARC enforced strongly enough for Google/Yahoo to display a BIMI logo? */
export function dmarcSufficientForBimi(dmarc) {
  return !!dmarc && dmarc.found && ['quarantine', 'reject'].includes(dmarc.appliedPolicy) && dmarc.pct === 100;
}

export function analyzeBimi(txtRecords, dmarc) {
  const records = selectBimiRecords(txtRecords);
  if (records.length === 0) {
    return { found: false, record: null, hasLogoUrl: false, hasAuthorityEvidence: false, dmarcSufficient: dmarcSufficientForBimi(dmarc), malformed: [] };
  }
  const record = records[0];
  const { tags, duplicates } = parseTagList(record);
  const malformed = duplicates.map((d) => `Duplicate ${d}= tag`);
  const l = (tags.get('l') || '').trim();
  const a = (tags.get('a') || '').trim();
  if (!l) malformed.push('No l= (logo URL) tag found');
  else if (!/^https:\/\//i.test(l)) malformed.push('l= logo URL is not https://');

  return {
    found: true,
    multiple: records.length > 1,
    record,
    hasLogoUrl: l.length > 0,
    logoUrl: l || null,
    hasAuthorityEvidence: a.length > 0,
    authorityEvidenceUrl: a || null,
    dmarcSufficient: dmarcSufficientForBimi(dmarc),
    malformed,
  };
}

// ---------------------------------------------------------------------------
// Combined report
// ---------------------------------------------------------------------------

function finding(id, severity, title, detail, evidence) {
  return { id, severity, title, detail, evidence };
}

function spfFindings(walk, transportError) {
  const findings = [];
  if (transportError) {
    findings.push(finding(
      'spf-lookup-failed', 'notice', 'Could not look up SPF',
      `Looking up the SPF record at ${walk?.domain ?? '(domain)'} failed: ${transportError}. Re-run the check once the lookup succeeds.`,
      `error: ${transportError}`,
    ));
    return findings;
  }
  const root = walk.root;
  if (!root || !root.found) {
    findings.push(finding(
      'spf-missing', 'danger', 'No SPF record found',
      `No TXT record starting with "v=spf1" was found at ${walk.domain}. Without SPF, receiving mail servers have no record of which servers are allowed to send mail as your domain, so nothing fails an SPF check for a forged message.`,
      `TXT ${walk.domain}: (no v=spf1 record)`,
    ));
    return findings;
  }
  if (root.multiple) {
    findings.push(finding(
      'spf-multiple-records', 'danger', 'Multiple SPF records published',
      `${walk.domain} publishes more than one TXT record starting with "v=spf1". RFC 7208 permits exactly one; most mail servers treat multiple records as a permanent error (PermError) and fail SPF for every message from this domain, valid or not. Merge them into a single record.`,
      `TXT ${walk.domain}: multiple v=spf1 records`,
    ));
  }
  if (root.malformed && root.malformed.length) {
    findings.push(finding(
      'spf-malformed', 'danger', 'SPF record has invalid syntax',
      `${walk.domain}'s SPF record could not be fully parsed: ${root.malformed.join('; ')}. A record a mail server can't parse is treated as a permanent error (PermError), which fails SPF for every message.`,
      `TXT ${walk.domain}: ${root.record}`,
    ));
  }
  if (root.allNotLast) {
    findings.push(finding(
      'spf-all-not-last', 'notice', '"all" is not the last term',
      `${walk.domain}'s SPF record has one or more terms after "all". Evaluation stops at the first matching mechanism, so nothing after "all" (which always matches) is ever reached.`,
      `TXT ${walk.domain}: ${root.record}`,
    ));
  }

  // RFC 7208 s5.2 (include) and s6.1 (redirect): a target with no SPF record,
  // more than one, or a record that does not parse is a PermError for the
  // whole evaluation, not only for that branch. A retired vendor's include
  // left in the record is the usual real-world cause.
  const brokenTargets = walk.chain.slice(1).filter(
    (c) => c.note !== 'loop' && c.found !== null && (c.found === false || c.multiple || (c.malformed && c.malformed.length)),
  );
  if (brokenTargets.length) {
    findings.push(finding(
      'spf-include-broken', 'danger', `An include: or redirect= target has no usable SPF record (${brokenTargets.length})`,
      `${walk.domain}'s SPF record points at ${brokenTargets.map((c) => c.domain).join(', ')}, which ${brokenTargets.length === 1 ? 'does' : 'do'} not publish exactly one valid "v=spf1" record. RFC 7208 (s5.2 for include:, s6.1 for redirect=) makes that a permanent error (PermError) for the whole check, so SPF fails for messages that reach that term. Remove the reference if the vendor is retired, or fix the record it points at.`,
      brokenTargets.map((c) => `${c.domain} (via ${c.via}): ${c.found === false ? 'no v=spf1 record' : c.multiple ? 'multiple v=spf1 records' : c.malformed.join('; ')}`).join('; '),
    ));
  }

  if (walk.exceedsLookupLimit) {
    findings.push(finding(
      'spf-too-many-lookups', 'danger', `SPF exceeds the 10-lookup limit (${walk.totalLookups} found)`,
      `Fully evaluating ${walk.domain}'s SPF record (following every include: and redirect= mechanism it references) requires ${walk.totalLookups} DNS lookups. RFC 7208 permits at most 10 -- a receiver that reaches the 11th lookup stops with a permanent error (PermError), and SPF fails for that message whether or not it is legitimate. Lookups are counted as evaluation goes, so a message that matches an earlier term can still pass; mail from a sender listed late in the record, or not listed at all, fails. This is the single most common real-world SPF bug, usually caused by stacking an include: for every marketing/support tool the domain uses. ${SCOPE_NOTE}`,
      `${walk.totalLookups} lookup-mechanism occurrences across ${walk.chain.filter((c) => c.found).length} SPF record(s) in the chain`,
    ));
  } else if (walk.totalLookups >= 8) {
    findings.push(finding(
      'spf-near-lookup-limit', 'notice', `SPF is close to the 10-lookup limit (${walk.totalLookups} of 10 used)`,
      `${walk.domain}'s SPF chain uses ${walk.totalLookups} of the 10 DNS lookups RFC 7208 allows. Adding one more include: (a new ESP, a new marketing tool) risks pushing it over, which fails SPF for every message. Consider flattening some includes to raw ip4/ip6 mechanisms.`,
      `${walk.totalLookups} lookup-mechanism occurrences`,
    ));
  }

  const voids = walk.voidLookups || [];
  if (voids.length > 2) {
    findings.push(finding(
      'spf-too-many-void-lookups', 'danger', `SPF has ${voids.length} void lookups (limit is 2)`,
      `${voids.length} a/mx/exists terms in ${walk.domain}'s SPF chain point at names that return no records. RFC 7208 s4.6.4 lets a receiver return a permanent error (PermError) after more than 2 such "void lookups", failing SPF for every message. These are usually left over from vendors that were retired: remove them.`,
      voids.map((v) => `${v.mechanism}:${v.target} (in ${v.domain})`).join('; '),
    ));
  } else if (voids.length > 0) {
    findings.push(finding(
      'spf-void-lookup', 'notice', `SPF has ${voids.length} void lookup${voids.length === 1 ? '' : 's'} (limit is 2)`,
      `${voids.length} a/mx/exists term(s) in ${walk.domain}'s SPF chain point at names that return no records. RFC 7208 allows 2 per evaluation and a third is a PermError, so this is a stale entry to remove before it becomes one.`,
      voids.map((v) => `${v.mechanism}:${v.target} (in ${v.domain})`).join('; '),
    ));
  }

  if (walk.loopDetected) {
    findings.push(finding(
      'spf-loop', 'danger', 'SPF include/redirect chain loops back on itself',
      `Following ${walk.domain}'s include:/redirect= chain revisits a domain already seen. A circular reference like this is a permanent error (PermError) for any mail server that detects it.`,
      `chain: ${walk.chain.map((c) => c.domain).join(' -> ')}`,
    ));
  }
  if (walk.truncated) {
    findings.push(finding(
      'spf-chain-incomplete', 'notice', 'Could not fully resolve the SPF chain',
      `${walk.unresolved.length} referenced domain(s) (${walk.unresolved.join(', ')}) could not be looked up within this check's budget. The ${walk.totalLookups}-lookup count above is therefore a minimum, not necessarily final.`,
      `unresolved: ${walk.unresolved.join(', ') || '(none)'}`,
    ));
  }

  const ptrHosts = walk.chain.filter((c) => c.found && c.record && parseSpfMechanisms(c.record).lookupTerms.some((t) => t.mechanism === 'ptr'));
  if (ptrHosts.length) {
    findings.push(finding(
      'spf-ptr', 'notice', 'SPF uses the ptr mechanism, which RFC 7208 says not to publish',
      `The ptr mechanism appears in ${ptrHosts.map((c) => c.domain).join(', ')}. RFC 7208 s5.5 says ptr SHOULD NOT be used: it is slow, unreliable, and receivers may skip it, and it still spends one of the 10 lookups. Replace it with ip4/ip6 or a/mx terms.`,
      ptrHosts.map((c) => `TXT ${c.domain}: ${c.record}`).join('; '),
    ));
  }
  if (root.redirectIgnored) {
    findings.push(finding(
      'spf-redirect-ignored', 'notice', 'redirect= is ignored because the record also has "all"',
      `${walk.domain}'s SPF record has both an "all" mechanism and redirect=${root.redirect}. RFC 7208 s6.1 says redirect= is ignored when "all" is present, so receivers never follow it and it costs no lookup. Remove one of them so the record says what it does.`,
      `TXT ${walk.domain}: ${root.record}`,
    ));
  }

  // A record that ends in redirect= with no "all" takes its closing answer
  // from the redirect target's record (RFC 7208 s6.1), so read "all" there.
  let allFrom = root;
  for (let hop = 0; allFrom && allFrom.allQualifier == null && allFrom.redirect && hop < 10; hop += 1) {
    const target = normalizeDomainKey(allFrom.redirect);
    allFrom = walk.chain.find((c) => c.domain === target && c.via === allFrom.domain && c.found) ?? null;
  }
  const allQ = allFrom ? allFrom.allQualifier ?? null : null;
  const viaRedirect = allFrom && allFrom !== root ? ` (reached through redirect= to ${allFrom.domain})` : '';
  const allEvidence = allFrom && allFrom !== root ? `TXT ${walk.domain}: ${root.record}; TXT ${allFrom.domain}: ${allFrom.record}` : `TXT ${walk.domain}: ${root.record}`;

  if (allQ === '+') {
    findings.push(finding(
      'spf-plus-all', 'danger', 'SPF ends in +all -- authorizes any server to send as this domain',
      `${walk.domain}'s SPF record ends in "+all"${viaRedirect} (or bare "all", which defaults to +all). This explicitly tells receivers that ANY server on the internet is authorized to send mail as this domain. It is one of the most serious SPF misconfigurations possible -- it makes the rest of the record pointless and provides zero spoofing protection.`,
      allEvidence,
    ));
  } else if (allQ === '?') {
    findings.push(finding(
      'spf-neutral-all', 'notice', 'SPF ends in ?all -- neutral, provides no real protection',
      `${walk.domain}'s SPF record ends in "?all"${viaRedirect} (neutral). Receivers are told to treat a non-matching sender as neither pass nor fail -- functionally close to having no SPF policy at all for anything not explicitly listed.`,
      allEvidence,
    ));
  } else if (allQ === '~') {
    findings.push(finding(
      'spf-softfail-all', 'notice', 'SPF ends in ~all (softfail)',
      `${walk.domain}'s SPF record ends in "~all"${viaRedirect} (softfail). Most receivers accept a softfail message but may flag or quarantine it rather than rejecting it outright. "-all" (hardfail) is the stronger setting once every legitimate sending source is confirmed to be listed.`,
      allEvidence,
    ));
  } else if (allQ === '-') {
    findings.push(finding(
      'spf-hardfail-all', 'info', 'SPF ends in -all (hardfail)',
      `${walk.domain}'s SPF record ends in "-all"${viaRedirect} (hardfail), the strongest SPF setting: receivers are told to reject mail from any server not explicitly listed as an SPF source.`,
      allEvidence,
    ));
  } else if (root.allQualifier === null && !root.redirect) { // no all, no redirect
    findings.push(finding(
      'spf-no-all-no-redirect', 'notice', 'No "all" mechanism and no redirect=',
      `${walk.domain}'s SPF record has neither an "all" mechanism nor a redirect= modifier. Per RFC 7208, a sender that matches none of the listed mechanisms then evaluates to Neutral -- a similarly weak result to "?all" -- rather than the record giving a deliberate closing answer.`,
      `TXT ${walk.domain}: ${root.record}`,
    ));
  }

  return findings;
}

function dkimFindings(dkim, transportErrors) {
  const findings = [];
  for (const err of transportErrors || []) {
    findings.push(finding(
      'dkim-lookup-failed', 'notice', `Could not look up DKIM selector "${err.selector}"`,
      `Looking up ${err.selector}._domainkey failed: ${err.error}. Re-run the check once the lookup succeeds.`,
      `error: ${err.error}`,
    ));
  }
  for (const r of dkim.results) {
    if (!r.found) continue;
    if (r.revoked) {
      findings.push(finding(
        'dkim-revoked-key', 'notice', `DKIM selector "${r.selector}" has an empty p= (revoked/disabled)`,
        `${r.selector}._domainkey publishes a DKIM record with an empty p= tag. Per RFC 6376, an empty public key means this selector has been deliberately revoked or disabled -- any signature made with it will now fail to verify. This is expected during a planned key rotation; unexpected, it means a working selector was turned off.`,
        `TXT ${r.selector}._domainkey: ${r.record}`,
      ));
    } else if (r.malformed.length) {
      findings.push(finding(
        'dkim-malformed', 'notice', `Selector "${r.selector}" resolved but doesn't hold a usable DKIM key`,
        `${r.selector}._domainkey resolves to a TXT record, but ${r.malformed.join('; ')}. It may be an unrelated TXT record squatting at this name, or a misconfigured key; mail signed with it will not verify.`,
        `TXT ${r.selector}._domainkey: ${r.record}`,
      ));
    } else if (r.hasPublicKey && r.keyType === 'rsa' && r.keyBits < 1024) {
      findings.push(finding(
        'dkim-weak-key', 'danger', `DKIM selector "${r.selector}" uses a ${r.keyBits}-bit RSA key (minimum is 1024)`,
        `${r.selector}._domainkey publishes a ${r.keyBits}-bit RSA key. RFC 8301 s3.2 says verifiers MUST NOT treat signatures made with keys under 1024 bits as valid, and Gmail and Yahoo's bulk-sender rules ask for at least 1024 (2048 recommended). Mail signed with this selector fails DKIM. Rotate to a 2048-bit key.`,
        `TXT ${r.selector}._domainkey: ${r.record}`,
      ));
    } else if (r.hasPublicKey) {
      const size = r.keyType === 'ed25519' ? 'an ed25519' : `a ${r.keyBits}-bit RSA`;
      const short = r.keyType === 'rsa' && r.keyBits < 2048
        ? ' It meets the 1024-bit floor (RFC 8301 s3.2) but is below the 2048 bits RFC 8301 asks signers to use; plan a rotation.'
        : '';
      findings.push(finding(
        'dkim-valid-key', 'info', `DKIM selector "${r.selector}" has a valid public key`,
        `${r.selector}._domainkey publishes ${size} public key that parses${r.hasVersionTag ? ', with v=DKIM1' : ''} -- mail signed with this selector can be verified by receivers.${short}`,
        `TXT ${r.selector}._domainkey: ${r.record}`,
      ));
    }
  }
  if (dkim.checkedCount > 0 && !dkim.anyFound) {
    findings.push(finding(
      'dkim-none-found', 'notice', 'No DKIM key found at any common selector',
      `None of the ${dkim.checkedCount} common selector names this tool checks (${dkim.results.map((r) => r.selector).join(', ')}) resolved. This is not proof DKIM isn't configured -- many providers use a custom, per-tenant, or rotating selector this tool cannot guess. Check your email provider's dashboard or a sent message's own DKIM-Signature header for the exact selector, then verify it directly: <selector>._domainkey.${'{domain}'}.`,
      `checked: ${dkim.results.map((r) => r.selector).join(', ')}`,
    ));
  }
  return findings;
}

function dmarcFindings(domain, dmarc, transportError) {
  const findings = [];
  if (transportError) {
    findings.push(finding(
      'dmarc-lookup-failed', 'notice', 'Could not look up DMARC',
      `Looking up the DMARC record at _dmarc.${domain} (or a parent domain) failed: ${transportError}. Re-run the check once the lookup succeeds.`,
      `error: ${transportError}`,
    ));
    return findings;
  }
  if (!dmarc.found) {
    const parents = domain.split('.').length > 2 ? ' or at any parent domain' : '';
    findings.push(finding(
      'dmarc-missing', 'danger', 'No DMARC record found',
      `No TXT record starting with "v=DMARC1" was found at _dmarc.${domain}${parents}. Without DMARC, receivers have no instruction for what to do with mail that fails SPF or DKIM alignment, and you receive no reports telling you who is sending mail (legitimate or spoofed) using your domain. A domain can look fully configured with SPF and DKIM in place and still be completely spoofable without this.`,
      `TXT _dmarc.${domain}: (no v=DMARC1 record)`,
    ));
    return findings;
  }
  // Where the record was read: the domain itself, or the parent that the
  // RFC 7489 s6.6.3 organizational-domain fallback reached.
  const at = dmarc.inheritedFrom || domain;
  const inherited = Boolean(dmarc.inheritedFrom);
  const usesSp = inherited && dmarc.appliedPolicy && dmarc.subdomainPolicy === dmarc.appliedPolicy;
  const tag = usesSp ? 'sp' : 'p';
  if (inherited) {
    findings.push(finding(
      'dmarc-inherited', 'info', `No DMARC record of its own: the policy at _dmarc.${at} applies`,
      `_dmarc.${domain} publishes no DMARC record, so receivers fall back to the record of the organizational domain (RFC 7489 s6.6.3), found at _dmarc.${at}. For a subdomain that record's sp= tag applies when present, otherwise its p= tag (RFC 7489 s6.3)${dmarc.appliedPolicy ? `; here that is ${tag}=${dmarc.appliedPolicy}` : ''}. Publish a record at _dmarc.${domain} only if this subdomain needs a different policy or its own reports.`,
      `TXT _dmarc.${domain}: (no v=DMARC1 record); TXT _dmarc.${at}: ${dmarc.record}`,
    ));
  }
  if (dmarc.multiple) {
    findings.push(finding(
      'dmarc-multiple-records', 'danger', 'Multiple DMARC records published: no policy applies',
      `_dmarc.${at} publishes more than one TXT record starting with "v=DMARC1". RFC 7489 s6.6.3 says policy discovery then terminates and DMARC is not applied at all, so none of these records' policies is in force: receivers treat the domain as if it had no DMARC record. Delete all but one.`,
      `TXT _dmarc.${at}: multiple v=DMARC1 records`,
    ));
  }
  if (dmarc.malformed.length) {
    findings.push(finding(
      'dmarc-malformed', 'danger', 'DMARC record has invalid tags',
      `_dmarc.${at}'s DMARC record has a problem: ${dmarc.malformed.join('; ')}.`,
      `TXT _dmarc.${at}: ${dmarc.record}`,
    ));
  }
  if (dmarc.tagWarnings && dmarc.tagWarnings.length) {
    findings.push(finding(
      'dmarc-tag-ignored', 'notice', 'DMARC record has a tag value receivers will ignore',
      `_dmarc.${at}'s DMARC record: ${dmarc.tagWarnings.join('; ')}. The policy still applies; fix the value so the record means what it says.`,
      `TXT _dmarc.${at}: ${dmarc.record}`,
    ));
  }
  const policy = dmarc.appliedPolicy;
  const who = inherited ? `Mail from ${domain} is covered by ${tag}=${policy} at _dmarc.${at}` : `_dmarc.${domain} is published with p=${policy}`;
  const title = (p) => (inherited ? `DMARC policy for this subdomain is ${tag}=${p} (inherited)` : `DMARC policy is p=${p}`);
  if (policy === 'none') {
    findings.push(finding(
      'dmarc-policy-none', 'notice', `${title('none')} (monitor-only)`,
      `${who}: receivers are asked to take no action even on a message that fails alignment. This is the most common real-world gap -- the domain looks configured (SPF, DKIM, and DMARC all present) but is still fully spoofable in practice. p=none is a reasonable first step while reviewing reports; move to p=quarantine or p=reject once they look clean.`,
      `TXT _dmarc.${at}: ${dmarc.record}`,
    ));
  } else if (policy === 'quarantine') {
    findings.push(finding(
      'dmarc-policy-quarantine', 'info', title('quarantine'),
      `${who}, which asks receivers to route a message that fails alignment to spam/junk rather than the inbox. Real enforcement, one step short of p=reject.`,
      `TXT _dmarc.${at}: ${dmarc.record}`,
    ));
  } else if (policy === 'reject') {
    findings.push(finding(
      'dmarc-policy-reject', 'info', title('reject'),
      `${who}, which asks receivers to refuse a message that fails alignment outright. The strongest DMARC enforcement level.`,
      `TXT _dmarc.${at}: ${dmarc.record}`,
    ));
  }
  if (policy && policy !== 'none' && dmarc.pct < 100) {
    findings.push(finding(
      'dmarc-pct-partial', 'notice', `Only ${dmarc.pct}% of failing mail is subject to the policy (pct=${dmarc.pct})`,
      `_dmarc.${at} sets pct=${dmarc.pct}, so only that percentage of messages failing alignment get the ${tag}=${policy} treatment above -- the rest are handled as if p=none. Consider raising toward pct=100 once reports look clean.`,
      `TXT _dmarc.${at}: ${dmarc.record}`,
    ));
  }
  if (!dmarc.hasReporting) {
    findings.push(finding(
      'dmarc-no-reporting', 'notice', 'No rua= (or ruf=) reporting address configured',
      `_dmarc.${at} has no rua= aggregate-report address, so you receive no visibility into who is sending mail -- legitimate or spoofed -- using your domain. Adding rua=mailto:you@${at} (or a DMARC report-aggregation service) is what makes DMARC's reports actually useful.`,
      `TXT _dmarc.${at}: ${dmarc.record}`,
    ));
  }
  if (dmarc.adkim === 'strict' || dmarc.aspf === 'strict') {
    findings.push(finding(
      'dmarc-strict-alignment', 'info', `Alignment mode: DKIM ${dmarc.adkim}, SPF ${dmarc.aspf}`,
      `_dmarc.${at} requires ${dmarc.adkim === 'strict' ? 'an exact domain match for DKIM' : 'DKIM alignment (relaxed, default)'} and ${dmarc.aspf === 'strict' ? 'an exact domain match for SPF' : 'SPF alignment (relaxed, default)'}. Strict mode is more precise but breaks alignment for mail sent via a subdomain of a third-party sender.`,
      `TXT _dmarc.${at}: ${dmarc.record}`,
    ));
  }
  return findings;
}

function bimiFindings(domain, bimi, dmarc, transportError) {
  const findings = [];
  if (transportError) {
    findings.push(finding(
      'bimi-lookup-failed', 'notice', 'Could not look up BIMI',
      `Looking up the BIMI record at default._bimi.${domain} failed: ${transportError}.`,
      `error: ${transportError}`,
    ));
    return findings;
  }
  if (!bimi.found) {
    findings.push(finding(
      'bimi-absent', 'info', 'No BIMI record found (optional)',
      `No TXT record starting with "v=BIMI1" was found at default._bimi.${domain}. BIMI is optional: it shows your logo next to messages in supporting inboxes (Gmail, Yahoo, and others) once DMARC is enforced. ${dmarc.found && dmarcSufficientForBimi(dmarc) ? 'DMARC enforcement here already meets the DNS prerequisite for BIMI; Gmail also requires a Verified Mark Certificate or Common Mark Certificate (the a= tag) before it shows a logo.' : 'DMARC enforcement is not yet strong enough for BIMI to be honored even if added -- see the DMARC findings above.'}`,
      `TXT default._bimi.${domain}: (no v=BIMI1 record)`,
    ));
    return findings;
  }
  if (bimi.malformed.length) {
    findings.push(finding(
      'bimi-malformed', 'notice', 'BIMI record is missing required tags',
      `default._bimi.${domain}'s BIMI record has a problem: ${bimi.malformed.join('; ')}.`,
      `TXT default._bimi.${domain}: ${bimi.record}`,
    ));
  }
  if (bimi.dmarcSufficient) {
    findings.push(finding(
      'bimi-present-and-honored', 'info', 'BIMI record found, and DMARC enforcement is strong enough for it to be honored',
      `default._bimi.${domain} is published, and DMARC is at p=${dmarc.appliedPolicy} with pct=100 -- the enforcement level Google and Yahoo require before they will display a BIMI logo. (They may still require a Verified Mark Certificate via the a= tag for a checkmark in some inboxes; this check only confirms the DNS-level prerequisites.)`,
      `TXT default._bimi.${domain}: ${bimi.record}`,
    ));
  } else {
    findings.push(finding(
      'bimi-present-not-honored', 'notice', 'BIMI record found, but DMARC enforcement is not strong enough for it to be honored',
      `default._bimi.${domain} is published, but Google and Yahoo require DMARC at p=quarantine or p=reject with pct=100 before they will display a BIMI logo. ${dmarc.found ? `Current DMARC here is p=${dmarc.appliedPolicy ?? '(none applies)'} pct=${dmarc.pct ?? 100}.` : 'No DMARC record was found at all -- see the DMARC findings above.'}`,
      `TXT default._bimi.${domain}: ${bimi.record}`,
    ));
  }
  return findings;
}

/**
 * Assembles the full evidence-first report from already-analyzed pieces.
 * Every argument here is plain data produced by the functions above (or by
 * `lookup.mjs`'s network layer feeding raw TXT answers through them) --
 * nothing in this function does I/O, so it is exactly what `analyze.test.mjs`
 * exercises directly with fixtures.
 */
export function buildReport(domain, { spfWalk, spfError, dkim, dkimErrors, dmarc, dmarcError, bimi, bimiError } = {}) {
  const findings = [
    ...spfFindings(spfWalk, spfError),
    ...dkimFindings(dkim, dkimErrors),
    ...dmarcFindings(domain, dmarc, dmarcError),
    ...bimiFindings(domain, bimi, dmarc, bimiError),
  ];

  const dangerCount = findings.filter((f) => f.severity === 'danger').length;
  const noticeCount = findings.filter((f) => f.severity === 'notice').length;
  const infoCount = findings.filter((f) => f.severity === 'info').length;
  const incomplete = Boolean(spfError || dmarcError || bimiError || (dkimErrors && dkimErrors.length));

  return {
    domain,
    generatedAt: new Date().toISOString(),
    findings,
    dangerCount,
    noticeCount,
    infoCount,
    incomplete,
    ok: dangerCount === 0,
    scopeNote: SCOPE_NOTE,
  };
}
