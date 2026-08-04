import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeRedirectPath } from "./redirect.ts";

/**
 * `sanitizeRedirectPath` is the only thing standing between the `redirect`
 * query parameter and an open redirect. It is reached from two places that both
 * take the value straight off an untrusted URL: `src/middleware.ts`, which puts
 * it on the login URL it bounces anonymous callers to, and
 * `src/app/api/auth/session/route.ts`, which redirects to it after clearing the
 * session cookie.
 *
 * It had no tests. The function is written as a deny-list of four shapes, and a
 * deny-list is exactly the kind of code where a later "small" edit — relaxing
 * the `%` rule to allow encoded spaces, say — reopens the hole silently. These
 * are the shapes an attacker sends.
 */

test("passes an ordinary same-origin path through unchanged", () => {
  assert.equal(sanitizeRedirectPath("/dashboard"), "/dashboard");
  assert.equal(sanitizeRedirectPath("/reports/q3?tab=summary"), "/reports/q3?tab=summary");
});

test("falls back to the root for an absent value", () => {
  assert.equal(sanitizeRedirectPath(null), "/");
  assert.equal(sanitizeRedirectPath(undefined), "/");
  assert.equal(sanitizeRedirectPath(""), "/");
});

const offSite = [
  // Absolute URLs — the plain case.
  "https://evil.example",
  "http://evil.example/login",
  // Protocol-relative. A browser reads `//evil.example` as a host, not a path.
  "//evil.example",
  "//evil.example/callback",
  // Backslash variants: some URL parsers normalise `\` to `/`, so `/\evil` and
  // `\\evil` can resolve off-site even though they start with a slash.
  "/\\evil.example",
  "\\\\evil.example",
  "/\\/evil.example",
  // Percent-encoding, which is how the two shapes above get past a check that
  // only looks at the literal characters.
  "/%2f%2fevil.example",
  "%2f%2fevil.example",
  "/%5c%5cevil.example",
  "/%09/evil.example",
  // Scheme-bearing values that do not start with a slash at all.
  "javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "mailto:someone@example.com",
];

for (const value of offSite) {
  test(`refuses to redirect to ${JSON.stringify(value)}`, () => {
    assert.equal(
      sanitizeRedirectPath(value),
      "/",
      "an off-site or encoded redirect target must fall back to the root",
    );
  });
}

test("the result is always a same-origin relative path", () => {
  // The property the two callers rely on, stated once: whatever goes in, what
  // comes out starts with a single slash and cannot be read as a host.
  const inputs = [...offSite, "/dashboard", "", null, undefined, "/a/b/c"];
  for (const value of inputs) {
    const result = sanitizeRedirectPath(value as string | null | undefined);
    assert.ok(result.startsWith("/"), `${String(value)} produced ${result}`);
    assert.ok(!result.startsWith("//"), `${String(value)} produced ${result}`);
    assert.ok(!result.includes("\\"), `${String(value)} produced ${result}`);
  }
});
