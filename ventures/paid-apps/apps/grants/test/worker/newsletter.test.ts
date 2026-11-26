// Newsletter: double opt-in subscribe, confirm, unsubscribe (page + RFC 8058 one-click), rate limits,
// the cron-driven nurture sequence (gated by MARKETING_EMAIL_ENABLED + postal address), the pending
// purge and the admin counts.
import { env } from "cloudflare:workers";
import { NEWSLETTER_CONSENT_VERSION, NEWSLETTER_SUBSCRIBE_MESSAGE } from "@shared/newsletter";
import { createApp } from "@worker/app";
import { createAppContext, testFakes } from "@worker/context";
import { marketingEmailLog, marketingSubscribers } from "@worker/db/schema";
import type { Env } from "@worker/env";
import { newId } from "@worker/lib/ids";
import { TEST_RATE_LIMIT_HEADER } from "@worker/middleware/rate-limit";
import { TEST_USER_HEADER } from "@worker/middleware/session";
import type { EmailMessage } from "@worker/ports/email";
import {
  hashConfirmToken,
  newsletterUnsubscribeToken,
  purgeStalePending,
  sendDueSequenceEmails,
} from "@worker/services/marketing";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { api, BASE, createTestUser, testDb } from "./helpers";

const DAY = 86_400_000;
const db = testDb();
const baseEnv = env as unknown as Env;
const SECRET = baseEnv.AUTH_SECRET ?? "";
const POSTAL = "Mary Stella Labs, LLC · Test Address Placeholder 1, Testville";
const enabledEnv: Env = {
  ...baseEnv,
  MARKETING_EMAIL_ENABLED: "true",
  MARKETING_POSTAL_ADDRESS: POSTAL,
};

const uniqueEmail = (tag = "reader") => `${tag}-${newId("nls").slice(4)}@example.test`;
const mailsTo = (addr: string): EmailMessage[] =>
  testFakes.email.sent.filter((m) => m.to.includes(addr));

async function waitFor<T>(fn: () => Promise<T | undefined | null | false>, ms = 3000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > until) throw new Error("waitFor: timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
}

const row = (email: string) =>
  db.select().from(marketingSubscribers).where(eq(marketingSubscribers.email, email)).get();

function subscribeReq(email: string, extra: Record<string, unknown> = {}, headers?: HeadersInit) {
  return api("/api/newsletter/subscribe", {
    method: "POST",
    headers,
    json: {
      email,
      source: "/resources/need-statement-funders-trust",
      consentVersion: NEWSLETTER_CONSENT_VERSION,
      ...extra,
    },
  });
}

/** Subscribes and returns the confirm token from the email. */
async function subscribeAndGetToken(email: string): Promise<string> {
  const res = await subscribeReq(email);
  expect(res.status).toBe(202);
  const mail = await waitFor(async () => mailsTo(email)[0]);
  const m = mail.text.match(/\/newsletter\/confirm\?token=([A-Za-z0-9_-]{43})/);
  if (!m?.[1]) throw new Error("no confirm link in email");
  return m[1];
}

async function confirmed(email: string): Promise<string> {
  const token = await subscribeAndGetToken(email);
  const res = await api(`/api/newsletter/confirm?token=${token}`, { method: "POST" });
  expect(await res.json()).toEqual({ ok: true, status: "confirmed" });
  const r = await row(email);
  if (!r) throw new Error("missing row");
  return r.id;
}

