import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The replay window this venture accepts on a Stripe webhook signature, and
 * simultaneously the widest one it will accept from any caller.
 *
 * 300s is Stripe's own documented tolerance, and is what
 * `src/app/api/stripe/webhook/route.ts` has always passed. It is declared here
 * rather than at the call site so there is exactly one number: the previous
 * shape put the safe value at the call site and the unsafe value — `0` — in
 * the signature, so the default read as "no opinion" while actually meaning
 * "no replay protection".
 *
 * Two rules hold it, and both are enforced in `verifyStripeWebhookSignature`
 * below rather than by convention:
 *
 *   - it is the default, so a call site that omits the argument gets the safe
 *     value rather than a disabled check;
 *   - it is the ceiling, so a call site cannot argue the window wider. A
 *     caller may narrow it (that is a strengthening); a caller may not widen
 *     it, and cannot switch it off at all.
 *
 * There is deliberately no opt-out. `0` used to mean "skip the age check";
 * it now means "a tolerance of zero seconds", which is out of range and is
 * refused. Every non-positive, non-finite or oversized tolerance fails closed
 * — the signature is rejected — because this endpoint records paid orders and
 * queues real Gelato/Printful fulfillment, so accepting a replay is more
 * expensive than rejecting a delivery.
 *
 * TypeScript constants in `ventures/` are not reachable by
 * `scripts/ci/cap_ratchet.py` (it reads `python-constant` and `yaml-path`
 * watches only). The stand-in is
 * `tests/stripe-webhook.test.ts` → "the accepted replay window is bounded",
 * which fails if this number grows.
 */
export const STRIPE_WEBHOOK_MAX_AGE_SECONDS = 300;

export function verifyStripeWebhookSignature(
  payload: string,
  signatureHeader: string | null,
  webhookSecret: string,
  maxAgeSeconds: number = STRIPE_WEBHOOK_MAX_AGE_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  // Checked before anything else, and unconditionally: an out-of-range
  // tolerance must never be a route into the rest of this function. The
  // previous `if (maxAgeSeconds > 0 && ...)` made exactly that mistake — a
  // caller passing `0`, or omitting the argument, skipped the comparison and
  // every captured webhook stayed valid forever.
  if (
    !Number.isFinite(maxAgeSeconds) ||
    maxAgeSeconds <= 0 ||
    maxAgeSeconds > STRIPE_WEBHOOK_MAX_AGE_SECONDS
  ) {
    return false;
  }

  if (!signatureHeader) {
    return false;
  }

  const entries = signatureHeader.split(",").map((part) => part.trim());
  const timestampPart = entries.find((part) => part.startsWith("t="));
  const signaturePart = entries.find((part) => part.startsWith("v1="));

  if (!timestampPart || !signaturePart) {
    return false;
  }

  const timestamp = timestampPart.slice(2);
  const timestampNum = parseInt(timestamp, 10);
  if (isNaN(timestampNum)) {
    return false;
  }

  if (Math.abs(nowSeconds - timestampNum) > maxAgeSeconds) {
    return false;
  }

  const expectedSignature = signaturePart.slice(3);
  const signedPayload = `${timestamp}.${payload}`;

  const computed = createHmac("sha256", webhookSecret)
    .update(signedPayload, "utf8")
    .digest("hex");

  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(expectedSignature));
  } catch {
    return false;
  }
}
