import { describe, expect, it } from "vitest";
import { cronSecretMatches, extractBearerToken, verifyCronRequest } from "./cron-secret";

/**
 * Direct unit coverage for the shared CRON_SECRET verification used by
 * every GET /api/cron/* route (daily-digest, checkout-recovery — see
 * operator-daily-digest-cron-automation / checkout-recovery-cron-automation
 * in BUSINESS_DECISIONS). Both route.test.ts files already exercise this
 * module indirectly through the full request/response cycle (missing
 * header, wrong length, same-length wrong token, over-length token), but
 * cron-secret.ts itself — unlike every other sibling in src/lib/security/
 * (app-url, content-security-policy, json-body, rate-limit,
 * security-headers all have a colocated *.test.ts) — had no direct test of
 * its own exported functions in isolation. This closes that gap and pins
 * down edge cases the route tests don't bother asserting (case-sensitive
 * "Bearer " prefix, missing/malformed Authorization header shapes, the
 * exact MAX_CRON_SECRET_LENGTH boundary).
 */

describe("cronSecretMatches", () => {
  it("returns true for identical secrets", () => {
    expect(cronSecretMatches("correct-secret", "correct-secret")).toBe(true);
  });

  it("returns false for a same-length wrong secret", () => {
    expect(cronSecretMatches("wrong-secretx", "correct-secre")).toBe(false);
  });

  it("returns false for a different-length secret", () => {
    expect(cronSecretMatches("short", "much-longer-secret")).toBe(false);
  });

  it("returns false for an empty provided secret against a non-empty expected one", () => {
    expect(cronSecretMatches("", "correct-secret")).toBe(false);
  });

  it("returns true when both provided and expected are empty", () => {
    expect(cronSecretMatches("", "")).toBe(true);
  });

  it("accepts a provided secret exactly at the 256-char length ceiling", () => {
    const secret = "a".repeat(256);
    expect(cronSecretMatches(secret, secret)).toBe(true);
  });

  it("rejects a provided secret over the 256-char length ceiling even if it would otherwise match", () => {
    const secret = "a".repeat(257);
    expect(cronSecretMatches(secret, secret)).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(cronSecretMatches("Secret", "secret")).toBe(false);
  });
});

describe("extractBearerToken", () => {
  it("extracts the token from a well-formed Authorization header", () => {
    const headers = new Headers({ authorization: "Bearer my-token" });
    expect(extractBearerToken(headers)).toBe("my-token");
  });

  it("returns an empty string when the Authorization header is absent", () => {
    const headers = new Headers();
    expect(extractBearerToken(headers)).toBe("");
  });

  it("returns an empty string for a lowercase 'bearer' scheme (case-sensitive prefix)", () => {
    const headers = new Headers({ authorization: "bearer my-token" });
    expect(extractBearerToken(headers)).toBe("");
  });

  it("returns an empty string for a non-Bearer scheme", () => {
    const headers = new Headers({ authorization: "Basic dXNlcjpwYXNz" });
    expect(extractBearerToken(headers)).toBe("");
  });

  it("returns an empty string for 'Bearer' with no trailing space or token", () => {
    const headers = new Headers({ authorization: "Bearer" });
    expect(extractBearerToken(headers)).toBe("");
  });

  it("returns an empty string for an empty Authorization header value", () => {
    const headers = new Headers({ authorization: "" });
    expect(extractBearerToken(headers)).toBe("");
  });
});

describe("verifyCronRequest", () => {
  const expectedSecret = "the-real-cron-secret";

  it("returns true for a request carrying the correct bearer token", () => {
    const headers = new Headers({ authorization: `Bearer ${expectedSecret}` });
    expect(verifyCronRequest(headers, expectedSecret)).toBe(true);
  });

  it("returns false for a request with no Authorization header", () => {
    const headers = new Headers();
    expect(verifyCronRequest(headers, expectedSecret)).toBe(false);
  });

  it("returns false for a request with the wrong bearer token", () => {
    const headers = new Headers({ authorization: "Bearer some-other-value" });
    expect(verifyCronRequest(headers, expectedSecret)).toBe(false);
  });

  it("returns false for a malformed (non-Bearer) Authorization header", () => {
    const headers = new Headers({ authorization: expectedSecret });
    expect(verifyCronRequest(headers, expectedSecret)).toBe(false);
  });
});
