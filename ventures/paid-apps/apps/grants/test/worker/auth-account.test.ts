// Account hardening: email verification, password reset, session management, account deletion.
import { testFakes } from "@worker/context";
import { auditLog, member, session, user, verification } from "@worker/db/schema";
import { TEST_REQUIRE_EMAIL_VERIFICATION_HEADER } from "@worker/services/auth";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  api,
  BASE,
  cookieFrom,
  createTestOrg,
  createTestUser,
  signIn,
  signUp,
  testDb,
} from "./helpers";

/** Opt this request in to "sign-in requires a verified email" (off by default in APP_ENV=test). */
const VERIFY = { [TEST_REQUIRE_EMAIL_VERIFICATION_HEADER]: "1" };
const PASSWORD = "correct-horse-battery";

const uniqueEmail = (tag: string) => `${tag}-${crypto.randomUUID()}@example.test`;

const mailsTo = (email: string, subject: RegExp, since = 0) =>
  testFakes.email.sent.slice(since).filter((m) => m.to.includes(email) && subject.test(m.subject));

function tokenFrom(text: string, page: "verify-email" | "reset-password"): string {
  const m = text.match(new RegExp(`${BASE}/${page}\\?token=([^\\s&]+)`));
  if (!m?.[1]) throw new Error(`no ${page} link in: ${text}`);
  return decodeURIComponent(m[1]);
}

async function errorCode(res: Response): Promise<string | undefined> {
  const body = (await res.json()) as { code?: string; error?: { code?: string } };
  return body.error?.code ?? body.code;
}

function signInWith(email: string, password: string, headers: Record<string, string> = {}) {
  return api("/api/auth/sign-in/email", {
    method: "POST",
    headers: { Origin: BASE, ...headers },
    json: { email, password },
  });
}

describe("email verification", () => {
  it("sign-up sends a verification email; sign-in is blocked until the link is used", async () => {
    const email = uniqueEmail("verify");
    const before = testFakes.email.sent.length;
    const res = await api("/api/auth/sign-up/email", {
      method: "POST",
      headers: { Origin: BASE, ...VERIFY },
      json: { email, password: PASSWORD, name: `Vera <b>"Begay"</b>` },
    });
    expect(res.status).toBe(200);
    expect(cookieFrom(res)).not.toContain("session_token=");

    const [mail, ...extra] = mailsTo(email, /confirm your email/i, before);
    expect(extra).toHaveLength(0);
    if (!mail) throw new Error("no verification email");
    expect(mail.text).toContain(`${BASE}/verify-email?token=`);
    expect(mail.text).not.toContain("/api/auth/");
    // Simple HTML part with every interpolated value escaped.
    expect(mail.html).toContain("Vera &lt;b&gt;&quot;Begay&quot;&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>");
    const token = tokenFrom(mail.text, "verify-email");

    const blocked = await signInWith(email, PASSWORD, VERIFY);
    expect(blocked.status).toBe(403);
    expect(await errorCode(blocked)).toBe("EMAIL_NOT_VERIFIED");
    expect(cookieFrom(blocked)).not.toContain("session_token=");

    const bad = await api("/api/auth/verify-email?token=not-a-real-token", { headers: VERIFY });
    expect(bad.status).toBe(401);

    // The SPA page at /verify-email calls this endpoint with the token (no callbackURL → JSON).
    const verified = await api(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
      headers: VERIFY,
    });
    expect(verified.status).toBe(200);
    const autoCookie = cookieFrom(verified);
    expect(autoCookie).toContain("session_token="); // autoSignInAfterVerification
    expect((await api("/api/me", { headers: { Cookie: autoCookie } })).status).toBe(200);

    const row = await testDb().select().from(user).where(eq(user.email, email)).get();
    expect(row?.emailVerified).toBe(true);

    const ok = await signInWith(email, PASSWORD, VERIFY);
    expect(ok.status).toBe(200);
    expect(cookieFrom(ok)).toContain("session_token=");
  });

  it("without the test opt-in, sign-up keeps the session (default for other tests)", async () => {
    const s = await signUp();
    expect(s.cookie).toContain("session_token=");
    expect((await signIn(s.email, s.password)).res.status).toBe(200);
  });

  it("lets unverified users resend the email, rate-limited per user", async () => {
    const email = uniqueEmail("resend");
    const before = testFakes.email.sent.length;
    await api("/api/auth/sign-up/email", {
      method: "POST",
      headers: { Origin: BASE, ...VERIFY },
      json: { email, password: PASSWORD, name: "Resend" },
    });
    for (let i = 0; i < 3; i++) {
      const r = await api("/api/auth/send-verification-email", {
        method: "POST",
        headers: { Origin: BASE, ...VERIFY },
        json: { email },
      });
      // Same 200 whether sent or throttled (no account enumeration).
      expect(r.status).toBe(200);
    }
    // 1 sign-up email + 2 resends; the 3rd resend is throttled (3 per 15 minutes).
    expect(mailsTo(email, /confirm your email/i, before)).toHaveLength(3);

    const unknown = uniqueEmail("nobody");
    const r = await api("/api/auth/send-verification-email", {
      method: "POST",
      headers: { Origin: BASE },
      json: { email: unknown },
    });
    expect(r.status).toBe(200);
    expect(mailsTo(unknown, /./)).toHaveLength(0);
  });
});

