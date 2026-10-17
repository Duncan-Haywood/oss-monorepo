// Turns a resolved CAA record set (lookup.mjs) into a report: which
// certificate authorities are actually authorized to issue for this name,
// which records are malformed, and whether a critical-flagged, unrecognized
// property tag is silently blocking every CA that doesn't implement it --
// the finding a bare "here are your CAA records" lookup tool never surfaces,
// because it requires understanding RFC 8659's processing rules, not just
// displaying the record text.

import { parseIssueValue } from './parse.mjs';

/**
 * Certificate authorities most sites choose among, with the issuer domain
 * name each publishes for use in a CAA `issue`/`issuewild` value. Sourced
 * from each CA's own CAA-setup documentation and Let's Encrypt's own CAA
 * guide (https://letsencrypt.org/docs/caa/) at screening time -- a CA can
 * change or add an issuer domain, so treat this as a helpful shortlist, not
 * an authoritative registry, and always cross-check an unexpected result
 * against the CA's own current documentation before treating it as final.
 */
export const KNOWN_CAS = [
  { domain: 'letsencrypt.org', name: "Let's Encrypt" },
  { domain: 'pki.goog', name: 'Google Trust Services' },
  { domain: 'digicert.com', name: 'DigiCert' },
  { domain: 'sectigo.com', name: 'Sectigo' },
  { domain: 'amazontrust.com', name: 'Amazon Trust Services (AWS Certificate Manager)' },
  { domain: 'globalsign.com', name: 'GlobalSign' },
  { domain: 'ssl.com', name: 'SSL.com' },
  { domain: 'zerossl.com', name: 'ZeroSSL' },
];

const STANDARD_TAGS = new Set(['issue', 'issuewild', 'iodef']);

/**
 * @param {Array<{ok:boolean, flag?:number, critical?:boolean, tag?:string, value?:string, error?:string, raw?:string}>} records
 */
export function analyzeCaaSet(records) {
  const malformed = records.filter((r) => !r.ok).map((r) => ({ error: r.error, raw: r.raw }));
  const parsed = records.filter((r) => r.ok);

  const criticalUnknown = parsed.filter((r) => r.critical && !STANDARD_TAGS.has(r.tag));

  const issueRecords = parsed.filter((r) => r.tag === 'issue').map((r) => ({ ...r, parsedValue: parseIssueValue(r.value) }));
  const issuewildRecords = parsed.filter((r) => r.tag === 'issuewild').map((r) => ({ ...r, parsedValue: parseIssueValue(r.value) }));
  const iodefRecords = parsed.filter((r) => r.tag === 'iodef');

  const nonWildcardAuthorized = new Set(
    issueRecords.filter((r) => !r.parsedValue.disallowAll).map((r) => r.parsedValue.issuerDomain),
  );
  const nonWildcardDisallowAll = issueRecords.length > 0 && nonWildcardAuthorized.size === 0;

  // RFC 8659: issuewild governs wildcard certs when present at all; when no
  // issuewild record exists anywhere in the set (not even a disallow-all
  // one), issue applies to both. A single missed edge case here -- treating
  // "issuewild present but only as disallow-all" as "fall back to issue" --
  // is exactly the kind of fallback-rule mistake this tool exists to get
  // right, the same class of error security-headers-check documents for
  // CSP's frame-ancestors/default-src fallback.
  const wildcardAuthorized = issuewildRecords.length > 0
    ? new Set(issuewildRecords.filter((r) => !r.parsedValue.disallowAll).map((r) => r.parsedValue.issuerDomain))
    : new Set(nonWildcardAuthorized);
  const wildcardDisallowAll = issuewildRecords.length > 0 ? wildcardAuthorized.size === 0 : nonWildcardDisallowAll;

  const noCaaAnywhere = records.length === 0;

  function verdictFor(caDomain, authorizedSet, disallowAll) {
    if (criticalUnknown.length > 0) {
      return { authorized: false, reason: 'blocked-by-critical-unknown-tag' };
    }
    if (noCaaAnywhere) return { authorized: true, reason: 'no-caa-record-found' };
    if (disallowAll) return { authorized: false, reason: 'disallow-all' };
    if (authorizedSet.size === 0) return { authorized: true, reason: 'no-issue-property-in-set' };
    return { authorized: authorizedSet.has(caDomain.toLowerCase()), reason: authorizedSet.has(caDomain.toLowerCase()) ? 'named' : 'not-named' };
  }

  const caVerdicts = KNOWN_CAS.map((ca) => ({
    ...ca,
    nonWildcard: verdictFor(ca.domain, nonWildcardAuthorized, nonWildcardDisallowAll),
    wildcard: verdictFor(ca.domain, wildcardAuthorized, wildcardDisallowAll),
  }));

  return {
    noCaaAnywhere,
    malformed,
    criticalUnknown: criticalUnknown.map((r) => ({ tag: r.tag, value: r.value })),
    nonWildcardAuthorized: [...nonWildcardAuthorized],
    wildcardAuthorized: [...wildcardAuthorized],
    nonWildcardDisallowAll,
    wildcardDisallowAll,
    iodef: iodefRecords.map((r) => r.value),
    caVerdicts,
    /** True when this hostname has at least one issue worth a human's attention. */
    hasFindings: malformed.length > 0 || criticalUnknown.length > 0,
  };
}

