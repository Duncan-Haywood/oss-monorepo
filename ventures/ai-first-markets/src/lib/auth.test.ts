import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_EMAIL,
  isEmailAllowed,
  getAuthSecret,
  isGoogleAuthConfigured,
  isCloudflareAccessEnabled,
  normalizeTeamDomain,
} from "./auth.ts";

describe("ai-first-markets auth utilities", () => {
  it("isEmailAllowed validates whitelisted email case-insensitively and handles empty", () => {
    assert.equal(isEmailAllowed(ALLOWED_EMAIL), true);
    assert.equal(isEmailAllowed(" DUNCAN.ANDREW.HAYWOOD@GMAIL.COM "), true);
    assert.equal(isEmailAllowed("attacker@baddomain.com"), false);
    assert.equal(isEmailAllowed(null), false);
    assert.equal(isEmailAllowed(undefined), false);
  });

  it("getAuthSecret returns dev fallback in non-production environment", () => {
    const origEnv = process.env.NODE_ENV;
    const origSecret = process.env.AUTH_SECRET;
    try {
      delete process.env.AUTH_SECRET;
      (process.env as Record<string, string | undefined>).NODE_ENV = "development";
      assert.equal(getAuthSecret(), "dev-only-secret-change-in-production");
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = origEnv;
      if (origSecret) process.env.AUTH_SECRET = origSecret;
    }
  });

  it("normalizeTeamDomain strips protocol and trailing slashes", () => {
    assert.equal(normalizeTeamDomain("https://myteam.cloudflareaccess.com/"), "myteam.cloudflareaccess.com");
    assert.equal(normalizeTeamDomain("http://myteam.cloudflareaccess.com"), "myteam.cloudflareaccess.com");
  });

  it("isCloudflareAccessEnabled returns boolean based on environment variables", () => {
    assert.equal(typeof isCloudflareAccessEnabled(), "boolean");
    assert.equal(typeof isGoogleAuthConfigured(), "boolean");
  });
});
