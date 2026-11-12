// Classifies one hostname's CNAME chain plus (optionally) a live HTTP probe
// of that hostname into a subdomain-takeover verdict. Pure function, no I/O,
// no network -- imported identically by the CLI (check.mjs) and the browser
// page (index.html), the same split every checker in this portfolio uses.
//
// What each category means:
//
//   no-cname             The hostname has no CNAME record (resolves via A/
//                         AAAA directly, or does not resolve at all). This
//                         check only applies to CNAME-based hosting; nothing
//                         to report either way.
//   not-risky            The CNAME target does not match any provider in
//                         `fingerprints.mjs`. Not evidence of safety -- see
//                         `no-known-provider` below -- but also not risky by
//                         this tool's own knowledge.
//   dangling-confirmed   The CNAME target matches a known takeover-prone
//                         provider AND a live GET to the hostname returned
//                         that exact provider's own "nothing is claimed at
//                         this name" fingerprint text. The strongest signal
//                         this tool can produce -- real, live evidence, not
//                         an inference from DNS alone.
//   risky-unconfirmed    The CNAME target matches a known provider, but the
//                         HTTP probe did not confirm the fingerprint (either
//                         because the probe couldn't complete -- commonly a
//                         browser CORS block -- or because the response
//                         didn't match, which usually means the target is
//                         actually claimed and this is a false alarm at the
//                         DNS layer alone). Worth a manual look, never
//                         treated as confirmed.
//   lookup-error          The DNS lookup itself failed (resolver timeout,
//                         network error). Never read as either finding.
//
// `severity` on a finding is set once, here, and never escalated by a
// caller: `dangling-confirmed` is `critical`, `risky-unconfirmed` is
// `warning`. A provider's `vulnerable: false` (see fingerprints.mjs) does
// not downgrade a `dangling-confirmed` verdict -- a live fingerprint match is
// live evidence regardless of this tool's own belief about the provider's
// current mitigations, and `vulnerable` is surfaced in the finding only as
// context for a human reader to weigh.

import { providerForChain, matchProvider } from './fingerprints.mjs';

/**
 * @param {string} hostname - the hostname checked, for display only
 * @param {object} cname - lookup.mjs's `resolveCnameChain` result:
 *   { chain: string[], finalTarget: string|null, truncated: boolean, error: string|null }
 * @param {object|null} probe - probe.mjs's `fetchHost` result, or null when
 *   no CNAME target matched a known provider (no probe was worth sending)
 */
export function classify(hostname, cname, probe) {
  if (cname.error) {
    return {
      hostname,
      category: 'lookup-error',
      chain: cname.chain,
      provider: null,
      probe: null,
      error: cname.error,
    };
  }

  if (!cname.finalTarget) {
    return {
      hostname,
      category: 'no-cname',
      chain: cname.chain,
      provider: null,
      probe: null,
      error: null,
    };
  }

  const provider = providerForChain(cname.chain);
  if (!provider) {
    return {
      hostname,
      category: 'not-risky',
      chain: cname.chain,
      provider: null,
      probe: null,
      error: null,
    };
  }

  if (!probe || !probe.ok) {
    return {
      hostname,
      category: 'risky-unconfirmed',
      chain: cname.chain,
      provider,
      probe: probe ?? null,
      error: probe?.error ?? null,
    };
  }

  const confirmed = provider.fingerprint.test(probe.text ?? '');
  return {
    hostname,
    category: confirmed ? 'dangling-confirmed' : 'risky-unconfirmed',
    chain: cname.chain,
    provider,
    probe,
    error: null,
  };
}

/* The chain hop that matched the provider. Since matching looks at every
 * hop (fingerprints.mjs, providerForChain), the last name can be an
 * internal one after it, such as S3's s3-w.us-east-1.amazonaws.com behind
 * <bucket>.s3.amazonaws.com: the matched hop is the name to reclaim. */
