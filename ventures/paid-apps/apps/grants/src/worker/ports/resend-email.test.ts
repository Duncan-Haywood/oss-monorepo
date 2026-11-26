import { describe, expect, it } from "vitest";
import { isEmail } from "../services/submission/channel";
import {
  isSafeEmailAddress,
  ResendEmailSender,
  sanitizeFilename,
  sanitizeHeaderValue,
} from "./resend-email";

function capture() {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(JSON.stringify({ id: "re_1" }), { status: 200 });
  }) as typeof fetch;
  return {
    calls,
    sender: new ResendEmailSender("key", "Grant Autopilot <no-reply@x.org>", fetchImpl),
  };
}

describe("ResendEmailSender header safety", () => {
  it("strips CR/LF and control characters from the subject and attachment filename", async () => {
    const { calls, sender } = capture();
    await sender.send({
      to: ["grants@funder.org"],
      subject: "Grant application: Youth\r\nBcc: victim@evil.test\u0000 — SWIF",
      text: "body",
      attachments: [{ filename: '../x"\r\n.md', content: "", contentType: "text/markdown" }],
    });
    const body = calls[0]?.body ?? {};
    expect(body.subject).toBe("Grant application: Youth Bcc: victim@evil.test — SWIF");
    expect(String(body.subject)).not.toMatch(/[\r\n]/);
    const att = (body.attachments as { filename: string }[])[0];
    expect(att?.filename).not.toMatch(/[\r\n"/\\]/);
  });

  it("refuses recipient / reply-to values that could smuggle extra recipients", async () => {
    const { calls, sender } = capture();
    for (const to of [
      "a@funder.org,b@evil.test",
      "Funder <a@funder.org>",
      "a@funder.org\r\nBcc: b@evil.test",
      "a b@funder.org",
    ]) {
      await expect(sender.send({ to: [to], subject: "s", text: "t" })).rejects.toThrow(
        /invalid recipient/,
      );
    }
    await expect(
      sender.send({
        to: ["a@funder.org"],
        subject: "s",
        text: "t",
        replyTo: "x@y.org;z@evil.test",
      }),
    ).rejects.toThrow(/invalid reply-to/);
    expect(calls).toHaveLength(0);
  });

  it("accepts ordinary addresses", () => {
    for (const ok of ["grants@funder.org", "first.last+tag@sub.example.co", "x_y-z@a1.io"])
      expect(isSafeEmailAddress(ok)).toBe(true);
    expect(sanitizeHeaderValue("  a \t b  ")).toBe("a b");
    expect(sanitizeFilename("")).toBe("attachment");
  });

  it("channel selection treats a malformed funder address as not-an-email (manual fallback)", () => {
    expect(isEmail("grants@funder.org")).toBe(true);
    expect(isEmail("grants@funder.org,attacker@evil.test")).toBe(false);
    expect(isEmail("Grants <grants@funder.org>")).toBe(false);
  });
});

describe("ResendEmailSender custom headers", () => {
  it("passes List-Unsubscribe headers through, single-line", async () => {
    const { calls, sender } = capture();
    await sender.send({
      to: ["reader@example.org"],
      subject: "Guides",
      text: "body",
      headers: {
        "List-Unsubscribe":
          "<https://x.test/api/newsletter/unsubscribe?token=u1.a.b>\r\nBcc: evil@x.test",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    const headers = calls[0]?.body.headers as Record<string, string>;
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(headers["List-Unsubscribe"]).not.toMatch(/[\r\n]/);
  });

  it("drops headers outside the allowlist (no From/To/Bcc/Subject overrides)", async () => {
    const { calls, sender } = capture();
    await sender.send({
      to: ["reader@example.org"],
      subject: "Guides",
      text: "body",
      headers: { Bcc: "evil@x.test", From: "spoof@x.test", Subject: "x" },
    });
    expect(calls[0]?.body.headers).toBeUndefined();
  });
});
