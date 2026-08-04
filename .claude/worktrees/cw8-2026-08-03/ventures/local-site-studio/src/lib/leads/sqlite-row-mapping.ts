import type { Lead, LeadHours, LeadPipelineStage } from "./types";
import { normalizeOutreachStep } from "../email/outreach-followups";

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
    const parts = raw.split("·").map((p) => p.trim());
    return { weekday: parts[0], weekend: parts[1] || "" };
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

const CATEGORIES = ["restaurant", "salon", "trades", "generic"] as const;
const RECOMMENDED_TIERS = ["starter", "growth", "complete"] as const;

/** Map a SQLite `leads` row back into the app-wide Lead shape (fallback-read path). */
export function mapSqliteRowToLead(row: SqliteLeadRow): Lead {
  const category = (CATEGORIES as readonly string[]).includes(row.category)
    ? (row.category as Lead["category"])
    : "generic";

  const recommendedTier = (RECOMMENDED_TIERS as readonly string[]).includes(
    row.recommendedTier ?? "",
  )
    ? (row.recommendedTier as Lead["recommendedTier"])
    : category === "trades"
      ? "starter"
      : category === "salon"
        ? "complete"
        : "growth";

  return {
    slug: row.slug,
    businessName: row.businessName,
    category,
    city: row.city,
    state: row.state || "CO",
    address: row.address || undefined,
    tagline:
      row.tagline ||
      (category === "trades"
        ? "Professional services you can count on"
        : category === "salon"
          ? "Tailored styling and care"
          : "Local favorites made fresh daily"),
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
  };
}
