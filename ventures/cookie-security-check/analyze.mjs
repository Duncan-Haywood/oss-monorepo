// Classifies one HTTP response's Set-Cookie headers (real headers collected
// by probe.mjs's live network request, or pasted in by hand) into named
// cookie-security misconfiguration patterns.
//
// Pure function, no I/O, no network -- this is the module both the CLI
// (check.mjs, which fetches for real) and the browser page (index.html,
// which can only ever analyse a payload someone already fetched) import, so
// the classification logic exists exactly once.
//
// The value here isn't reading three attribute names -- curl -I does that.
// It's two things a naive implementation gets wrong:
//
//   * Set-Cookie cannot be joined into one string and re-split on commas the
//     way most other response headers can. An Expires attribute contains a
//     comma of its own ("Expires=Wed, 21 Oct 2026 07:28:00 GMT"), so
//     `headers['set-cookie'].join(', ').split(',')` silently corrupts every
//     cookie that carries one. Node's http/https clients already split
//     multiple Set-Cookie headers into a proper array before your code ever
//     sees it -- probe.mjs reads that array directly and this module takes
//     it as already-correct input, never re-joining or re-splitting it.
//   * SameSite=None without Secure and a __Host-/__Secure- prefix violation
//     are not merely weaker protection -- Chrome, Firefox, and Safari all
//     reject the Set-Cookie header outright in those cases (see the two
//     "danger" findings below). A response can look like it configured a
//     cookie and have the browser silently refuse to store it at all, which
//     reads as a functional bug (the user gets logged out, a flow breaks)
//     as often as a security one.

/** Splits one raw Set-Cookie header value into { name, value, attrs }. attrs
 * keys are lowercased; a flag attribute (Secure, HttpOnly) maps to `true`;
 * a valued attribute (SameSite, Domain, Path, Expires, Max-Age) maps to its
 * raw string value. */
export function parseSetCookieHeader(raw) {
  const parts = String(raw).split(';').map((p) => p.trim());
  const [nameValue, ...attrParts] = parts;
  const eq = nameValue.indexOf('=');
  const name = eq === -1 ? nameValue : nameValue.slice(0, eq).trim();
  const value = eq === -1 ? '' : nameValue.slice(eq + 1).trim();
  const attrs = {};
  for (const part of attrParts) {
    if (!part) continue;
    const attrEq = part.indexOf('=');
    if (attrEq === -1) {
      attrs[part.toLowerCase()] = true;
    } else {
      attrs[part.slice(0, attrEq).trim().toLowerCase()] = part.slice(attrEq + 1).trim();
    }
  }
  return { name, value, attrs };
}

