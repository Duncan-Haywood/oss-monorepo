// Classifies one HTTP response's security headers (a real response
// collected by probe.mjs's live network request, or pasted in by hand) into
// named clickjacking and Content-Security-Policy misconfiguration patterns.
//
// Pure function, no I/O, no network -- this is the module both the CLI
// (check.mjs, which fetches for real) and the browser page (index.html,
// which can only ever analyse a payload someone already fetched) import, so
// the classification logic exists exactly once.
//
// The value here isn't reading four header names -- curl -I does that. It's
// getting the CSP fallback rules right, the way a developer who has to know
// them by heart already does and a naive grep does not:
//
//   * `frame-ancestors` does NOT fall back to `default-src`. It is a
//     navigation directive, not a fetch directive, so a policy with
//     `default-src 'self'` and no explicit `frame-ancestors` gives the page
//     *no* frame protection from CSP at all -- only X-Frame-Options can
//     cover that gap.
//   * `script-src` DOES fall back to `default-src` when script-src is
//     absent from the policy entirely.
//   * `X-Frame-Options: ALLOW-FROM ...` is silently ignored by every
//     current major browser engine (it was dropped after CSP2 shipped
//     frame-ancestors) -- a site relying on it looks protected in a header
//     dump and is not actually protected in a real browser today.
//   * A nonce- or hash-source alongside `'unsafe-inline'` in a fetch
//     directive makes CSP2+ browsers ignore `'unsafe-inline'` entirely
//     (kept only for CSP1 backwards compatibility) -- so `'unsafe-inline'`
//     is only a live finding when no nonce/hash is also present.

const FRAME_TOKEN_RE = /^-?[A-Za-z0-9]/;

/** Parses a Content-Security-Policy (or -Report-Only) header value into a
 * Map of directive name -> array of lowercased source-list tokens. Multiple
 * directives of the same name in one header keep only the first, per spec
 * (later duplicates are ignored by browsers). */
export function parseCsp(headerValue) {
  const map = new Map();
  if (typeof headerValue !== 'string' || headerValue.trim() === '') return map;
  for (const rawDirective of headerValue.split(';')) {
    const trimmed = rawDirective.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    const name = parts[0].toLowerCase();
    if (!FRAME_TOKEN_RE.test(name) || map.has(name)) continue;
    map.set(name, parts.slice(1).map((t) => t.toLowerCase()));
  }
  return map;
}

function effectiveScriptSrc(csp) {
  if (csp.has('script-src')) return csp.get('script-src');
  if (csp.has('default-src')) return csp.get('default-src');
  return null;
}