describe("POST /api/newsletter/subscribe", () => {
  it("creates a pending row with hashed token + consent and emails a confirm link", async () => {
    const email = uniqueEmail();
    const res = await subscribeReq(
      ` ${email.toUpperCase()} `,
      {},
      { "cf-connecting-ip": "203.0.113.9" },
    );
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true, message: NEWSLETTER_SUBSCRIBE_MESSAGE });
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const mail = await waitFor(async () => mailsTo(email)[0]);
    expect(mail.to).toEqual([email]);
    expect(mail.subject).toContain("Confirm");
    expect(mail.idempotencyKey).toMatch(/^newsletter-confirm:nls_/);
    // A confirmation the reader asked for is transactional (Cloudflare Email Service may send it).
    expect(mail.category).toBeUndefined();
    const token = mail.text.match(/token=([A-Za-z0-9_-]{43})/)?.[1] ?? "";

    const r = await row(email);
    expect(r).toMatchObject({
      status: "pending",
      consentSource: "/resources/need-statement-funders-trust",
      consentTextVersion: NEWSLETTER_CONSENT_VERSION,
      confirmSendCount: 1,
    });
    expect(r?.confirmTokenHash).toBe(await hashConfirmToken(token));
    expect(JSON.stringify(r)).not.toContain(token);
    expect(r?.consentIpHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(r)).not.toContain("203.0.113.9");
  });

  it("answers identically for repeat and confirmed addresses, without re-mailing", async () => {
    const email = uniqueEmail();
    await subscribeAndGetToken(email);
    const again = await subscribeReq(email);
    expect(again.status).toBe(202);
    expect(await again.json()).toEqual({ ok: true, message: NEWSLETTER_SUBSCRIBE_MESSAGE });
    await new Promise((r) => setTimeout(r, 100));
    expect(mailsTo(email)).toHaveLength(1); // within the resend interval

    const done = uniqueEmail();
    await confirmed(done);
    const res = await subscribeReq(done);
    expect(await res.json()).toEqual({ ok: true, message: NEWSLETTER_SUBSCRIBE_MESSAGE });
    await new Promise((r) => setTimeout(r, 100));
    expect(mailsTo(done)).toHaveLength(1);
    expect((await row(done))?.status).toBe("confirmed");
  });

  it("ignores honeypot submissions but answers the same", async () => {
    const email = uniqueEmail("bot");
    const res = await subscribeReq(email, { website: "https://spam.example" });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true, message: NEWSLETTER_SUBSCRIBE_MESSAGE });
    await new Promise((r) => setTimeout(r, 100));
    expect(await row(email)).toBeUndefined();
    expect(mailsTo(email)).toHaveLength(0);
  });

  it("validates input and blocks cross-origin posts", async () => {
    for (const json of [
      { email: "not-an-email", source: "/resources", consentVersion: NEWSLETTER_CONSENT_VERSION },
      {
        email: "a@b.example",
        source: "https://evil.example",
        consentVersion: NEWSLETTER_CONSENT_VERSION,
      },
      { email: "a@b.example", source: "/resources", consentVersion: "1999-01-01" },
      {
        email: "a@b.example",
        source: "/resources",
        consentVersion: NEWSLETTER_CONSENT_VERSION,
        x: 1,
      },
      { email: "Name <a@b.example>", source: "/", consentVersion: NEWSLETTER_CONSENT_VERSION },
    ]) {
      const res = await api("/api/newsletter/subscribe", { method: "POST", json });
      expect(res.status, JSON.stringify(json)).toBe(400);
    }
    const cross = await subscribeReq(uniqueEmail(), {}, { Origin: "https://evil.example" });
    expect(cross.status).toBe(403);
    const same = await subscribeReq(uniqueEmail(), {}, { Origin: BASE });
    expect(same.status).toBe(202);
  });

  it("rate-limits per IP and per address", async () => {
    const enforce = (ip: string) => ({
      [TEST_RATE_LIMIT_HEADER]: "enforce",
      "cf-connecting-ip": ip,
    });
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    const byIp: number[] = [];
    for (let i = 0; i < 6; i++)
      byIp.push((await subscribeReq(uniqueEmail(), {}, enforce(ip))).status);
    expect(byIp).toEqual([202, 202, 202, 202, 202, 429]);

    const email = uniqueEmail("hammered");
    const byEmail: number[] = [];
    for (let i = 0; i < 6; i++) {
      byEmail.push((await subscribeReq(email, {}, enforce(`192.0.2.${i + 10}`))).status);
    }
    expect(byEmail).toEqual([202, 202, 202, 202, 202, 429]);
    await waitFor(async () => mailsTo(email)[0]);
    expect(mailsTo(email)).toHaveLength(1); // the DB resend limit still applies under the IP limit
  });
});

