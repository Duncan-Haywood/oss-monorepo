/**
 * Soft-cap lead free-text fields at create-path MAX_* before public preview /
 * meta / JSON-LD emission (preview-lead-description-read-soft-cap).
 *
 * CSV + Add lead already soft-cap on write, but pre-cap Convex/SQLite rows
 * (and any future create-path miss) would otherwise reach unauthenticated
 * /preview HTML, Open Graph descriptions, and LocalBusiness JSON-LD without
 * a length bound. Soft-cap at read (never hard-reject) so one oversized cell
 * still renders a truncated page.
 */

import {
  MAX_ADDRESS_LENGTH,
  MAX_BUSINESS_NAME_LENGTH,
  MAX_CITY_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_HOURS_SEGMENT_LENGTH,
  MAX_LEAD_EMAIL_LENGTH,
  MAX_LEAD_PHONE_LENGTH,
  MAX_SERVICE_ITEM_LENGTH,
  MAX_SERVICES,
  MAX_STATE_LENGTH,
  MAX_TAGLINE_LENGTH,
  softCapLeadField,
} from "@/lib/leads/create-fields";
import type { Lead } from "@/lib/leads/types";

/** Soft-cap description alone — used by leadMetaDescription and tests. */
export function softCapLeadDescription(description: string): string {
  return softCapLeadField(
    typeof description === "string" ? description : "",
    MAX_DESCRIPTION_LENGTH,
  );
}

/**
 * A Lead with every dashboard-only / operator-internal field structurally
 * removed — the type public-surface consumers (preview page, meta tags,
 * JSON-LD, OG images) should be passed around, so a future component that
 * takes a "public lead" prop can never widen back to a full Lead by mistake.
 */
export type PublicLead = Omit<Lead, "notes" | "stripeConnectAccountId">;

/**
 * Soft-cap every create-path free-text field on a Lead for public surfaces,
 * and strip fields that must never reach an unauthenticated visitor: `notes`
 * (operator call notes — dashboard only per its own doc comment) and
 * `stripeConnectAccountId` (a Stripe financial identifier). Preserves
 * slug/stage/tier/provenance/outreach fields unchanged — those are read by
 * public-surface callers (e.g. isDemoPreview's dataSource check) by design.
 *
 * Every current caller only reads individual fields off the result, so
 * `notes`/`stripeConnectAccountId` are not live-exploitable today — but this
 * is the one function whose contract is "safe to hand to a public surface",
 * and at least one caller (CategoryPreview → TierUpsell) already passes the
 * whole result object onward. Omitting these two fields from the return
 * type (rather than relying on every caller reading around them) means a
 * future Client Component boundary added on that path cannot silently
 * serialize an operator's notes or Stripe account id into the RSC payload.
 */
export function softCapLeadForPublicSurface(lead: Lead): PublicLead {
  const { notes, stripeConnectAccountId, ...publicLead } = lead;
  void notes;
  void stripeConnectAccountId;
  const address =
    typeof lead.address === "string"
      ? softCapLeadField(lead.address, MAX_ADDRESS_LENGTH)
      : lead.address;
  const email =
    typeof lead.email === "string"
      ? softCapLeadField(lead.email, MAX_LEAD_EMAIL_LENGTH)
      : lead.email;
  const services = Array.isArray(lead.services)
    ? lead.services
        .slice(0, MAX_SERVICES)
        .map((service) =>
          softCapLeadField(
            typeof service === "string" ? service : "",
            MAX_SERVICE_ITEM_LENGTH,
          ),
        )
    : [];

  return {
    ...publicLead,
    businessName: softCapLeadField(
      typeof lead.businessName === "string" ? lead.businessName : "",
      MAX_BUSINESS_NAME_LENGTH,
    ),
    city: softCapLeadField(
      typeof lead.city === "string" ? lead.city : "",
      MAX_CITY_LENGTH,
    ),
    state: softCapLeadField(
      typeof lead.state === "string" ? lead.state : "",
      MAX_STATE_LENGTH,
    ),
    ...(address !== undefined ? { address } : {}),
    tagline: softCapLeadField(
      typeof lead.tagline === "string" ? lead.tagline : "",
      MAX_TAGLINE_LENGTH,
    ),
    description: softCapLeadDescription(lead.description),
    phone: softCapLeadField(
      typeof lead.phone === "string" ? lead.phone : "",
      MAX_LEAD_PHONE_LENGTH,
    ),
    ...(email !== undefined ? { email } : {}),
    services,
    hours: {
      weekday: softCapLeadField(
        typeof lead.hours?.weekday === "string" ? lead.hours.weekday : "",
        MAX_HOURS_SEGMENT_LENGTH,
      ),
      weekend: softCapLeadField(
        typeof lead.hours?.weekend === "string" ? lead.hours.weekend : "",
        MAX_HOURS_SEGMENT_LENGTH,
      ),
    },
  };
}
