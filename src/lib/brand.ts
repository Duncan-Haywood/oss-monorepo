/**
 * Two-layer branding:
 * - Public brand (`brand.name`) — marketing, outreach, voice agent persona
 * - Legal entity (`brand.legalEntity`) — Stripe, contracts, compliance footers
 *
 * Set `NEXT_PUBLIC_BRAND_NAME` in `.env.local` before launch.
 */

export const BRAND_NAME_FALLBACK = "Your Brand";

function readBrandName(): string {
  const fromEnv = process.env.NEXT_PUBLIC_BRAND_NAME?.trim();
  if (fromEnv) return fromEnv;
  // Legacy env var support during migration
  const legacy = process.env.NEXT_PUBLIC_APP_NAME?.trim();
  if (legacy) return legacy;
  return BRAND_NAME_FALLBACK;
}

export const brand = {
  /** Customer-facing public brand (marketing, outreach, voice). */
  name: readBrandName(),
  /** True when NEXT_PUBLIC_BRAND_NAME is explicitly set. */
  isConfigured: Boolean(process.env.NEXT_PUBLIC_BRAND_NAME?.trim()),
  /** Legal entity for Stripe, contracts, and compliance. */
  legalEntity:
    process.env.NEXT_PUBLIC_LEGAL_ENTITY ??
    process.env.NEXT_PUBLIC_COMPANY_NAME ??
    "Maris Stella Labs",
  /** Legal entity location for footers and CAN-SPAM. */
  legalLocation:
    process.env.NEXT_PUBLIC_LEGAL_LOCATION ??
    process.env.NEXT_PUBLIC_COMPANY_LOCATION ??
    "Colorado, USA",
  /** DBA / trade name filed with Colorado SOS — set when registered. */
  dbaName: process.env.NEXT_PUBLIC_DBA_NAME?.trim() || null,
  /** CAN-SPAM requires a valid physical postal address in outreach emails. */
  postalAddress:
    process.env.NEXT_PUBLIC_COMPANY_ADDRESS ??
    "[Registered business address — Colorado, USA]",
  supportEmail:
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@marisstellalabs.com",
  emailFrom: process.env.EMAIL_FROM ?? "noreply@marisstellalabs.com",
} as const;

/** Marketing footer: public brand + legal parent company. */
export function marketingFooterLine(year = new Date().getFullYear()): string {
  return `© ${year} ${brand.name} · A ${brand.legalEntity} company · ${brand.legalLocation}`;
}

/** Legal-only line for invoices, terms, and compliance blocks. */
export function legalEntityLine(): string {
  return `${brand.legalEntity} · ${brand.legalLocation}`;
}

/** CAN-SPAM outreach sender block — legal entity must appear; brand is primary From name. */
export function outreachSenderLine(): string {
  return `${brand.name} · ${brand.legalEntity} · ${brand.legalLocation}`;
}
