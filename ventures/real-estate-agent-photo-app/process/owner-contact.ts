/**
 * owner-contact.ts — the one address prospects book with and pay to.
 *
 * It used to be the owner's personal inbox, typed into booking-link.ts,
 * payment-collection.ts and the logs. The repository is public now, so the
 * address comes from LISTING_LENS_CONTACT_EMAIL in whatever environment
 * generates outreach and delivery messages. Unset, every generated message
 * carries an undeliverable `.invalid` placeholder, so a message sent without
 * it fails visibly instead of routing a booking or a payment somewhere wrong.
 */

export const CONTACT_EMAIL_PLACEHOLDER = "contact-email-not-set@example.invalid";

export function ownerContactEmail(): string {
  const configured =
    typeof process === "undefined" ? undefined : process.env.LISTING_LENS_CONTACT_EMAIL;
  return configured?.trim() || CONTACT_EMAIL_PLACEHOLDER;
}
