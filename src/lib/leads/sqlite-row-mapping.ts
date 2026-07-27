import type { Lead, LeadHours, LeadPipelineStage } from "./types";
import { normalizeOutreachStep } from "../email/outreach-followups";
import { normalizeLeadCategory, normalizeLeadRecommendedTier } from "./category-normalize";
import { defaultTagline } from "./default-tagline";

/**
 * Pure SQLite <-> Lead row mapping, split out of src/lib/db.ts (which imports
 * "server-only" and therefore cannot be imported directly by Vitest — see
 * AGENT_PROTOCOL's server-only testability rule). This is the exact logic
 * db.ts's fallback path round-trips lead.hours/lead.services through; keeping
 * it here lets that round-trip be unit-tested without mocking @/lib/db.
 */

// Mirrors the `leads` SQLite table columns db.ts reads via `SELECT *`.
export interface SqliteLeadRow {
  id: string;
  slug: string;
  businessName: string;
  category: string;
  city: string;
  state?: string;
  address?: string | null;
  phone?: string;
  email?: string | null;
  hours?: string;
  services?: string;
  status: string;
  tagline?: string | null;
  description?: string | null;
  recommendedTier?: string | null;
  dataSource?: string | null;
  outreachStep?: number | null;
  lastOutreachAt?: string | null;
  lastPreviewOpenAt?: string | null;
  notes?: string | null;
  snoozedUntil?: string | null;
  stripeConnectAccountId?: string | null;
  stripeConnectAccountCreatedAt?: string | null;
  stripeConnectChargesEnabled?: number | null;
  stripeConnectPayoutsEnabled?: number | null;
  stripeConnectDetailsSubmitted?: number | null;
  stripeConnectStatusCheckedAt?: string | null;
  bufferProfileIds?: string | null;
  bufferPostedVariantKeys?: string | null;
  starterUpsellSentCount?: number | null;
  lastStarterUpsellSentAt?: string | null;
  stripeConnectOnboardingLinkSentCount?: number | null;
  lastStripeConnectOnboardingLinkSentAt?: string | null;
}

/** Encode LeadHours into the single TEXT column db.ts persists — "weekday · weekend", or bare weekday when weekend is empty. */
export function serializeLeadHours(hours: LeadHours): string {
  return hours.weekend ? `${hours.weekday} · ${hours.weekend}` : hours.weekday;
}

/** Inverse of serializeLeadHours; falls back to the documented demo default when the column is empty/absent. */
export function parseLeadHours(raw: string | null | undefined): LeadHours {
  if (!raw) {
    return { weekday: "Mon–Fri 9am–5pm", weekend: "Sat–Sun Closed" };
  }
  if (raw.includes("·")) {
    const idx = raw.indexOf("·");
    const weekday = raw.slice(0, idx).trim();
    const weekend = raw.slice(idx + 1).trim();
    return { weekday, weekend };
  }
  return { weekday: raw, weekend: "" };
}

/** Encode Lead.services into the JSON TEXT column db.ts persists. */
export function serializeLeadServices(services: string[]): string {
  return JSON.stringify(services);
}

/** Inverse of serializeLeadServices; malformed/absent JSON degrades to []. */
export function parseLeadServices(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

/** Encode Lead.bufferProfileIds into the JSON TEXT column db.ts persists. */
export function serializeLeadBufferProfileIds(bufferProfileIds: string[]): string {
  return JSON.stringify(bufferProfileIds);
}

/** Inverse of serializeLeadBufferProfileIds; malformed/absent JSON degrades to undefined. */
export function parseLeadBufferProfileIds(raw: string | null | undefined): string[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as string[]) : undefined;
  } catch {
    return undefined;
  }
}

/** Encode Lead.bufferPostedVariantKeys into the JSON TEXT column db.ts persists. */
export function serializeLeadBufferPostedVariantKeys(bufferPostedVariantKeys: string[]): string {
  return JSON.stringify(bufferPostedVariantKeys);
}

/** Inverse of serializeLeadBufferPostedVariantKeys; malformed/absent JSON degrades to undefined. */
export function parseLeadBufferPostedVariantKeys(
  raw: string | null | undefined,
): string[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as string[]) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Inverse of the `? 1 : 0` write convention this codebase uses for every
 * SQLite boolean column (see e.g. orders.commerceAddon) — tri-state: 1 →
 * true, 0 → false, null/undefined → undefined (never checked yet), so a
 * lead whose Connect status was never checked stays distinguishable from one
 * confirmed NOT chargesEnabled/payoutsEnabled.
 */
export function parseSqliteTriStateBoolean(raw: number | null | undefined): boolean | undefined {
  if (raw === 1) return true;
  if (raw === 0) return false;
  return undefined;
}

/** Map a SQLite `leads` row back into the app-wide Lead shape (fallback-read path). */
export function mapSqliteRowToLead(row: SqliteLeadRow): Lead {
  const category = normalizeLeadCategory(row.category);
  const recommendedTier = normalizeLeadRecommendedTier(row.recommendedTier, category);

  return {
    slug: row.slug,
    businessName: row.businessName,
    category,
    city: row.city,
    state: row.state || "CO",
    address: row.address || undefined,
    tagline: row.tagline || defaultTagline(category),
    description:
      row.description ||
      `This is a preview page generated for ${row.businessName}. Claim it to connect your domain, contact form, and marketing dashboard.`,
    phone: row.phone || "(555) 000-0000",
    email: row.email || undefined,
    services: parseLeadServices(row.services),
    hours: parseLeadHours(row.hours),
    stage: row.status as LeadPipelineStage,
    recommendedTier,
    dataSource: row.dataSource || undefined,
    outreachStep: normalizeOutreachStep(row.outreachStep ?? undefined),
    lastOutreachAt: row.lastOutreachAt || undefined,
    lastPreviewOpenAt: row.lastPreviewOpenAt || undefined,
    notes: row.notes || undefined,
    snoozedUntil: row.snoozedUntil || undefined,
    stripeConnectAccountId: row.stripeConnectAccountId || undefined,
    stripeConnectAccountCreatedAt: row.stripeConnectAccountCreatedAt || undefined,
    stripeConnectChargesEnabled: parseSqliteTriStateBoolean(row.stripeConnectChargesEnabled),
    stripeConnectPayoutsEnabled: parseSqliteTriStateBoolean(row.stripeConnectPayoutsEnabled),
    stripeConnectDetailsSubmitted: parseSqliteTriStateBoolean(row.stripeConnectDetailsSubmitted),
    stripeConnectStatusCheckedAt: row.stripeConnectStatusCheckedAt || undefined,
    bufferProfileIds: parseLeadBufferProfileIds(row.bufferProfileIds),
    bufferPostedVariantKeys: parseLeadBufferPostedVariantKeys(row.bufferPostedVariantKeys),
    starterUpsellSentCount:
      typeof row.starterUpsellSentCount === "number" ? row.starterUpsellSentCount : undefined,
    lastStarterUpsellSentAt: row.lastStarterUpsellSentAt || undefined,
    stripeConnectOnboardingLinkSentCount:
      typeof row.stripeConnectOnboardingLinkSentCount === "number"
        ? row.stripeConnectOnboardingLinkSentCount
        : undefined,
    lastStripeConnectOnboardingLinkSentAt: row.lastStripeConnectOnboardingLinkSentAt || undefined,
  };
}
