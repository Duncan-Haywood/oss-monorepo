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
 * This number is held in two places, deliberately not one.
 *
 *   - `tests/stripe-webhook.test.ts` → "the accepted replay window is bounded"
 *     refuses a value above Stripe's own 300s tolerance, and allows lowering,
 *     which is the safe direction.
 *   - `scripts/ci/cap_ratchet.py` pins it at exactly 300. As of 2026-08-06 that
 *     control reads `ts-constant` watches and pins as well as `python-constant`
 *     and `yaml-path` ones, so the note that used to sit here — that a
 *     TypeScript constant under `ventures/` was reachable by none of its kinds
 *     — is no longer true. Changing this number now means changing the pin in
 *     the same diff, which is the review this file was asking for.
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

  // The second fail-open default in this function's contract, and the same
  // shape as the tolerance above: an absent value that behaves like an
  // authorised one. `createHmac("sha256", "")` does not throw — it returns a
  // digest keyed on nothing, which any attacker can reproduce — so an unset
  // or blank `STRIPE_WEBHOOK_SECRET` reaching here would verify forged
  // payloads rather than refuse to answer.
  //
  // The one current call site is not exposed: `route.ts` requires
  // `getStripeWebhookEnvStatus().webhookSecretConfigured`, which demands a
  // `whsec_` prefix, and returns 503 otherwise. This guard is therefore
  // defence in depth, not a live hole. It is worth having anyway for exactly
  // the reason this file was being edited: the safety of this verifier
  // depended on what a single caller happened to pass, and a second call site
  // that read the env var directly would inherit none of that check.
  if (typeof webhookSecret !== "string" || webhookSecret.trim() === "") {
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
