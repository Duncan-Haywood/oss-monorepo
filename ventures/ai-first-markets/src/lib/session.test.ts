import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ALLOWED_EMAIL } from "./auth.ts";
import {
  createSessionToken,
  verifySessionToken,
  verifyCloudflareAccessJwt,
} from "./session.ts";

describe("ai-first-markets session JWT signing and verification", () => {
  if (!process.env.AUTH_SECRET) {
    process.env.AUTH_SECRET = "test-secret-key-123456789012345678901234567890";
  }

  it("creates and verifies valid session tokens for allowed emails", async () => {
    const token = await createSessionToken({
      email: ALLOWED_EMAIL,
      name: "Duncan Haywood",
    });
    assert.ok(token);

    const payload = await verifySessionToken(token);
    assert.ok(payload);
    assert.equal(payload.email, ALLOWED_EMAIL);
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
