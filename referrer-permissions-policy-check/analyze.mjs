// Classifies one HTTP response's Referrer-Policy and Permissions-Policy
// headers (real headers collected by probe.mjs's live network request, or
// pasted in by hand) into named misconfiguration patterns.
//
// Pure function, no I/O, no network -- this is the module both the CLI
// (check.mjs, which fetches for real) and the browser page (index.html,
// which can only ever analyse a payload someone already fetched) import, so
// the classification logic exists exactly once.
//
// Scope, deliberately narrow: no sibling venture in this portfolio reads
// these two headers. security-headers-check covers CSP and frame-ancestors,
// cookie-security-check covers Set-Cookie attributes, cors-misconfig-check
// covers a reflected Origin, cache-control-check covers HTTP caching -- none
// of them touch where a page's outbound Referer header goes, or which
// powerful browser features (camera, microphone, geolocation, payment...) a
// page and the third parties it embeds may use.

// Referrer Policy tokens the Referrer Policy spec (W3C) defines. A token
// outside this set is not a policy value at all -- a conforming browser
// treats it as if that entry were absent.
const KNOWN_REFERRER_POLICIES = new Set([
  'no-referrer',
  'no-referrer-when-downgrade',
  'same-origin',
  'origin',
  'strict-origin',
  'origin-when-cross-origin',
  'strict-origin-when-cross-origin',
  'unsafe-url',
]);

// Permissions-Policy directives that gate a sensitive capability -- access
// to a device sensor/peripheral, the ability to read the screen, or a
// payment flow. A `*` allowlist on one of these grants every origin this
// document ever embeds (including a third-party ad or widget iframe) the
// same access the top-level page has, not just the page's own origin.
const SENSITIVE_FEATURES = new Set([
  'camera',
  'microphone',
  'geolocation',
  'payment',
  'usb',
  'midi',
  'serial',
  'hid',
  'bluetooth',
  'display-capture',
  'clipboard-read',
  'clipboard-write',
  'screen-wake-lock',
]);

function norm(value) {
  return typeof value === 'string' ? value.trim() : null;
}

/** Splits on top-level commas only -- a comma inside `(...)` or `"..."`
 * (an origin list, or an origin string) does not end a directive. */
function splitTopLevel(raw) {
  const parts = [];
  let depth = 0;
  let inString = false;
  let current = '';
  for (const ch of raw) {
    if (inString) {
      current += ch;
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      current += ch;
    } else if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1);
      current += ch;
    } else if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim() !== '') parts.push(current);
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

/** Parses a Referrer-Policy header value into its comma-separated tokens,
 * lowercased. The spec allows a fallback list: a browser that does not
 * recognise a token skips it and tries the next; if none is recognised, the
 * whole header is treated as absent. */
export function parseReferrerPolicy(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  return raw
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t !== '');
}

/**
 * Parses one Permissions-Policy directive's allowlist. Per the Permissions
 * Policy spec's structured-field-based syntax, a directive's value is
 * either the bare token `*` (wildcard -- every origin), or a
 * parenthesised, possibly-empty list whose items are `self`, `src`, or a
 * double-quoted origin string. Anything else (a bare unparenthesised
 * origin, an unquoted origin inside the parens, unbalanced parens, no `=`
 * at all) does not match that shape.
 */
export function parsePermissionsPolicyDirective(directive) {
  const eq = directive.indexOf('=');
  if (eq === -1) {
    return { name: directive.trim(), raw: directive, valid: false, kind: 'invalid', items: [] };
  }
  const name = directive.slice(0, eq).trim().toLowerCase();
  const value = directive.slice(eq + 1).trim();

  if (value === '*') {
    return { name, raw: directive, valid: true, kind: 'wildcard', items: ['*'] };
  }

  const listMatch = /^\(([^()]*)\)$/.exec(value);
  if (!listMatch) {
    return { name, raw: directive, valid: false, kind: 'invalid', items: [] };
  }

  const inner = listMatch[1].trim();
  if (inner === '') {
    return { name, raw: directive, valid: true, kind: 'empty', items: [] };
  }

  // Items inside the parens are whitespace-separated (not comma-separated --
  // commas already ended the directive one level up).
  const items = [];
  let malformed = false;
  for (const raw of inner.split(/\s+/).filter(Boolean)) {
    if (raw === 'self' || raw === 'src') {
      items.push(raw);
    } else if (/^"[^"]*"$/.test(raw)) {
      items.push(raw.slice(1, -1));
    } else {
      malformed = true;
      items.push(raw);
    }
  }

  return { name, raw: directive, valid: !malformed, kind: malformed ? 'invalid' : 'list', items };
}

