/**
 * CSV → Lead parsing for operator bulk import.
 * See /docs/compliance (document data source) and backlog item csv-lead-import.
 */

import type { BusinessCategory, Lead, LeadPipelineStage } from "./types";
import { parseLeadHours } from "./sqlite-row-mapping";
import { MAX_LEAD_SLUG_LENGTH, sanitizeLeadSlug } from "./slug";
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
} from "./create-fields";

// Re-export shared create-path caps so existing csv-import.test imports keep working.
export {
  MAX_ADDRESS_LENGTH,
  MAX_BUSINESS_NAME_LENGTH,
  MAX_CITY_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_HOURS_SEGMENT_LENGTH,
  MAX_SERVICE_ITEM_LENGTH,
  MAX_SERVICES,
  MAX_STATE_LENGTH,
  MAX_TAGLINE_LENGTH,
};
/** @deprecated Prefer MAX_LEAD_PHONE_LENGTH — alias kept for CSV test imports. */
export const MAX_CSV_PHONE_LENGTH = MAX_LEAD_PHONE_LENGTH;
/** @deprecated Prefer MAX_LEAD_EMAIL_LENGTH — alias kept for CSV test imports. */
export const MAX_CSV_EMAIL_LENGTH = MAX_LEAD_EMAIL_LENGTH;

export const CSV_LEAD_HEADERS = [
  "businessName",
  "category",
  "city",
  "state",
  "address",
  "phone",
  "email",
  "hours",
  "services",
  "tagline",
  "description",
  "recommendedTier",
  "slug",
] as const;

export type CsvLeadHeader = (typeof CSV_LEAD_HEADERS)[number];

export interface CsvImportRowError {
  row: number; // 1-based data row (excludes header)
  message: string;
}

export interface CsvImportResult {
  leads: Lead[];
  errors: CsvImportRowError[];
  skipped: number;
}

const CATEGORIES = new Set<BusinessCategory>(["restaurant", "salon", "trades", "generic"]);
const TIERS = new Set(["starter", "growth", "complete"] as const);
const MAX_ROWS = 100;

/**
 * Auth-gated CSV import still needs a finite payload ceiling —
 * requireOperatorAuth is not a payload-size throttle. MAX_ROWS (100) alone is
 * not enough: splitCsvIntoLines runs over the full string before the row-count
 * gate, so a multi-MB body with few rows still burns parse work. Soft-cap /
 * truncate would cut mid-row and mint corrupt leads — hard-reject instead.
 *
 * 512 KiB comfortably fits 100 capped rows (create-path MAX_* per cell) while
 * blocking multi-MB probes on importLeadsCsvAction.
 */
export const MAX_CSV_IMPORT_TEXT_LENGTH = 512_000;

export type ParseCsvImportTextResult =
  | { ok: true; csvText: string }
  | { ok: false; reason: "missing" | "too_long" };

/**
 * Bound operator-submitted CSV text before parseLeadsCsv.
 * Over MAX → too_long (never truncate); empty/whitespace → missing.
 */
export function parseCsvImportText(raw: unknown): ParseCsvImportTextResult {
  if (typeof raw !== "string") {
    return { ok: false, reason: "missing" };
  }
  // Length-check before trim/split — auth is not a payload-size throttle.
  if (raw.length > MAX_CSV_IMPORT_TEXT_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  if (!raw.trim()) {
    return { ok: false, reason: "missing" };
  }
  return { ok: true, csvText: raw };
}

function softCap(value: string, max: number): string {
  return softCapLeadField(value, max);
}

export const CSV_LEAD_TEMPLATE = [
  CSV_LEAD_HEADERS.join(","),
  [
    "Blue River Salon",
    "salon",
    "Denver",
    "CO",
    "1200 Blake St",
    "(303) 555-0100",
    "hello@blueriversalon.example",
    "Mon–Fri 9am–5pm · Sat 10am–2pm",
    "Haircuts; Color; Blowouts",
    '"Color cuts and calm appointments"',
    '"Appointment-only salon in RiNo"',
    "complete",
    "blue-river-salon",
  ].join(","),
].join("\n");

/**
 * Split raw CSV text into lines, handling double-quoted fields that may contain
 * embedded newlines (RFC 4180 §2, item 6). Normalises CRLF / bare CR to LF.
 */
export function splitCsvIntoLines(csvText: string): string[] {
  const normalized = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === "\n" && !inQuotes) {
      const trimmed = current.trimEnd();
      if (trimmed.length > 0) lines.push(trimmed);
      current = "";
    } else {
      current += ch;
    }
  }
  const remaining = current.trimEnd();
  if (remaining.length > 0) lines.push(remaining);
  return lines;
}

