/**
 * booking-link.test.ts — `npm test` (tsx, no test framework dependency).
 *
 * Exercises process/booking-link.ts's pure buildBookingMailtoLink(), the
 * one function every real booking surface (outreach templates,
 * pricing-one-pager.tsx, docs-site's /pricing page) renders as the actual
 * "Book now" link — previously the only process/ module in this class
 * (delivery-message.ts, referral-followup.ts already have sibling tests
 * here) with zero test coverage.
 */

import { buildBookingMailtoLink, BOOKING_LINK, BOOKING_CONTACT_EMAIL } from "../../process/booking-link";
import { bookingIntakeFields } from "../../process/outreach-templates";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function run() {
  const link = buildBookingMailtoLink();
  assert(link.startsWith(`mailto:${BOOKING_CONTACT_EMAIL}?`), "should address the mailto: link to the real inbox by default");
  assert(link.includes("subject=Book%20a%20Listing%20Lens%20shoot"), "should URL-encode the subject line");
  assert(!link.includes(" "), "the full URI should be percent-encoded, not contain raw spaces");

  const decodedBody = decodeURIComponent(link.split("body=")[1]);
  for (const { field } of bookingIntakeFields) {
    assert(decodedBody.includes(`${field}: `), `body should include a fill-in-the-blank prompt for "${field}"`);
  }

  const custom = buildBookingMailtoLink("someone-else@example.com");
  assert(custom.startsWith("mailto:someone-else@example.com?"), "should honor a custom email override rather than always using the default inbox");

  assert(BOOKING_LINK === buildBookingMailtoLink(), "the exported BOOKING_LINK constant should match the default-args build (what call sites actually render)");

  console.log("booking-link.test.ts: all assertions passed");
}

run();
