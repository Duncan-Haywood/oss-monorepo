// EMAIL_PROVIDER=ses / ses-with-fallback through the composition root, in workerd: SES requests
// are signed with WebCrypto in the Workers runtime, and on a definite SES refusal the message goes
// to the Cloudflare Email Service binding (Miniflare simulates it; nothing leaves the machine).
// SES itself is stubbed at the global fetch.
import { env } from "cloudflare:workers";
import { createEmailSender } from "@worker/context";
import type { Env } from "@worker/env";
import { afterEach, describe, expect, it, vi } from "vitest";

const e = env as unknown as Env;
const AWS = {
  AWS_ACCESS_KEY_ID: "AKIDEXAMPLE",
  AWS_SECRET_ACCESS_KEY: "test-secret",
  AWS_REGION: "us-east-1",
};
const MSG = {
  to: ["reviewer@example.org"],
  subject: "Your application is ready for review",
  text: "Open Grant Autopilot to review it.",
};
const quiet = { warn: () => {} };

function stubSes(status: number, body: unknown) {
  const calls: { url: string; auth: string | null }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    calls.push({ url: String(input), auth: new Headers(init?.headers).get("authorization") });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  return calls;
}

afterEach(() => vi.restoreAllMocks());

describe("SES email through the composition root", () => {
  it("ses: sends through SES with a SigV4 signature computed in workerd", async () => {
    const calls = stubSes(200, { MessageId: "ses-1" });
    const sender = createEmailSender(
      { ...AWS, EMAIL_FROM: "no-reply@example.org", EMAIL_PROVIDER: "ses", EMAIL: e.EMAIL },
      quiet,
    );
    expect(await sender.send({ ...MSG, category: "marketing" })).toEqual({ id: "ses-1" });
    expect(calls[0]?.url).toBe("https://email.us-east-1.amazonaws.com/v2/email/outbound-emails");
    expect(calls[0]?.auth).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/us-east-1\/ses\//,
    );
  });

  it("ses-with-fallback: a throttled SES send goes out through Cloudflare instead", async () => {
    const calls = stubSes(429, { message: "Maximum sending rate exceeded." });
    const warnings: string[] = [];
    const sender = createEmailSender(
      {
        ...AWS,
        EMAIL_FROM: "Grant Autopilot <no-reply@example.org>",
        EMAIL_PROVIDER: "ses-with-fallback",
        EMAIL: e.EMAIL,
      },
      { warn: (m) => warnings.push(m) },
    );
    const res = await sender.send(MSG);
    expect(calls).toHaveLength(1);
    expect(res.id).toEqual(expect.any(String));
    expect(res.id.length).toBeGreaterThan(0);
    expect(warnings).toEqual(["email.provider_fallback"]);
  });

  it("ses-with-fallback: an ambiguous SES failure (503) is not resent elsewhere", async () => {
    stubSes(503, { message: "Service Unavailable" });
    const warnings: string[] = [];
    const sender = createEmailSender(
      {
        ...AWS,
        EMAIL_FROM: "no-reply@example.org",
        EMAIL_PROVIDER: "ses-with-fallback",
        EMAIL: e.EMAIL,
      },
      { warn: (m) => warnings.push(m) },
    );
    await expect(sender.send(MSG)).rejects.toThrow(/Email send failed: 503/);
    expect(warnings).toEqual([]);
  });

  it("ses without AWS settings keeps the existing provider", async () => {
    const calls = stubSes(200, {});
    const warnings: string[] = [];
    const sender = createEmailSender(
      { EMAIL_FROM: "no-reply@example.org", EMAIL_PROVIDER: "ses", EMAIL: e.EMAIL },
      { warn: (m) => warnings.push(m) },
    );
    const res = await sender.send(MSG); // Cloudflare binding, as with "auto"
    expect(res.id.length).toBeGreaterThan(0);
    expect(calls).toHaveLength(0);
    expect(warnings).toEqual(["email.ses_not_configured"]);
  });
});