export function parsePermissionsPolicy(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  return splitTopLevel(raw).map(parsePermissionsPolicyDirective);
}

function findingsFor(headers) {
  const findings = [];
  const referrerRaw = norm(headers['referrer-policy']);
  const permissionsRaw = norm(headers['permissions-policy']);
  const featurePolicyRaw = norm(headers['feature-policy']);

  // -- Referrer-Policy -----------------------------------------------
  if (!referrerRaw) {
    findings.push({
      id: 'referrer-policy-missing',
      severity: 'notice',
      title: 'No Referrer-Policy header',
      detail:
        'Without an explicit Referrer-Policy, the browser applies its own default -- ' +
        'strict-origin-when-cross-origin in every current major browser, which already sends less than ' +
        "older browsers did. Setting the header explicitly documents the site's intent and protects " +
        'against relying on a default that has changed once already and could change again.',
      evidenceHeader: 'referrer-policy: (absent)',
    });
  } else {
    const tokens = parseReferrerPolicy(referrerRaw);
    const recognised = tokens.filter((t) => KNOWN_REFERRER_POLICIES.has(t));

    if (tokens.includes('unsafe-url')) {
      findings.push({
        id: 'referrer-policy-unsafe-url',
        severity: 'danger',
        title: 'Referrer-Policy: unsafe-url sends the full URL on every request, even downgrades',
        detail:
          "unsafe-url sends the document's full URL -- including its path and query string -- as the " +
          'Referer header on every outbound request this page makes, including a request that downgrades ' +
          'from HTTPS to plain HTTP. A query string carrying a session token, a password-reset code, or ' +
          "any other sensitive value is then readable by every third-party resource the page loads and by " +
          'anyone who can observe that HTTP request in transit.',
        evidenceHeader: `referrer-policy: ${referrerRaw}`,
      });
    } else if (recognised.length === 0) {
      findings.push({
        id: 'referrer-policy-invalid-value',
        severity: 'notice',
        title: 'Referrer-Policy value is not a recognised policy token',
        detail:
          `None of the comma-separated value(s) ("${referrerRaw}") is a token the Referrer Policy spec ` +
          'defines (no-referrer, no-referrer-when-downgrade, same-origin, origin, strict-origin, ' +
          'origin-when-cross-origin, strict-origin-when-cross-origin, unsafe-url). A conforming browser ' +
          'treats an unrecognised token as absent, so this header has no effect at all -- the browser falls ' +
          'back to its default policy, silently, with nothing in the response to say so.',
        evidenceHeader: `referrer-policy: ${referrerRaw}`,
      });
    } else if (tokens.includes('no-referrer-when-downgrade')) {
      findings.push({
        id: 'referrer-policy-legacy-downgrade',
        severity: 'notice',
        title: 'Referrer-Policy: no-referrer-when-downgrade is weaker than the current browser default',
        detail:
          'no-referrer-when-downgrade was the unwritten default before browsers moved to ' +
          'strict-origin-when-cross-origin around 2020. It still sends the full URL -- path and query ' +
          "string included -- on every same-protocol request, cross-origin or not, which the current " +
          'default no longer does. A valid, deliberate choice in some cases, but worth confirming it is ' +
          'one rather than a header nobody has revisited since the browser default changed under it.',
        evidenceHeader: `referrer-policy: ${referrerRaw}`,
      });
    }
  }

  // -- Permissions-Policy / Feature-Policy ----------------------------
  if (featurePolicyRaw && !permissionsRaw) {
    findings.push({
      id: 'feature-policy-only',
      severity: 'notice',
      title: 'Only the deprecated Feature-Policy header is set, not its replacement Permissions-Policy',
      detail:
        'Feature-Policy was superseded by Permissions-Policy, and every current major browser ignores ' +
        'Feature-Policy entirely. A site that only sends Feature-Policy believes it is restricting camera, ' +
        "microphone, geolocation or similar features and is not enforcing anything -- the restriction is " +
        'silently a no-op in a current browser, with no console warning by default.',
      evidenceHeader: `feature-policy: ${featurePolicyRaw}; permissions-policy: (absent)`,
    });
  }

  if (!permissionsRaw) {
    findings.push({
      id: 'permissions-policy-missing',
      severity: 'notice',
      title: 'No Permissions-Policy header',
      detail:
        'With no Permissions-Policy, every powerful feature (camera, microphone, geolocation, payment, ' +
        'USB, and more) is available to this document and to any same-origin iframe it embeds at the ' +
        "browser's own default allowlist for that feature -- typically self-only, but that default varies " +
        'by feature and by browser rather than being a documented, page-level choice.',
      evidenceHeader: 'permissions-policy: (absent)',
    });
  } else {
    const directives = parsePermissionsPolicy(permissionsRaw);
    for (const d of directives) {
      if (!d.valid) {
        findings.push({
          id: `permissions-policy-syntax-error:${d.name}`,
          severity: 'danger',
          title: `Permissions-Policy directive "${d.name}" does not match the documented allowlist syntax`,
          detail:
            'A Permissions-Policy allowlist must be the bare wildcard "*", or a parenthesised list whose ' +
            'items are self, src, or a double-quoted origin -- e.g. camera=(self) or ' +
            'geolocation=(self "https://example.com"). This directive is shaped differently (a bare, ' +
            'unparenthesised value other than *, an unquoted origin, or unbalanced parentheses). Browsers ' +
            'do not all handle a malformed directive the same way -- some drop only this one directive, ' +
            'and specification text leaves room for a stricter implementation to drop the whole header -- ' +
            'so treat this as a real gap regardless of what your own browser currently does with it.',
          evidenceHeader: `permissions-policy: ${d.raw.trim()}`,
        });
        continue;
      }
      if (d.kind === 'wildcard' && SENSITIVE_FEATURES.has(d.name)) {
        findings.push({
          id: `permissions-policy-wildcard:${d.name}`,
          severity: 'danger',
          title: `Permissions-Policy: ${d.name}=* allows every origin, including embedded third parties`,
          detail:
            `The wildcard allowlist on "${d.name}" grants this powerful feature to every origin this ` +
            'document ever embeds as an iframe -- not just to this site\'s own origin. A third-party ad, ' +
            'widget, or analytics iframe added later inherits the same access with no further change to ' +
            'this header. Prefer an explicit allowlist -- (self), or (self "https://trusted-partner.example") ' +
            '-- naming exactly which origins should have it.',
          evidenceHeader: `permissions-policy: ${d.raw.trim()}`,
        });
      }
    }
  }

  return findings;
}

