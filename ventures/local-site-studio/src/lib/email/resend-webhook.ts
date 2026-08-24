/**
 * Resend delivery-event webhook support (bounce/complaint → suppression).
 *
 * Resend signs webhook requests using the Svix scheme: three headers
 * (svix-id, svix-timestamp, svix-signature) and a secret shaped
 * `whsec_<base64>`. The signed content is
 * `${svix-id}.${svix-timestamp}.${rawBody}`, HMAC-SHA256'd with the
 * base64-decoded secret bytes, base64-encoded, and compared against each
 * `v1,<base64>` entry in the (possibly space-separated, multi-version)
 * svix-signature header. See src/app/api/resend/webhook/route.ts for the
 * route this backs and /docs/architecture for the full design.
 *
 * Mirrors the constant-time-compare discipline src/lib/auth/operator.ts and
 * src/lib/email/unsubscribe-token.ts already use for other public,
 * signature-gated surfaces — never a raw `===` on a secret-derived value.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** svix-id is a short opaque message id (msg_...); real values are well under this. */
export const MAX_RESEND_WEBHOOK_ID_LENGTH = 128;

/** svix-signature can carry several space-separated "v1,<base64>" entries; well under this in practice. */
export const MAX_RESEND_WEBHOOK_SIGNATURE_LENGTH = 1024;

/** Svix's own documented tolerance window for replay protection. */
export const RESEND_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

export interface ResendWebhookSignatureHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

function decodeSigningSecret(secret: string): Buffer {
  const withoutPrefix = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  return Buffer.from(withoutPrefix, "base64");
}

/**
 * Verifies a Resend webhook request. `nowSeconds` is injected (never
 * Date.now() internally) so tests never depend on the real clock — same
 * discipline checkRateLimit's injectable `now` already uses.
 *
 * Hard-rejects an over-long id/signature header before any Buffer.from /
 * HMAC work — same opaque-token size-bound class as
 * MAX_UNSUBSCRIBE_TOKEN_LENGTH (rate limiting alone blunts request count,
 * not per-request payload/crypto-work size).
 */
export function verifyResendWebhookSignature(
  secret: string,
  headers: ResendWebhookSignatureHeaders,
  rawBody: string,
  nowSeconds: number,
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  if (id.length > MAX_RESEND_WEBHOOK_ID_LENGTH) return false;
  if (signature.length > MAX_RESEND_WEBHOOK_SIGNATURE_LENGTH) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(nowSeconds - timestampSeconds) > RESEND_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS) {
    return false;
  }

  let expected: Buffer;
  try {
    expected = createHmac("sha256", decodeSigningSecret(secret))
      .update(`${id}.${timestamp}.${rawBody}`)
      .digest();
  } catch {
    return false;
  }

  for (const candidate of signature.split(" ")) {
    const separatorIndex = candidate.indexOf(",");
    if (separatorIndex === -1) continue;
    const version = candidate.slice(0, separatorIndex);
    const encoded = candidate.slice(separatorIndex + 1);
    if (version !== "v1" || !encoded) continue;
    let provided: Buffer;
    try {
      provided = Buffer.from(encoded, "base64");
    } catch {
      continue;
    }
    if (provided.length !== expected.length) continue;
    if (timingSafeEqual(provided, expected)) return true;
  }
  return false;
}

export interface ResendWebhookEvent {
  type: string;
  data?: {
    to?: string | string[];
    bounce?: { type?: string };
  };
}

/**
 * true only for a bounce Resend itself classifies as permanent. Resend's
 * own docs describe email.bounced as firing "when the recipient's mail
 * server permanently rejected the email", so a missing bounce.type is
 * treated as permanent too — the conservative, suppress-by-default reading
 * of that definition. An explicit non-Permanent type (e.g.
 * "Transient"/"Undetermined") is a defensive escape hatch in case a future
 * Resend payload variant reuses this event type for a soft failure; never
 * suppress on that, since a temporary mailbox-full/greylist condition can
 * resolve on its own and should not permanently cut the recipient off.
 */
export function isPermanentBounceEvent(event: ResendWebhookEvent): boolean {
  if (event.type !== "email.bounced") return false;
  const bounceType = event.data?.bounce?.type;
  if (!bounceType) return true;
  return bounceType.toLowerCase() === "permanent";
}

/** A spam complaint is unconditionally actionable — always suppress, no sub-type to weigh. */
export function isComplaintEvent(event: ResendWebhookEvent): boolean {
  return event.type === "email.complained";
}

/**
 * First recipient address off `data.to` (string or array — Resend's own
 * samples show an array). Every send in this app addresses exactly one
 * recipient per outreach/receipt/pack email, so the first entry is always
 * the one this event is about.
 */
export function resendWebhookRecipientEmail(event: ResendWebhookEvent): string | null {
  const to = event.data?.to;
  if (typeof to === "string") return to.trim() || null;
  if (Array.isArray(to) && typeof to[0] === "string") return to[0].trim() || null;
  return null;
}
