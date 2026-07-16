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

/** leadId is a slug-like token on this route — match preview-open slug bound. */
export const MAX_MARKETING_GENERATE_LEAD_ID_LENGTH = 120;

const MAX_WEBSITE_URL_LENGTH = 500;

function softCapOptional(
  value: string | undefined,
  max: number,
): string | undefined {
  if (value === undefined) return undefined;
  return softCapLeadField(value, max);
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
    hours: softCapOptional(business.hours?.trim(), MAX_HOURS_SEGMENT_LENGTH),
    services: services.length > 0 ? services : ["our services"],
    tagline: softCapOptional(business.tagline?.trim(), MAX_TAGLINE_LENGTH),
    websiteUrl: softCapOptional(business.websiteUrl?.trim(), MAX_WEBSITE_URL_LENGTH),
    tone: business.tone,
  };
}
