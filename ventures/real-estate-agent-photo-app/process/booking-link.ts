/**
 * booking-link.ts — the concrete "[Phone / booking link]" that
 * outreach-templates.ts (p2-outreach-templates) and pricing-one-pager.tsx's
 * callToAction (p2-pricing-page) have referenced as a placeholder since
 * they were written, months ago. No prospect who received one of those
 * templates or looked at the one-pager could ever actually book, since
 * nothing generated a real link — pricing-one-pager.tsx even told them to
 * "scan the QR code," which has never existed.
 *
 * Zero-cost, zero-backend, zero-deploy fix: a mailto: link pre-filled with
 * the same bookingIntakeFields questions outreach-templates.ts already
 * defines, addressed to Duncan directly. This is deliberately not a hosted
 * form/landing page — that would mean standing up a new public Cloudflare
 * Pages project, a domain decision, and a paid-or-not form service, none of
 * which is needed to make "reply to book" actually work today. See the
 * matching decisions-log.ts entry for why a hosted booking page was
 * considered and deferred.
 */

import { bookingIntakeFields } from "./outreach-templates";

/** Duncan's real inbox — same address already used for docs-site's Cloudflare Access allowlist. */
export const BOOKING_CONTACT_EMAIL = "duncan.andrew.haywood@gmail.com";

const BOOKING_SUBJECT = "Book a Listing Lens shoot";

function bookingBody(): string {
  const prompts = bookingIntakeFields.map((f) => `${f.field}: `).join("\n");
  return `Hi — I'd like to book a Listing Lens concierge shoot ($19, MLS-ready photos within 1 business day).\n\n${prompts}\n`;
}

/** Builds a mailto: URI pre-filled with subject + the booking-intake questions as fill-in-the-blanks. */
export function buildBookingMailtoLink(email: string = BOOKING_CONTACT_EMAIL): string {
  const subject = encodeURIComponent(BOOKING_SUBJECT);
  const body = encodeURIComponent(bookingBody());
  return `mailto:${email}?subject=${subject}&body=${body}`;
}

/** The single real booking link every outreach surface (templates, one-pager) should use. */
export const BOOKING_LINK = buildBookingMailtoLink();
