/**
 * Two-layer branding:
 * - Public brand (`brand.name`) — marketing, outreach, voice agent persona
 * - Legal entity (`brand.legalEntity`) — Stripe, contracts, compliance footers
 *
 * Set `NEXT_PUBLIC_BRAND_NAME` in `.env.local` before launch.
 *
 * Values are read via getters so env is evaluated at access time (Vitest can
 * flip vars between cases; whitespace-only counts as unset, matching
 * price-env-readiness).
 */

export const BRAND_NAME_FALLBACK = "Your Brand";
export const LEGAL_ENTITY_FALLBACK = "Maris Stella Labs";
export const LEGAL_LOCATION_FALLBACK = "Colorado, USA";
export const POSTAL_ADDRESS_FALLBACK =
  "[Registered business address — Colorado, USA]";
export const SUPPORT_EMAIL_FALLBACK = "support@marisstella.app";
export const EMAIL_FROM_FALLBACK = "noreply@marisstella.app";

/** Trim and treat whitespace-only as unset. */
function envTrimmed(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readBrandName(): string {
  const fromEnv = envTrimmed("NEXT_PUBLIC_BRAND_NAME");
  if (fromEnv) return fromEnv;
  // Legacy env var support during migration
  const legacy = envTrimmed("NEXT_PUBLIC_APP_NAME");
  if (legacy) return legacy;
  return BRAND_NAME_FALLBACK;
}

function readLegalEntity(): string {
  return (
    envTrimmed("NEXT_PUBLIC_LEGAL_ENTITY") ??
    envTrimmed("NEXT_PUBLIC_COMPANY_NAME") ??
    LEGAL_ENTITY_FALLBACK
  );
}

function readLegalLocation(): string {
  return (
    envTrimmed("NEXT_PUBLIC_LEGAL_LOCATION") ??
    envTrimmed("NEXT_PUBLIC_COMPANY_LOCATION") ??
    LEGAL_LOCATION_FALLBACK
  );
}

function readPostalAddress(): string {
  return envTrimmed("NEXT_PUBLIC_COMPANY_ADDRESS") ?? POSTAL_ADDRESS_FALLBACK;
}

export const brand = {
  /** Customer-facing public brand (marketing, outreach, voice). */
  get name(): string {
    return readBrandName();
  },
  /** True when NEXT_PUBLIC_BRAND_NAME is explicitly set (not legacy APP_NAME). */
  get isConfigured(): boolean {
    return Boolean(envTrimmed("NEXT_PUBLIC_BRAND_NAME"));
  },
  /** Legal entity for Stripe, contracts, and compliance. */
  get legalEntity(): string {
    return readLegalEntity();
  },
  /** Legal entity location for footers and CAN-SPAM. */
  get legalLocation(): string {
    return readLegalLocation();
  },
  /** DBA / trade name filed with Colorado SOS — set when registered. */
  get dbaName(): string | null {
    return envTrimmed("NEXT_PUBLIC_DBA_NAME") ?? null;
  },
  /** CAN-SPAM requires a valid physical postal address in outreach emails. */
  get postalAddress(): string {
    return readPostalAddress();
  },
  get supportEmail(): string {
    return envTrimmed("NEXT_PUBLIC_SUPPORT_EMAIL") ?? SUPPORT_EMAIL_FALLBACK;
  },
  get emailFrom(): string {
    return envTrimmed("EMAIL_FROM") ?? EMAIL_FROM_FALLBACK;
  },
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
