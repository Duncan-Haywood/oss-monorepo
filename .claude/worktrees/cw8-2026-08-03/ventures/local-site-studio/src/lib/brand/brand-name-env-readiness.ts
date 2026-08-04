/**
 * Operator-visible readiness for the public brand name.
 *
 * Stripe / Resend / Anthropic / digest / auth banners already cover payment,
 * outbound transport, AI pack quality, digest destination, and CRM lock.
 * Without NEXT_PUBLIC_BRAND_NAME, brand.name falls back to "Your Brand" on
 * every outreach From display name, marketing footer, voice intro, and CAN-SPAM
 * sender line — operators can look "send-ready" while customer-facing copy
 * still reads as an unconfigured placeholder.
 *
 * Matches brand.isConfigured in src/lib/brand.ts:
 *   missing or whitespace-only NEXT_PUBLIC_BRAND_NAME → not ready
 *   (legacy NEXT_PUBLIC_APP_NAME does not count — launch checklist requires
 *   the public brand var).
 * Also flags documented paste placeholders (Your Brand / Brand Name / etc.)
 * that would otherwise look "set" while remaining customer-facing placeholders.
 *
 * Pure: pass an env map in tests; production call sites use process.env.
 * Does not invent optional aggregates. Local demos may leave this unset —
 * the banner is the early production signal before the first outreach batch.
 */

export type EnvLike = NodeJS.ProcessEnv | Record<string, string | undefined>;

export const BRAND_NAME_ENV_NAMES = ["NEXT_PUBLIC_BRAND_NAME"] as const;

export type BrandNameEnvName = (typeof BRAND_NAME_ENV_NAMES)[number];

export type BrandNameEnvReadiness = {
  /** True when NEXT_PUBLIC_BRAND_NAME is a non-placeholder public brand. */
  ready: boolean;
  /** Canonical required env names. */
  required: readonly BrandNameEnvName[];
  /** Subset of required that are present and usable. */
  present: readonly BrandNameEnvName[];
  /** Subset of required that are missing, whitespace-only, or placeholder. */
  missing: readonly BrandNameEnvName[];
  /** True when a non-placeholder brand name is configured. */
  brandNameReady: boolean;
  /** True when the value looks like a documented placeholder, not a real brand. */
  placeholderDetected: boolean;
};

/** Stable list of brand env names from launch checklist / .env.example. */
export function listRequiredBrandNameEnvNames(): BrandNameEnvName[] {
  return [...BRAND_NAME_ENV_NAMES];
}

/** Documented paste placeholders — not usable customer-facing brand names. */
export function isBrandNamePlaceholder(trimmed: string): boolean {
  const lower = trimmed.toLowerCase();
  if (
    lower === "your brand" ||
    lower === "your-brand" ||
    lower === "brand name" ||
    lower === "your company" ||
    lower === "company name" ||
    lower === "acme" ||
    lower === "example" ||
    lower === "todo" ||
    lower === "changeme" ||
    lower === "placeholder"
  ) {
    return true;
  }
  if (
    lower.startsWith("your brand") ||
    lower.startsWith("brand name") ||
    lower.startsWith("changeme")
  ) {
    return true;
  }
  return false;
}

/**
 * True when NEXT_PUBLIC_BRAND_NAME is set to a non-placeholder value
 * (matching brand.isConfigured + placeholder rejection).
 */
export function isBrandNameConfigured(raw: string | undefined): boolean {
  if (typeof raw !== "string") {
    return false;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (isBrandNamePlaceholder(trimmed)) {
    return false;
  }
  return true;
}

/**
 * Assess whether the public brand name is ready for customer-facing sends.
 * Env presence only — does not validate trademark or length beyond placeholders.
 */
export function assessBrandNameEnvReadiness(
  env: EnvLike = process.env,
): BrandNameEnvReadiness {
  const required = listRequiredBrandNameEnvNames();
  const raw = env.NEXT_PUBLIC_BRAND_NAME;
  const trimmed =
    typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : "";
  const placeholderDetected =
    trimmed.length > 0 && isBrandNamePlaceholder(trimmed);
  const brandNameReady = isBrandNameConfigured(raw);
  const present: BrandNameEnvName[] = brandNameReady
    ? ["NEXT_PUBLIC_BRAND_NAME"]
    : [];
  const missing: BrandNameEnvName[] = brandNameReady
    ? []
    : ["NEXT_PUBLIC_BRAND_NAME"];
  return {
    ready: brandNameReady,
    required,
    present,
    missing,
    brandNameReady,
    placeholderDetected,
  };
}
