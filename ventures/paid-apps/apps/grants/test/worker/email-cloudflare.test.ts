// Cloudflare Email Service through the Worker's real `send_email` binding (Miniflare simulates it
// locally: sends are accepted and logged, nothing leaves the machine). Covers the composition root's
// provider choice and the adapter's mapping onto the binding (docs/EMAIL.md).
import { env } from "cloudflare:workers";
import { createEmailSender } from "@worker/context";
import type { Env } from "@worker/env";
import { CategoryRoutedEmailSender } from "@worker/ports/cloudflare-email";
import { describe, expect, it } from "vitest";

const e = env as unknown as Env;

describe("Cloudflare Email Service binding", () => {
  it("is bound in the Worker config", () => {
    expect(typeof e.EMAIL?.send).toBe("function");
  });

  it("sends a transactional email through the binding and returns its message id", async () => {
    const sender = createEmailSender({
      EMAIL: e.EMAIL,
      EMAIL_FROM: "Grant Autopilot <no-reply@example.org>",
      EMAIL_PROVIDER: "cloudflare",
    });
    expect(sender).toBeInstanceOf(CategoryRoutedEmailSender);
    const res = await sender.send({
      to: ["reviewer@example.org"],
      subject: "Your application is ready for review",
      text: "Open Grant Autopilot to review it.",
      html: "<p>Open Grant Autopilot to review it.</p>",
      headers: {
        "List-Unsubscribe": "<https://example.org/api/email/unsubscribe?token=t>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      attachments: [{ filename: "package.md", content: "IyBIaQ==", contentType: "text/markdown" }],
    });
    expect(res.id).toEqual(expect.any(String));
    expect(res.id.length).toBeGreaterThan(0);
  });

  it("does not send marketing mail through Cloudflare without another provider", async () => {
    const sender = createEmailSender({
      EMAIL: e.EMAIL,
      EMAIL_FROM: "Grant Autopilot <no-reply@example.org>",
      EMAIL_PROVIDER: "cloudflare",
    });
    await expect(
      sender.send({
        to: ["reader@example.org"],
        subject: "Welcome",
        text: "Hello",
        category: "marketing",
      }),
    ).rejects.toThrow(/no marketing email provider/);
  });
});
