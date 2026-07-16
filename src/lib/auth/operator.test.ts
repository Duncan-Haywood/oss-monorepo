import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Token crypto + passwordsMatch stay pure. requireOperatorAuth /
 * isOperatorAuthenticated are the cookie-read path every dashboard mutation
 * and proxy gate share — login action Vitest locks write/clear; this suite
 * locks jar read (open demo when unset, reject missing/invalid/expired,
 * accept valid session).
 */

const cookieGet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (...args: unknown[]) => cookieGet(...args),
  })),
}));

import {
  MAX_OPERATOR_PASSWORD_LENGTH,
  MAX_OPERATOR_SESSION_TOKEN_LENGTH,
  OPERATOR_SESSION_COOKIE,
  createOperatorSessionToken,
  getPassword,
  isOperatorAuthenticated,
  isOperatorAuthConfigured,
  passwordsMatch,
  requireOperatorAuth,
  tryCreateSessionFromPassword,
  verifyOperatorSessionToken,
} from "./operator";

const PASSWORD = "correct-horse-battery-staple";
const NOW = Date.parse("2026-07-11T00:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

const originalPassword = process.env.OPERATOR_DASHBOARD_PASSWORD;

function restorePasswordEnv(): void {
  if (originalPassword === undefined) {
    delete process.env.OPERATOR_DASHBOARD_PASSWORD;
  } else {
    process.env.OPERATOR_DASHBOARD_PASSWORD = originalPassword;
  }
}

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

  it("produces tokens well under MAX_OPERATOR_SESSION_TOKEN_LENGTH", () => {
    const token = createOperatorSessionToken(PASSWORD, NOW);
    expect(token.length).toBeLessThanOrEqual(MAX_OPERATOR_SESSION_TOKEN_LENGTH);
    expect(token.length).toBeLessThan(80);
  });

  it("hard-rejects tokens longer than MAX_OPERATOR_SESSION_TOKEN_LENGTH (no soft-cap)", () => {
    const over = "x".repeat(MAX_OPERATOR_SESSION_TOKEN_LENGTH + 1);
    expect(over.length).toBeGreaterThan(MAX_OPERATOR_SESSION_TOKEN_LENGTH);
    expect(verifyOperatorSessionToken(over, PASSWORD, NOW)).toBe(false);
  });

  it("still evaluates tokens at exactly MAX_OPERATOR_SESSION_TOKEN_LENGTH (no early length reject)", () => {
    // Exact-max garbage still goes through shape/HMAC checks (rejects as invalid),
    // proving the length gate is exclusive (> max) not inclusive.
    const exact = "y".repeat(MAX_OPERATOR_SESSION_TOKEN_LENGTH);
    expect(exact).toHaveLength(MAX_OPERATOR_SESSION_TOKEN_LENGTH);
    expect(verifyOperatorSessionToken(exact, PASSWORD, NOW)).toBe(false);
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

  it("returns false for passwords longer than MAX_OPERATOR_PASSWORD_LENGTH (no Buffer compare)", () => {
    const over = "x".repeat(MAX_OPERATOR_PASSWORD_LENGTH + 1);
    expect(passwordsMatch(over, PASSWORD)).toBe(false);
  });

  it("still compares an exact-max-length password", () => {
    const exact = "y".repeat(MAX_OPERATOR_PASSWORD_LENGTH);
    expect(passwordsMatch(exact, exact)).toBe(true);
    expect(passwordsMatch(exact, `${exact.slice(0, -1)}z`)).toBe(false);
  });
});

describe("getPassword / isOperatorAuthConfigured", () => {
  afterEach(() => {
    restorePasswordEnv();
  });

  it("returns trimmed password and reports configured", () => {
    process.env.OPERATOR_DASHBOARD_PASSWORD = `  ${PASSWORD}  `;
    expect(getPassword()).toBe(PASSWORD);
    expect(isOperatorAuthConfigured()).toBe(true);
  });

  it("treats whitespace-only as unset", () => {
    process.env.OPERATOR_DASHBOARD_PASSWORD = "   ";
    expect(getPassword()).toBeNull();
    expect(isOperatorAuthConfigured()).toBe(false);
  });
});

describe("tryCreateSessionFromPassword", () => {
  beforeEach(() => {
    process.env.OPERATOR_DASHBOARD_PASSWORD = PASSWORD;
  });

  afterEach(() => {
    restorePasswordEnv();
  });

  it("returns a token for a correct password", () => {
    expect(tryCreateSessionFromPassword(PASSWORD)).not.toBeNull();
    expect(tryCreateSessionFromPassword(PASSWORD)).toContain(".");
  });

  it("returns null for a wrong password", () => {
    expect(tryCreateSessionFromPassword("wrong-password")).toBeNull();
  });

  it("returns null when env var is unset", () => {
    delete process.env.OPERATOR_DASHBOARD_PASSWORD;
    expect(tryCreateSessionFromPassword("anything")).toBeNull();
  });

  it("trims leading whitespace from the provided password", () => {
    expect(tryCreateSessionFromPassword(`  ${PASSWORD}`)).not.toBeNull();
  });

  it("trims trailing whitespace from the provided password", () => {
    expect(tryCreateSessionFromPassword(`${PASSWORD}  `)).not.toBeNull();
  });

  it("trims whitespace on both sides of the provided password", () => {
    expect(tryCreateSessionFromPassword(`  ${PASSWORD}  `)).not.toBeNull();
  });

  it("rejects when env var has only whitespace (treated as unset)", () => {
    process.env.OPERATOR_DASHBOARD_PASSWORD = "   ";
    expect(tryCreateSessionFromPassword("anything")).toBeNull();
  });

  it("returns a token when env var has surrounding whitespace (trimmed)", () => {
    process.env.OPERATOR_DASHBOARD_PASSWORD = `  ${PASSWORD}  `;
    expect(tryCreateSessionFromPassword(PASSWORD)).not.toBeNull();
  });

  it("returns null for a whitespace-only provided password", () => {
    expect(tryCreateSessionFromPassword("   ")).toBeNull();
  });

  it("returns null for an over-long provided password before compare", () => {
    const over = "z".repeat(MAX_OPERATOR_PASSWORD_LENGTH + 1);
    expect(tryCreateSessionFromPassword(over)).toBeNull();
  });

  it("accepts an exact-max-length correct password", () => {
    const exact = "p".repeat(MAX_OPERATOR_PASSWORD_LENGTH);
    process.env.OPERATOR_DASHBOARD_PASSWORD = exact;
    expect(tryCreateSessionFromPassword(exact)).not.toBeNull();
  });
});

describe("requireOperatorAuth (cookie-read)", () => {
  beforeEach(() => {
    cookieGet.mockReset();
    process.env.OPERATOR_DASHBOARD_PASSWORD = PASSWORD;
  });

  afterEach(() => {
    restorePasswordEnv();
    vi.clearAllMocks();
  });

  it("returns ok when OPERATOR_DASHBOARD_PASSWORD is unset (open demo)", async () => {
    delete process.env.OPERATOR_DASHBOARD_PASSWORD;
    await expect(requireOperatorAuth()).resolves.toEqual({ ok: true });
    expect(cookieGet).not.toHaveBeenCalled();
  });

  it("returns ok when password is empty string (treated as unset)", async () => {
    process.env.OPERATOR_DASHBOARD_PASSWORD = "";
    await expect(requireOperatorAuth()).resolves.toEqual({ ok: true });
    expect(cookieGet).not.toHaveBeenCalled();
  });

  it("returns ok when password is whitespace-only (treated as unset)", async () => {
    process.env.OPERATOR_DASHBOARD_PASSWORD = "   ";
    await expect(requireOperatorAuth()).resolves.toEqual({ ok: true });
    expect(cookieGet).not.toHaveBeenCalled();
  });

  it("rejects when password is set and the session cookie is missing", async () => {
    cookieGet.mockReturnValue(undefined);
    await expect(requireOperatorAuth()).resolves.toEqual({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(cookieGet).toHaveBeenCalledWith(OPERATOR_SESSION_COOKIE);
  });

  it("rejects when the session cookie value is invalid", async () => {
    cookieGet.mockReturnValue({ value: "not.a.valid.token" });
    await expect(requireOperatorAuth()).resolves.toEqual({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
  });

  it("rejects when the session cookie has expired", async () => {
    const expiredToken = createOperatorSessionToken(
      PASSWORD,
      Date.now() - 13 * HOUR_MS,
    );
    cookieGet.mockReturnValue({ value: expiredToken });
    await expect(requireOperatorAuth()).resolves.toEqual({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
  });

  it("accepts a valid signed session cookie", async () => {
    const token = createOperatorSessionToken(PASSWORD);
    cookieGet.mockReturnValue({ value: token });
    await expect(requireOperatorAuth()).resolves.toEqual({ ok: true });
    expect(cookieGet).toHaveBeenCalledWith(OPERATOR_SESSION_COOKIE);
  });
});

describe("isOperatorAuthenticated (cookie-read)", () => {
  beforeEach(() => {
    cookieGet.mockReset();
    process.env.OPERATOR_DASHBOARD_PASSWORD = PASSWORD;
  });

  afterEach(() => {
    restorePasswordEnv();
    vi.clearAllMocks();
  });

  it("returns true when auth is not configured (open demo)", async () => {
    delete process.env.OPERATOR_DASHBOARD_PASSWORD;
    await expect(isOperatorAuthenticated()).resolves.toBe(true);
    expect(cookieGet).not.toHaveBeenCalled();
  });

  it("returns false when password is set and cookie is missing", async () => {
    cookieGet.mockReturnValue(undefined);
    await expect(isOperatorAuthenticated()).resolves.toBe(false);
    expect(cookieGet).toHaveBeenCalledWith(OPERATOR_SESSION_COOKIE);
  });

  it("returns false when the session cookie is invalid", async () => {
    cookieGet.mockReturnValue({ value: "tampered.token.value" });
    await expect(isOperatorAuthenticated()).resolves.toBe(false);
  });

  it("returns true when a valid signed session cookie is present", async () => {
    const token = createOperatorSessionToken(PASSWORD);
    cookieGet.mockReturnValue({ value: token });
    await expect(isOperatorAuthenticated()).resolves.toBe(true);
  });
});
