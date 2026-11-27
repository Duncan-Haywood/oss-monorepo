// Inbound RFQ email, sender checks (services/inbound, docs/EMAIL.md "Sender checks"). Cloudflare
// Email Routing checks SPF, DKIM and DMARC before it calls the worker and prepends one
// `Authentication-Results` header (RFC 8601) with authserv-id `mx.cloudflare.net`. Its docs say to
// read the first such header and trust it only with that id: any other may have been written by
// the sender (cloudflare-docs, email-service/api/route-emails/email-handler.mdx, "Authentication
// results", read 2026-11-25).
//
// The allowlist (sender-allowlist.ts) matches the addresses the mail claims. With these results a
// listed address counts only when it is shown to be real: the From header when DMARC passed (or a
// DKIM signature from the From domain passed), the envelope sender when SPF passed. Pure, no I/O.

/** The authserv-id Cloudflare Email Routing writes; any other Authentication-Results is the sender's. */
export const TRUSTED_AUTHSERV_ID = "mx.cloudflare.net";

export interface AuthMethodResult {
  /** "spf", "dkim", "dmarc", "arc", ... lower case. */
  method: string;
  /** "pass", "fail", "none", "softfail", "neutral", "temperror", "permerror", "policy", ... */
  result: string;
  /** Properties such as "header.d", "header.from", "smtp.mailfrom", lower-cased keys and values. */
  props: Record<string, string>;
}

export interface AuthenticationResults {
  authservId: string;
  results: AuthMethodResult[];
}

/** Drop RFC 5322 comments ("(...)", nested, with backslash escapes) outside quoted strings. */
function stripComments(s: string): string {
  let out = "";
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && (depth > 0 || quoted)) {
      if (depth === 0) out += c + (s[i + 1] ?? "");
      i++;
      continue;
    }
    if (depth === 0 && c === '"') quoted = !quoted;
    if (!quoted && c === "(") {
      depth++;
      continue;
    }
    if (!quoted && c === ")" && depth > 0) {
      depth--;
      out += " ";
      continue;
    }
    if (depth === 0) out += c;
  }
  return out;
}

/** Split on ";" outside quoted strings. */
function splitSemicolons(s: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && quoted) {
      cur += c + (s[i + 1] ?? "");
      i++;
      continue;
    }
    if (c === '"') quoted = !quoted;
    if (c === ";" && !quoted) {
      parts.push(cur);
      cur = "";
    } else cur += c;
  }
  parts.push(cur);
  return parts;
}

const unquote = (v: string) => (v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v);

/**
 * One Authentication-Results header value, or null when it has no authserv-id. A result that does
 * not read as `method=result` is skipped, never guessed. "none" (no checks done) reads as no results.
 */
export function parseAuthenticationResults(value: string | null): AuthenticationResults | null {
  if (!value) return null;
  const segments = splitSemicolons(stripComments(value).replace(/\r?\n/g, " "));
  // authserv-id [ CFWS authres-version ]
  const authservId = (segments[0] ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!/^[a-z0-9.-]+$/.test(authservId)) return null;
  const results: AuthMethodResult[] = [];
  for (const seg of segments.slice(1)) {
    // Each token is key=value; values may be quoted strings containing spaces.
    const tokens = seg.trim().match(/[^\s=]+\s*=\s*(?:"(?:[^"\\]|\\.)*"|[^\s]+)|\S+/g) ?? [];
    const first = tokens[0]?.match(/^([a-z0-9_-]+)(?:\/\d+)?\s*=\s*([a-z0-9_-]+)$/i);
    if (!first) continue;
    const props: Record<string, string> = {};
    for (const t of tokens.slice(1)) {
      const m = t.match(/^([a-z0-9_.-]+)\s*=\s*(.*)$/i);
      if (m?.[1] && m[2] !== undefined) props[m[1].toLowerCase()] = unquote(m[2]).toLowerCase();
    }
    results.push({
      method: (first[1] ?? "").toLowerCase(),
      result: (first[2] ?? "").toLowerCase(),
      props,
    });
  }
  return { authservId, results };
}

/**
 * The first Authentication-Results value from the Workers runtime's `message.headers.get(...)`,
 * which joins repeated headers with ", ". Cloudflare's header comes first; whatever follows a
 * ", <id>;" boundary is another header (possibly the sender's) and is cut off.
 */
export function firstOfJoined(value: string | null): string | null {
  if (!value) return null;
  const m = /,\s*[a-z0-9.-]+(?:\s+\d+)?\s*;/i.exec(value);
  return (m ? value.slice(0, m.index) : value).trim() || null;
}

export interface SenderVerdict {
  /** Whether Cloudflare's own header was found (first header, trusted authserv-id). */
  checked: boolean;
  spf: string | null;
  dkim: string | null;
  dmarc: string | null;
  /** The envelope sender passed SPF. */
  envelopeVerified: boolean;
  /** The From header's domain passed DMARC, or an aligned DKIM signature passed. */
  fromVerified: boolean;
}

function domainOf(address: string | null): string | null {
  if (!address) return null;
  const at = address.lastIndexOf("@");
  return at > 0
    ? address
        .slice(at + 1)
        .trim()
        .toLowerCase() || null
    : null;
}

/** Relaxed alignment without a public-suffix list: equal, or one is a subdomain of the other. */
function aligned(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/** The best result of one method (any "pass" wins: a message may carry several DKIM signatures). */
function resultOf(ar: AuthenticationResults, method: string): string | null {
  const rs = ar.results.filter((r) => r.method === method);
  if (rs.length === 0) return null;
  return rs.find((r) => r.result === "pass")?.result ?? rs[0]?.result ?? null;
}

/**
 * Which of the claimed senders the trusted results vouch for. `header` is the first
 * Authentication-Results value; anything not from TRUSTED_AUTHSERV_ID vouches for nothing.
 */
export function verifySenders(
  header: string | null,
  envelopeFrom: string | null,
  headerFrom: string | null,
): SenderVerdict {
  const ar = parseAuthenticationResults(header);
  if (!ar || ar.authservId !== TRUSTED_AUTHSERV_ID) {
    return {
      checked: false,
      spf: null,
      dkim: null,
      dmarc: null,
      envelopeVerified: false,
      fromVerified: false,
    };
  }
  const envDomain = domainOf(envelopeFrom);
  const fromDomain = domainOf(headerFrom);

  const spfPass = ar.results.some((r) => {
    if (r.method !== "spf" || r.result !== "pass") return false;
    // When the result names the domain it checked, it must be the envelope sender's.
    const checked = domainOf(r.props["smtp.mailfrom"] ?? null) ?? r.props["smtp.mailfrom"] ?? null;
    return checked === null || checked === envDomain;
  });

  const dmarcPass = ar.results.some((r) => {
    if (r.method !== "dmarc" || r.result !== "pass") return false;
    const checked = r.props["header.from"] ?? null;
    return checked === null || checked === fromDomain;
  });
  const dkimAligned = ar.results.some((r) => {
    if (r.method !== "dkim" || r.result !== "pass" || !fromDomain) return false;
    const d = r.props["header.d"] ?? domainOf(r.props["header.i"] ?? null);
    return !!d && aligned(d, fromDomain);
  });

  return {
    checked: true,
    spf: resultOf(ar, "spf"),
    dkim: resultOf(ar, "dkim"),
    dmarc: resultOf(ar, "dmarc"),
    envelopeVerified: envDomain !== null && spfPass,
    fromVerified: fromDomain !== null && (dmarcPass || dkimAligned),
  };
}
