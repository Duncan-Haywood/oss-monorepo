// Email adapter for Amazon SES v2 `SendEmail` over HTTPS, SigV4-signed with WebCrypto (no AWS SDK),
// so it runs on Workers today and anywhere else later. Chosen 2026-11-24 to consolidate our own
// LLM and email traffic on AWS (docs/EMAIL.md).
//
// Request: POST https://email.{region}.amazonaws.com/v2/email/outbound-emails, signing name "ses".
// Shape checked against botocore's sesv2 service model (1.44): `Content.Simple` carries Subject,
// Body.Text/Html, Headers (max 15; name <= 126, value <= 995 chars) and Attachments (RawContent
// base64, FileName <= 255, ContentType <= 78, ContentDisposition ATTACHMENT|INLINE,
// ContentTransferEncoding BASE64|QUOTED_PRINTABLE|SEVEN_BIT). Response: `{ MessageId }`.
//
// SES accepts marketing mail (unlike Cloudflare Email Service), so both categories go here; the
// category is also sent as an SES message tag so the configuration set's event destination can
// tell them apart.
//
// Header safety as in the other adapters (ports/email.ts): one bare address per recipient,
// single-line header values, allowlisted custom headers only.
//
// Idempotency: SES has no idempotency key. `idempotencyKey` is dropped, as in the Cloudflare
// adapter; every caller claims a database row before it sends, which is the real guard.
//
// Errors: thrown as SesSendError with `rejected` = SES answered with a 4xx, i.e. it refused the
// request before accepting the message. FallbackEmailSender uses that to decide whether another
// provider may send it (never on 5xx or a lost connection: those are ambiguous).
import {
  type AwsCredentials,
  assertAwsRegion,
  createSigV4Fetch,
  type FetchLike,
} from "./aws-sigv4";
import {
  assertAddresses,
  type EmailMessage,
  type EmailSender,
  isSafeEmailAddress,
  safeCustomHeaders,
  sanitizeFilename,
  sanitizeHeaderValue,
} from "./email";

export interface SesEmailOptions {
  region: string;
  credentials: AwsCredentials;
  /** `EMAIL_FROM`: "Name <addr@domain>" or a bare address; the identity must be verified in SES. */
  from: string;
  /** `SES_CONFIGURATION_SET`: event publishing (bounces, complaints) and dedicated IPs. */
  configurationSetName?: string;
  fetchImpl?: FetchLike;
  now?: () => Date;
}

export class SesSendError extends Error {
  constructor(
    message: string,
    /** HTTP status, or null when no response arrived. */
    public readonly status: number | null,
    /** SES error type, e.g. TooManyRequestsException, MessageRejected. */
    public readonly code: string,
    /** True only when SES definitely refused the request (4xx): nothing was queued for delivery. */
    public readonly rejected: boolean,
  ) {
    super(message);
    this.name = "SesSendError";
  }
}

/** RFC 2047 encoded-word for a display name with non-ASCII characters; quoted otherwise. */
function encodeDisplayName(name: string): string {
  if (/^[\x20-\x7e]*$/.test(name)) return `"${name.replace(/["\\]/g, "")}"`;
  const bytes = new TextEncoder().encode(name);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `=?UTF-8?B?${btoa(bin)}?=`;
}

/** `EMAIL_FROM` as SES's FromEmailAddress. Throws unless it holds exactly one safe address. */
export function sesFromAddress(from: string): string {
  const m = /^\s*"?([^"<>]*?)"?\s*<([^<>\s]+)>\s*$/.exec(from);
  const email = (m?.[2] ?? from).trim();
  if (!email || !isSafeEmailAddress(email)) {
    throw new Error("Email send failed: EMAIL_FROM is not a valid sender address");
  }
  const name = m ? sanitizeHeaderValue(m[1] ?? "", 120) : "";
  return name ? `${encodeDisplayName(name)} <${email}>` : email;
}

const SES_TAG_VALUE_RE = /^[A-Za-z0-9_-]{1,256}$/;
const SES_MAX_HEADERS = 15;

export function sesSendEmailUrl(region: string): string {
  return `https://email.${assertAwsRegion(region)}.amazonaws.com/v2/email/outbound-emails`;
}

