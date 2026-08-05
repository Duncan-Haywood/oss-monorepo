import { resolveSiteUrl } from "./site-url";

/**
 * The origin a buyer is returned to after paying.
 *
 * The checkout route used to build this from two request headers:
 * `${x-forwarded-proto ?? "http"}://${host}`, on a POST that takes no
 * authentication. Whoever calls that endpoint chooses the `success_url` and
 * `cancel_url` of the Stripe session it creates (`stripe-checkout-server.ts`),
 * so a caller sending `Host: evil.example` received a genuine
 * `checkout.stripe.com` link — the real Stripe payment page — that returned the
 * buyer to a site of the caller's choosing the moment the card was charged. The
 * `?? "http"` was the smaller version of the same defect, quietly downgrading
 * the return trip to plaintext.
 *
 * This function takes no `Request` on purpose. A version that accepted one and
 * checked the `Host` against the configured origin would be one comparison away
 * from the same bug; a version that cannot see the headers cannot regress into
 * trusting them. The signature is the control.
 *
 * Unconfigured is a refusal rather than a guessed default, matching
 * `resolveFeedBaseUrl` in the ad-catalog sync route: there is no correct origin
 * to guess, and the previous `http://localhost:3000` fallback would have sent a
 * paying customer to their own machine.
 */
export type CheckoutBaseUrlResolution =
  | { ok: true; baseUrl: string }
  | { ok: false; reason: "unconfigured" };

export function resolveCheckoutBaseUrl(): CheckoutBaseUrlResolution {
  const configured = resolveSiteUrl();
  if (configured === null) {
    return { ok: false, reason: "unconfigured" };
  }
  return { ok: true, baseUrl: configured };
}