describe("confirm", () => {
  it("GET redirects to the confirm page without confirming (link scanners)", async () => {
    const email = uniqueEmail();
    const token = await subscribeAndGetToken(email);
    const res = await api(`/api/newsletter/confirm?token=${token}`, { redirect: "manual" });
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe(`/newsletter/confirm?token=${token}`);
    expect((await row(email))?.status).toBe("pending");
  });

  it("POST confirms once; the token is single-use", async () => {
    const email = uniqueEmail();
    const token = await subscribeAndGetToken(email);
    const ok = await api(`/api/newsletter/confirm?token=${token}`, { method: "POST" });
    expect(await ok.json()).toEqual({ ok: true, status: "confirmed" });
    const r = await row(email);
    expect(r).toMatchObject({ status: "confirmed", confirmTokenHash: null });
    expect(r?.nextSequenceAt).not.toBeNull();
    const again = await api(`/api/newsletter/confirm?token=${token}`, { method: "POST" });
    expect(await again.json()).toEqual({ ok: false, status: "invalid" });
  });

  it("rejects expired and malformed tokens", async () => {
    const email = uniqueEmail();
    const token = await subscribeAndGetToken(email);
    await db
      .update(marketingSubscribers)
      .set({ confirmTokenExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(marketingSubscribers.email, email));
    const res = await api(`/api/newsletter/confirm?token=${token}`, { method: "POST" });
    expect(await res.json()).toEqual({ ok: false, status: "expired" });
    expect((await row(email))?.status).toBe("pending");
    const bad = await api("/api/newsletter/confirm?token=nope", { method: "POST" });
    expect(await bad.json()).toEqual({ ok: false, status: "invalid" });
  });
});

describe("unsubscribe", () => {
  it("RFC 8058 one-click POST (form body, no Origin, no cookie) unsubscribes", async () => {
    const email = uniqueEmail();
    const id = await confirmed(email);
    const token = await newsletterUnsubscribeToken(SECRET, id);
    const res = await api(`/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "unsubscribed" });
    const r = await row(email);
    expect(r).toMatchObject({ status: "unsubscribed", unsubscribeMethod: "one_click" });
    expect(r?.nextSequenceAt).toBeNull();

    // Idempotent.
    const again = await api(`/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`, {
      method: "POST",
    });
    expect(await again.json()).toEqual({ ok: true, status: "unsubscribed" });
  });

  it("page button POST records a link unsubscribe; GET only redirects", async () => {
    const email = uniqueEmail();
    const id = await confirmed(email);
    const token = await newsletterUnsubscribeToken(SECRET, id);
    const get = await api(`/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`, {
      redirect: "manual",
    });
    expect(get.status).toBe(303);
    expect(get.headers.get("Location")).toBe(`/unsubscribe?token=${encodeURIComponent(token)}`);
    expect((await row(email))?.status).toBe("confirmed");
    const post = await api(`/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { Origin: BASE },
    });
    expect(await post.json()).toEqual({ ok: true, status: "unsubscribed" });
    expect((await row(email))?.unsubscribeMethod).toBe("link");
  });

  it("rejects forged tokens", async () => {
    const email = uniqueEmail();
    const id = await confirmed(email);
    const forged = (await newsletterUnsubscribeToken("wrong-secret", id)).replace(/.$/, "A");
    for (const t of [forged, `u1.${id}.`, "u1.nls_x.y", ""]) {
      const res = await api(`/api/newsletter/unsubscribe?token=${encodeURIComponent(t)}`, {
        method: "POST",
      });
      expect(await res.json()).toEqual({ ok: false, status: "invalid" });
    }
    expect((await row(email))?.status).toBe("confirmed");
  });

  it("re-subscribing stays unsubscribed until the new link is confirmed", async () => {
    const email = uniqueEmail();
    const id = await confirmed(email);
    await api(`/api/newsletter/unsubscribe?token=${await newsletterUnsubscribeToken(SECRET, id)}`, {
      method: "POST",
    });
    // Let the resend interval pass.
    await db
      .update(marketingSubscribers)
      .set({ confirmSentAt: new Date(Date.now() - DAY) })
      .where(eq(marketingSubscribers.id, id));
    await subscribeReq(email);
    await waitFor(async () => mailsTo(email).length === 2);
    expect((await row(email))?.status).toBe("unsubscribed");
    const token = mailsTo(email)[1]?.text.match(/token=([A-Za-z0-9_-]{43})/)?.[1] ?? "";
    const res = await api(`/api/newsletter/confirm?token=${token}`, { method: "POST" });
    expect(await res.json()).toEqual({ ok: true, status: "confirmed" });
    expect(await row(email)).toMatchObject({ status: "confirmed", unsubscribedAt: null });
  });
});