/**
 * Checks one named or custom CA domain against an already-analyzed set, for
 * the CLI's `--ca` flag and the browser's "check a specific CA" field --
 * covers a CA outside the `KNOWN_CAS` shortlist without needing the table
 * to be exhaustive.
 */
export function verdictForCustomCa(analysis, caDomain) {
  const domain = String(caDomain).trim().toLowerCase();
  const known = KNOWN_CAS.find((ca) => ca.domain === domain);
  if (known) return analysis.caVerdicts.find((v) => v.domain === domain);
  const nonWildcard = analysis.criticalUnknown.length > 0
    ? { authorized: false, reason: 'blocked-by-critical-unknown-tag' }
    : analysis.noCaaAnywhere
      ? { authorized: true, reason: 'no-caa-record-found' }
      : analysis.nonWildcardDisallowAll
        ? { authorized: false, reason: 'disallow-all' }
        : analysis.nonWildcardAuthorized.length === 0
          ? { authorized: true, reason: 'no-issue-property-in-set' }
          : { authorized: analysis.nonWildcardAuthorized.includes(domain), reason: analysis.nonWildcardAuthorized.includes(domain) ? 'named' : 'not-named' };
  const wildcard = analysis.criticalUnknown.length > 0
    ? { authorized: false, reason: 'blocked-by-critical-unknown-tag' }
    : analysis.noCaaAnywhere
      ? { authorized: true, reason: 'no-caa-record-found' }
      : analysis.wildcardDisallowAll
        ? { authorized: false, reason: 'disallow-all' }
        : analysis.wildcardAuthorized.length === 0
          ? { authorized: true, reason: 'no-issue-property-in-set' }
          : { authorized: analysis.wildcardAuthorized.includes(domain), reason: analysis.wildcardAuthorized.includes(domain) ? 'named' : 'not-named' };
  return { domain, name: domain, nonWildcard, wildcard };
}

/** Combines a lookup result and its analysis into one per-hostname result. */
export function classify(hostname, lookup, requestedCa) {
  if (!lookup.ok) {
    return { hostname, category: 'lookup-error', error: lookup.error, lookup: null, analysis: null, requestedCaVerdict: null };
  }
  const analysis = analyzeCaaSet(lookup.records);
  const requestedCaVerdict = requestedCa ? verdictForCustomCa(analysis, requestedCa) : null;
  const category = analysis.malformed.length > 0 || analysis.criticalUnknown.length > 0
    ? 'has-findings'
    : requestedCaVerdict && !requestedCaVerdict.nonWildcard.authorized
      ? 'requested-ca-blocked'
      : 'clean';
  return { hostname, category, error: null, lookup, analysis, requestedCaVerdict };
}

/** Aggregates classify() results into the shape the CLI and the page render. */
export function buildReport(hostnames, results) {
  const errors = results.filter((r) => r.category === 'lookup-error');
  const findings = results.filter((r) => r.category === 'has-findings');
  const blocked = results.filter((r) => r.category === 'requested-ca-blocked');
  const clean = results.filter((r) => r.category === 'clean');
  return {
    hostnamesChecked: hostnames.length,
    results,
    errors,
    findingsCount: findings.length,
    blockedCount: blocked.length,
    cleanCount: clean.length,
    ok: errors.length === 0 && findings.length === 0 && blocked.length === 0,
  };
}
