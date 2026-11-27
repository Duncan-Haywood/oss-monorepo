// Account mail: email verification, password reset, existing-account notice, per-user throttles.
// Mail goes to the in-memory FakeEmailSender (testFakes.email) in APP_ENV=test.
import { testFakes } from "@worker/context";
import { user, verification } from "@worker/db/schema";
import { TEST_REQUIRE_EMAIL_VERIFICATION_HEADER } from "@worker/services/auth/auth";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { api, BASE, testDb } from "./helpers";

/** Opt this request in to "sign-in requires a verified email" (off by default in APP_ENV=test). */
const VERIFY = { [TEST_REQUIRE_EMAIL_VERIFICATION_HEADER]: "1" };
const PASSWORD = "correct-horse-battery";

const uniqueEmail = (tag: string) => `${tag}-${crypto.randomUUID()}@example.test`;

const cookieFrom = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0] ?? "")
    .filter((c) => c && !c.endsWith("="))
    .join("; ");

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

const post = (path: string, json: unknown, headers: Record<string, string> = {}) =>
  api(path, { method: "POST", headers: { Origin: BASE, ...headers }, json });

const signInWith = (email: string, password: string, headers: Record<string, string> = {}) =>
  post("/api/auth/sign-in/email", { email, password }, headers);

async function signUp(headers: Record<string, string> = {}) {
  const email = uniqueEmail("user");
  const res = await post(
    "/api/auth/sign-up/email",
    { email, password: PASSWORD, name: "Sam" },
    headers,
  );
  expect(res.status).toBe(200);
  return { email, cookie: cookieFrom(res) };
}

describe("email verification", () => {
  it("sign-up sends a verification email; sign-in is blocked until the link is used", async () => {
    const email = uniqueEmail("verify");
    const before = testFakes.email.sent.length;
    const res = await post(
      "/api/auth/sign-up/email",
      { email, password: PASSWORD, name: `Vera <b>"Begay"</b>` },
      VERIFY,
    );
    expect(res.status).toBe(200);
    expect(cookieFrom(res)).not.toContain("session_token=");

    const [mail, ...extra] = mailsTo(email, /confirm your email/i, before);
    expect(extra).toHaveLength(0);
    if (!mail) throw new Error("no verification email");
    expect(mail.text).toContain(`${BASE}/verify-email?token=`);
    expect(mail.text).not.toContain("/api/auth/");
    expect(mail.html).toContain("Vera &lt;b&gt;&quot;Begay&quot;&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>");
    const token = tokenFrom(mail.text, "verify-email");

    const blocked = await signInWith(email, PASSWORD, VERIFY);
    expect(blocked.status).toBe(403);
    expect(await errorCode(blocked)).toBe("EMAIL_NOT_VERIFIED");
    expect(cookieFrom(blocked)).not.toContain("session_token=");

    const bad = await api("/api/auth/verify-email?token=not-a-real-token", { headers: VERIFY });
    expect(bad.status).toBe(401);

    const verified = await api(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
      headers: VERIFY,
    });
    expect(verified.status).toBe(200);
    const autoCookie = cookieFrom(verified);
    expect(autoCookie).toContain("session_token=");
    expect((await api("/api/me", { headers: { Cookie: autoCookie } })).status).toBe(200);

    const row = await testDb().select().from(user).where(eq(user.email, email)).get();
    expect(row?.emailVerified).toBe(true);
    expect((await signInWith(email, PASSWORD, VERIFY)).status).toBe(200);
  });

  it("without the test opt-in, sign-up keeps the session (default for other tests)", async () => {
    const s = await signUp();
    expect(s.cookie).toContain("session_token=");
  });

  it("resends are rate-limited per user and answer the same for unknown addresses", async () => {
    const email = uniqueEmail("resend");
    const before = testFakes.email.sent.length;
    await post("/api/auth/sign-up/email", { email, password: PASSWORD, name: "Resend" }, VERIFY);
    for (let i = 0; i < 3; i++) {
      const r = await post("/api/auth/send-verification-email", { email }, VERIFY);
      expect(r.status).toBe(200);
    }
    // 1 sign-up email + 2 resends; the 3rd resend is throttled (3 per 15 minutes).
    expect(mailsTo(email, /confirm your email/i, before)).toHaveLength(3);

    const unknown = uniqueEmail("nobody");
    const r = await post("/api/auth/send-verification-email", { email: unknown });
    expect(r.status).toBe(200);
    expect(mailsTo(unknown, /./)).toHaveLength(0);
  });
});

