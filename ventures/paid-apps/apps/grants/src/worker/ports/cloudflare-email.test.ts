import { describe, expect, it } from "vitest";
import { createEmailSender } from "../context";
import {
  CategoryRoutedEmailSender,
  CloudflareEmailSender,
  type EmailSendBinding,
  NoMarketingProviderSender,
  parseFromAddress,
} from "./cloudflare-email";
import type { EmailMessage, EmailSender } from "./email";
import { LogEmailSender, ResendEmailSender } from "./resend-email";

function fakeBinding(fail?: { code: string; message: string }) {
  const calls: EmailMessageBuilder[] = [];
  const binding: EmailSendBinding = {
    async send(builder) {
      calls.push(builder);
      if (fail) throw Object.assign(new Error(fail.message), { code: fail.code });
      return { messageId: `cf-${calls.length}` };
    },
  };
  return { calls, binding };
}

const FROM = "Grant Autopilot <no-reply@marisstella.app>";

describe("parseFromAddress", () => {
  it("splits a display name from the address", () => {
    expect(parseFromAddress(FROM)).toEqual({
      email: "no-reply@marisstella.app",
      name: "Grant Autopilot",
    });
    expect(parseFromAddress('"Grant Autopilot" <a@b.org>')).toEqual({
      email: "a@b.org",
      name: "Grant Autopilot",
    });
  });

  it("passes a bare address through and refuses anything else", () => {
    expect(parseFromAddress("a@b.org")).toBe("a@b.org");
    expect(parseFromAddress("<a@b.org>")).toBe("a@b.org");
    for (const bad of ["", "not an address", "A <a@b.org>, B <c@d.org>", "a@b.org\r\nBcc: x@y.z"]) {
      expect(() => parseFromAddress(bad)).toThrow(/EMAIL_FROM/);
    }
  });
});