function hasNonceOrHash(tokens) {
  return tokens.some((t) => t.startsWith("'nonce-") || /^'sha(256|384|512)-/.test(t));
}

function norm(value) {
  return typeof value === 'string' ? value.trim() : null;
}

/**
 * @param {string} target - the URL that was probed (for display only)
 * @param {{ok: boolean, status: number|null, protocol: string|null,
 *   headers: Record<string,string|null>, error: string|null}} probe
 * @returns {{target: string, probe: object, findings: object[],
 *   dangerCount: number, noticeCount: number, ok: boolean, incomplete: boolean}}
 */
export function buildReport(target, probe) {
  const p = probe && typeof probe === 'object' ? probe : { ok: false };
  const incomplete = p.ok === false;
  const findings = [];
  const headers = p.headers ?? {};

  const cspHeader = norm(headers['content-security-policy']);
  const cspReportOnly = norm(headers['content-security-policy-report-only']);
  const xfo = norm(headers['x-frame-options']);
  const hsts = norm(headers['strict-transport-security']);

  if (!incomplete) {
    const csp = cspHeader ? parseCsp(cspHeader) : new Map();

    // --- Clickjacking / frame protection -----------------------------
    if (csp.has('frame-ancestors')) {
      // Protected: CSP frame-ancestors is present and takes precedence over
      // X-Frame-Options in every current browser. No finding either way.
    } else if (xfo && /^allow-from\b/i.test(xfo)) {
      findings.push({
        id: 'frame-options-allow-from-ignored',
        severity: 'danger',
        title: 'X-Frame-Options: ALLOW-FROM is ignored by current browsers',
        detail:
          `The response sent X-Frame-Options: ${xfo}, but every current major browser engine ` +
          "dropped support for the ALLOW-FROM directive value once CSP2's frame-ancestors " +
          'shipped. The header looks like frame protection in a raw dump and provides none in a ' +
          "real browser today -- add a CSP frame-ancestors directive (it isn't a fallback for " +
          'this header, it replaces it).',
        evidenceHeader: `x-frame-options: ${xfo}`,
      });
    } else if (!xfo) {
      findings.push({
        id: 'missing-frame-protection',
        severity: 'danger',
        title: 'No clickjacking protection (frame-ancestors or X-Frame-Options)',
        detail:
          'Neither a Content-Security-Policy frame-ancestors directive nor an X-Frame-Options ' +
          'header is present, so any site on the web can load this page in an iframe and overlay ' +
          "it to trick a visitor into clicking something they didn't mean to -- the classic " +
          'clickjacking attack.',
        evidenceHeader: 'x-frame-options: (not set); content-security-policy frame-ancestors: (not set)',
      });
    }
    // else: X-Frame-Options is present with a value other than ALLOW-FROM
    // (DENY, SAMEORIGIN, or anything else current browsers still honour
    // enough to constrain framing) -- protected, no finding.

    // --- Content-Security-Policy strength -----------------------------
    if (!cspHeader && !cspReportOnly) {
      findings.push({
        id: 'missing-csp',
        severity: 'notice',
        title: 'No Content-Security-Policy header at all',
        detail:
          'Neither Content-Security-Policy nor Content-Security-Policy-Report-Only is present. ' +
          'CSP is the strongest browser-side mitigation against script injection (XSS) and, via ' +
          'frame-ancestors, clickjacking -- this response has none of that defence-in-depth.',
        evidenceHeader: 'content-security-policy: (not set)',
      });
    } else if (!cspHeader && cspReportOnly) {
      findings.push({
        id: 'csp-report-only-not-enforced',
        severity: 'notice',
        title: 'CSP is report-only, not enforced',
        detail:
          'Only Content-Security-Policy-Report-Only is set. The browser will report violations ' +
          'to the configured endpoint but will not block anything -- an attacker-injected script ' +
          'still runs. This is a normal rollout stage, not a finished deployment.',
        evidenceHeader: `content-security-policy-report-only: ${cspReportOnly}`,
      });
    }

    if (cspHeader) {
      const scriptSrc = effectiveScriptSrc(csp);
      if (scriptSrc) {
        const usedDirective = csp.has('script-src') ? 'script-src' : 'default-src';
        if (scriptSrc.includes("'unsafe-inline'") && !hasNonceOrHash(scriptSrc)) {
          findings.push({
            id: 'csp-unsafe-inline-script',
            severity: 'danger',
            title: `CSP ${usedDirective} allows 'unsafe-inline' with no nonce or hash`,
            detail:
              `The effective script-src (from ${usedDirective}) includes 'unsafe-inline' and no ` +
              "nonce-/hash-source to override it. In every CSP2+ browser a nonce or hash source " +
              "makes 'unsafe-inline' ignored (kept only for CSP1 fallback) -- without one, this " +
              'policy does not block inline script injection at all, which is the exact attack ' +
              'class CSP exists to stop.',
            evidenceHeader: `content-security-policy: ${cspHeader}`,
          });
        }
        const wildcardToken = scriptSrc.find((t) => t === '*' || t === 'http:' || t === 'https:' || t === 'data:');
        if (wildcardToken) {
          findings.push({
            id: 'csp-wildcard-script-src',
            severity: 'danger',
            title: `CSP ${usedDirective} allows scripts from ${wildcardToken === '*' ? 'any host' : `any ${wildcardToken} URL`}`,
            detail:
              `The effective script-src (from ${usedDirective}) includes the token "${wildcardToken}", ` +
              'which permits loading script from any host on that scheme (or any host at all, for ' +
              "\"*\"). A policy this broad does not meaningfully restrict where script can be " +
              'loaded from, regardless of nonces or hashes elsewhere in the directive.',
            evidenceHeader: `content-security-policy: ${cspHeader}`,
          });
        }
      }
    }

    // --- HSTS -----------------------------------------------------------
    if (p.protocol === 'https:' && !hsts) {
      findings.push({
        id: 'missing-hsts',
        severity: 'notice',
        title: 'No Strict-Transport-Security header on an HTTPS response',
        detail:
          "This response was served over HTTPS but sent no Strict-Transport-Security header, so " +
          "a browser has no instruction to refuse a later plain-HTTP connection to this host -- " +
          "leaving a window for a downgrade / SSL-stripping attack on a visitor's next visit.",
        evidenceHeader: 'strict-transport-security: (not set)',
      });
    }
  }

  const dangerCount = findings.filter((f) => f.severity === 'danger').length;
  const noticeCount = findings.filter((f) => f.severity === 'notice').length;

  return {
    target,
    probe: {
      ok: p.ok !== false,
      status: p.status ?? null,
      protocol: p.protocol ?? null,
      headers: {
        'content-security-policy': cspHeader,
        'content-security-policy-report-only': cspReportOnly,
        'x-frame-options': xfo,
        'strict-transport-security': hsts,
      },
      error: p.error ?? null,
    },
    findings,
    dangerCount,
    noticeCount,
    ok: !incomplete && dangerCount === 0,
    incomplete,
  };
}