describe("password reset", () => {
  it("emails a 1-hour single-use link, resets the password and revokes every session", async () => {
    const s = await signUp();
    const second = await signInWith(s.email, PASSWORD);
    const secondCookie = cookieFrom(second);
    expect((await api("/api/me", { headers: { Cookie: secondCookie } })).status).toBe(200);

    const before = testFakes.email.sent.length;
    expect((await post("/api/auth/request-password-reset", { email: s.email })).status).toBe(200);
    const [mail] = mailsTo(s.email, /reset your/i, before);
    if (!mail) throw new Error("no reset email");
    expect(mail.text).toContain(`${BASE}/reset-password?token=`);
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
    expect((await post("/api/auth/reset-password", { newPassword, token })).status).toBe(200);
    const again = await post("/api/auth/reset-password", {
      newPassword: "yet-another-password",
      token,
    });
    expect(again.status).toBe(400);
    expect(await errorCode(again)).toBe("INVALID_TOKEN");

    expect((await api("/api/me", { headers: { Cookie: s.cookie } })).status).toBe(401);
    expect((await api("/api/me", { headers: { Cookie: secondCookie } })).status).toBe(401);
    expect((await signInWith(s.email, PASSWORD)).status).toBe(401);
    expect((await signInWith(s.email, newPassword)).status).toBe(200);
  });

  it("rejects expired tokens and does not reveal unknown emails", async () => {
    const s = await signUp();
    const before = testFakes.email.sent.length;
    await post("/api/auth/request-password-reset", { email: s.email });
    const [mail] = mailsTo(s.email, /reset your/i, before);
    const token = tokenFrom(mail?.text ?? "", "reset-password");
    await testDb()
      .update(verification)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(verification.identifier, `reset-password:${token}`));
    const expired = await post("/api/auth/reset-password", {
      newPassword: "a-brand-new-password",
      token,
    });
    expect(expired.status).toBe(400);
    expect((await signInWith(s.email, PASSWORD)).status).toBe(200);

    const unknown = uniqueEmail("nobody");
    expect((await post("/api/auth/request-password-reset", { email: unknown })).status).toBe(200);
    expect(mailsTo(unknown, /./)).toHaveLength(0);
  });

  it("a reset also verifies the email (the link proves mailbox control)", async () => {
    const email = uniqueEmail("reset-verifies");
    await post("/api/auth/sign-up/email", { email, password: PASSWORD, name: "U" }, VERIFY);
    const before = testFakes.email.sent.length;
    await post("/api/auth/request-password-reset", { email }, VERIFY);
    const [mail] = mailsTo(email, /reset your/i, before);
    const token = tokenFrom(mail?.text ?? "", "reset-password");
    const reset = await post(
      "/api/auth/reset-password",
      { newPassword: "a-brand-new-password", token },
      VERIFY,
    );
    expect(reset.status).toBe(200);
    expect((await signInWith(email, "a-brand-new-password", VERIFY)).status).toBe(200);
  });
});

describe("existing account", () => {
  it("signing up again with a taken address mails the owner once an hour, nothing else", async () => {
    const s = await signUp();
    const before = testFakes.email.sent.length;
    for (let i = 0; i < 2; i++) {
      await post(
        "/api/auth/sign-up/email",
        { email: s.email, password: "someone-elses-password", name: "Intruder" },
        VERIFY,
      );
    }
    const mails = mailsTo(s.email, /already have a payapps account/i, before);
    expect(mails).toHaveLength(1);
    expect(mails[0]?.text).toContain(`${BASE}/forgot-password`);
    // The original password still works; the attempt changed nothing.
    expect((await signInWith(s.email, PASSWORD)).status).toBe(200);
  });
});

describe("health", () => {
  it("reports that tests keep mail in memory (nothing is delivered)", async () => {
    const res = await api("/api/health");
    // The test Worker runs a fake billing provider, so checkout reads as on (production: off until Paddle).
    expect(await res.json()).toEqual({ ok: true, app: "payapps", email: false, checkout: true });
  });
});
