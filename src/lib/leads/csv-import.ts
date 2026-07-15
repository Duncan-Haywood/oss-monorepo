/**
 * CSV → Lead parsing for operator bulk import.
 * See /docs/compliance (document data source) and backlog item csv-lead-import.
 */

import type { BusinessCategory, Lead, LeadPipelineStage } from "./types";
import { parseLeadHours } from "./sqlite-row-mapping";
import { sanitizeLeadSlug } from "./slug";

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
const MAX_BUSINESS_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_SERVICES = 100;

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

export function slugifyBusinessName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "lead";
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

    // Explicit slug column uses shared sanitizeLeadSlug (edge dashes stripped)
    // so CSV create-paths match addLead / checkout / DNS labels. Missing or
    // all-symbol slug columns fall back to slugifyBusinessName (already strips
    // edges and returns "lead" when empty). See create-path-slug-edge-dash-normalize.
    const explicitSlug = get("slug");
    let slug = explicitSlug
      ? sanitizeLeadSlug(explicitSlug)
      : slugifyBusinessName(businessName);
    if (!slug) {
      slug = slugifyBusinessName(businessName);
    }
    if (seenSlugs.has(slug)) {
      let suffix = 2;
      while (seenSlugs.has(`${slug}-${suffix}`)) suffix += 1;
      slug = `${slug}-${suffix}`;
    }
    seenSlugs.add(slug);

    const servicesRaw = get("services");
    const services = servicesRaw
      ? servicesRaw
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, MAX_SERVICES)
      : ["Custom digital setup"];

    const hoursRaw = get("hours");
    const hours = hoursRaw ? parseLeadHours(hoursRaw) : { weekday: "Mon–Fri 9am–5pm", weekend: "Sat–Sun Closed" };

    const city = get("city") || "Denver";
    const state = get("state") || "CO";
    const address = get("address") || undefined;
    const phone = get("phone") || "(555) 000-0000";
    const email = get("email") || undefined;
    const tagline = get("tagline") || defaultTagline(category);
    const descriptionRaw = get("description");
    const description = descriptionRaw
      ? descriptionRaw.slice(0, MAX_DESCRIPTION_LENGTH)
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
