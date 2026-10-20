// JWT Security Check -- deterministic, mechanical checks against one pasted
// JSON Web Token (JWS compact serialization: base64url(header).base64url
// (payload).base64url(signature)). This module never contacts a network,
// never verifies a signature (it has no key to verify with, and never asks
// for one), and never claims to know whether a token is "safe" -- only
// whether a specific, named misconfiguration pattern was or was not observed
// in the header and payload you pasted. See PRODUCT_PLAYBOOK.md 5b: a tool
// that can't verify a fact live must not assert it, so every finding here is
// "worth a look", not a verdict.
//
// What gets checked, matching real, documented JWT failure classes (RFC 7519,
// RFC 8725 "JWT Best Current Practices", and the widely reported "alg: none"
// and algorithm-confusion attack classes):
//   1. Structural validity -- exactly three dot-separated segments, and the
//      header/payload segments decode as base64url JSON.
//   2. The "alg: none" bypass -- a header that disables signature
//      verification entirely.
//   3. Embedded/referenced key material in the header (jwk, jku, x5u, x5c)
//      -- a verifier that trusts these uncritically can be made to verify
//      against an attacker-supplied key.
//   4. Algorithm-confusion risk -- a symmetric ("HS*") algorithm alongside
//      header fields normally associated with asymmetric keys.
//   5. A "kid" header containing path-traversal or SQL-metacharacter-shaped
//      text -- a verifier that uses "kid" to look up a key on disk or in a
//      database without sanitizing it is a documented attack surface.
//   6. Registered timing claims -- missing/expired "exp", an excessively
//      long lifetime, a future-dated "iat", a not-yet-valid "nbf".
//   7. Missing "aud"/"iss" -- no audience or issuer restriction recorded.
//   8. Sensitive-looking field names in the payload -- a reminder that a JWT
//      payload is base64url-*encoded*, not encrypted, and is fully readable
//      by anyone who has the token.

// ---- base64url <-> bytes/string, with no atob()/Buffer dependency so the
// same code runs unmodified in the browser build and under `node --test` ----

const B64URL_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const B64URL_CHAR_RE = /^[A-Za-z0-9_-]*$/;

function base64UrlToBytes(segment) {
  const clean = String(segment ?? "").replace(/=+$/, "");
  if (clean === "") throw new Error("empty segment");
  if (!B64URL_CHAR_RE.test(clean)) {
    throw new Error('contains characters outside the base64url alphabet (A-Z a-z 0-9 "-" "_")');
  }
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    const value = B64URL_CHARS.indexOf(ch);
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

/** Decodes a base64url JWT segment to a JSON value. Throws with a message
 * naming which step failed (encoding vs. JSON syntax) rather than a bare
 * parser error. */
function decodeJsonSegment(segment) {
  const bytes = base64UrlToBytes(segment);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("decoded but is not valid JSON");
  }
}

// ---- structural parse -------------------------------------------------

/** Splits a pasted token into its three segments and decodes the header and
 * payload as JSON. Never touches the signature segment beyond confirming it
 * is present -- this tool has no key to verify a signature with, and never
 * pretends to. Returns { ok, errors, header, payload, headerRaw, payloadRaw,
 * signatureSegment }. */
