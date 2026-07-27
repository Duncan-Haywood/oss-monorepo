/**
 * Shared create-path field length limits for manual Add lead + CSV import.
 * Unbounded lead fields land in public /preview, JSON-LD, maps query, and
 * outreach HTML — soft-cap optional cells; hard-reject over-long businessName
 * (same contract as csv-import-remaining-field-length-caps).
 */

import {
  MAX_CONTACT_EMAIL_LENGTH,
  MAX_CONTACT_PHONE_LENGTH,
} from "@/lib/inquiries/contact-fields";
import { defaultTagline } from "./default-tagline";
import type { BusinessCategory } from "./types";

/** Hard-reject — empty/over-long name cannot form a useful lead row. */
export const MAX_BUSINESS_NAME_LENGTH = 200;
/** Soft-cap — truncate so one bad cell does not skip the whole row / create. */
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_SERVICES = 100;
export const MAX_CITY_LENGTH = 100;
export const MAX_STATE_LENGTH = 40;
export const MAX_ADDRESS_LENGTH = 300;
export const MAX_TAGLINE_LENGTH = 200;
export const MAX_SERVICE_ITEM_LENGTH = 100;
export const MAX_HOURS_SEGMENT_LENGTH = 120;
/**
 * Soft-cap for Lead.dataSource (compliance / batch tag on CSV + Add lead).
 * Built-ins are short (csv_import, manual_entry, demo_catalog, …); operators
 * may pass a custom list label — 64 covers that without letting a multi-KB
 * tag reach Convex/SQLite or quality-score. Not an opaque lookup key.
 */
export const MAX_LEAD_DATA_SOURCE_LENGTH = 64;
/** Reuse contact-form caps so CRM phone/email cannot diverge by ingest path. */
export const MAX_LEAD_PHONE_LENGTH = MAX_CONTACT_PHONE_LENGTH;
export const MAX_LEAD_EMAIL_LENGTH = MAX_CONTACT_EMAIL_LENGTH;

/**
 * Shared empty-field fallbacks — every other lead-creation path (CSV import's
 * parseLeadsCsv, the Stripe payment-stub builder) already defaults a blank
 * phone/tagline/description rather than persisting an empty string, since an
 * empty value renders broken on the public preview page (dead "Call " button
 * with no number, blank hero subtext) and ships empty telephone/description
 * fields in the paid preview's LocalBusiness JSON-LD. normalizeLeadCreateFields
 * is the manual Add-lead path and had never picked up this same convention
 * (see add-lead-empty-field-defaults).
 */
export const DEFAULT_LEAD_PHONE = "(555) 000-0000";

export function defaultLeadDescription(businessName: string): string {
  return `Preview site generated for ${businessName}. Claim it to connect your domain and go live.`;
}

export function softCapLeadField(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * Normalize an operator-supplied dataSource tag: trim, soft-cap length, fall
 * back when empty/non-string. Soft-cap (not hard-reject) — a custom batch
 * label is free text for compliance, not an opaque CRM key.
 */
export function normalizeLeadDataSource(
  raw: unknown,
  fallback: string,
): string {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) {
    return softCapLeadField(fallback, MAX_LEAD_DATA_SOURCE_LENGTH);
  }
  return softCapLeadField(trimmed, MAX_LEAD_DATA_SOURCE_LENGTH);
}

export type LeadCreateFieldOutput = {
  businessName: string;
  city: string;
  state: string;
  address?: string;
  phone: string;
  email?: string;
  tagline: string;
  description: string;
  services: string[];
  hours: { weekday: string; weekend: string };
};

/**
 * `category` is input-only — it feeds defaultTagline's empty-tagline
 * fallback below but is never itself transformed, and the caller (Lead)
 * already carries its own category field, so it is not echoed in the output.
 */
export type LeadCreateFieldInput = LeadCreateFieldOutput & {
  category: BusinessCategory;
};

export type NormalizeLeadCreateFieldsResult =
  | { ok: true; fields: LeadCreateFieldOutput }
  | { ok: false; error: string };

/**
 * Soft-cap optional create-path lead fields; hard-reject over-long businessName.
 * Used by addLeadAction so manual entry cannot bypass CSV length policy.
 */
export function normalizeLeadCreateFields(
  input: LeadCreateFieldInput,
): NormalizeLeadCreateFieldsResult {
  const businessName =
    typeof input.businessName === "string" ? input.businessName.trim() : "";
  if (!businessName) {
    return { ok: false, error: "Business Name is required" };
  }
  if (businessName.length > MAX_BUSINESS_NAME_LENGTH) {
    return {
      ok: false,
      error: `Business Name must be ${MAX_BUSINESS_NAME_LENGTH} characters or fewer`,
    };
  }

  const services = (Array.isArray(input.services) ? input.services : [])
    .map((s) =>
      softCapLeadField(
        typeof s === "string" ? s.trim() : "",
        MAX_SERVICE_ITEM_LENGTH,
      ),
    )
    .filter(Boolean)
    .slice(0, MAX_SERVICES);

  const addressRaw =
    typeof input.address === "string" ? input.address.trim() : "";
  const emailRaw = typeof input.email === "string" ? input.email.trim() : "";

  return {
    ok: true,
    fields: {
      businessName,
      city: softCapLeadField(
        typeof input.city === "string" ? input.city.trim() : "",
        MAX_CITY_LENGTH,
      ),
      state: softCapLeadField(
        typeof input.state === "string" ? input.state.trim() : "",
        MAX_STATE_LENGTH,
      ),
      ...(addressRaw
        ? { address: softCapLeadField(addressRaw, MAX_ADDRESS_LENGTH) }
        : {}),
      phone: softCapLeadField(
        (typeof input.phone === "string" ? input.phone.trim() : "") ||
          DEFAULT_LEAD_PHONE,
        MAX_LEAD_PHONE_LENGTH,
      ),
      ...(emailRaw
        ? { email: softCapLeadField(emailRaw, MAX_LEAD_EMAIL_LENGTH) }
        : {}),
      tagline: softCapLeadField(
        (typeof input.tagline === "string" ? input.tagline.trim() : "") ||
          defaultTagline(input.category),
        MAX_TAGLINE_LENGTH,
      ),
      description: softCapLeadField(
        (typeof input.description === "string"
          ? input.description.trim()
          : "") || defaultLeadDescription(businessName),
        MAX_DESCRIPTION_LENGTH,
      ),
      services:
        services.length > 0 ? services : ["Custom digital setup"],
      hours: {
        weekday: softCapLeadField(
          typeof input.hours?.weekday === "string"
            ? input.hours.weekday.trim()
            : "",
          MAX_HOURS_SEGMENT_LENGTH,
        ),
        weekend: softCapLeadField(
          typeof input.hours?.weekend === "string"
            ? input.hours.weekend.trim()
            : "",
          MAX_HOURS_SEGMENT_LENGTH,
        ),
      },
    },
  };
}
