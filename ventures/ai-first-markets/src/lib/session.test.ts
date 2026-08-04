import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ALLOWED_EMAIL_VAR } from "./auth.ts";
import {
  createSessionToken,
  verifySessionToken,
  verifyCloudflareAccessJwt,
} from "./session.ts";

/**
 * A session is only ever issued to an address the allowlist admits, so these
 * tests configure the allowlist rather than importing whatever the deployment
 * is set to. The address below exists only in this file.
 */
const ALLOWED = "session-test@example.com";

describe("ai-first-markets session JWT signing and verification", () => {
  if (!process.env.AUTH_SECRET) {
    process.env.AUTH_SECRET = "test-secret-key-123456789012345678901234567890";
  }
  (process.env as Record<string, string | undefined>)[ALLOWED_EMAIL_VAR] = ALLOWED;

  it("creates and verifies valid session tokens for allowed emails", async () => {
    const token = await createSessionToken({
      email: ALLOWED,
      name: "Duncan Haywood",
    });
    assert.ok(token);

    const payload = await verifySessionToken(token);
    assert.ok(payload);
    assert.equal(payload.email, ALLOWED);
    assert.equal(payload.name, "Duncan Haywood");
  });

  it("rejects token creation for unauthorized emails", async () => {
    await assert.rejects(
      async () => {
        await createSessionToken({ email: "unauthorized@evil.com" });
      },
      /Email not authorized/,
    );
  });

  it("refuses to issue or accept a session while no allowlist is configured", async () => {
    // The token below is signed while the allowlist admits ALLOWED, then
    // verified with the allowlist removed: a deployment that loses its
    // `ALLOWED_EMAIL` must stop honouring sessions rather than keep admitting
    // whoever already holds one.
    const token = await createSessionToken({ email: ALLOWED });
    const env = process.env as Record<string, string | undefined>;
    try {
      delete env[ALLOWED_EMAIL_VAR];
      await assert.rejects(
        async () => {
          await createSessionToken({ email: ALLOWED });
        },
        /Email not authorized/,
      );
      assert.equal(await verifySessionToken(token), null);
    } finally {
      env[ALLOWED_EMAIL_VAR] = ALLOWED;
    }
    // Restoring the allowlist makes the same token acceptable again, so the
    // check above failed on the allowlist and not on the signature.
    assert.ok(await verifySessionToken(token));
  });

  it("returns null when verifying invalid session token", async () => {
    const payload = await verifySessionToken("invalid-garbage-token");
    assert.equal(payload, null);
  });

  it("verifyCloudflareAccessJwt returns null for invalid jwt or domain", async () => {
    const payload = await verifyCloudflareAccessJwt(
      "invalid-jwt",
      "test.cloudflareaccess.com",
      "aud-123",
    );
    assert.equal(payload, null);
  });
});