export function parseJwt(token) {
  const trimmed = String(token ?? "").trim();
  const errors = [];
  if (trimmed === "") {
    return { ok: false, errors: ["Paste a token to check."], header: null, payload: null, headerRaw: null, payloadRaw: null, signatureSegment: null };
  }
  const segments = trimmed.split(".");
  if (segments.length !== 3) {
    return {
      ok: false,
      errors: [
        `Found ${segments.length} dot-separated segment(s); a JWT (JWS compact serialization) needs exactly 3: header.payload.signature.`,
      ],
      header: null,
      payload: null,
      headerRaw: null,
      payloadRaw: null,
      signatureSegment: null,
    };
  }
  const [headerSeg, payloadSeg, signatureSeg] = segments;

  let header = null;
  try {
    header = decodeJsonSegment(headerSeg);
  } catch (error) {
    errors.push(`Header segment could not be decoded: ${error.message}.`);
  }
  let payload = null;
  try {
    payload = decodeJsonSegment(payloadSeg);
  } catch (error) {
    errors.push(`Payload segment could not be decoded: ${error.message}.`);
  }
  if (header !== null && (typeof header !== "object" || Array.isArray(header))) {
    errors.push("Header segment decoded to JSON but is not an object.");
    header = null;
  }
  if (payload !== null && (typeof payload !== "object" || Array.isArray(payload))) {
    errors.push("Payload segment decoded to JSON but is not an object.");
    payload = null;
  }
  if (signatureSeg === "") {
    errors.push('Signature segment is empty (this is only valid for an explicitly unsigned "alg": "none" token).');
  }

  return {
    ok: errors.length === 0,
    errors,
    header,
    payload,
    headerRaw: headerSeg,
    payloadRaw: payloadSeg,
    signatureSegment: signatureSeg,
  };
}

// ---- findings -----------------------------------------------------------

function finding(source, category, severity, detail) {
  return { source, category, severity, detail };
}

