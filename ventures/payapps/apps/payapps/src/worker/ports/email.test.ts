import { describe, expect, it } from "vitest";
import { usesFakeEmail } from "../context";
import {
  CloudflareEmailSender,
  createEmailSender,
  type EmailSendBinding,
  LogEmailSender,
  parseFromAddress,
} from "./email";

function fakeBinding() {
  const calls: Parameters<EmailSendBinding["send"]>[0][] = [];
  const binding: EmailSendBinding = {
    async send(m) {
      calls.push(m);
      return { messageId: `m${calls.length}` };
    },
  };
  return { binding, calls };
}

describe("CloudflareEmailSender", () => {
  it("sends one bare address per recipient with a single-line subject", async () => {
    const { binding, calls } = fakeBinding();
    const sender = new CloudflareEmailSender(binding, "PayApps <no-reply@example.org>");
    const res = await sender.send({
      to: ["a@example.org"],
      subject: "Reset\r\nBcc: victim@example.org",
      text: "hi",
    });
    expect(res.id).toBe("m1");
    expect(calls[0]?.from).toEqual({ email: "no-reply@example.org", name: "PayApps" });
    expect(calls[0]?.subject).toBe("Reset Bcc: victim@example.org");
    expect(calls[0]?.subject).not.toMatch(/[\r\n]/);
  });

  it("passes only the allowed extra headers, each on one line", async () => {
    const { binding, calls } = fakeBinding();
    const sender = new CloudflareEmailSender(binding, "no-reply@example.org");
    await sender.send({
      to: ["a@example.org"],
      subject: "x",
      text: "x",
      headers: {
        "List-Unsubscribe": "<https://app.example/u?t=1>\r\nBcc: victim@example.org",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    expect(calls[0]?.headers?.["List-Unsubscribe"]).toBe(
      "<https://app.example/u?t=1> Bcc: victim@example.org",
    );
    await expect(
      sender.send({ to: ["a@example.org"], subject: "x", text: "x", headers: { Bcc: "v@x.org" } }),
    ).rejects.toThrow(/not allowed/);
    expect(calls).toHaveLength(1);
  });

  it("refuses header-injection recipients and a bad sender", async () => {
    const { binding, calls } = fakeBinding();
    const sender = new CloudflareEmailSender(binding, "no-reply@example.org");
    await expect(
      sender.send({ to: ["a@example.org, b@example.org"], subject: "x", text: "x" }),
    ).rejects.toThrow(/invalid recipient/);
    await expect(sender.send({ to: [], subject: "x", text: "x" })).rejects.toThrow(/no recipients/);
    expect(calls).toHaveLength(0);
    expect(() => parseFromAddress("not an address")).toThrow(/EMAIL_FROM/);
  });

  it("keeps the provider's error code in the thrown message", async () => {
    const binding: EmailSendBinding = {
      send: async () => {
        throw Object.assign(new Error("domain not onboarded"), {
          code: "E_SENDER_DOMAIN_NOT_AVAILABLE",
        });
      },
    };
    const sender = new CloudflareEmailSender(binding, "no-reply@example.org");
    await expect(sender.send({ to: ["a@example.org"], subject: "x", text: "x" })).rejects.toThrow(
      "Email send failed: E_SENDER_DOMAIN_NOT_AVAILABLE domain not onboarded",
    );
  });
});

describe("createEmailSender", () => {
  it("uses Cloudflare only with both the binding and EMAIL_FROM; otherwise logs", () => {
    const { binding } = fakeBinding();
    expect(createEmailSender({ EMAIL: binding, EMAIL_FROM: "x@example.org" }).delivers).toBe(true);
    expect(createEmailSender({ EMAIL: binding, EMAIL_FROM: " " })).toBeInstanceOf(LogEmailSender);
    expect(createEmailSender({ EMAIL_FROM: "x@example.org" })).toBeInstanceOf(LogEmailSender);
  });

  it("never uses the in-memory fake in production", () => {
    expect(usesFakeEmail({ APP_ENV: "production", FAKE_EXTERNALS: "true" })).toBe(false);
    expect(usesFakeEmail({ APP_ENV: "development", FAKE_EXTERNALS: "true" })).toBe(true);
    expect(usesFakeEmail({ APP_ENV: "test" })).toBe(true);
    expect(usesFakeEmail({ APP_ENV: "development" })).toBe(false);
  });
});
