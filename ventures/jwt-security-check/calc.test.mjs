import test from "node:test";
import assert from "node:assert/strict";
import {
  parseJwt,
  analyzeJwt,
  checkAlgNone,
  checkEmbeddedKeyHeaders,
  checkAlgorithmConfusion,
  checkKidInjection,
  checkTimingClaims,
  checkAudienceIssuer,
  checkSensitiveFields,
  summaryText,
} from "./calc.mjs";

// Test-only helper: builds a JWT segment/token from a plain object, so
// fixtures read as JSON rather than as hand-typed base64. Uses Node's
// Buffer, which calc.mjs itself deliberately does not depend on (it has to
// run in the browser build too).
function b64url(input) {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(JSON.stringify(input), "utf8");
  return buf.toString("base64url");
}

function makeToken(header, payload, signature = "sig") {
  return `${b64url(header)}.${b64url(payload)}.${signature}`;
}

const NOW = Date.parse("2026-06-15T00:00:00Z");
const nowSec = () => Math.floor(NOW / 1000);

// ---- parseJwt ---------------------------------------------------------

test("parseJwt rejects an empty token", () => {
  const result = parseJwt("");
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /Paste a token/);
});

test("parseJwt rejects a token without exactly 3 segments", () => {
  assert.match(parseJwt("abc.def").errors[0], /Found 2 dot-separated segment/);
  assert.match(parseJwt("a.b.c.d").errors[0], /Found 4 dot-separated segment/);
});

test("parseJwt rejects a header segment that is not valid base64url", () => {
  const result = parseJwt("not!valid.".concat(b64url({ sub: "1" }), ".sig"));
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /Header segment could not be decoded/);
});

test("parseJwt rejects a segment that decodes but is not JSON", () => {
  const badHeader = Buffer.from("not json", "utf8").toString("base64url");
  const result = parseJwt(`${badHeader}.${b64url({ sub: "1" })}.sig`);
  assert.match(result.errors[0], /not valid JSON/);
});

test("parseJwt rejects a header/payload that decode to a non-object", () => {
  const result = parseJwt(`${b64url([1, 2, 3])}.${b64url({ sub: "1" })}.sig`);
  assert.match(result.errors.join(" "), /is not an object/);
});

test("parseJwt flags an empty signature segment", () => {
  const result = parseJwt(`${b64url({ alg: "HS256" })}.${b64url({ sub: "1" })}.`);
  assert.match(result.errors.join(" "), /Signature segment is empty/);
});

test("parseJwt accepts a well-formed token", () => {
  const token = makeToken({ alg: "HS256", typ: "JWT" }, { sub: "user-1", exp: nowSec() + 3600 });
  const result = parseJwt(token);
  assert.equal(result.ok, true);
  assert.deepEqual(result.header, { alg: "HS256", typ: "JWT" });
  assert.equal(result.payload.sub, "user-1");
});

test("parseJwt round-trips a payload containing non-ASCII text", () => {
  const token = makeToken({ alg: "HS256" }, { name: "Zoë Müller — 日本語" });
  const result = parseJwt(token);
  assert.equal(result.ok, true);
  assert.equal(result.payload.name, "Zoë Müller — 日本語");
});

// ---- checkAlgNone -------------------------------------------------------

test("checkAlgNone flags alg: none", () => {
  const findings = checkAlgNone({ alg: "none" });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].category, "alg-none");
  assert.equal(findings[0].severity, "high");
});

test("checkAlgNone is case-insensitive on the value", () => {
  assert.equal(checkAlgNone({ alg: "None" })[0].category, "alg-none");
  assert.equal(checkAlgNone({ alg: "NONE" })[0].category, "alg-none");
});

test("checkAlgNone flags a missing alg field", () => {
  const findings = checkAlgNone({});
  assert.equal(findings[0].category, "missing-alg");
  assert.equal(findings[0].severity, "high");
});

test("checkAlgNone is silent for a normal algorithm", () => {
  assert.deepEqual(checkAlgNone({ alg: "RS256" }), []);
});

// ---- checkEmbeddedKeyHeaders ---------------------------------------------

test("checkEmbeddedKeyHeaders flags jwk, jku, x5u, and x5c independently", () => {
  assert.equal(checkEmbeddedKeyHeaders({ jwk: { kty: "RSA" } })[0].category, "embedded-key-header");
  assert.equal(checkEmbeddedKeyHeaders({ jku: "https://evil.example/keys.json" })[0].category, "embedded-key-header");
  assert.equal(checkEmbeddedKeyHeaders({ x5u: "https://evil.example/cert" })[0].category, "embedded-key-header");
  assert.equal(checkEmbeddedKeyHeaders({ x5c: ["MIIB..."] })[0].category, "embedded-key-header");
});

test("checkEmbeddedKeyHeaders reports one finding per field present", () => {
  const findings = checkEmbeddedKeyHeaders({ jwk: {}, jku: "https://x" });
  assert.equal(findings.length, 2);
});

