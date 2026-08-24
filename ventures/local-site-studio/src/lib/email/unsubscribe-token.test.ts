import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MAX_UNSUBSCRIBE_TOKEN_LENGTH,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./unsubscribe-token";

describe("unsubscribe-token", () => {
  const originalResendKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_signing_key";
  });

  afterEach(() => {
    if (originalResendKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalResendKey;
    }
  });

  it("round-trips: a token signed for an address verifies for that address", () => {
    const token = signUnsubscribeToken("owner@example.com");
    expect(verifyUnsubscribeToken("owner@example.com", token)).toBe(true);
  });

  it("produces a base64url HMAC digest well under MAX_UNSUBSCRIBE_TOKEN_LENGTH", () => {
    const token = signUnsubscribeToken("owner@example.com");
    expect(token.length).toBe(43);
    expect(token.length).toBeLessThanOrEqual(MAX_UNSUBSCRIBE_TOKEN_LENGTH);
  });

  it("is case- and whitespace-insensitive on the signed address (matches sendEmail's normalizedTo)", () => {
    const token = signUnsubscribeToken("Owner@Example.com");
    expect(verifyUnsubscribeToken(" owner@example.com ", token)).toBe(true);
  });

  it("rejects a token signed for a different address", () => {
    const token = signUnsubscribeToken("owner@example.com");
    expect(verifyUnsubscribeToken("victim@example.com", token)).toBe(false);
  });

  it("rejects a missing token", () => {
    expect(verifyUnsubscribeToken("owner@example.com", null)).toBe(false);
  });

  it("rejects an empty-string token", () => {
    expect(verifyUnsubscribeToken("owner@example.com", "")).toBe(false);
  });

  it("rejects a garbage/tampered token", () => {
    const token = signUnsubscribeToken("owner@example.com");
    const tampered = token.slice(0, -1) + (token.at(-1) === "a" ? "b" : "a");
    expect(verifyUnsubscribeToken("owner@example.com", tampered)).toBe(false);
  });

  it("rejects a token of the wrong length without throwing", () => {
    expect(verifyUnsubscribeToken("owner@example.com", "short")).toBe(false);
  });

  it("hard-rejects tokens longer than MAX_UNSUBSCRIBE_TOKEN_LENGTH (no soft-cap)", () => {
    const over = "x".repeat(MAX_UNSUBSCRIBE_TOKEN_LENGTH + 1);
    expect(over.length).toBeGreaterThan(MAX_UNSUBSCRIBE_TOKEN_LENGTH);
    expect(verifyUnsubscribeToken("owner@example.com", over)).toBe(false);
  });

  it("still evaluates tokens at exactly MAX_UNSUBSCRIBE_TOKEN_LENGTH (no early length reject)", () => {
    const exact = "y".repeat(MAX_UNSUBSCRIBE_TOKEN_LENGTH);
    expect(exact).toHaveLength(MAX_UNSUBSCRIBE_TOKEN_LENGTH);
    // Wrong digest → false, but must not trip the over-max gate
    expect(verifyUnsubscribeToken("owner@example.com", exact)).toBe(false);
  });

  it("changes the token when the signing secret changes (RESEND_API_KEY rotation)", () => {
    const tokenA = signUnsubscribeToken("owner@example.com");
    process.env.RESEND_API_KEY = "re_a_different_key";
    const tokenB = signUnsubscribeToken("owner@example.com");
    expect(tokenA).not.toBe(tokenB);
    expect(verifyUnsubscribeToken("owner@example.com", tokenA)).toBe(false);
  });

  it("falls back to a stable dev secret when RESEND_API_KEY is unset (mock-email mode)", () => {
    delete process.env.RESEND_API_KEY;
    const token = signUnsubscribeToken("owner@example.com");
    expect(verifyUnsubscribeToken("owner@example.com", token)).toBe(true);
  });
});