describe("password reset", () => {
  it("emails a 1-hour single-use link, resets the password and revokes every session", async () => {
    const s = await signUp();
    const second = await signIn(s.email, s.password);
    expect((await api("/api/me", { headers: { Cookie: second.cookie } })).status).toBe(200);

    const before = testFakes.email.sent.length;
    const req = await api("/api/auth/request-password-reset", {
      method: "POST",
      headers: { Origin: BASE },
      json: { email: s.email },
    });
    expect(req.status).toBe(200);
    const [mail] = mailsTo(s.email, /reset your/i, before);
    if (!mail) throw new Error("no reset email");
    expect(mail.text).toContain(`${BASE}/reset-password?token=`);
    expect(mail.html).toContain("Choose a new password");
    const token = tokenFrom(mail.text, "reset-password");

    const stored = await testDb()
      .select()
      .from(verification)
      .where(eq(verification.identifier, `reset-password:${token}`))
      .get();
    const ttl = (stored?.expiresAt.getTime() ?? 0) - Date.now();
    expect(ttl).toBeGreaterThan(59 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(60 * 60 * 1000);

    const newPassword = "a-brand-new-password";
    const reset = await api("/api/auth/reset-password", {
      method: "POST",
      headers: { Origin: BASE },
      json: { newPassword, token },
    });
    expect(reset.status).toBe(200);

    const again = await api("/api/auth/reset-password", {
      method: "POST",
      headers: { Origin: BASE },
      json: { newPassword: "yet-another-password", token },
    });
    expect(again.status).toBe(400);
    expect(await errorCode(again)).toBe("INVALID_TOKEN");

    // Every pre-reset session is revoked.
    expect((await api("/api/me", { headers: { Cookie: s.cookie } })).status).toBe(401);
    expect((await api("/api/me", { headers: { Cookie: second.cookie } })).status).toBe(401);

    expect((await signIn(s.email, s.password)).res.status).toBe(401);
    expect((await signIn(s.email, newPassword)).res.status).toBe(200);
  });

  it("rejects expired tokens and does not reveal unknown emails", async () => {
    const s = await signUp();
    const before = testFakes.email.sent.length;
    await api("/api/auth/request-password-reset", {
      method: "POST",
      headers: { Origin: BASE },
      json: { email: s.email },
    });
    const [mail] = mailsTo(s.email, /reset your/i, before);
    const token = tokenFrom(mail?.text ?? "", "reset-password");
    await testDb()
      .update(verification)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(verification.identifier, `reset-password:${token}`));
    const expired = await api("/api/auth/reset-password", {
      method: "POST",
      headers: { Origin: BASE },
      json: { newPassword: "a-brand-new-password", token },
    });
    expect(expired.status).toBe(400);
    expect((await signIn(s.email, s.password)).res.status).toBe(200);

    const unknown = uniqueEmail("nobody");
    const res = await api("/api/auth/request-password-reset", {
      method: "POST",
      headers: { Origin: BASE },
      json: { email: unknown },
    });
    expect(res.status).toBe(200);
    expect(mailsTo(unknown, /./)).toHaveLength(0);
  });

  it("a reset also verifies the email (the link proves mailbox control)", async () => {
    const email = uniqueEmail("reset-verifies");
    await api("/api/auth/sign-up/email", {
      method: "POST",
      headers: { Origin: BASE, ...VERIFY },
      json: { email, password: PASSWORD, name: "Unverified" },
    });
    const before = testFakes.email.sent.length;
    await api("/api/auth/request-password-reset", {
      method: "POST",
      headers: { Origin: BASE, ...VERIFY },
      json: { email },
    });
    const [mail] = mailsTo(email, /reset your/i, before);
    const token = tokenFrom(mail?.text ?? "", "reset-password");
    const reset = await api("/api/auth/reset-password", {
      method: "POST",
      headers: { Origin: BASE, ...VERIFY },
      json: { newPassword: "a-brand-new-password", token },
    });
    expect(reset.status).toBe(200);
    expect((await signInWith(email, "a-brand-new-password", VERIFY)).status).toBe(200);
  });
});

