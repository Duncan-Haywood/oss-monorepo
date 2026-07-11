/**
 * Operator-owned CSV → Lead parsing.
 * Accepts publicly known business contacts the operator already has —
 * not a substitute for Google Places (still gated on legal review).
 */

import type { BusinessCategory, Lead, LeadPipelineStage } from "./types";

export const CSV_LEAD_HEADERS = [
  "businessName",
  "email",
  "phone",
  "category",
  "city",
  "state",
  "slug",
  "recommendedTier",
  "tagline",
  "description",
  "services",
] as const;

export type CsvLeadHeader = (typeof CSV_LEAD_HEADERS)[number];

export interface CsvImportRowError {
  row: number;
  message: string;
}

export interface CsvImportResult {
  leads: Lead[];
  errors: CsvImportRowError[];
  skipped: number;
}

const CATEGORIES = new Set<BusinessCategory>(["restaurant", "salon", "trades", "generic"]);
const TIERS = new Set<"starter" | "growth" | "complete">(["starter", "growth", "complete"]);

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Minimal CSV line splitter — handles quoted fields with commas. */
export function splitCsvLine(line: string): string[] {
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
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function normalizeHeader(raw: string): string {
  return raw.trim().replace(/^\uFEFF/, "").toLowerCase();
}

const HEADER_ALIASES: Record<string, CsvLeadHeader> = {
  businessname: "businessName",
  business_name: "businessName",
  name: "businessName",
  email: "email",
  phone: "phone",
  category: "category",
  city: "city",
  state: "state",
  slug: "slug",
  recommendedtier: "recommendedTier",
  recommended_tier: "recommendedTier",
  tier: "recommendedTier",
  tagline: "tagline",
  description: "description",
  services: "services",
};

function defaultTagline(category: BusinessCategory): string {
  switch (category) {
    case "trades":
      return "Professional services you can count on";
    case "salon":
      return "Tailored styling and care";
    case "restaurant":
      return "Local favorites made fresh daily";
    case "generic":
      return "Your local business, online";
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

function defaultTier(category: BusinessCategory): "starter" | "growth" | "complete" {
  switch (category) {
    case "trades":
      return "starter";
    case "salon":
      return "complete";
    case "restaurant":
      return "growth";
    case "generic":
      return "starter";
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

/**
 * Parse operator CSV text into Lead objects.
 * Header row required. `businessName` is required per data row.
 */
export function parseLeadCsv(csvText: string): CsvImportResult {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { leads: [], errors: [{ row: 0, message: "CSV is empty" }], skipped: 0 };
  }

  const headerFields = splitCsvLine(lines[0] ?? "").map(normalizeHeader);
  const columnMap: Array<CsvLeadHeader | null> = headerFields.map(
    (h) => HEADER_ALIASES[h] ?? null
  );

  if (!columnMap.includes("businessName")) {
    return {
      leads: [],
      errors: [
        {
          row: 1,
          message:
            "Missing required column businessName (aliases: name, business_name). Expected header row.",
        },
      ],
      skipped: 0,
    };
  }

  const leads: Lead[] = [];
  const errors: CsvImportRowError[] = [];
  const seenSlugs = new Set<string>();
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const values = splitCsvLine(lines[i] ?? "");
    const record: Partial<Record<CsvLeadHeader, string>> = {};

    columnMap.forEach((key, idx) => {
      if (key) {
        record[key] = values[idx] ?? "";
      }
    });

    const businessName = (record.businessName ?? "").trim();
    if (!businessName) {
      skipped += 1;
      errors.push({ row: rowNum, message: "Skipped: empty businessName" });
      continue;
    }

    const rawCategory = (record.category ?? "generic").trim().toLowerCase();
    const category: BusinessCategory = CATEGORIES.has(rawCategory as BusinessCategory)
      ? (rawCategory as BusinessCategory)
      : "generic";

    const rawTier = (record.recommendedTier ?? "").trim().toLowerCase();
    const recommendedTier = TIERS.has(rawTier as "starter" | "growth" | "complete")
      ? (rawTier as "starter" | "growth" | "complete")
      : defaultTier(category);

    let slug = slugify(record.slug?.trim() || businessName);
    if (!slug) {
      errors.push({ row: rowNum, message: "Could not derive slug from businessName" });
      skipped += 1;
      continue;
    }
    if (seenSlugs.has(slug)) {
      slug = `${slug}-${rowNum}`;
    }
    seenSlugs.add(slug);

    const services = (record.services ?? "")
      .split(/[|;]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const stage: LeadPipelineStage = "discovered";
    const email = record.email?.trim() || undefined;
    const phone = record.phone?.trim() || "(555) 000-0000";
    const city = record.city?.trim() || "Denver";
    const state = record.state?.trim() || "CO";
    const tagline = record.tagline?.trim() || defaultTagline(category);
    const description =
      record.description?.trim() ||
      `Preview site drafted for ${businessName}. Claim it to connect your domain, contact form, and marketing.`;

    leads.push({
      slug,
      businessName,
      category,
      city,
      state,
      tagline,
      description,
      phone,
      email,
      services: services.length > 0 ? services : ["Custom digital setup"],
      hours: {
        weekday: "Mon–Fri 9am–5pm",
        weekend: "Sat 9am–2pm · Closed Sun",
      },
      stage,
      recommendedTier,
    });
  }

  return { leads, errors, skipped };
}

export const CSV_TEMPLATE = `businessName,email,phone,category,city,state,slug,recommendedTier,services
Blue River Salon,hello@blueriversalon.example,(303) 555-0101,salon,Denver,CO,blue-river-salon,complete,"Hair cut|Color|Blowout"
Peak Plumbing,info@peakplumbing.example,(720) 555-0199,trades,Boulder,CO,peak-plumbing,starter,"Drain cleaning|Water heaters"
`;
