// Classifies a fetched page's canonical-tag evidence (real HTTP responses,
// collected by probe.mjs's live requests or pasted in by hand) into named
// canonicalization misconfiguration patterns.
//
// Pure function, no I/O, no network -- this is the module both the CLI
// (check.mjs, which fetches for real) and the browser page (index.html,
// which can only ever analyse a payload someone already fetched) import, so
// the classification logic exists exactly once.
//
// What each finding means, and why it is evidence rather than an opinion:
//
//   no-canonical-tag            No <link rel="canonical"> tag in <head> at
//                                all. Not inherently wrong -- search engines
//                                infer one on their own -- but an explicit
//                                tag replaces their guess with yours.
//   multiple-conflicting-       Two or more canonical tags naming different
//   canonical                   URLs. Browsers and crawlers honor only the
//                                first and ignore the rest, so this is the
//                                page's own markup contradicting itself --
//                                commonly two systems (a CMS plugin and a
//                                hand-written template tag) both emitting one.
//   relative-canonical-url      The one canonical tag's href has no scheme
//                                and host. Google's own guidance is to use an
//                                absolute URL.
//   protocol-mismatch-canonical The canonical's scheme (http/https) differs
//                                from the scheme the page itself was served
//                                over -- often a leftover from a migration.
//   cross-domain-canonical      The canonical points at a different
//                                registrable domain. A real, supported
//                                pattern for syndicated content, and also
//                                exactly what a hardcoded staging URL or a
//                                copied template leaves behind -- either way
//                                it tells search engines to index the other
//                                domain's page instead of this one.
//   canonical-target-unreachable The canonical URL itself errors or 4xx/5xxs
//                                when fetched: it names a page to index that
//                                does not return usable content.
//   canonical-target-redirects  The canonical URL redirects before resolving.
//                                It should ideally point straight at the
//                                final resting URL.
//   canonical-target-noindex    The page the canonical points at carries a
//                                noindex directive itself -- a direct
//                                contradiction ("index this" pointing at a
//                                page that says "don't index me").
//
// Only the single-canonical-specific checks (relative/protocol/cross-domain)
// run when exactly one canonical link with an href is present: with zero,
// there is nothing to check; with two or more, `multiple-conflicting-
// canonical` already covers it and "which one would you even check" has no
// good answer.

function isAbsoluteUrl(href) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test((href || '').trim());
}

function normalizeForCompare(href) {
  return (href || '').trim().replace(/\/$/, '');
}

const TWO_LABEL_SUFFIXES = new Set(['co.uk', 'com.au', 'co.jp', 'com.br', 'co.nz', 'github.io']);

/** Good-enough eTLD+1 approximation for the "same domain" comparison this
 * check needs -- not a full public-suffix-list implementation, but it
 * correctly handles the handful of common two-label public suffixes a real
 * site (including this portfolio's own GitHub Pages host) could plausibly
 * hit, rather than reading "sub.example.co.uk" and "other.co.uk" as the
 * same domain. */
function registrableHost(hostname) {
  const parts = (hostname || '').toLowerCase().split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const lastTwo = parts.slice(-2).join('.');
  if (TWO_LABEL_SUFFIXES.has(lastTwo)) return parts.slice(-3).join('.');
  return lastTwo;
}

function isNoindex(metaRobots, xRobotsTag) {
  const combined = `${metaRobots || ''} ${xRobotsTag || ''}`.toLowerCase();
  return /\bnoindex\b/.test(combined);
}

/**
 * @param {string} target - the URL that was requested (for display only)
 * @param {object} page - probe.mjs's `page` result
 * @param {object|null} canonicalTarget - probe.mjs's `canonicalTarget` result, or null
 * @returns {{
 *   target: string, page: object|null, canonicalTarget: object|null,
 *   findings: object[], dangerCount: number, noticeCount: number,
 *   ok: boolean, incomplete: boolean,
 * }}
 */
