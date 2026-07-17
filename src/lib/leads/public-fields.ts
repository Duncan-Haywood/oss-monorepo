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
 * Soft-cap every create-path free-text field on a Lead for public surfaces.
 * Preserves slug/stage/tier/provenance/outreach fields unchanged.
 */
export function softCapLeadForPublicSurface(lead: Lead): Lead {
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
    ...lead,
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