interface SessionItem {
  id: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  device: string;
  ip: string | null;
  current: boolean;
}

async function sessions(cookie: string): Promise<SessionItem[]> {
  const res = await api("/api/me/sessions", { headers: { Cookie: cookie } });
  expect(res.status).toBe(200);
  return ((await res.json()) as { items: SessionItem[] }).items;
}

const meStatus = async (cookie: string) =>
  (await api("/api/me", { headers: { Cookie: cookie } })).status;

describe("sessions", () => {
  it("lists my sessions with device, truncated IP and the current flag", async () => {
    const a = await signUp();
    const res = await signInWith(a.email, a.password, {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "cf-connecting-ip": "203.0.113.77",
    });
    expect(res.status).toBe(200);
    const items = await sessions(a.cookie);
    expect(items).toHaveLength(2);
    expect(items.filter((s) => s.current)).toHaveLength(1);
    expect(items[0]?.current).toBe(true);
    const mac = items.find((s) => !s.current);
    expect(mac?.device).toBe("Chrome on macOS");
    expect(mac?.ip).toBe("203.0.113.0/24");
    expect(Object.keys(mac ?? {})).not.toContain("token");
    // Full client IPs are never stored.
    const rows = await testDb().select().from(session).where(eq(session.userId, a.userId));
    expect(rows.map((r) => r.ipAddress)).not.toContain("203.0.113.77");

    // Better Auth's built-in list (which exposes raw tokens) is disabled.
    const builtin = await api("/api/auth/list-sessions", { headers: { Cookie: a.cookie } });
    expect(builtin.status).toBe(404);

    // The test-only header path works too (no cookie session, so nothing is "current").
    const viaHeader = await api("/api/me/sessions", { as: a.userId });
    const listed = ((await viaHeader.json()) as { items: SessionItem[] }).items;
    expect(listed).toHaveLength(2);
    expect(listed.some((s) => s.current)).toBe(false);

    expect((await api("/api/me/sessions")).status).toBe(401);
  });

  it("revokes only the caller's own sessions", async () => {
    const a = await signUp();
    const a2 = await signIn(a.email, a.password);
    const b = await signUp();
    const bSession = (await sessions(b.cookie))[0];
    if (!bSession) throw new Error("no session for b");

    // Another user's session id looks exactly like an unknown id.
    const cross = await api(`/api/me/sessions/${bSession.id}`, {
      method: "DELETE",
      headers: { Cookie: a.cookie, Origin: BASE },
    });
    expect(cross.status).toBe(404);
    const crossHeader = await api(`/api/me/sessions/${bSession.id}`, {
      method: "DELETE",
      as: a.userId,
    });
    expect(crossHeader.status).toBe(404);
    expect(await meStatus(b.cookie)).toBe(200);

    const a2Session = (await sessions(a.cookie)).find((s) => !s.current);
    if (!a2Session) throw new Error("no second session for a");
    const del = await api(`/api/me/sessions/${a2Session.id}`, {
      method: "DELETE",
      headers: { Cookie: a.cookie, Origin: BASE },
    });
    expect(del.status).toBe(200);
    expect(await meStatus(a2.cookie)).toBe(401);
    expect(await meStatus(a.cookie)).toBe(200);

    // Revoke others: keeps the current session, leaves other users alone.
    const a3 = await signIn(a.email, a.password);
    const a4 = await signIn(a.email, a.password);
    const others = await api("/api/me/sessions/revoke-others", {
      method: "POST",
      headers: { Cookie: a.cookie, Origin: BASE },
    });
    expect(others.status).toBe(200);
    expect(await others.json()).toEqual({ revoked: 2 });
    expect(await meStatus(a3.cookie)).toBe(401);
    expect(await meStatus(a4.cookie)).toBe(401);
    expect(await meStatus(a.cookie)).toBe(200);
    expect(await meStatus(b.cookie)).toBe(200);
    expect(await sessions(a.cookie)).toEqual([expect.objectContaining({ current: true })]);
  });
});