test("checkEmbeddedKeyHeaders is silent when none of the fields are present", () => {
  assert.deepEqual(checkEmbeddedKeyHeaders({ alg: "RS256", kid: "key-1" }), []);
});

// ---- checkAlgorithmConfusion ---------------------------------------------

test("checkAlgorithmConfusion flags HS256 alongside an embedded key hint", () => {
  const findings = checkAlgorithmConfusion({ alg: "HS256", jwk: { kty: "RSA" } });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].category, "algorithm-confusion-risk");
  assert.match(findings[0].detail, /"jwk"/);
});

test("checkAlgorithmConfusion covers HS384 and HS512 too, case-insensitively", () => {
  assert.equal(checkAlgorithmConfusion({ alg: "hs384", jku: "https://x" }).length, 1);
  assert.equal(checkAlgorithmConfusion({ alg: "HS512", x5c: ["a"] }).length, 1);
});

test("checkAlgorithmConfusion is silent for an asymmetric algorithm", () => {
  assert.deepEqual(checkAlgorithmConfusion({ alg: "RS256", jwk: {} }), []);
});

test("checkAlgorithmConfusion is silent for a symmetric algorithm with no embedded key hint", () => {
  assert.deepEqual(checkAlgorithmConfusion({ alg: "HS256" }), []);
});

// ---- checkKidInjection ----------------------------------------------------

test("checkKidInjection flags a path-traversal-shaped kid", () => {
  const findings = checkKidInjection({ kid: "../../etc/passwd" });
  assert.equal(findings[0].category, "kid-injection-risk");
  assert.match(findings[0].detail, /path-traversal/);
});

test("checkKidInjection flags a SQL-metacharacter-shaped kid", () => {
  const findings = checkKidInjection({ kid: "1' OR '1'='1" });
  assert.match(findings[0].detail, /SQL-metacharacter/);
});

test("checkKidInjection can flag both shapes at once", () => {
  const findings = checkKidInjection({ kid: "../keys/1' --" });
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /path-traversal \("\.\.\/"\) and SQL-metacharacter/);
});

test("checkKidInjection is silent for an ordinary opaque kid", () => {
  assert.deepEqual(checkKidInjection({ kid: "2026-key-07" }), []);
  assert.deepEqual(checkKidInjection({}), []);
});

// ---- checkTimingClaims ----------------------------------------------------

test("checkTimingClaims flags a missing exp", () => {
  const findings = checkTimingClaims({}, NOW);
  assert.ok(findings.some((f) => f.category === "missing-exp" && f.severity === "high"));
});

test("checkTimingClaims flags a non-numeric exp", () => {
  const findings = checkTimingClaims({ exp: "tomorrow" }, NOW);
  assert.ok(findings.some((f) => f.category === "missing-exp"));
});

test("checkTimingClaims flags an already-expired token as low severity", () => {
  const findings = checkTimingClaims({ exp: nowSec() - 3600 }, NOW);
  const expired = findings.find((f) => f.category === "expired");
  assert.ok(expired);
  assert.equal(expired.severity, "low");
});

test("checkTimingClaims does not flag expired for a still-valid exp", () => {
  const findings = checkTimingClaims({ exp: nowSec() + 3600, iat: nowSec() }, NOW);
  assert.ok(!findings.some((f) => f.category === "expired"));
});

test("checkTimingClaims flags an excessive lifetime at the low tier past 24h", () => {
  const findings = checkTimingClaims({ iat: nowSec(), exp: nowSec() + 48 * 3600 }, NOW);
  const lifetime = findings.find((f) => f.category === "excessive-lifetime");
  assert.equal(lifetime.severity, "low");
});

test("checkTimingClaims flags an excessive lifetime at the medium tier past 30 days", () => {
  const findings = checkTimingClaims({ iat: nowSec(), exp: nowSec() + 40 * 86400 }, NOW);
  const lifetime = findings.find((f) => f.category === "excessive-lifetime");
  assert.equal(lifetime.severity, "medium");
});

test("checkTimingClaims does not flag a short lifetime", () => {
  const findings = checkTimingClaims({ iat: nowSec(), exp: nowSec() + 600 }, NOW);
  assert.ok(!findings.some((f) => f.category === "excessive-lifetime"));
});

test("checkTimingClaims flags a missing iat as low severity", () => {
  const findings = checkTimingClaims({ exp: nowSec() + 3600 }, NOW);
  assert.ok(findings.some((f) => f.category === "missing-iat" && f.severity === "low"));
});

test("checkTimingClaims flags an iat far in the future", () => {
  const findings = checkTimingClaims({ exp: nowSec() + 7200, iat: nowSec() + 3600 }, NOW);
  assert.ok(findings.some((f) => f.category === "iat-in-future" && f.severity === "medium"));
});

test("checkTimingClaims tolerates a few minutes of clock skew on iat", () => {
  const findings = checkTimingClaims({ exp: nowSec() + 3600, iat: nowSec() + 60 }, NOW);
  assert.ok(!findings.some((f) => f.category === "iat-in-future"));
});