/** Split a single CSV line into fields, honoring double-quoted values. */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      fields.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Derive a lead slug from a business name for CSV rows without an explicit
 * slug column. Reuses sanitizeLeadSlug so charset / edge-dash / ≤63 DNS
 * label caps match addLead and checkout create-paths; falls back to "lead"
 * when the name sanitizes away to nothing.
 */
export function slugifyBusinessName(name: string): string {
  return sanitizeLeadSlug(name) || "lead";
}

/**
 * Keep a collision suffix within MAX_LEAD_SLUG_LENGTH so a long base slug
 * + `-2` cannot produce an over-length DNS label (create-path identity).
 */
function slugWithCollisionSuffix(base: string, suffix: number): string {
  const suffixPart = `-${suffix}`;
  const maxBase = MAX_LEAD_SLUG_LENGTH - suffixPart.length;
  const truncated = base.slice(0, Math.max(1, maxBase)).replace(/-+$/g, "");
  // sanitize again so a truncated base never leaves an invalid form
  return sanitizeLeadSlug(`${truncated}${suffixPart}`) || `lead${suffixPart}`;
}

function normalizeHeader(raw: string): string {
  return raw.trim().replace(/^\uFEFF/, "").toLowerCase();
}

function parseCategory(value: string): BusinessCategory | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "generic";
  if (CATEGORIES.has(normalized as BusinessCategory)) {
    return normalized as BusinessCategory;
  }
  return null;
}

function parseTier(value: string, category: BusinessCategory): Lead["recommendedTier"] {
  const normalized = value.trim().toLowerCase();
  if (normalized && TIERS.has(normalized as Lead["recommendedTier"])) {
    return normalized as Lead["recommendedTier"];
  }
  if (category === "salon") return "complete";
  if (category === "trades") return "starter";
  return "growth";
}

