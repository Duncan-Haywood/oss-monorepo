import { describe, expect, it } from "vitest";
import { createOperatorSessionToken, passwordsMatch, verifyOperatorSessionToken } from "./operator";

const PASSWORD = "correct-horse-battery-staple";
const NOW = Date.parse("2026-07-11T00:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

describe("createOperatorSessionToken / verifyOperatorSessionToken", () => {
  it("round-trips a freshly created token", () => {
    const token = createOperatorSessionToken(PASSWORD, NOW);
    expect(verifyOperatorSessionToken(token, PASSWORD, NOW)).toBe(true);
  });

  it("rejects a token verified against the wrong password", () => {
    const token = createOperatorSessionToken(PASSWORD, NOW);
    expect(verifyOperatorSessionToken(token, "wrong-password", NOW)).toBe(false);
  });

  it("rejects a token once it has expired (12h TTL)", () => {
    const token = createOperatorSessionToken(PASSWORD, NOW);
    const justExpired = NOW + 12 * HOUR_MS + 1;
    expect(verifyOperatorSessionToken(token, PASSWORD, justExpired)).toBe(false);
  });

  it("accepts a token right up to its expiry", () => {
    const token = createOperatorSessionToken(PASSWORD, NOW);
    const justBeforeExpiry = NOW + 12 * HOUR_MS;
    expect(verifyOperatorSessionToken(token, PASSWORD, justBeforeExpiry)).toBe(true);
  });

  it("rejects malformed tokens", () => {
    expect(verifyOperatorSessionToken("not.enough.parts.here", PASSWORD, NOW)).toBe(false);
    expect(verifyOperatorSessionToken("only-one-part", PASSWORD, NOW)).toBe(false);
    expect(verifyOperatorSessionToken(undefined, PASSWORD, NOW)).toBe(false);
    expect(verifyOperatorSessionToken(null, PASSWORD, NOW)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const token = createOperatorSessionToken(PASSWORD, NOW);
    const [expiresAt, subject] = token.split(".");
    const tampered = `${expiresAt}.${subject}.not-the-real-signature`;
    expect(verifyOperatorSessionToken(tampered, PASSWORD, NOW)).toBe(false);
  });

  it("rejects a tampered expiry (payload no longer matches signature)", () => {
    const token = createOperatorSessionToken(PASSWORD, NOW);
    const [expiresAt, subject, signature] = token.split(".");
    const tampered = `${Number(expiresAt) + HOUR_MS}.${subject}.${signature}`;
    expect(verifyOperatorSessionToken(tampered, PASSWORD, NOW)).toBe(false);
  });
});

describe("passwordsMatch", () => {
  it("returns true for identical strings", () => {
    expect(passwordsMatch(PASSWORD, PASSWORD)).toBe(true);
  });

  it("returns false for a mismatched password", () => {
    expect(passwordsMatch("wrong", PASSWORD)).toBe(false);
  });

  it("returns false without throwing on different-length inputs", () => {
    expect(passwordsMatch("short", "a-much-longer-password")).toBe(false);
  });
});
