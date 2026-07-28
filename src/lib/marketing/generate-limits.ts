/**
 * Request-size limits for POST /api/marketing/generate.
 *
 * Membership checks alone are not a size bound: contentTypes maps 1:1 into
 * stub variants and Anthropic prompt array length, so an open-demo or
 * compromised-session caller can burn quota with thousands of valid-type
 * duplicates under the existing per-IP rate limit. Cap at the sold monthly
 * pack ceiling; soft-cap business context with create-path field limits.
 */

import {
  MAX_BUSINESS_NAME_LENGTH,
  MAX_CITY_LENGTH,
  MAX_HOURS_SEGMENT_LENGTH,
  MAX_LEAD_PHONE_LENGTH,
  MAX_SERVICE_ITEM_LENGTH,
  MAX_SERVICES,
  MAX_STATE_LENGTH,
  MAX_TAGLINE_LENGTH,
  softCapLeadField,
} from "@/lib/leads/create-fields";
import { MONTHLY_MARKETING_PACK_TYPES } from "./monthly-pack";
import type { BusinessContext } from "./types";

/** Sold Growth/Complete monthly pack ceiling (8 posts + 2 emails). */
export const MAX_MARKETING_CONTENT_TYPES_PER_REQUEST =
  MONTHLY_MARKETING_PACK_TYPES.length;

/** Same bound as tagline — a free-text marketing label, not a CRM field. */
export const MAX_CAMPAIGN_CONTEXT_LENGTH = MAX_TAGLINE_LENGTH;

/** leadId is a slug-like token on this route — match preview-open slug bound. */
export const MAX_MARKETING_GENERATE_LEAD_ID_LENGTH = 120;

const MAX_WEBSITE_URL_LENGTH = 500;

/** Prefixes used by formatPackBusinessHours — keep in sync with that join. */
const PACK_HOURS_WEEKDAY_PREFIX = "Weekdays ";
const PACK_HOURS_WEEKEND_JOIN = "; Weekends ";

/**
 * Joined Weekdays/Weekends hours ceiling for pack/voice generate.
 * Create-path caps each CRM segment at MAX_HOURS_SEGMENT_LENGTH; joining both
 * into one BusinessContext.hours string must not re-truncate at a single
 * segment (that wiped weekend hours after #356).
 */
export const MAX_PACK_BUSINESS_HOURS_LENGTH =
  PACK_HOURS_WEEKDAY_PREFIX.length +
  MAX_HOURS_SEGMENT_LENGTH +
  PACK_HOURS_WEEKEND_JOIN.length +
  MAX_HOURS_SEGMENT_LENGTH;

function softCapOptional(
  value: string | undefined,
  max: number,
): string | undefined {
  if (value === undefined) return undefined;
  return softCapLeadField(value, max);
}

/**
 * Soft-cap each CRM hours segment, then join for pack/voice BusinessContext.
 * Returns undefined when both weekday and weekend are empty.
 */
export function formatPackBusinessHours(hours: {
  weekday: string;
  weekend: string;
}): string | undefined {
  if (!hours.weekday && !hours.weekend) return undefined;
  const weekday = softCapLeadField(
    (hours.weekday || "by appointment").trim() || "by appointment",
    MAX_HOURS_SEGMENT_LENGTH,
  );
  const weekend = softCapLeadField(
    (hours.weekend || "by appointment").trim() || "by appointment",
    MAX_HOURS_SEGMENT_LENGTH,
  );
  return `${PACK_HOURS_WEEKDAY_PREFIX}${weekday}${PACK_HOURS_WEEKEND_JOIN}${weekend}`;
}

/**
 * Soft-cap business context strings + services before LLM / stub generate.
 * Callers must already validate shape via isBusinessContext.
 */
export function normalizeMarketingGenerateBusiness(
  business: BusinessContext,
): BusinessContext {
  const services = business.services
    .map((s) => softCapLeadField(s.trim(), MAX_SERVICE_ITEM_LENGTH))
    .filter((s) => s.length > 0)
    .slice(0, MAX_SERVICES);

  return {
    businessName: softCapLeadField(
      business.businessName.trim(),
      MAX_BUSINESS_NAME_LENGTH,
    ),
    category: softCapLeadField(business.category.trim(), MAX_TAGLINE_LENGTH),
    city: softCapLeadField(business.city.trim(), MAX_CITY_LENGTH),
    state: softCapOptional(business.state?.trim(), MAX_STATE_LENGTH),
    phone: softCapOptional(business.phone?.trim(), MAX_LEAD_PHONE_LENGTH),
    hours: softCapOptional(business.hours?.trim(), MAX_PACK_BUSINESS_HOURS_LENGTH),
    services: services.length > 0 ? services : ["our services"],
    tagline: softCapOptional(business.tagline?.trim(), MAX_TAGLINE_LENGTH),
    websiteUrl: softCapOptional(business.websiteUrl?.trim(), MAX_WEBSITE_URL_LENGTH),
    tone: business.tone,
    campaignContext: softCapOptional(
      business.campaignContext?.trim(),
      MAX_CAMPAIGN_CONTEXT_LENGTH,
    ),
  };
}