/**
 * @param {string} target - the URL that was probed (for display only)
 * @param {{ok: boolean, status: number|null, protocol: string|null, path: string|null,
 *   headers: object, error: string|null}} probe
 * @returns {{target: string, probe: object, findings: object[], dangerCount: number,
 *   noticeCount: number, ok: boolean, incomplete: boolean}}
 */
export function buildReport(target, probe) {
  const p = probe && typeof probe === 'object' ? probe : { ok: false };
  const incomplete = p.ok === false;
  const headers = p.headers && typeof p.headers === 'object' ? p.headers : {};

  const findings = incomplete ? [] : findingsFor(headers);
  const dangerCount = findings.filter((f) => f.severity === 'danger').length;
  const noticeCount = findings.filter((f) => f.severity === 'notice').length;

  return {
    target,
    probe: {
      ok: p.ok !== false,
      status: p.status ?? null,
      protocol: p.protocol ?? null,
      path: p.path ?? null,
      headers: {
        'referrer-policy': norm(headers['referrer-policy']),
        'permissions-policy': norm(headers['permissions-policy']),
        'feature-policy': norm(headers['feature-policy']),
      },
      error: norm(p.error),
    },
    findings,
    dangerCount,
    noticeCount,
    ok: !incomplete && dangerCount === 0,
    incomplete,
  };
}
