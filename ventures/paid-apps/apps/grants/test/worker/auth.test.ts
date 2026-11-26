import { hashPassword, verifyPassword } from "@worker/services/auth";
import { describe, expect, it } from "vitest";
import { api, BASE, createTestOrg, signIn, signUp } from "./helpers";

interface MeBody {
  user: { id: string; email: string; name: string };
  memberships: { orgId: string; orgName: string; orgSlug: string; role: string }[];
}

describe("auth (Better Auth, real cookie flow)", () => {
  it("signs up and resolves /api/me from the session cookie", async () => {
    const s = await signUp({ name: "Dana Begay" });
    expect(s.cookie).toContain("better-auth.session_token=");

    const anon = await api("/api/me");
    expect(anon.status).toBe(401);

    const res = await api("/api/me", { headers: { Cookie: s.cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as MeBody;
    expect(body.user).toEqual({ id: s.userId, email: s.email, name: "Dana Begay" });
    expect(body.memberships).toEqual([]);

    const { orgId } = await createTestOrg(s.userId, { name: "SWIF", role: "owner" });
    const res2 = await api("/api/me", { headers: { Cookie: s.cookie } });
    const body2 = (await res2.json()) as MeBody;
    expect(body2.memberships).toEqual([{ orgId, orgName: "SWIF", orgSlug: orgId, role: "owner" }]);

    // The session cookie also unlocks tenant routes.
    const org = await api(`/api/orgs/${orgId}/members`, { headers: { Cookie: s.cookie } });
    expect(org.status).toBe(200);
  });

  it("sets an HttpOnly, SameSite=Lax session cookie", async () => {
    const email = `cookie-${crypto.randomUUID()}@example.test`;
    const res = await api("/api/auth/sign-up/email", {
      method: "POST",
      headers: { Origin: BASE },
      json: { email, password: "long-enough-password", name: "Cookie" },
    });
    expect(res.status).toBe(200);
    const sc = res.headers.getSetCookie().find((c) => c.includes("session_token="));
    expect(sc).toBeDefined();
    expect(sc).toMatch(/HttpOnly/i);
    expect(sc).toMatch(/SameSite=Lax/i);
  });

  it("signs in with the right password and rejects the wrong one", async () => {
    const s = await signUp();
    const ok = await signIn(s.email, s.password);
    expect(ok.res.status).toBe(200);
    const me = await api("/api/me", { headers: { Cookie: ok.cookie } });
    expect(me.status).toBe(200);

    const bad = await signIn(s.email, "wrong-password-123");
    expect(bad.res.status).toBe(401);
    expect(bad.cookie).not.toContain("session_token=");
  });

  it("enforces a minimum password length of 10", async () => {
    const res = await api("/api/auth/sign-up/email", {
      method: "POST",
      headers: { Origin: BASE },
      json: { email: `short-${crypto.randomUUID()}@example.test`, password: "short123", name: "S" },
    });
    expect(res.status).toBe(400);
  });

  it("signs out and the cookie stops working", async () => {
    const s = await signUp();
    const out = await api("/api/auth/sign-out", {
      method: "POST",
      headers: { Cookie: s.cookie, Origin: BASE },
      json: {},
    });
    expect(out.status).toBe(200);
    const me = await api("/api/me", { headers: { Cookie: s.cookie } });
    expect(me.status).toBe(401);
  });

  it("ignores forged session cookies", async () => {
    const me = await api("/api/me", {
      headers: { Cookie: "better-auth.session_token=forged.value" },
    });
    expect(me.status).toBe(401);
  });
});

describe("PBKDF2 password hashing", () => {
  it("round-trips and uses a random salt", async () => {
    const a = await hashPassword("correct-horse-battery");
    const b = await hashPassword("correct-horse-battery");
    expect(a).not.toBe(b);
    expect(a.startsWith("pbkdf2-sha256$100000$")).toBe(true);
    expect(await verifyPassword({ hash: a, password: "correct-horse-battery" })).toBe(true);
    expect(await verifyPassword({ hash: a, password: "correct-horse-batterY" })).toBe(false);
    expect(await verifyPassword({ hash: "garbage", password: "x" })).toBe(false);
  });
});
