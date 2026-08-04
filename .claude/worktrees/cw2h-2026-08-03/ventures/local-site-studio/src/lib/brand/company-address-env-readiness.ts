/**
 * Operator-visible readiness for the CAN-SPAM physical postal address.
 *
 * Brand-name / Resend / digest banners already cover public brand copy, outbound
 * transport, and digest destination. Without NEXT_PUBLIC_COMPANY_ADDRESS,
 * brand.postalAddress falls back to the documented bracket stub
 * "[Registered business address — Colorado, USA]" on every outreach CAN-SPAM
 * footer — operators can look "send-ready" while compliant physical-address
 * disclosure is still a placeholder.
 *
 * Matches brand.postalAddress / readPostalAddress in src/lib/brand.ts:
 *   missing or whitespace-only → POSTAL_ADDRESS_FALLBACK
 * Also flags the documented fallback itself and paste placeholders
 * (Registered business address / your address / etc.) that would otherwise
 * look "set" while remaining non-compliant.
 *
 * Pure: pass an env map in tests; production call sites use process.env.
 * Env presence only — does not geocode or validate USPS. Does not invent
 * optional aggregates.
 */

import { POSTAL_ADDRESS_FALLBACK } from "@/lib/brand";

export type EnvLike = NodeJS.ProcessEnv | Record<string, string | undefined>;

export const COMPANY_ADDRESS_ENV_NAMES = [
  "NEXT_PUBLIC_COMPANY_ADDRESS",
] as const;

export type CompanyAddressEnvName = (typeof COMPANY_ADDRESS_ENV_NAMES)[number];

export type CompanyAddressEnvReadiness = {
  /** True when NEXT_PUBLIC_COMPANY_ADDRESS is a non-placeholder postal address. */
  ready: boolean;
  /** Canonical required env names. */
  required: readonly CompanyAddressEnvName[];
  /** Subset of required that are present and usable. */
  present: readonly CompanyAddressEnvName[];
  /** Subset of required that are missing, whitespace-only, or placeholder. */
  missing: readonly CompanyAddressEnvName[];
  /** True when a non-placeholder postal address is configured. */
  companyAddressReady: boolean;
  /** True when the value looks like a documented placeholder, not a real address. */
  placeholderDetected: boolean;
};

/** Stable list of company-address env names from launch checklist / .env.example. */
export function listRequiredCompanyAddressEnvNames(): CompanyAddressEnvName[] {
  return [...COMPANY_ADDRESS_ENV_NAMES];
}

/** Documented paste / fallback placeholders — not usable CAN-SPAM addresses. */
export function isCompanyAddressPlaceholder(trimmed: string): boolean {
  const lower = trimmed.toLowerCase();
  if (trimmed === POSTAL_ADDRESS_FALLBACK) {
    return true;
  }
  if (
    lower === "registered business address — colorado, usa" ||
    lower === "registered business address - colorado, usa" ||
    lower === "registered business address" ||
    lower === "your address" ||
    lower === "your business address" ||
    lower === "business address" ||
    lower === "address here" ||
    lower === "todo" ||
    lower === "changeme" ||
    lower === "placeholder" ||
    lower === "xxx" ||
    lower === "n/a" ||
    lower === "tbd"
  ) {
    return true;
  }
  if (
    lower.startsWith("[registered business address") ||
    lower.startsWith("registered business address") ||
    lower.startsWith("your address") ||
    lower.startsWith("your business address") ||
    lower.startsWith("changeme") ||
    lower.startsWith("todo")
  ) {
    return true;
  }
  // Bracket-wrapped stubs are never a filed postal address.
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return true;
  }
  return false;
}

/**
 * True when NEXT_PUBLIC_COMPANY_ADDRESS is set to a non-placeholder value
 * (matching brand.postalAddress's env preference + placeholder rejection).
 */
export function isCompanyAddressConfigured(raw: string | undefined): boolean {
  if (typeof raw !== "string") {
    return false;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (isCompanyAddressPlaceholder(trimmed)) {
    return false;
  }
  return true;
}

/**
 * Assess whether the CAN-SPAM postal address is ready for outreach footers.
 * Env presence only — does not validate deliverability or jurisdiction.
 */
export function assessCompanyAddressEnvReadiness(
  env: EnvLike = process.env,
): CompanyAddressEnvReadiness {
  const required = listRequiredCompanyAddressEnvNames();
  const raw = env.NEXT_PUBLIC_COMPANY_ADDRESS;
  const trimmed =
    typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : "";
  const placeholderDetected =
    trimmed.length > 0 && isCompanyAddressPlaceholder(trimmed);
  const companyAddressReady = isCompanyAddressConfigured(raw);
  const present: CompanyAddressEnvName[] = companyAddressReady
    ? ["NEXT_PUBLIC_COMPANY_ADDRESS"]
    : [];
  const missing: CompanyAddressEnvName[] = companyAddressReady
    ? []
    : ["NEXT_PUBLIC_COMPANY_ADDRESS"];
  return {
    ready: companyAddressReady,
    required,
    present,
    missing,
    companyAddressReady,
    placeholderDetected,
  };
}
