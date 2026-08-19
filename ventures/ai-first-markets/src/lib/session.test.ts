import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { ALLOWED_EMAIL } from "./auth";
import { createSessionToken, verifySessionToken } from "./session";

describe("createSessionToken / verifySessionToken", () => {
  const originalSecret = process.env.AUTH_SECRET;

  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret-do-not-use-in-production";
  });

  afterEach(() => {
    process.env.AUTH_SECRET = originalSecret;
  });

  it("round-trips a session for the allowed email", async () => {
    const token = await createSessionToken({
      email: ALLOWED_EMAIL,
      name: "Duncan",
      picture: "https://example.com/pic.png",
    });

    const session = await verifySessionToken(token);
    expect(session).not.toBeNull();
    expect(session?.email).toBe(ALLOWED_EMAIL);
    expect(session?.name).toBe("Duncan");
    expect(session?.picture).toBe("https://example.com/pic.png");
    expect(session?.exp).toBeGreaterThan(session?.iat ?? 0);
  });

  it("lowercases and trims the email into the token", async () => {
    const token = await createSessionToken({
      email: `  ${ALLOWED_EMAIL.toUpperCase()}  `,
    });
    const session = await verifySessionToken(token);
    expect(session?.email).toBe(ALLOWED_EMAIL);
  });

  it("refuses to mint a token for a non-allowed email", async () => {
    await expect(
      createSessionToken({ email: "attacker@example.com" }),
    ).rejects.toThrow("Email not authorized");
  });

  it("rejects a syntactically invalid token", async () => {
    expect(await verifySessionToken("not-a-jwt")).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const foreignKey = new TextEncoder().encode("a-different-secret");
    const forged = await new SignJWT({ email: ALLOWED_EMAIL })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(foreignKey);

    expect(await verifySessionToken(forged)).toBeNull();
  });

  it("rejects an expired token even if properly signed", async () => {
    const key = new TextEncoder().encode(process.env.AUTH_SECRET!);
    const now = Math.floor(Date.now() / 1000);
    const expired = await new SignJWT({ email: ALLOWED_EMAIL })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(now - 120)
      .setExpirationTime(now - 60)
      .sign(key);

    expect(await verifySessionToken(expired)).toBeNull();
  });

  it("rejects a validly signed token for a non-allowed email", async () => {
    const key = new TextEncoder().encode(process.env.AUTH_SECRET!);
    const forOther = await new SignJWT({ email: "attacker@example.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);

    expect(await verifySessionToken(forOther)).toBeNull();
  });

  it("rejects a token whose email claim is missing or not a string", async () => {
    const key = new TextEncoder().encode(process.env.AUTH_SECRET!);
    const noEmail = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);

    expect(await verifySessionToken(noEmail)).toBeNull();
  });
});
