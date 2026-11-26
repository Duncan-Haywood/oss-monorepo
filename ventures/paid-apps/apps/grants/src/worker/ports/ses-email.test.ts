import { describe, expect, it } from "vitest";
import { signRequest } from "./aws-sigv4";
import type { EmailMessage, EmailSender } from "./email";
import {
  type EmailFallbackEvent,
  FallbackEmailSender,
  isDefinitelyNotSent,
} from "./fallback-email";
import { buildSesSendEmailBody, SesEmailSender, SesSendError, sesFromAddress } from "./ses-email";

const CREDS = { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" };
const NOW = new Date("2026-11-24T09:15:30Z");

type Call = { url: string; headers: Headers; body: string };

function sesWith(respond: () => Response | Promise<Response>, configurationSetName?: string) {
  const calls: Call[] = [];
  const sender = new SesEmailSender({
    region: "eu-west-1",
    credentials: CREDS,
    from: "Grant Autopilot <no-reply@example.org>",
    configurationSetName,
    now: () => NOW,
    fetchImpl: async (url, init) => {
      calls.push({
        url: String(url),
        headers: new Headers(init?.headers),
        body: String(init?.body),
      });
      return respond();
    },
  });
  return { calls, sender };
}

const ok = () =>
  new Response(JSON.stringify({ MessageId: "0102-abc" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
const sesError = (status: number, type: string, message = "nope") =>
  new Response(JSON.stringify({ message }), {
    status,
    headers: { "content-type": "application/json", "x-amzn-ErrorType": `${type}:http://internal` },
  });

const MSG: EmailMessage = {
  to: ["grants@funder.org"],
  subject: "Application: Youth\r\nBcc: victim@evil.test",
  text: "Plain body",
  html: "<p>Body</p>",
  replyTo: "reviewer@example.org",
  idempotencyKey: "sub_1",
  headers: {
    "List-Unsubscribe": "<https://example.org/u?t=1>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    From: "attacker@evil.test",
    Bcc: "victim@evil.test",
    "X-Entity-Ref-ID": "ref\r\nInjected: yes",
  },
  attachments: [{ filename: '../pkg"\r\n.md', content: "IyBIaQ==", contentType: "text/markdown" }],
};

describe("SesEmailSender", () => {
  it("posts a signed SES v2 SendEmail with Simple content", async () => {
    const { calls, sender } = sesWith(ok, "grants-prod");
    expect(await sender.send(MSG)).toEqual({ id: "0102-abc" });
    const c = calls[0] as Call;
    expect(c.url).toBe("https://email.eu-west-1.amazonaws.com/v2/email/outbound-emails");
    const body = JSON.parse(c.body);
    expect(body).toEqual({
      FromEmailAddress: '"Grant Autopilot" <no-reply@example.org>',
      Destination: { ToAddresses: ["grants@funder.org"] },
      ReplyToAddresses: ["reviewer@example.org"],
      Content: {
        Simple: {
          Subject: { Data: "Application: Youth Bcc: victim@evil.test", Charset: "UTF-8" },
          Body: {
            Text: { Data: "Plain body", Charset: "UTF-8" },
            Html: { Data: "<p>Body</p>", Charset: "UTF-8" },
          },
          Headers: [
            { Name: "List-Unsubscribe", Value: "<https://example.org/u?t=1>" },
            { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
            { Name: "X-Entity-Ref-ID", Value: "ref Injected: yes" },
          ],
          Attachments: [
            {
              FileName: "_pkg_ .md",
              RawContent: "IyBIaQ==",
              ContentType: "text/markdown",
              ContentDisposition: "ATTACHMENT",
              ContentTransferEncoding: "BASE64",
            },
          ],
        },
      },
      ConfigurationSetName: "grants-prod",
      EmailTags: [{ Name: "category", Value: "transactional" }],
    });
    // No idempotency key reaches SES (it has none); no headers smuggle From/Bcc.
    expect(c.body).not.toContain("sub_1");
    expect(c.body).not.toContain("attacker@evil.test");
    // Signed for service "ses" in the region, verifiable over what was sent.
    const auth = c.headers.get("authorization") ?? "";
    expect(auth).toContain("Credential=AKIDEXAMPLE/20261124/eu-west-1/ses/aws4_request");
    const again = await signRequest({
      method: "POST",
      url: c.url,
      headers: c.headers,
      body: c.body,
      service: "ses",
      region: "eu-west-1",
      credentials: CREDS,
      date: NOW,
    });
    expect(again.get("authorization")).toBe(auth);
  });

  it("sends marketing mail too, tagged as marketing, and omits optional fields", async () => {
    const { calls, sender } = sesWith(ok);
    await sender.send({ to: ["a@example.org"], subject: "Hi", text: "t", category: "marketing" });
    const body = JSON.parse((calls[0] as Call).body);
    expect(body.EmailTags).toEqual([{ Name: "category", Value: "marketing" }]);
    expect(body.ConfigurationSetName).toBeUndefined();
    expect(body.ReplyToAddresses).toBeUndefined();
    expect(body.Content.Simple.Headers).toBeUndefined();
    expect(body.Content.Simple.Attachments).toBeUndefined();
    expect(body.Content.Simple.Body.Html).toBeUndefined();
  });

  it("refuses unsafe addresses before calling SES", async () => {
    const { calls, sender } = sesWith(ok);
    for (const to of ["a@x.org, b@y.org", "Name <a@x.org>", "a@x.org\r\nBcc: v@evil.test"]) {
      await expect(sender.send({ to: [to], subject: "s", text: "t" })).rejects.toThrow(/invalid/);
    }
    await expect(sender.send({ to: [], subject: "s", text: "t" })).rejects.toThrow(/no recip/);
    expect(calls).toHaveLength(0);
  });

  it("maps SES errors: 4xx are definite rejections, 5xx and network errors are not", async () => {
    const throttled = sesWith(() => sesError(429, "TooManyRequestsException", "Too many"));
    const e1 = await throttled.sender.send(MSG).catch((e) => e);
    expect(e1).toBeInstanceOf(SesSendError);
    expect(e1).toMatchObject({ status: 429, code: "TooManyRequestsException", rejected: true });
    expect(e1.message).toBe("Email send failed: 429 TooManyRequestsException: Too many");

    const body = new Response(JSON.stringify({ __type: "com.amazon#MessageRejected" }), {
      status: 400,
    });
    const e2 = await sesWith(() => body)
      .sender.send(MSG)
      .catch((e) => e);
    expect(e2).toMatchObject({ code: "MessageRejected", rejected: true });

    const e3 = await sesWith(() => sesError(503, "ServiceUnavailable"))
      .sender.send(MSG)
      .catch((e) => e);
    expect(e3).toMatchObject({ status: 503, rejected: false });

    const e4 = await sesWith(() => {
      throw new TypeError("network");
    })
      .sender.send(MSG)
      .catch((e) => e);
    expect(e4).toMatchObject({ status: null, code: "NetworkError", rejected: false });
  });

  it("treats an accepted send with an unreadable body as sent", async () => {
    const { sender } = sesWith(() => new Response("not json", { status: 200 }));
    expect(await sender.send(MSG)).toEqual({ id: "ses:accepted" });
  });

  it("formats the From address safely", () => {
    expect(sesFromAddress("no-reply@example.org")).toBe("no-reply@example.org");
    expect(sesFromAddress("Fundación Ñ <a@example.org>")).toBe(
      "=?UTF-8?B?RnVuZGFjacOzbiDDkQ==?= <a@example.org>",
    );
    expect(() => sesFromAddress("a@x.org, b@y.org")).toThrow(/EMAIL_FROM/);
    expect(
      () => new SesEmailSender({ region: "evil.com/", credentials: CREDS, from: "a@b.org" }),
    ).toThrow(/region/);
  });

  it("keeps at most 15 headers (SES limit)", () => {
    const body = buildSesSendEmailBody(
      { to: ["a@b.org"], subject: "s", text: "t", headers: { "List-Id": "x" } },
      "a@b.org",
    ) as { Content: { Simple: { Headers: unknown[] } } };
    expect(body.Content.Simple.Headers).toEqual([{ Name: "List-Id", Value: "x" }]);
  });
});

class Recorder implements EmailSender {
  sent: EmailMessage[] = [];
  async send(msg: EmailMessage) {
    this.sent.push(msg);
    return { id: "legacy-1" };
  }
}

describe("FallbackEmailSender", () => {
  const make = (respond: () => Response) => {
    const ses = sesWith(respond);
    const legacy = new Recorder();
    const events: EmailFallbackEvent[] = [];
    const sender = new FallbackEmailSender(
      ses.sender,
      legacy,
      { primary: "ses", secondary: "resend" },
      (e) => events.push(e),
    );
    return { ses, legacy, events, sender };
  };

  it("sends once through SES when SES accepts", async () => {
    const t = make(ok);
    expect(await t.sender.send(MSG)).toEqual({ id: "0102-abc" });
    expect(t.legacy.sent).toHaveLength(0);
  });

  it("falls back when SES refused for a provider-side reason (throttled, unverified identity, auth)", async () => {
    for (const [status, code] of [
      [429, "TooManyRequestsException"],
      [400, "MailFromDomainNotVerifiedException"],
      [403, "AccessDeniedException"],
    ] as const) {
      const t = make(() => sesError(status, code));
      expect(await t.sender.send(MSG)).toEqual({ id: "legacy-1" });
      expect(t.ses.calls).toHaveLength(1);
      expect(t.legacy.sent).toHaveLength(1);
      expect(t.events[0]).toEqual({
        from: "ses",
        to: "resend",
        status,
        code,
        category: "transactional",
      });
    }
  });

  it("never double-sends on an ambiguous failure (5xx, no response)", async () => {
    const t = make(() => sesError(503, "ServiceUnavailable"));
    await expect(t.sender.send(MSG)).rejects.toThrow(/503/);
    expect(t.legacy.sent).toHaveLength(0);
    const n = make(() => {
      throw new TypeError("reset");
    });
    await expect(n.sender.send(MSG)).rejects.toThrow(/unreachable/);
    expect(n.legacy.sent).toHaveLength(0);
  });

  it("never re-sends a message SES refused for the message or recipient (e.g. suppression list)", async () => {
    for (const [status, code] of [
      [400, "MessageRejected"],
      [400, "BadRequestException"],
    ] as const) {
      const t = make(() => sesError(status, code));
      await expect(t.sender.send(MSG)).rejects.toThrow(new RegExp(code));
      expect(t.legacy.sent).toHaveLength(0);
      expect(t.events).toHaveLength(0);
    }
  });

  it("does not fall back on our own validation errors", async () => {
    const t = make(ok);
    await expect(t.sender.send({ ...MSG, to: ["bad address"] })).rejects.toThrow(/invalid/);
    expect(t.legacy.sent).toHaveLength(0);
    expect(isDefinitelyNotSent(new Error("x"))).toBe(false);
  });
});