/** The SendEmail request body for a message (exported for tests). */
export function buildSesSendEmailBody(
  msg: EmailMessage,
  from: string,
  configurationSetName?: string,
): Record<string, unknown> {
  const headers = Object.entries(safeCustomHeaders(msg.headers) ?? {})
    .slice(0, SES_MAX_HEADERS)
    .map(([Name, Value]) => ({ Name, Value }));
  const category = msg.category ?? "transactional";
  const configSet = configurationSetName?.trim();
  return {
    FromEmailAddress: sesFromAddress(from),
    Destination: { ToAddresses: msg.to },
    ...(msg.replyTo !== undefined ? { ReplyToAddresses: [msg.replyTo] } : {}),
    Content: {
      Simple: {
        Subject: { Data: sanitizeHeaderValue(msg.subject), Charset: "UTF-8" },
        Body: {
          Text: { Data: msg.text, Charset: "UTF-8" },
          ...(msg.html !== undefined ? { Html: { Data: msg.html, Charset: "UTF-8" } } : {}),
        },
        ...(headers.length ? { Headers: headers } : {}),
        ...(msg.attachments?.length
          ? {
              Attachments: msg.attachments.map((a) => ({
                FileName: sanitizeFilename(a.filename),
                RawContent: a.content,
                ContentType: sanitizeHeaderValue(a.contentType, 78),
                ContentDisposition: "ATTACHMENT",
                ContentTransferEncoding: "BASE64",
              })),
            }
          : {}),
      },
    },
    ...(configSet ? { ConfigurationSetName: configSet } : {}),
    ...(SES_TAG_VALUE_RE.test(category)
      ? { EmailTags: [{ Name: "category", Value: category }] }
      : {}),
  };
}

export class SesEmailSender implements EmailSender {
  private readonly signedFetch: FetchLike;
  private readonly url: string;

  constructor(private readonly opts: SesEmailOptions) {
    this.url = sesSendEmailUrl(opts.region);
    this.signedFetch = createSigV4Fetch({
      service: "ses",
      region: opts.region,
      credentials: opts.credentials,
      fetchImpl: opts.fetchImpl,
      now: opts.now,
    });
  }

  async send(msg: EmailMessage): Promise<{ id: string }> {
    if (msg.to.length === 0) throw new Error("Email send failed: no recipients");
    if (msg.to.length > 50) throw new Error("Email send failed: too many recipients");
    assertAddresses("recipient", msg.to);
    if (msg.replyTo !== undefined) assertAddresses("reply-to", [msg.replyTo]);
    const body = JSON.stringify(
      buildSesSendEmailBody(msg, this.opts.from, this.opts.configurationSetName),
    );

    let res: Response;
    try {
      res = await this.signedFetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
    } catch (e) {
      // No response: SES may or may not have accepted the message.
      throw new SesSendError(
        `Email send failed: SES unreachable (${e instanceof Error ? e.name : "error"})`,
        null,
        "NetworkError",
        false,
      );
    }

    if (!res.ok) {
      // AWS JSON errors: type in `x-amzn-ErrorType` ("Type:http://...") or `__type`; text in
      // `message`/`Message`. Neither carries secrets; truncated for logs and submission.error.
      let code = (res.headers.get("x-amzn-errortype") ?? "").split(":")[0] ?? "";
      let detail = "";
      try {
        const b = (await res.json()) as { __type?: string; message?: string; Message?: string };
        code ||= (b.__type ?? "").split("#").pop() ?? "";
        detail = (b.message ?? b.Message ?? "").slice(0, 200);
      } catch {
        // non-JSON error body
      }
      code = sanitizeHeaderValue(code, 80) || `HTTP${res.status}`;
      throw new SesSendError(
        `Email send failed: ${res.status} ${code}${detail ? `: ${sanitizeHeaderValue(detail, 200)}` : ""}`,
        res.status,
        code,
        res.status >= 400 && res.status < 500,
      );
    }

    let id = "";
    try {
      id = String(((await res.json()) as { MessageId?: unknown }).MessageId ?? "");
    } catch {
      // Accepted (2xx) but the body was unreadable: still sent, so do not throw.
    }
    return { id: id || "ses:accepted" };
  }
}