describe("nurture sequence (cron)", () => {
  const ctxAt = (e: Env, now: Date) => createAppContext(e, { now: () => now });

  it("sends nothing while MARKETING_EMAIL_ENABLED is off or no postal address is set", async () => {
    const email = uniqueEmail();
    await confirmed(email);
    const now = new Date(Date.now() + DAY);
    const off = await sendDueSequenceEmails(ctxAt(baseEnv, now));
    expect(off).toMatchObject({ skipped: "disabled,no_postal_address", sent: 0 });
    const noAddress = await sendDueSequenceEmails(
      ctxAt({ ...baseEnv, MARKETING_EMAIL_ENABLED: "true" }, now),
    );
    expect(noAddress).toMatchObject({ skipped: "no_postal_address", sent: 0 });
    expect(mailsTo(email)).toHaveLength(1); // only the confirmation
  });

  it("sends each step once, in order, with unsubscribe headers, link and postal address", async () => {
    const email = uniqueEmail();
    const id = await confirmed(email);
    const t0 = new Date(Date.now() + 60_000);

    const r1 = await sendDueSequenceEmails(ctxAt(enabledEnv, t0));
    expect(r1.skipped).toBeNull();
    const welcome = mailsTo(email)[1];
    expect(welcome?.subject).toContain("Welcome");
    expect(welcome?.idempotencyKey).toBe(`newsletter:${id}:welcome`);
    // Marketing mail: routed away from Cloudflare Email Service, which is transactional only.
    expect(welcome?.category).toBe("marketing");
    const token = await newsletterUnsubscribeToken(SECRET, id);
    expect(welcome?.headers).toEqual({
      "List-Unsubscribe": `<${BASE}/api/newsletter/unsubscribe?token=${token}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(welcome?.text).toContain(`Unsubscribe: ${BASE}/unsubscribe?token=${token}`);
    expect(welcome?.text).toContain(POSTAL);

    // Same run again: nothing new (not due yet).
    await sendDueSequenceEmails(ctxAt(enabledEnv, t0));
    expect(mailsTo(email)).toHaveLength(2);

    await sendDueSequenceEmails(ctxAt(enabledEnv, new Date(t0.getTime() + 3 * DAY)));
    await sendDueSequenceEmails(ctxAt(enabledEnv, new Date(t0.getTime() + 7 * DAY)));
    await sendDueSequenceEmails(ctxAt(enabledEnv, new Date(t0.getTime() + 14 * DAY)));
    await sendDueSequenceEmails(ctxAt(enabledEnv, new Date(t0.getTime() + 40 * DAY)));
    const keys = (
      await db
        .select({ k: marketingEmailLog.stepKey })
        .from(marketingEmailLog)
        .where(eq(marketingEmailLog.subscriberId, id))
        .all()
    ).map((r) => r.k);
    expect(keys.sort()).toEqual(["getting-ready", "how-it-works", "welcome", "writing"]);
    expect(mailsTo(email)).toHaveLength(5);
    expect((await row(email))?.nextSequenceAt).toBeNull();
  });

  it("skips pending and unsubscribed people, and a step another run already claimed", async () => {
    const pending = uniqueEmail("pending");
    await subscribeAndGetToken(pending);
    const gone = uniqueEmail("gone");
    const goneId = await confirmed(gone);
    await api(
      `/api/newsletter/unsubscribe?token=${await newsletterUnsubscribeToken(SECRET, goneId)}`,
      {
        method: "POST",
      },
    );
    const raced = uniqueEmail("raced");
    const racedId = await confirmed(raced);
    await db
      .insert(marketingEmailLog)
      .values({ subscriberId: racedId, stepKey: "welcome", sentAt: new Date() });

    const parallel = uniqueEmail("parallel");
    await confirmed(parallel);

    // Two overlapping cron runs: the per-step claim lets only one of them send.
    const now = new Date(Date.now() + 60_000);
    await Promise.all([
      sendDueSequenceEmails(ctxAt(enabledEnv, now)),
      sendDueSequenceEmails(ctxAt(enabledEnv, now)),
    ]);
    expect(mailsTo(parallel).filter((m) => m.subject.includes("Welcome"))).toHaveLength(1);
    expect(mailsTo(pending)).toHaveLength(1);
    expect(mailsTo(gone)).toHaveLength(1);
    expect(mailsTo(raced)).toHaveLength(1);
  });

  it("releases the claim when a send fails so the next run retries", async () => {
    const email = uniqueEmail("flaky");
    const id = await confirmed(email);
    const now = new Date(Date.now() + 60_000);
    const failing = createAppContext(enabledEnv, {
      now: () => now,
      email: {
        send: async (m) => {
          if (m.to.includes(email)) throw new Error("provider down");
          return testFakes.email.send(m);
        },
      },
    });
    const r = await sendDueSequenceEmails(failing);
    expect(r.failed).toBeGreaterThanOrEqual(1);
    const log = await db
      .select()
      .from(marketingEmailLog)
      .where(eq(marketingEmailLog.subscriberId, id))
      .all();
    expect(log).toEqual([]);
    await sendDueSequenceEmails(ctxAt(enabledEnv, now));
    expect(mailsTo(email).map((m) => m.subject)[1]).toContain("Welcome");
  });
});

describe("retention and admin", () => {
  it("purges never-confirmed signups after 30 days and keeps the rest", async () => {
    const old = uniqueEmail("stale");
    await subscribeAndGetToken(old);
    const kept = uniqueEmail("kept");
    await confirmed(kept);
    await db
      .update(marketingSubscribers)
      .set({ createdAt: new Date(Date.now() - 31 * DAY) })
      .where(eq(marketingSubscribers.email, old));
    await db
      .update(marketingSubscribers)
      .set({ createdAt: new Date(Date.now() - 31 * DAY) })
      .where(eq(marketingSubscribers.email, kept));
    const n = await purgeStalePending(createAppContext(baseEnv));
    expect(n).toBeGreaterThanOrEqual(1);
    expect(await row(old)).toBeUndefined();
    expect((await row(kept))?.status).toBe("confirmed");
  });

  it("GET /api/admin/newsletter shows counts and gating to platform admins only", async () => {
    const adminEmail = uniqueEmail("ops");
    const admin = await createTestUser({ email: adminEmail });
    const other = await createTestUser();
    const app = createApp();
    const adminEnv: Env = { ...baseEnv, PLATFORM_ADMIN_EMAILS: adminEmail };
    const call = (as: string) =>
      app.request("/api/admin/newsletter", { headers: { [TEST_USER_HEADER]: as } }, adminEnv);
    expect((await call(other.id)).status).toBe(403);
    const res = await call(admin.id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      sendingEnabled: boolean;
      blockers: string[];
      counts: Record<string, number>;
    };
    expect(body.sendingEnabled).toBe(false);
    expect(body.blockers).toContain("disabled");
    expect(body.counts.confirmed).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toContain("@");
  });
});
