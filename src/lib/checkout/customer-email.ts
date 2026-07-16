/**
 * Shared customerEmail normalization for public Stripe checkout create routes
 * (bundle + commerce Buy now).
 *
 * Rate limits blunt request count, not payload size: an uncapped
 * body.customerEmail reaches stripe.checkout.sessions.create and
 * recordCheckoutSessionCreated (abandoned-recovery + dashboard), so a
 * public caller can force multi-KB strings into Stripe + checkout_sessions.
 * Soft-cap once here and reuse for both twins — align with contact-form /
 * create-path MAX_CONTACT_EMAIL_LENGTH.
 */

import { MAX_CONTACT_EMAIL_LENGTH } from "@/lib/inquiries/contact-fields";

export { MAX_CONTACT_EMAIL_LENGTH as MAX_CHECKOUT_CUSTOMER_EMAIL_LENGTH };

/**
 * Normalize optional checkout customerEmail before Stripe + persist.
 * Non-string / blank → undefined (Stripe collects email on hosted Checkout).
 * Soft-cap over-long strings (do not hard-reject — match contact soft-cap UX).
 */
export function normalizeCheckoutCustomerEmail(
  value: unknown,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > MAX_CONTACT_EMAIL_LENGTH
    ? trimmed.slice(0, MAX_CONTACT_EMAIL_LENGTH)
    : trimmed;
}
