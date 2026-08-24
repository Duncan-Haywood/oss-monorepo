/**
 * Shared businessName/phone normalization for public Stripe checkout create
 * routes — the organic no-preexisting-lead path (homepage/pricing CTAs omit
 * a slug) previously had no way to collect the buyer's real business name or
 * phone, so the payment stub inserted at webhook time fell back to a
 * title-cased slug ("Organic A1b2c3") and a fake "(555) 000-0000" number
 * that then leaked into the receipt/go-live emails a paying customer
 * receives (checkout-business-fields-capture).
 *
 * Soft-cap (not hard-reject) — matching normalizeCheckoutCustomerEmail's UX:
 * these fields are optional and cosmetic to the checkout flow itself, so an
 * over-long value should never block payment. Mirrors create-fields.ts's
 * MAX_BUSINESS_NAME_LENGTH / contact-fields.ts's MAX_CONTACT_PHONE_LENGTH so
 * this collection path cannot diverge from every other lead-creation path's
 * length policy.
 */

import { MAX_BUSINESS_NAME_LENGTH } from "@/lib/leads/create-fields";
import { MAX_CONTACT_PHONE_LENGTH } from "@/lib/inquiries/contact-fields";

export {
  MAX_BUSINESS_NAME_LENGTH as MAX_CHECKOUT_BUSINESS_NAME_LENGTH,
  MAX_CONTACT_PHONE_LENGTH as MAX_CHECKOUT_BUSINESS_PHONE_LENGTH,
};

function normalizeOptionalCheckoutField(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/** Normalize optional checkout businessName before Stripe metadata + persist. */
export function normalizeCheckoutBusinessName(value: unknown): string | undefined {
  return normalizeOptionalCheckoutField(value, MAX_BUSINESS_NAME_LENGTH);
}

/** Normalize optional checkout phone before Stripe metadata + persist. */
export function normalizeCheckoutBusinessPhone(value: unknown): string | undefined {
  return normalizeOptionalCheckoutField(value, MAX_CONTACT_PHONE_LENGTH);
}