function defaultTagline(category: BusinessCategory): string {
  switch (category) {
    case "salon":
      return "Tailored styling and care";
    case "trades":
      return "Professional services you can count on";
    case "restaurant":
      return "Local favorites made fresh daily";
    case "generic":
      return "Your neighborhood business, online";
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

/**
 * Parse operator CSV text into Lead objects.
 * Required columns: businessName. Others are optional with sensible defaults.
 * Services use `;` as the in-cell separator (commas remain CSV delimiters).
 */
export function parseLeadsCsv(
  csvText: string,
  options?: { dataSource?: string; defaultStage?: LeadPipelineStage },
): CsvImportResult {
  const dataSource = options?.dataSource?.trim() || "csv_import";
  const defaultStage = options?.defaultStage ?? "discovered";
  const errors: CsvImportRowError[] = [];
  const leads: Lead[] = [];
  const seenSlugs = new Set<string>();

  const lines = splitCsvIntoLines(csvText);

  if (lines.length === 0) {
    return { leads: [], errors: [{ row: 0, message: "CSV is empty" }], skipped: 0 };
  }

  const headerCells = parseCsvLine(lines[0] ?? "").map(normalizeHeader);
  const indexOf = (name: CsvLeadHeader): number => headerCells.indexOf(name.toLowerCase());

  if (indexOf("businessName") < 0) {
    return {
      leads: [],
      errors: [
        {
          row: 0,
          message: `Missing required header "businessName". Expected columns: ${CSV_LEAD_HEADERS.join(", ")}`,
        },
      ],
      skipped: 0,
    };
  }

  const dataLines = lines.slice(1);
  if (dataLines.length > MAX_ROWS) {
    return {
      leads: [],
      errors: [
        {
          row: 0,
          message: `Too many rows (${dataLines.length}). Max ${MAX_ROWS} leads per import.`,
        },
      ],
      skipped: 0,
    };
  }

  let skipped = 0;

  dataLines.forEach((line, idx) => {
    const rowNumber = idx + 1;
    const cells = parseCsvLine(line);
    const get = (name: CsvLeadHeader): string => {
      const i = indexOf(name);
      if (i < 0) return "";
      return (cells[i] ?? "").trim();
    };

    const businessName = get("businessName");
    if (!businessName) {
      errors.push({ row: rowNumber, message: "businessName is required" });
      skipped += 1;
      return;
    }
    if (businessName.length > MAX_BUSINESS_NAME_LENGTH) {
      errors.push({
        row: rowNumber,
        message: `businessName too long (${businessName.length} chars, max ${MAX_BUSINESS_NAME_LENGTH})`,
      });
      skipped += 1;
      return;
    }

    const category = parseCategory(get("category"));
    if (!category) {
      errors.push({
        row: rowNumber,
        message: `Invalid category "${get("category")}" (use restaurant|salon|trades|generic)`,
      });
      skipped += 1;
      return;
    }

    // Explicit slug column uses shared sanitizeLeadSlug (edge dashes stripped
    // + ≤63 DNS label) so CSV create-paths match addLead / checkout /
    // leadSlugAsDnsLabel. Missing or all-symbol slug columns fall back to
    // slugifyBusinessName (same sanitizer + "lead" fallback).
    // See create-path-slug-edge-dash-normalize + create-path-slug-dns-label-max-length.
    const explicitSlug = get("slug");
    let slug = explicitSlug
      ? sanitizeLeadSlug(explicitSlug)
      : slugifyBusinessName(businessName);
    if (!slug) {
      slug = slugifyBusinessName(businessName);
    }
    if (seenSlugs.has(slug)) {
      let suffix = 2;
      let candidate = slugWithCollisionSuffix(slug, suffix);
      while (seenSlugs.has(candidate)) {
        suffix += 1;
        candidate = slugWithCollisionSuffix(slug, suffix);
      }
      slug = candidate;
    }
    seenSlugs.add(slug);

    const servicesRaw = get("services");
    const services = servicesRaw
      ? servicesRaw
          .split(";")
          .map((s) => softCap(s.trim(), MAX_SERVICE_ITEM_LENGTH))
          .filter(Boolean)
          .slice(0, MAX_SERVICES)
      : ["Custom digital setup"];

    const hoursRaw = get("hours");
    const parsedHours = hoursRaw
      ? parseLeadHours(hoursRaw)
      : { weekday: "Mon–Fri 9am–5pm", weekend: "Sat–Sun Closed" };
    const hours = {
      weekday: softCap(parsedHours.weekday, MAX_HOURS_SEGMENT_LENGTH),
      weekend: softCap(parsedHours.weekend, MAX_HOURS_SEGMENT_LENGTH),
    };

    // Soft-cap remaining columns (description already capped). city/state/
    // address/phone/email/tagline/hours/service tokens land in public preview,
    // JSON-LD, and outreach — unbounded CSV cells are an abuse + payload risk
    // even though import is operator-gated (csv-import-remaining-field-length-caps).
    const city = softCap(get("city") || "Denver", MAX_CITY_LENGTH);
    const state = softCap(get("state") || "CO", MAX_STATE_LENGTH);
    const addressRaw = get("address");
    const address = addressRaw
      ? softCap(addressRaw, MAX_ADDRESS_LENGTH)
      : undefined;
    const phone = softCap(get("phone") || "(555) 000-0000", MAX_LEAD_PHONE_LENGTH);
    const emailRaw = get("email");
    const email = emailRaw ? softCap(emailRaw, MAX_LEAD_EMAIL_LENGTH) : undefined;
    const taglineRaw = get("tagline");
    const tagline = softCap(
      taglineRaw || defaultTagline(category),
      MAX_TAGLINE_LENGTH,
    );
    const descriptionRaw = get("description");
    const description = descriptionRaw
      ? softCap(descriptionRaw, MAX_DESCRIPTION_LENGTH)
      : `Preview site generated for ${businessName}. Claim it to connect your domain and go live.`;
    const recommendedTier = parseTier(get("recommendedTier"), category);

    leads.push({
      slug,
      businessName,
      category,
      city,
      state,
      address,
      tagline,
      description,
      phone,
      email,
      services,
      hours,
      stage: defaultStage,
      recommendedTier,
      dataSource,
    });
  });

  return { leads, errors, skipped };
}

/**
 * Split parsed CSV (or other create-path) leads into inserts vs collisions
 * against already-persisted slugs. Call-site only — does not change upsertLead.
 * CSV import skips collisions with a row warning; addLead returns an error.
 */
export function partitionLeadsByExistingSlugs<T extends { slug: string }>(
  candidates: T[],
  existingSlugs: ReadonlySet<string>,
): { fresh: T[]; collisions: T[] } {
  const fresh: T[] = [];
  const collisions: T[] = [];
  for (const lead of candidates) {
    if (existingSlugs.has(lead.slug)) {
      collisions.push(lead);
    } else {
      fresh.push(lead);
    }
  }
  return { fresh, collisions };
}

/** Operator-facing message when a create-path slug already exists in the DB. */
export function existingLeadSlugConflictMessage(slug: string): string {
  return `Lead already exists for slug "${slug}" — skipped to avoid overwriting pipeline state (stage, outreach, notes, snooze). Edit the existing lead instead.`;
}
