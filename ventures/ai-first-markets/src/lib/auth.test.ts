import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALLOWED_EMAIL,
  getAuthSecret,
  getCloudflareAccessAudience,
  getCloudflareAccessTeamDomain,
  getGoogleClientId,
  getGoogleClientSecret,
  isCloudflareAccessEnabled,
  isEmailAllowed,
  isGoogleAuthConfigured,
  normalizeTeamDomain,
} from "./auth";

describe("isEmailAllowed", () => {
  it("allows the exact allowed email", () => {
    expect(isEmailAllowed(ALLOWED_EMAIL)).toBe(true);
  });

  it("allows the allowed email regardless of case", () => {
    expect(isEmailAllowed(ALLOWED_EMAIL.toUpperCase())).toBe(true);
  });

  it("allows the allowed email with surrounding whitespace", () => {
    expect(isEmailAllowed(`  ${ALLOWED_EMAIL}  `)).toBe(true);
  });

  it("rejects a different email", () => {
    expect(isEmailAllowed("someone.else@example.com")).toBe(false);
  });

  it("rejects an email that merely contains the allowed email as a substring", () => {
    expect(isEmailAllowed(`not-${ALLOWED_EMAIL}`)).toBe(false);
    expect(isEmailAllowed(`${ALLOWED_EMAIL}.evil.com`)).toBe(false);
  });

  it("rejects null, undefined, and empty string", () => {
    expect(isEmailAllowed(null)).toBe(false);
    expect(isEmailAllowed(undefined)).toBe(false);
    expect(isEmailAllowed("")).toBe(false);
  });
});

describe("getAuthSecret", () => {
  const originalSecret = process.env.AUTH_SECRET;

  afterEach(() => {
    process.env.AUTH_SECRET = originalSecret;
    vi.unstubAllEnvs();
  });

  it("returns the configured secret when set", () => {
    process.env.AUTH_SECRET = "a-real-secret";
    expect(getAuthSecret()).toBe("a-real-secret");
  });

  it("falls back to a dev-only secret in development when unset", () => {
    delete process.env.AUTH_SECRET;
    vi.stubEnv("NODE_ENV", "development");
    expect(getAuthSecret()).toBe("dev-only-secret-change-in-production");
  });

  it("throws when unset outside development", () => {
    delete process.env.AUTH_SECRET;
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getAuthSecret()).toThrow(
      "AUTH_SECRET environment variable is required",
    );
  });
});

describe("Google OAuth config helpers", () => {
  const originalId = process.env.GOOGLE_CLIENT_ID;
  const originalSecret = process.env.GOOGLE_CLIENT_SECRET;

  afterEach(() => {
    process.env.GOOGLE_CLIENT_ID = originalId;
    process.env.GOOGLE_CLIENT_SECRET = originalSecret;
  });

  it("reports configured only when both id and secret are present", () => {
    process.env.GOOGLE_CLIENT_ID = "id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    expect(getGoogleClientId()).toBe("id");
    expect(getGoogleClientSecret()).toBe("secret");
    expect(isGoogleAuthConfigured()).toBe(true);
  });

  it("reports not configured when either is missing", () => {
    process.env.GOOGLE_CLIENT_ID = "id";
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(isGoogleAuthConfigured()).toBe(false);

    delete process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    expect(isGoogleAuthConfigured()).toBe(false);
  });
});

describe("Cloudflare Access config helpers", () => {
  const keys = [
    "CLOUDFLARE_ACCESS_ENABLED",
    "TEAM_DOMAIN",
    "CLOUDFLARE_ACCESS_TEAM_DOMAIN",
    "POLICY_AUD",
    "CLOUDFLARE_ACCESS_AUDIENCE",
  ] as const;
  const originalValues: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of keys) {
      originalValues[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of keys) {
      if (originalValues[key] === undefined) delete process.env[key];
      else process.env[key] = originalValues[key];
    }
  });

  it("is disabled when nothing is configured", () => {
    expect(isCloudflareAccessEnabled()).toBe(false);
    expect(getCloudflareAccessTeamDomain()).toBeUndefined();
    expect(getCloudflareAccessAudience()).toBeUndefined();
  });

  it("is enabled via the explicit flag alone", () => {
    process.env.CLOUDFLARE_ACCESS_ENABLED = "true";
    expect(isCloudflareAccessEnabled()).toBe(true);
  });

  it("is enabled when both team domain and audience are set", () => {
    process.env.TEAM_DOMAIN = "example.cloudflareaccess.com";
    process.env.POLICY_AUD = "aud-value";
    expect(isCloudflareAccessEnabled()).toBe(true);
  });

  it("is not enabled with only one of team domain or audience set", () => {
    process.env.TEAM_DOMAIN = "example.cloudflareaccess.com";
    expect(isCloudflareAccessEnabled()).toBe(false);
  });

  it("prefers TEAM_DOMAIN/POLICY_AUD over the CLOUDFLARE_ACCESS_* aliases", () => {
    process.env.TEAM_DOMAIN = "preferred.example.com";
    process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN = "fallback.example.com";
    process.env.POLICY_AUD = "preferred-aud";
    process.env.CLOUDFLARE_ACCESS_AUDIENCE = "fallback-aud";
    expect(getCloudflareAccessTeamDomain()).toBe("preferred.example.com");
    expect(getCloudflareAccessAudience()).toBe("preferred-aud");
  });

  it("falls back to the CLOUDFLARE_ACCESS_* aliases when the short names are unset", () => {
    process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN = "fallback.example.com";
    process.env.CLOUDFLARE_ACCESS_AUDIENCE = "fallback-aud";
    expect(getCloudflareAccessTeamDomain()).toBe("fallback.example.com");
    expect(getCloudflareAccessAudience()).toBe("fallback-aud");
  });
});

describe("normalizeTeamDomain", () => {
  it("strips a leading http(s):// scheme", () => {
    expect(normalizeTeamDomain("https://example.cloudflareaccess.com")).toBe(
      "example.cloudflareaccess.com",
    );
    expect(normalizeTeamDomain("http://example.cloudflareaccess.com")).toBe(
      "example.cloudflareaccess.com",
    );
  });

  it("strips a trailing slash", () => {
    expect(normalizeTeamDomain("example.cloudflareaccess.com/")).toBe(
      "example.cloudflareaccess.com",
    );
  });

  it("leaves a bare domain unchanged", () => {
    expect(normalizeTeamDomain("example.cloudflareaccess.com")).toBe(
      "example.cloudflareaccess.com",
    );
  });
});