export function buildReport(target, page, canonicalTarget = null) {
  const findings = [];
  const p = page || {};
  const incomplete = p.ok === false;

  if (!incomplete) {
    const links = Array.isArray(p.canonicalLinks) ? p.canonicalLinks : [];
    const withHref = links.filter((l) => l && l.href);

    if (links.length === 0) {
      findings.push({
        id: 'no-canonical-tag',
        severity: 'notice',
        title: 'No canonical tag found',
        detail:
          'No <link rel="canonical"> tag was found in the page\'s <head>. Search engines will infer ' +
          'a canonical URL on their own when none is given, which is not always the one you would ' +
          'choose -- an explicit tag replaces their guess with yours.',
        evidence: `fetched ${p.finalUrl}, 0 canonical link tag(s) in <head>`,
      });
    }

    if (withHref.length >= 2) {
      const distinctHrefs = [...new Set(withHref.map((l) => normalizeForCompare(l.href)))];
      if (distinctHrefs.length >= 2) {
        findings.push({
          id: 'multiple-conflicting-canonical',
          severity: 'danger',
          title: `${withHref.length} canonical tags naming ${distinctHrefs.length} different URLs`,
          detail:
            `This page's own <head> carries ${withHref.length} <link rel="canonical"> tags pointing ` +
            `at ${distinctHrefs.length} different URLs. Browsers and search engines only honor the ` +
            'first one found and ignore the rest, so this is the page contradicting itself -- often ' +
            'two systems (a CMS plugin and a hand-written template tag, for example) both emitting one.',
          evidence: withHref.map((l) => l.href).join(' | '),
        });
      }
    }

    if (withHref.length === 1) {
      const href = withHref[0].href;
      const absolute = isAbsoluteUrl(href);

      if (!absolute) {
        findings.push({
          id: 'relative-canonical-url',
          severity: 'notice',
          title: 'Canonical URL is not absolute',
          detail:
            `The canonical tag's href ("${href}") has no scheme and host. Google's own guidance is ` +
            'to use an absolute URL: a relative one leaves the protocol and host to be inferred, and ' +
            'can resolve differently than intended if the page is ever served from a different path ' +
            'or mirrored elsewhere.',
          evidence: `canonical tag href attribute: ${href}`,
        });
      }

      let abs = null;
      try {
        abs = new URL(href, p.finalUrl);
      } catch {
        abs = null;
      }
      let pageUrl = null;
      try {
        pageUrl = new URL(p.finalUrl);
      } catch {
        pageUrl = null;
      }

      if (abs && pageUrl) {
        if (abs.protocol !== pageUrl.protocol) {
          findings.push({
            id: 'protocol-mismatch-canonical',
            severity: 'notice',
            title: `Canonical uses ${abs.protocol.replace(':', '')}, page served over ${pageUrl.protocol.replace(':', '')}`,
            detail:
              "The canonical URL's scheme does not match the scheme the page itself was served over. " +
              'A mixed http/https canonical is a common leftover from a migration and can leave the ' +
              'wrong version of a page indexed.',
            evidence: `page: ${pageUrl.protocol}//${pageUrl.host} ; canonical: ${abs.protocol}//${abs.host}`,
          });
        }

        if (registrableHost(abs.hostname) !== registrableHost(pageUrl.hostname)) {
          findings.push({
            id: 'cross-domain-canonical',
            severity: 'notice',
            title: 'Canonical points to a different domain',
            detail:
              `This page's canonical tag points at ${abs.hostname}, not ${pageUrl.hostname}. That is ` +
              'a real, supported pattern for syndicated content -- but it is also exactly what a ' +
              'hardcoded staging URL or a copy-pasted template leaves behind, and either way it tells ' +
              "search engines to index the other domain's page instead of this one. Confirm it is " +
              'intentional.',
            evidence: `page host: ${pageUrl.hostname} ; canonical host: ${abs.hostname}`,
          });
        }
      }
    }
  }

  if (canonicalTarget) {
    const failed = canonicalTarget.ok === false;
    const errored = typeof canonicalTarget.status === 'number' && canonicalTarget.status >= 400;
    if (failed || errored) {
      findings.push({
        id: 'canonical-target-unreachable',
        severity: 'danger',
        title: 'Canonical URL does not return a usable page',
        detail:
          `The canonical tag points at ${canonicalTarget.requestedUrl}, and fetching it ` +
          `${failed ? `failed (${canonicalTarget.error})` : `returned HTTP ${canonicalTarget.status}`}. ` +
          'A canonical pointing at a page that errors or does not exist tells search engines to ' +
          'index a page that is not actually there.',
        evidence: failed ? `error: ${canonicalTarget.error}` : `HTTP ${canonicalTarget.status}`,
      });
    } else if (canonicalTarget.redirectCount > 0) {
      findings.push({
        id: 'canonical-target-redirects',
        severity: 'notice',
        title: 'Canonical URL redirects before resolving',
        detail:
          `The canonical tag points at ${canonicalTarget.requestedUrl}, which redirects ` +
          `${canonicalTarget.redirectCount} time(s) before reaching ${canonicalTarget.finalUrl}. A ` +
          'canonical should ideally point straight at the final resting URL, since a crawler has to ' +
          'follow the chain itself to find it.',
        evidence: `${canonicalTarget.requestedUrl} -> (${canonicalTarget.redirectCount} redirect(s)) -> ${canonicalTarget.finalUrl}`,
      });
    }

    if (!failed && isNoindex(canonicalTarget.metaRobots, canonicalTarget.xRobotsTag)) {
      const evidenceParts = [];
      if (canonicalTarget.metaRobots) evidenceParts.push(`meta robots: ${canonicalTarget.metaRobots}`);
      if (canonicalTarget.xRobotsTag) evidenceParts.push(`x-robots-tag: ${canonicalTarget.xRobotsTag}`);
      findings.push({
        id: 'canonical-target-noindex',
        severity: 'danger',
        title: 'Canonical target is itself marked noindex',
        detail:
          `The page this canonical points at (${canonicalTarget.finalUrl}) carries a noindex ` +
          'directive. A canonical tag is the instruction of which page IS the one to index -- ' +
          'pointing it at a page that says "do not index me" is a direct contradiction, and the ' +
          'practical effect is usually that neither page ends up indexed.',
        evidence: evidenceParts.join(' ; '),
      });
    }
  }

  const dangerCount = findings.filter((f) => f.severity === 'danger').length;
  const noticeCount = findings.filter((f) => f.severity === 'notice').length;

  return {
    target,
    page: page || null,
    canonicalTarget: canonicalTarget || null,
    findings,
    dangerCount,
    noticeCount,
    incomplete,
    ok: !incomplete && dangerCount === 0,
  };
}