test("checkTimingClaims flags a future nbf", () => {
  const findings = checkTimingClaims({ exp: nowSec() + 3600, iat: nowSec(), nbf: nowSec() + 1800 }, NOW);
  assert.ok(findings.some((f) => f.category === "not-yet-valid" && f.severity === "low"));
});

test("checkTimingClaims does not flag a past nbf", () => {
  const findings = checkTimingClaims({ exp: nowSec() + 3600, iat: nowSec(), nbf: nowSec() - 1800 }, NOW);
  assert.ok(!findings.some((f) => f.category === "not-yet-valid"));
});

// ---- checkAudienceIssuer ---------------------------------------------------

test("checkAudienceIssuer flags both missing aud and iss", () => {
  const findings = checkAudienceIssuer({});
  assert.equal(findings.length, 2);
  assert.ok(findings.some((f) => f.category === "missing-aud"));
  assert.ok(findings.some((f) => f.category === "missing-iss"));
});

test("checkAudienceIssuer is silent when both are present", () => {
  assert.deepEqual(checkAudienceIssuer({ aud: "api.example.com", iss: "https://issuer.example" }), []);
});

// ---- checkSensitiveFields ---------------------------------------------------

test("checkSensitiveFields flags common sensitive key-name shapes", () => {
  const findings = checkSensitiveFields({ password: "hunter2", ssn: "123-45-6789", sub: "user-1" });
  assert.equal(findings.length, 2);
  assert.ok(findings.every((f) => f.severity === "high"));
  assert.ok(findings.some((f) => f.detail.includes('"password"')));
  assert.ok(findings.some((f) => f.detail.includes('"ssn"')));
});

test("checkSensitiveFields matches case- and separator-insensitively, including camelCase", () => {
  assert.equal(checkSensitiveFields({ API_KEY: "x" }).length, 1);
  assert.equal(checkSensitiveFields({ "credit-card": "x" }).length, 1);
  assert.equal(checkSensitiveFields({ creditCard: "x" }).length, 1);
});

test("checkSensitiveFields is silent for ordinary claim names", () => {
  assert.deepEqual(checkSensitiveFields({ sub: "1", email: "a@example.com", role: "admin" }), []);
});

test("checkSensitiveFields handles a missing/non-object payload gracefully", () => {
  assert.deepEqual(checkSensitiveFields(null), []);
  assert.deepEqual(checkSensitiveFields(undefined), []);
});

// ---- analyzeJwt orchestration ----------------------------------------------

test("analyzeJwt returns only structural findings when the token does not parse", () => {
  const result = analyzeJwt("garbage", { now: NOW });
  assert.equal(result.parsed.ok, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].category, "invalid-structure");
});

test("analyzeJwt runs every check on a well-formed token and totals severities", () => {
  const token = makeToken(
    { alg: "none" },
    { sub: "user-1", password: "hunter2" },
  );
  const result = analyzeJwt(token, { now: NOW });
  assert.equal(result.parsed.ok, true);
  const categories = result.findings.map((f) => f.category);
  assert.ok(categories.includes("alg-none"));
  assert.ok(categories.includes("missing-exp"));
  assert.ok(categories.includes("missing-iat"));
  assert.ok(categories.includes("missing-aud"));
  assert.ok(categories.includes("missing-iss"));
  assert.ok(categories.includes("sensitive-field-name"));
  assert.equal(result.counts.high, result.findings.filter((f) => f.severity === "high").length);
});

test("analyzeJwt reports zero findings for a well-formed, fully-populated token", () => {
  const token = makeToken(
    { alg: "RS256", typ: "JWT", kid: "2026-key-07" },
    {
      sub: "user-1",
      aud: "api.example.com",
      iss: "https://issuer.example",
      iat: nowSec(),
      exp: nowSec() + 600,
    },
  );
  const result = analyzeJwt(token, { now: NOW });
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.counts, { high: 0, medium: 0, low: 0 });
});

test("analyzeJwt defaults `now` to Date.now() when not supplied", () => {
  const token = makeToken({ alg: "RS256" }, { exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) });
  const result = analyzeJwt(token);
  assert.ok(!result.findings.some((f) => f.category === "expired"));
});

// ---- summaryText -------------------------------------------------------

test("summaryText reports a clean result plainly", () => {
  const text = summaryText({ findings: [], counts: { high: 0, medium: 0, low: 0 } });
  assert.match(text, /0 finding\(s\)/);
  assert.match(text, /not a claim that the token.*is secure/);
});

test("summaryText lists every finding with its severity and category", () => {
  const findings = [{ severity: "high", category: "alg-none", detail: "no signature" }];
  const text = summaryText({ findings, counts: { high: 1, medium: 0, low: 0 } });
  assert.match(text, /\[HIGH\] alg-none: no signature/);
  assert.match(text, /never verifies a signature/);
});
