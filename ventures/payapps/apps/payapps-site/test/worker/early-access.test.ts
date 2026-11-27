import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { CONSENT_VERSION } from "@site/pages";
import { createApp, stripBasePath } from "@worker/app";
import { LogEmailSender } from "@worker/email";
import { CONFIRM_TOKEN_TTL_MS, purgePending, RESEND_MIN_INTERVAL_MS } from "@worker/signups";
import { beforeEach, describe, expect, it } from "vitest";

const SITE = "https://example.test/payapps";
const ORIGIN = "https://example.test";

let sender: LogEmailSender;
let clock: Date;

function app() {
  return createApp({ sender: () => sender, now: () => clock });
}

async function call(path: string, init: RequestInit = {}) {
  const ctx = createExecutionContext();
  const req = stripBasePath(new Request(`${ORIGIN}${path}`, { redirect: "manual", ...init }), SITE);
  const res = await app().fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const form = (fields: Record<string, string>, origin = ORIGIN) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin },
  body: new URLSearchParams(fields).toString(),
});

const valid = {
  email: "Owner@Acme-Drywall.example",
  company: "Acme Drywall",
  jobs: "6-15",
  role: "owner",
  consent: "yes",
  consentVersion: CONSENT_VERSION,
};

const tokenFrom = (text: string, kind: "confirm" | "remove") => {
  const m = new RegExp(`/api/early-access/${kind}\\?token=([A-Za-z0-9_-]+)`).exec(text);
  if (!m?.[1]) throw new Error(`no ${kind} link`);
  return m[1];
};

const row = (email: string) =>
  env.DB.prepare("SELECT * FROM early_access_signups WHERE email = ?")
    .bind(email)
    .first<Record<string, unknown>>();

beforeEach(async () => {
  sender = new LogEmailSender();
  clock = new Date("2026-11-24T12:00:00Z");
  await env.DB.prepare("DELETE FROM early_access_signups").run();
});

describe("early access", () => {
  it("signs up, confirms through a POST, and removes", async () => {
    const res = await call("/payapps/api/early-access", form(valid));
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/payapps/early-access/check-your-email");

    const saved = await row("owner@acme-drywall.example");
    expect(saved).toMatchObject({ status: "pending", company: "Acme Drywall", jobs: "6-15" });
    expect(sender.sent).toHaveLength(1);
    const mail = sender.sent[0];
    if (!mail) throw new Error("no mail");
    expect(mail.to).toBe("owner@acme-drywall.example");
    expect(mail.text).toContain(`${SITE}/api/early-access/confirm?token=`);
    const confirm = tokenFrom(mail.text, "confirm");
    const remove = tokenFrom(mail.text, "remove");
    // Only hashes are stored.
    expect(JSON.stringify(saved)).not.toContain(confirm);

    // GET never confirms (link scanners): it shows a button.
    const page = await call(`/payapps/api/early-access/confirm?token=${confirm}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('method="post"');
    expect((await row("owner@acme-drywall.example"))?.status).toBe("pending");

    const ok = await call(`/payapps/api/early-access/confirm?token=${confirm}`, {
      method: "POST",
      headers: { Origin: ORIGIN },
    });
    expect(ok.status).toBe(303);
    expect(ok.headers.get("Location")).toBe("/payapps/early-access/confirmed");
    expect((await row("owner@acme-drywall.example"))?.status).toBe("confirmed");

    // Single use.
    const again = await call(`/payapps/api/early-access/confirm?token=${confirm}`, {
      method: "POST",
      headers: { Origin: ORIGIN },
    });
    expect(again.status).toBe(400);

    const gone = await call(`/payapps/api/early-access/remove?token=${remove}`, {
      method: "POST",
      headers: { Origin: ORIGIN },
    });
    expect(gone.status).toBe(303);
    expect(gone.headers.get("Location")).toBe("/payapps/early-access/removed");
    expect(await row("owner@acme-drywall.example")).toBeNull();
  });

  it("answers the same for a confirmed address and never overwrites its answers", async () => {
    await call("/api/early-access", form(valid));
    const confirm = tokenFrom(sender.sent[0]?.text ?? "", "confirm");
    await call(`/api/early-access/confirm?token=${confirm}`, { method: "POST" });

    clock = new Date(clock.getTime() + RESEND_MIN_INTERVAL_MS + 1);
    const res = await call("/api/early-access", {
      ...form({ ...valid, company: "Someone Else" }),
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      body: JSON.stringify({ ...valid, company: "Someone Else" }),
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(sender.sent).toHaveLength(1);
    expect((await row("owner@acme-drywall.example"))?.company).toBe("Acme Drywall");
  });

  it("throttles resends and lets an old link expire", async () => {
    await call("/api/early-access", form(valid));
    await call("/api/early-access", form(valid));
    expect(sender.sent).toHaveLength(1);

    clock = new Date(clock.getTime() + RESEND_MIN_INTERVAL_MS + 1);
    await call("/api/early-access", form(valid));
    expect(sender.sent).toHaveLength(2);
    const latest = tokenFrom(sender.sent[1]?.text ?? "", "confirm");
    const first = tokenFrom(sender.sent[0]?.text ?? "", "confirm");
    // The earlier link was replaced.
    expect(
      (await call(`/api/early-access/confirm?token=${first}`, { method: "POST" })).status,
    ).toBe(400);

    clock = new Date(clock.getTime() + CONFIRM_TOKEN_TTL_MS + 1);
    const expired = await call(`/api/early-access/confirm?token=${latest}`, { method: "POST" });
    expect(expired.status).toBe(400);
    expect(await expired.text()).toContain("expired");
  });

  it("rejects bad input, foreign origins and silently drops the honeypot", async () => {
    const bad = await call("/api/early-access", form({ ...valid, email: "not-an-email" }));
    expect(bad.status).toBe(400);
    const noConsent = await call("/api/early-access", form({ ...valid, consent: "" }));
    expect(noConsent.status).toBe(400);
    const foreign = await call("/api/early-access", form(valid, "https://evil.example"));
    expect(foreign.status).toBe(403);

    const bot = await call("/api/early-access", form({ ...valid, website: "http://spam" }));
    expect(bot.status).toBe(303);
    expect(await row("owner@acme-drywall.example")).toBeNull();
    expect(sender.sent).toHaveLength(0);

    const forged = await call("/api/early-access/remove?token=x", { method: "POST" });
    expect(forged.status).toBe(400);
  });

  it("purges sign-ups never confirmed within 30 days, keeps confirmed ones", async () => {
    await call("/api/early-access", form(valid));
    await call("/api/early-access", form({ ...valid, email: "pm@example.org" }));
    const t = tokenFrom(sender.sent[1]?.text ?? "", "confirm");
    await call(`/api/early-access/confirm?token=${t}`, { method: "POST" });

    expect(await purgePending(env.DB, new Date(clock.getTime() + 29 * 86_400_000))).toBe(0);
    expect(await purgePending(env.DB, new Date(clock.getTime() + 31 * 86_400_000))).toBe(1);
    expect(await row("owner@acme-drywall.example")).toBeNull();
    expect((await row("pm@example.org"))?.status).toBe("confirmed");
  });

  it("sets security headers and answers health", async () => {
    const res = await call("/payapps/api/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