function matchedHop(result) {
  const hops = result.chain.slice(1);
  return hops.find((h) => matchProvider(h)?.id === result.provider.id) ?? hops[hops.length - 1];
}

function chainText(result, target) {
  const last = result.chain[result.chain.length - 1];
  const matches = `which matches ${result.provider.name}'s own hostname pattern`;
  return last === target
    ? `The CNAME chain ends at ${target}, ${matches}`
    : `The CNAME chain reaches ${target}, ${matches} (the chain then ends at ${last})`;
}

function findingFor(result) {
  if (result.category === 'dangling-confirmed') {
    return {
      id: `takeover-confirmed-${result.hostname}`,
      severity: 'critical',
      hostname: result.hostname,
      provider: result.provider.name,
      target: matchedHop(result),
      title: `${result.hostname} is a confirmed dangling CNAME to ${result.provider.name}`,
      detail:
        `${chainText(result, matchedHop(result))}, and a live GET to https://${result.hostname}/ returned that provider's own ` +
        `"nothing is claimed at this name" page. Unless this is intentional (a domain being decommissioned on ` +
        `purpose), remove the DNS record now, or reclaim the name on ${result.provider.name} before anyone else can.`,
      docsUrl: result.provider.docsUrl,
    };
  }
  if (result.category === 'risky-unconfirmed') {
    return {
      id: `takeover-unconfirmed-${result.hostname}`,
      severity: 'warning',
      hostname: result.hostname,
      provider: result.provider.name,
      target: matchedHop(result),
      title: `${result.hostname} points at ${result.provider.name}, a known takeover-prone provider`,
      detail: result.probe && result.probe.ok
        ? `The CNAME target matches ${result.provider.name}, but the live response did not match that provider's ` +
          `known "unclaimed" page -- this usually means the target is actually claimed and in use. Worth a manual ` +
          `look if you don't recognise it.`
        : `The CNAME target matches ${result.provider.name}, but this run could not confirm it live${
          result.error ? ` (${result.error})` : ''
        } -- commonly a browser CORS block. Re-run with the CLI, or check the target manually.`,
      docsUrl: result.provider.docsUrl,
    };
  }
  return null;
}

/**
 * @param {string[]} hostnames
 * @param {object[]} results - one `classify()` result per hostname
 */
export function buildReport(hostnames, results) {
  const list = Array.isArray(results) ? results : [];
  const findings = list.map(findingFor).filter(Boolean);
  const confirmedCount = findings.filter((f) => f.severity === 'critical').length;
  const unconfirmedCount = findings.filter((f) => f.severity === 'warning').length;
  const errors = list.filter((r) => r.category === 'lookup-error');

  return {
    hostnamesChecked: list.length,
    results: list,
    findings,
    confirmedCount,
    unconfirmedCount,
    errors,
    incomplete: errors.length > 0,
    ok: confirmedCount === 0 && unconfirmedCount === 0,
  };
}

/** The one-line verdict, its tone and the CLI's exit code, shared by the
 * page and check.mjs so neither can read a failed lookup as a clean result
 * (README: exit 1 "when at least one is, or a lookup could not be completed
 * at all"). `report.ok` alone counts findings only. */
export function verdictFor(report) {
  const failed = report.errors?.length ?? 0;
  const unread = failed > 0 ? ` ${failed} hostname(s) could not be looked up.` : '';
  if (report.confirmedCount > 0) {
    return { clean: false, exitCode: 1, text: `${report.confirmedCount} confirmed dangling CNAME(s) found.${unread}` };
  }
  if (report.unconfirmedCount > 0) {
    return { clean: false, exitCode: 1, text: `${report.unconfirmedCount} hostname(s) point at a takeover-prone provider, unconfirmed.${unread}` };
  }
  if (failed > 0) {
    return { clean: false, exitCode: 1, text: `${failed} hostname(s) could not be looked up, so this run is not a clean result.` };
  }
  return { clean: true, exitCode: 0, text: `No subdomain-takeover risk found (${report.hostnamesChecked} hostname(s) checked).` };
}