function findingsForCookie(cookie, { isHttps }) {
  const findings = [];
  const { name, attrs } = cookie;
  const secure = attrs.secure === true;
  const httpOnly = attrs.httponly === true;
  const sameSite = typeof attrs.samesite === 'string' ? attrs.samesite.toLowerCase() : null;
  const evidence = `set-cookie: ${name}=...${Object.keys(attrs).length ? '; ' + Object.keys(attrs).join('; ') : ''}`;

  let prefixDangerFired = false;

  if (name.startsWith('__Host-')) {
    const violations = [];
    if (!secure) violations.push('no Secure attribute');
    if (attrs.domain !== undefined) violations.push('carries a Domain attribute');
    if (attrs.path !== '/') violations.push(attrs.path ? `Path is "${attrs.path}", not "/"` : 'no Path=/ attribute');
    if (violations.length > 0) {
      prefixDangerFired = true;
      findings.push({
        id: 'host-prefix-violated',
        severity: 'danger',
        title: `"${name}" uses the __Host- prefix but violates its rules`,
        detail:
          `A cookie named __Host-... is a browser-enforced contract: Secure must be set, no Domain ` +
          `attribute may be present, and Path must be exactly "/". This response violates it (${violations.join('; ')}), ` +
          'so a compliant browser silently refuses to store the cookie at all rather than storing a weaker version of it -- ' +
          'the response looks like it set a cookie and no cookie is actually stored.',
        evidenceHeader: evidence,
      });
    }
  } else if (name.startsWith('__Secure-')) {
    if (!secure) {
      prefixDangerFired = true;
      findings.push({
        id: 'secure-prefix-violated',
        severity: 'danger',
        title: `"${name}" uses the __Secure- prefix but has no Secure attribute`,
        detail:
          'A cookie named __Secure-... is a browser-enforced contract requiring the Secure attribute. ' +
          'This response omits it, so a compliant browser silently refuses to store the cookie at all -- ' +
          'the response looks like it set a cookie and no cookie is actually stored.',
        evidenceHeader: evidence,
      });
    }
  }

  if (sameSite === 'none' && !secure) {
    findings.push({
      id: 'samesite-none-without-secure',
      severity: 'danger',
      title: `"${name}" is SameSite=None without Secure`,
      detail:
        'SameSite=None declares that this cookie should be sent on cross-site requests, which requires ' +
        'the Secure attribute per the current SameSite specification. Chrome, Firefox, and Safari all reject ' +
        'a SameSite=None cookie outright when Secure is missing, rather than merely restricting it to same-site ' +
        'requests -- so this is not a weaker cookie, it is one that fails to be set in any current browser.',
      evidenceHeader: evidence,
    });
  }

  if (isHttps && !secure && !prefixDangerFired) {
    findings.push({
      id: 'missing-secure',
      severity: 'notice',
      title: `"${name}" has no Secure attribute`,
      detail:
        'This response was served over HTTPS but the cookie has no Secure attribute, so a browser will still ' +
        "attach it to a future plain-HTTP request to the same host (or a subdomain, if Domain is set broadly) -- " +
        'exposing it to anyone who can observe that unencrypted connection.',
      evidenceHeader: evidence,
    });
  }

  if (!httpOnly) {
    findings.push({
      id: 'missing-httponly',
      severity: 'notice',
      title: `"${name}" has no HttpOnly attribute`,
      detail:
        "Without HttpOnly, this cookie's value is readable by JavaScript running on the page (document.cookie), " +
        'so any script-injection (XSS) bug on the site can read and exfiltrate it. Not every cookie needs this -- ' +
        "a UI preference a script legitimately needs to read is a reasonable exception -- but a session or " +
        'authentication cookie without it turns any XSS into session theft.',
      evidenceHeader: evidence,
    });
  }

  if (sameSite === null) {
    findings.push({
      id: 'missing-samesite',
      severity: 'notice',
      title: `"${name}" has no SameSite attribute`,
      detail:
        'With no SameSite attribute, current versions of Chrome, Firefox, and Edge default the cookie to ' +
        'SameSite=Lax, but older or less common browsers may still default to sending it on every cross-site ' +
        'request -- setting the attribute explicitly (Lax, Strict, or None with Secure) removes that ambiguity ' +
        'rather than relying on a default that varies by browser.',
      evidenceHeader: evidence,
    });
  }

  return findings;
}

function norm(value) {
  return typeof value === 'string' ? value.trim() : null;
}

/**
 * @param {string} target - the URL that was probed (for display only)
 * @param {{ok: boolean, status: number|null, protocol: string|null,
 *   setCookie: string[], error: string|null}} probe
 * @returns {{target: string, probe: object, cookies: object[], findings: object[],
 *   dangerCount: number, noticeCount: number, ok: boolean, incomplete: boolean}}
 */
export function buildReport(target, probe) {
  const p = probe && typeof probe === 'object' ? probe : { ok: false };
  const incomplete = p.ok === false;
  const rawCookies = Array.isArray(p.setCookie) ? p.setCookie : [];
  const isHttps = p.protocol === 'https:';

  let cookies = [];
  let findings = [];

  if (!incomplete) {
    cookies = rawCookies.map(parseSetCookieHeader);
    for (const cookie of cookies) {
      findings = findings.concat(findingsForCookie(cookie, { isHttps }));
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
      setCookie: rawCookies,
      error: norm(p.error),
    },
    cookies: cookies.map((c) => ({ name: c.name, attrs: c.attrs })),
    findings,
    dangerCount,
    noticeCount,
    ok: !incomplete && dangerCount === 0,
    incomplete,
  };
}