describe("CloudflareEmailSender", () => {
  it("maps a message onto the send_email builder", async () => {
    const { calls, binding } = fakeBinding();
    const sender = new CloudflareEmailSender(binding, FROM);
    const res = await sender.send({
      to: ["grants@funder.org"],
      subject: "Application\r\nBcc: victim@evil.test",
      text: "body",
      html: "<p>body</p>",
      replyTo: "ed@org.org",
      idempotencyKey: "submission:sub_1",
      headers: {
        "List-Unsubscribe": "<https://x.org/u?t=1>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        Bcc: "smuggled@evil.test",
      },
      attachments: [{ filename: '../x"\r\n.pdf', content: "QUJD", contentType: "application/pdf" }],
    });
    expect(res).toEqual({ id: "cf-1" });
    const b = calls[0];
    expect(b).toMatchObject({
      from: { email: "no-reply@marisstella.app", name: "Grant Autopilot" },
      to: ["grants@funder.org"],
      subject: "Application Bcc: victim@evil.test",
      text: "body",
      html: "<p>body</p>",
      replyTo: "ed@org.org",
      headers: {
        "List-Unsubscribe": "<https://x.org/u?t=1>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    expect(b?.headers).not.toHaveProperty("Bcc");
    const att = b?.attachments?.[0];
    expect(att).toMatchObject({
      disposition: "attachment",
      type: "application/pdf",
      content: "QUJD",
    });
    expect(att?.filename).not.toMatch(/[\r\n"/\\]/);
    // No idempotency field exists on the binding; the key is not leaked into headers either.
    expect(JSON.stringify(b)).not.toContain("submission:sub_1");
  });

  it("omits optional fields that are not set", async () => {
    const { calls, binding } = fakeBinding();
    await new CloudflareEmailSender(binding, "a@b.org").send({
      to: ["c@d.org"],
      subject: "s",
      text: "t",
    });
    expect(Object.keys(calls[0] ?? {}).sort()).toEqual(["from", "subject", "text", "to"]);
  });

  it("refuses unsafe recipients, too many recipients and marketing mail before sending", async () => {
    const { calls, binding } = fakeBinding();
    const sender = new CloudflareEmailSender(binding, FROM);
    const base = { subject: "s", text: "t" };
    await expect(sender.send({ ...base, to: [] })).rejects.toThrow(/no recipients/);
    await expect(
      sender.send({ ...base, to: Array.from({ length: 51 }, (_, i) => `u${i}@x.org`) }),
    ).rejects.toThrow(/too many recipients/);
    await expect(sender.send({ ...base, to: ["a@x.org,b@evil.test"] })).rejects.toThrow(
      /invalid recipient/,
    );
    await expect(
      sender.send({ ...base, to: ["a@x.org"], replyTo: "x@y.org;z@e.test" }),
    ).rejects.toThrow(/invalid reply-to/);
    await expect(sender.send({ ...base, to: ["a@x.org"], category: "marketing" })).rejects.toThrow(
      /transactional mail only/,
    );
    expect(calls).toHaveLength(0);
  });

  it("keeps Cloudflare's error code in the thrown message", async () => {
    const { binding } = fakeBinding({
      code: "E_SENDER_DOMAIN_NOT_AVAILABLE",
      message: "Domain not available for sending",
    });
    await expect(
      new CloudflareEmailSender(binding, FROM).send({ to: ["a@x.org"], subject: "s", text: "t" }),
    ).rejects.toThrow("Email send failed: E_SENDER_DOMAIN_NOT_AVAILABLE Domain not available");
  });
});

describe("CategoryRoutedEmailSender", () => {
  class Recorder implements EmailSender {
    sent: EmailMessage[] = [];
    async send(m: EmailMessage) {
      this.sent.push(m);
      return { id: "r" };
    }
  }

  it("sends marketing mail to the marketing sender and everything else to the other", async () => {
    const t = new Recorder();
    const m = new Recorder();
    const router = new CategoryRoutedEmailSender(t, m);
    await router.send({ to: ["a@x.org"], subject: "verify", text: "t" });
    await router.send({ to: ["a@x.org"], subject: "conf", text: "t", category: "transactional" });
    await router.send({ to: ["a@x.org"], subject: "nurture", text: "t", category: "marketing" });
    expect(t.sent.map((x) => x.subject)).toEqual(["verify", "conf"]);
    expect(m.sent.map((x) => x.subject)).toEqual(["nurture"]);
  });

  it("fails marketing mail when no marketing provider is configured", async () => {
    await expect(
      new NoMarketingProviderSender().send({ to: ["a@x.org"], subject: "s", text: "t" }),
    ).rejects.toThrow(/no marketing email provider/);
  });
});

describe("createEmailSender", () => {
  const { binding } = fakeBinding();
  const pick = (s: EmailSender) => {
    if (!(s instanceof CategoryRoutedEmailSender)) return { kind: s.constructor.name };
    const r = s as unknown as { transactional: EmailSender; marketing: EmailSender };
    return {
      transactional: r.transactional.constructor.name,
      marketing: r.marketing.constructor.name,
    };
  };

  it("logs only when no provider is configured", () => {
    expect(createEmailSender({ EMAIL_FROM: FROM })).toBeInstanceOf(LogEmailSender);
    expect(
      createEmailSender({ EMAIL_FROM: FROM, EMAIL_PROVIDER: "resend", EMAIL: binding }),
    ).toBeInstanceOf(LogEmailSender);
  });

  it("auto keeps Resend while its key is set, else uses Cloudflare", () => {
    expect(
      pick(createEmailSender({ EMAIL_FROM: FROM, RESEND_API_KEY: "k", EMAIL: binding })),
    ).toEqual({
      transactional: ResendEmailSender.name,
      marketing: ResendEmailSender.name,
    });
    expect(pick(createEmailSender({ EMAIL_FROM: FROM, EMAIL: binding }))).toEqual({
      transactional: CloudflareEmailSender.name,
      marketing: NoMarketingProviderSender.name,
    });
  });

  it("cloudflare sends transactional mail through the binding and keeps Resend for marketing", () => {
    expect(
      pick(
        createEmailSender({
          EMAIL_FROM: FROM,
          EMAIL_PROVIDER: "Cloudflare ",
          RESEND_API_KEY: "k",
          EMAIL: binding,
        }),
      ),
    ).toEqual({ transactional: CloudflareEmailSender.name, marketing: ResendEmailSender.name });
  });
});
