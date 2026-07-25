import { NextResponse } from "next/server";
import { suppressEmail } from "@/lib/db";
import {
  isComplaintEvent,
  isPermanentBounceEvent,
  resendWebhookRecipientEmail,
  verifyResendWebhookSignature,
  type ResendWebhookEvent,
} from "@/lib/email/resend-webhook";
import { RESEND_WEBHOOK_SUPPRESSION_CONVEX_PRIMARY } from "@/lib/email/suppression-persist";
import { checkRateLimit, clientIpFromHeaders, type RateLimitConfig } from "@/lib/security/rate-limit";

/**
 * Resend delivery-event webhook — hard bounces (email.bounced, Permanent)
 * and spam complaints (email.complained) suppress the recipient the same
 * way a CAN-SPAM unsubscribe click does, closing the gap where this app
 * only ever learned about an opt-out, never a bounced/complained address.
 * Continuing to send to either damages sender reputation / deliverability
 * for every future send (outreach, receipts, DNS handoff, marketing/voice
 * packs) — this is a sender-reputation-protection surface, not a revenue
 * path, but it gates every other email surface's actual inbox placement.
 *
 * Dormant until an operator sets RESEND_WEBHOOK_SECRET (see .env.example
 * and /docs/launch-checklist) — no ALLOW_* feature flag needed, since an
 * unset secret alone makes this endpoint refuse to process anything.
 */

/**
 * Resend/Svix retries with backoff on a non-2xx response, the same
 * redelivery contract Stripe's webhook relies on — sized well above
 * DEFAULT_RATE_LIMIT for the same reason STRIPE_WEBHOOK_RATE_LIMIT is: a
 * legitimate high-volume send burst (a daily digest, a bulk marketing pack
 * delivery) generating a matching burst of delivery events should never
 * trip this.
 */
const RESEND_WEBHOOK_RATE_LIMIT: RateLimitConfig = { limit: 120, windowMs: 60_000 };

function notConfigured() {
  return NextResponse.json(
    {
      error: "Resend webhook not configured",
      message: "Set RESEND_WEBHOOK_SECRET (see .env.example).",
      docs: "/docs/launch-checklist",
    },
    { status: 501 },
  );
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return notConfigured();
  }

  const rawBody = await request.text();
  const verified = verifyResendWebhookSignature(
    secret,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    rawBody,
    Math.floor(Date.now() / 1000),
  );
  if (!verified) {
    return NextResponse.json({ error: "Signature verification failed" }, { status: 400 });
  }

  // Rate-limit only after signature verification succeeds
  // (stripe-webhook-rate-limit-post-verify's exact rationale applies here
  // unchanged): clientIpFromHeaders derives its key from
  // x-forwarded-for/x-real-ip, which any direct caller can set to an
  // arbitrary value. A pre-verification gate keyed on that header would let
  // an attacker impersonate Resend's sending IPs, burn out the
  // `resend-webhook:<ip>` bucket with garbage POSTs that fail verification,
  // and then have Resend's own real redeliveries from that same IP land in
  // the identical already-exhausted bucket. Gating only on requests that
  // already produced a cryptographically verified event closes that hole.
  const clientIp = clientIpFromHeaders(request.headers);
  const rate = checkRateLimit(`resend-webhook:${clientIp}`, RESEND_WEBHOOK_RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests", message: "Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(rawBody) as ResendWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (isPermanentBounceEvent(event) || isComplaintEvent(event)) {
    const email = resendWebhookRecipientEmail(event);
    if (email) {
      try {
        await suppressEmail(email, RESEND_WEBHOOK_SUPPRESSION_CONVEX_PRIMARY);
      } catch (e) {
        console.error(`Resend webhook: failed to suppress ${event.type} recipient`, e);
        return NextResponse.json(
          { error: "Suppression write failed — Resend should retry", received: false },
          { status: 500 },
        );
      }
    } else {
      console.warn(`Resend webhook: ${event.type} event had no recipient address to suppress`);
    }
  }

  return NextResponse.json({ received: true });
}
