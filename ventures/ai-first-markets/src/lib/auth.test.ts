import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_EMAIL_VAR,
  getAllowedEmails,
  isAllowlistConfigured,
  isEmailAllowed,
  getAuthSecret,
  isGoogleAuthConfigured,
  isCloudflareAccessEnabled,
  normalizeTeamDomain,
} from "./auth.ts";

/**
 * These assertions deliberately never name the address the deployment happens
 * to be configured with today.
 *
 * The test this file replaces asserted `isEmailAllowed(ALLOWED_EMAIL)` against
 * the module constant it was comparing to — true by construction no matter
 * what that constant held, and green whether the allowlist came from
 * configuration or was compiled in. Every case below sets the configuration to
 * a value of its own choosing and checks the answer against that, so a build
 * that ignores the configuration fails here.
 */
const env = process.env as Record<string, string | undefined>;

/** Runs `body` with `ALLOWED_EMAIL` set to `value`, or unset when null. */
function withAllowlist<T>(value: string | null, body: () => T): T {
  const original = env[ALLOWED_EMAIL_VAR];
  try {
    if (value === null) {
      delete env[ALLOWED_EMAIL_VAR];
    } else {
      env[ALLOWED_EMAIL_VAR] = value;
    }
    return body();
  } finally {
    if (original === undefined) {
      delete env[ALLOWED_EMAIL_VAR];
    } else {
      env[ALLOWED_EMAIL_VAR] = original;
    }
  }
}

describe("ai-first-markets sign-in allowlist", () => {
  it("admits the address the configuration names, and only that one", () => {
    withAllowlist("owner@example.com", () => {
      assert.equal(isEmailAllowed("owner@example.com"), true);
      // The address that used to be compiled into this module. A build that
      // still consults a hardcoded allowlist admits it here; a build that
      // reads the configuration does not.
      assert.equal(isEmailAllowed("duncan.andrew.haywood@gmail.com"), false);
      assert.equal(isEmailAllowed("attacker@baddomain.com"), false);
    });
  });

  it("admits every address in a comma-separated list", () => {
    withAllowlist("first@example.com, second@example.com", () => {
      assert.deepEqual(getAllowedEmails(), [
        "first@example.com",
        "second@example.com",
      ]);
      assert.equal(isEmailAllowed("first@example.com"), true);
      assert.equal(isEmailAllowed("second@example.com"), true);
      assert.equal(isEmailAllowed("third@example.com"), false);
    });
  });

  it("compares case-insensitively and ignores surrounding whitespace", () => {
    withAllowlist("  Owner@Example.COM  ", () => {
      assert.equal(isEmailAllowed("owner@example.com"), true);
      assert.equal(isEmailAllowed(" OWNER@EXAMPLE.COM "), true);
    });
  });

  it("denies everyone when the allowlist is unset", () => {
    withAllowlist(null, () => {
      assert.equal(isAllowlistConfigured(), false);
      assert.deepEqual(getAllowedEmails(), []);
      // Absent configuration must not mean "allow all"...
      assert.equal(isEmailAllowed("anyone@example.com"), false);
      // ...and must not silently fall back to a built-in address.
      assert.equal(isEmailAllowed("duncan.andrew.haywood@gmail.com"), false);
    });
  });

  it("denies everyone when the allowlist is present but empty", () => {
    for (const empty of ["", "   ", ",", " , , "]) {
      withAllowlist(empty, () => {
        assert.equal(
          isAllowlistConfigured(),
          false,
          `${JSON.stringify(empty)} is an empty allowlist`,
        );
        assert.equal(isEmailAllowed("anyone@example.com"), false);
        assert.equal(isEmailAllowed("duncan.andrew.haywood@gmail.com"), false);
      });
    }
  });

  it("still refuses an absent address whatever the allowlist says", () => {
    withAllowlist("owner@example.com", () => {
      assert.equal(isEmailAllowed(null), false);
      assert.equal(isEmailAllowed(undefined), false);
      assert.equal(isEmailAllowed(""), false);
      assert.equal(isEmailAllowed("   "), false);
    });
  });

  it("reads the configuration on every call, not once at module load", () => {
    // The Workers adapter populates `process.env` from the Worker's bindings,
    // and a value captured while the module first evaluated could predate
    // that — the shape where the feature is off forever and nothing notices.
    // Changing the variable between two calls must change the answer.
    withAllowlist("before@example.com", () => {
      assert.equal(isEmailAllowed("before@example.com"), true);
      assert.equal(isEmailAllowed("after@example.com"), false);
    });
    withAllowlist("after@example.com", () => {
      assert.equal(isEmailAllowed("after@example.com"), true);
      assert.equal(isEmailAllowed("before@example.com"), false);
    });
  });
});

describe("ai-first-markets auth utilities", () => {
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