describe("account deletion (DELETE /api/me)", () => {
  const del = (cookie: string, body: unknown) =>
    api("/api/me", { method: "DELETE", headers: { Cookie: cookie, Origin: BASE }, json: body });

  it("requires the password and refuses while I'm the last owner of an org", async () => {
    const s = await signUp();
    const { orgId } = await createTestOrg(s.userId, { name: "Solo Org", role: "owner" });
    const shared = await createTestOrg(s.userId, { name: "Shared Org", role: "editor" });

    const noPassword = await del(s.cookie, {});
    expect(noPassword.status).toBe(403);
    expect(await errorCode(noPassword)).toBe("invalid_password");
    const wrong = await del(s.cookie, { password: "not-my-password" });
    expect(wrong.status).toBe(403);

    const blocked = await del(s.cookie, { password: s.password });
    expect(blocked.status).toBe(409);
    const body = (await blocked.json()) as {
      error: { code: string; message: string; details: { orgs: { orgId: string }[] } };
    };
    expect(body.error.code).toBe("last_owner");
    expect(body.error.message).toContain("Solo Org");
    expect(body.error.message).toMatch(/owner|delete the organization/i);
    expect(body.error.details.orgs.map((o) => o.orgId)).toEqual([orgId]);
    expect(await meStatus(s.cookie)).toBe(200);

    // Once another owner exists, deletion goes through.
    const co = await createTestUser();
    await testDb()
      .insert(member)
      .values({
        id: `mem_${crypto.randomUUID()}`,
        organizationId: orgId,
        userId: co.id,
        role: "owner",
      });
    const ok = await del(s.cookie, { password: s.password });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ deleted: true });
    expect(ok.headers.getSetCookie().join("\n")).toMatch(/session_token=;.*Max-Age=0/);

    expect(await meStatus(s.cookie)).toBe(401);
    expect(await testDb().select().from(user).where(eq(user.id, s.userId)).get()).toBeUndefined();
    expect(await testDb().select().from(member).where(eq(member.userId, s.userId))).toHaveLength(0);
    expect((await signIn(s.email, s.password)).res.status).toBe(401);
    // The org survives with its other owner; membership history is audited.
    const coMe = await api("/api/me", { as: co.id });
    expect(((await coMe.json()) as { memberships: { orgId: string }[] }).memberships).toEqual([
      expect.objectContaining({ orgId, role: "owner" }),
    ]);
    const audits = await testDb()
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(and(eq(auditLog.orgId, shared.orgId), eq(auditLog.action, "member.account_deleted")));
    expect(audits).toHaveLength(1);
  });

  it("accounts without a password must have signed in recently", async () => {
    const u = await createTestUser(); // no credential account, no cookie session
    const res = await api("/api/me", { method: "DELETE", as: u.id, json: {} });
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe("reauth_required");
    expect(await testDb().select().from(user).where(eq(user.id, u.id)).get()).toBeDefined();
    expect((await api("/api/me", { method: "DELETE", json: {} })).status).toBe(401);
  });
});