function isBlank(value) {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

/** The "alg: none" bypass and a missing "alg" entirely. RFC 7518 defines
 * "none" as a legitimate value for an explicitly-unsecured JWS -- the finding
 * is not that the value exists, it is that a token asserting it was likely
 * not meant to carry a disabled signature, and several real-world libraries
 * historically accepted it even when the caller expected a signed token. */
export function checkAlgNone(header) {
  const out = [];
  const alg = header?.alg;
  if (isBlank(alg)) {
    out.push(finding(
      "header", "missing-alg", "high",
      'No "alg" header field. A JWS verifier needs this to know which algorithm secured the token; some libraries fall back to accepting the token unverified when it is absent.',
    ));
  } else if (typeof alg === "string" && alg.trim().toLowerCase() === "none") {
    out.push(finding(
      "header", "alg-none", "high",
      '"alg": "none" -- this token asserts it is explicitly unsigned. Any verifier that accepts this value treats the token as valid with no signature check at all, which is a well-documented forgery technique (a party can hand-craft any header/payload and set alg to "none"). Legitimate only for a deliberately unsecured JWS; if this token is meant to be trusted, this is a critical finding.',
    ));
  }
  return out;
}

// Header fields that carry or reference key material. A verifier that
// trusts one of these from an attacker-controlled token (rather than only
// from its own configured key store) can be made to verify against a key
// the attacker chose -- the header-injection family of JWT attacks.
const EMBEDDED_KEY_FIELDS = {
  jwk: 'carries the signing key directly in the header ("jwk"). A verifier that trusts an embedded key instead of its own configured key store will happily verify a token against a key the token itself supplied.',
  jku: 'points to a URL to fetch the signing key from ("jku"). A verifier that fetches and trusts this URL without restricting it to an allow-list is exposed to both server-side request forgery and to a token forged against an attacker-hosted key set.',
  x5u: 'points to a URL to fetch an X.509 certificate chain from ("x5u"), the same trust risk as "jku" for a certificate-based verifier.',
  x5c: 'embeds an X.509 certificate chain directly in the header ("x5c"). A verifier that trusts an embedded certificate instead of its own trust store has the same exposure as an embedded "jwk".',
};

/** Header fields (jwk/jku/x5u/x5c) that embed or reference key material.
 * Presence alone is not a vulnerability -- some protocols use these
 * legitimately -- but it names a specific, documented header-injection
 * attack surface worth checking the verifying code against. */
export function checkEmbeddedKeyHeaders(header) {
  const out = [];
  for (const [field, detail] of Object.entries(EMBEDDED_KEY_FIELDS)) {
    if (!isBlank(header?.[field])) {
      out.push(finding("header", "embedded-key-header", "medium", `The header ${detail}`));
    }
  }
  return out;
}

/** A symmetric algorithm (HS256/HS384/HS512) alongside a header field
 * normally associated with an asymmetric key. This is the shape of the
 * documented "algorithm confusion" attack (Tim McLean, 2015): a verifier
 * that expects an asymmetric algorithm and is tricked into treating a public
 * key (or a key derived from header-supplied material) as an HMAC secret
 * will accept a token anyone could forge with that public information. This
 * tool cannot see server-side verification code, so it only flags the
 * *shape* -- worth checking your verifier enforces an expected-algorithm
 * allow-list rather than trusting the token's own "alg". */
export function checkAlgorithmConfusion(header) {
  const alg = header?.alg;
  if (typeof alg !== "string" || !/^HS(256|384|512)$/i.test(alg.trim())) return [];
  const present = Object.keys(EMBEDDED_KEY_FIELDS).filter((f) => !isBlank(header?.[f]));
  if (present.length === 0) return [];
  return [finding(
    "header", "algorithm-confusion-risk", "medium",
    `"alg": "${alg}" is symmetric, but the header also carries ${present.map((f) => `"${f}"`).join(", ")}, which is normally asymmetric-key material. If a verifier expecting an asymmetric algorithm can be led to treat that public material as an HMAC secret, this is the classic algorithm-confusion forgery -- confirm your verification code pins the expected algorithm rather than trusting the token's own "alg" field.`,
  )];
}

// Path-traversal and SQL-metacharacter shapes. "kid" is meant to be an
// opaque identifier a verifier uses to look up its own configured key; a
// verifier that concatenates it into a file path or a SQL string without
// sanitizing it is a documented attack surface (reported in several
// real-world JWT library integrations, and covered in public JWT
// pentesting material as a standard header-injection check).
const KID_PATH_TRAVERSAL_RE = /\.\.[\\/]/;
const KID_SQLI_RE = /['";]|--|\/\*/;

/** Flags a "kid" header value shaped like a path-traversal or SQL-injection
 * payload. This never claims your server is vulnerable -- it names a
 * documented technique that applies only if the verifying code uses "kid" to
 * look up a key on disk or in a database without treating it as untrusted
 * input. */
export function checkKidInjection(header) {
  const kid = header?.kid;
  if (typeof kid !== "string" || kid === "") return [];
  const shapes = [];
  if (KID_PATH_TRAVERSAL_RE.test(kid)) shapes.push("path-traversal (\"../\")");
  if (KID_SQLI_RE.test(kid)) shapes.push("SQL-metacharacter");
  if (shapes.length === 0) return [];
  return [finding(
    "header", "kid-injection-risk", "medium",
    `The "kid" header ("${kid}") contains ${shapes.join(" and ")}-shaped characters. "kid" is meant to be an opaque key identifier; if the verifying code uses it to build a file path or a database query without sanitizing it, this is a documented key-confusion technique. Not itself proof of a vulnerability -- worth checking how your verifier resolves "kid".`,
  )];
}

// ---- registered timing claims (RFC 7519 4.1) -----------------------------

const SECONDS_TO_MS = 1000;
const EXCESSIVE_LIFETIME_CAUTION_SECONDS = 24 * 60 * 60; // 1 day
const EXCESSIVE_LIFETIME_HIGH_SECONDS = 30 * 24 * 60 * 60; // 30 days
const CLOCK_SKEW_TOLERANCE_SECONDS = 5 * 60; // 5 minutes

function isNumericClaim(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isoOrRaw(numericSeconds) {
  const ms = numericSeconds * SECONDS_TO_MS;
  if (!Number.isFinite(ms)) return String(numericSeconds);
  try {
    return new Date(ms).toISOString();
  } catch {
    return String(numericSeconds);
  }
}

/** Missing/expired/excessively long "exp", a missing or future "iat", and a
 * not-yet-valid "nbf". The excessive-lifetime threshold is a documented
 * reference point (RFC 8725 3.7 recommends short-lived tokens; OWASP's JWT
 * Cheat Sheet says the same) rather than a number any spec enforces -- like
 * every caution in this tool, it is worth a look, never a hard failure. */
export function checkTimingClaims(payload, now = Date.now()) {
  const out = [];
  const { exp, iat, nbf } = payload || {};

  if (isBlank(exp)) {
    out.push(finding(
      "payload", "missing-exp", "high",
      'No "exp" (expiration) claim. RFC 8725 recommends every JWT carry one; without it, a verifier that does not enforce its own external expiry will accept this token indefinitely, so a leaked token never stops working on its own.',
    ));
  } else if (!isNumericClaim(exp)) {
    out.push(finding("payload", "missing-exp", "high", '"exp" is present but is not a NumericDate (seconds since the Unix epoch) as RFC 7519 4.1.4 requires -- check what produced this token.'));
  } else {
    const expMs = exp * SECONDS_TO_MS;
    if (expMs < now) {
      out.push(finding(
        "payload", "expired", "low",
        `"exp" (${isoOrRaw(exp)}) is already in the past as of the time this was checked (${new Date(now).toISOString()}). Not itself a vulnerability -- if you expect this token to still be accepted, check the verifying service's clock and configured leeway.`,
      ));
    }
    if (isNumericClaim(iat)) {
      const lifetimeSeconds = exp - iat;
      if (lifetimeSeconds > 0) {
        if (lifetimeSeconds >= EXCESSIVE_LIFETIME_HIGH_SECONDS) {
          out.push(finding(
            "payload", "excessive-lifetime", "medium",
            `The token's lifetime ("exp" minus "iat") is about ${Math.round(lifetimeSeconds / 86400)} days -- well past common short-lived-access-token guidance (RFC 8725 3.7, OWASP's JWT Cheat Sheet). A long-lived token that leaks stays usable for the whole window; consider a shorter "exp" plus a separate refresh flow if this is meant to be an access token.`,
          ));
        } else if (lifetimeSeconds >= EXCESSIVE_LIFETIME_CAUTION_SECONDS) {
          out.push(finding(
            "payload", "excessive-lifetime", "low",
            `The token's lifetime ("exp" minus "iat") is about ${Math.round(lifetimeSeconds / 3600)} hours -- past the ${EXCESSIVE_LIFETIME_CAUTION_SECONDS / 3600}-hour reference point commonly suggested for access tokens. Worth a look if this is meant to be short-lived; not a hard rule, and a long-lived refresh or service token can be entirely intentional.`,
          ));
        }
      }
    }
  }

  if (isBlank(iat)) {
    out.push(finding("payload", "missing-iat", "low", 'No "iat" (issued-at) claim. Not required by spec, but its absence removes a signal you could otherwise use to bound the token\'s age or compute its lifetime against "exp".'));
  } else if (isNumericClaim(iat) && iat * SECONDS_TO_MS > now + CLOCK_SKEW_TOLERANCE_SECONDS * SECONDS_TO_MS) {
    out.push(finding(
      "payload", "iat-in-future", "medium",
      `"iat" (${isoOrRaw(iat)}) is in the future relative to when this was checked (${new Date(now).toISOString()}), beyond a ${CLOCK_SKEW_TOLERANCE_SECONDS / 60}-minute clock-skew allowance. This can mean clock skew between issuer and verifier, or a forged/backdated timestamp -- worth checking if unexpected.`,
    ));
  }

  if (isNumericClaim(nbf) && nbf * SECONDS_TO_MS > now) {
    out.push(finding(
      "payload", "not-yet-valid", "low",
      `"nbf" (not-before, ${isoOrRaw(nbf)}) is still in the future as of the time this was checked. A spec-compliant verifier will reject this token until then -- expected if this is a deliberately future-dated token, worth a look otherwise.`,
    ));
  }

  return out;
}

/** Missing "aud"/"iss". Neither is required by RFC 7519, but their absence
 * removes a restriction a verifier could otherwise enforce -- a token with
 * no audience can, in principle, be replayed against any service that trusts
 * the issuer's signature (RFC 8725 2.8's "audience confusion" concern). */
export function checkAudienceIssuer(payload) {
  const out = [];
  if (isBlank(payload?.aud)) {
    out.push(finding(
      "payload", "missing-aud", "low",
      'No "aud" (audience) claim. Without one, a verifier that only checks the signature (and not which service the token was meant for) could accept this token for a service it was never issued to.',
    ));
  }
  if (isBlank(payload?.iss)) {
    out.push(finding("payload", "missing-iss", "low", 'No "iss" (issuer) claim. Without one, a verifier trusting multiple issuers has no field to check the token actually came from the issuer it expects.'));
  }
  return out;
}

// ---- sensitive-looking payload fields -------------------------------------

// Key-name shapes that, in practice, show up in JWT payloads by mistake far
// more often than on purpose -- a pattern-matching heuristic against known
// mistake shapes, not a semantic read of what the field actually holds.
const SENSITIVE_KEY_RE = /^(pass(word)?|pwd|secret|api[_-]?key|private[_-]?key|access[_-]?token|refresh[_-]?token|ssn|social[_-]?security(?:[_-]?number)?|credit[_-]?card|card[_-]?number|cvv|cvc|bank[_-]?account|routing[_-]?number|pin)$/i;

/** Flags payload field *names* that match a known sensitive-data shape. A
 * JWT payload is base64url-*encoded*, not encrypted -- anyone holding the
 * token can decode and read it, so a field like this is readable by any
 * client, log, proxy, or browser extension the token passes through. This is
 * a name-pattern heuristic, not a content classifier: it can miss a
 * differently-named sensitive field and can flag a field that, for this
 * token, is genuinely fine to expose. */
export function checkSensitiveFields(payload) {
  const out = [];
  if (!payload || typeof payload !== "object") return out;
  for (const key of Object.keys(payload)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      out.push(finding(
        "payload", "sensitive-field-name", "high",
        `The payload has a field named "${key}", which matches a common sensitive-data naming pattern. A JWT payload is base64url-encoded, not encrypted -- this value is readable by anyone who has the token (the browser, any proxy or log it passes through, a browser extension). If this genuinely holds a secret, password, or full payment/ID number, move it out of the token.`,
      ));
    }
  }
  return out;
}

// ---- orchestration ----------------------------------------------------------

function countSeverities(findings) {
  const counts = { high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
  return counts;
}

/** Runs every check against one pasted token. Returns the parse result plus
 * a flat finding list and severity counts. If the token does not parse
 * structurally, only the parse errors are returned as findings -- there is
 * nothing else to check. */
export function analyzeJwt(token, { now = Date.now() } = {}) {
  const parsed = parseJwt(token);
  if (!parsed.ok) {
    const findings = parsed.errors.map((err) => finding("structure", "invalid-structure", "high", err));
    return { parsed, findings, counts: countSeverities(findings) };
  }
  const findings = [
    ...checkAlgNone(parsed.header),
    ...checkEmbeddedKeyHeaders(parsed.header),
    ...checkAlgorithmConfusion(parsed.header),
    ...checkKidInjection(parsed.header),
    ...checkTimingClaims(parsed.payload, now),
    ...checkAudienceIssuer(parsed.payload),
    ...checkSensitiveFields(parsed.payload),
  ];
  return { parsed, findings, counts: countSeverities(findings) };
}

/** Plain-text summary suitable for pasting into a review note or PR. */
export function summaryText({ findings, counts }) {
  const lines = [
    `JWT security check: ${findings.length} finding(s) (${counts.high} high, ${counts.medium} medium, ${counts.low} low).`,
  ];
  if (findings.length === 0) {
    lines.push("No structural issues observed. This is not a claim that the token, or the service that issued or verifies it, is secure -- only that none of this tool's mechanical checks fired.");
  } else {
    for (const f of findings) {
      lines.push(`[${f.severity.toUpperCase()}] ${f.category}: ${f.detail}`);
    }
  }
  lines.push("Mechanical, pattern-matching checks only -- this tool never verifies a signature and never sees your server's verification code. Review every finding yourself.");
  return lines.join("\n");
}
