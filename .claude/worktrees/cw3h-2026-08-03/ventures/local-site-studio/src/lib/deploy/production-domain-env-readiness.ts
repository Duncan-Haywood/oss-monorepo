/**
 * Operator-visible readiness for the production root domain.
 *
 * Stripe / Resend / Anthropic / digest / auth / APP_URL / brand banners already
 * cover payment, outbound transport, AI pack quality, digest destination, CRM
 * lock, canonical origin, and public brand copy. Without an explicit
 * NEXT_PUBLIC_PRODUCTION_DOMAIN, productionRootDomain() falls back to stripping
 * "preview." from NEXT_PUBLIC_PREVIEW_DOMAIN (or the localsitestudio.com
 * default) — handoff suggestedHost + DNS counseling silently advertise the
 * wrong root while APP_URL looks ready.
 *
 * Matches productionRootDomain()'s explicit-env preference in
 * src/lib/deploy/handoff.ts:
 *   missing or whitespace-only → treated as unset (falls through to preview
 *   root derivation).
 * Also flags localhost / 127.0.0.1 and example.com-style paste placeholders
 * that would otherwise look "set" while still pointing at a non-production
 * root.
 *
 * Pure: pass an env map in tests; production call sites use process.env.
 * Env presence only — does not resolve DNS and does not invent aggregates.
 * PREVIEW_DOMAIN fallback does not count as PRODUCTION_DOMAIN ready.
 */

export type EnvLike = NodeJS.ProcessEnv | Record<string, string | undefined>;

export const PRODUCTION_DOMAIN_ENV_NAMES = [
  "NEXT_PUBLIC_PRODUCTION_DOMAIN",
] as const;

export type ProductionDomainEnvName =
  (typeof PRODUCTION_DOMAIN_ENV_NAMES)[number];

export type ProductionDomainEnvReadiness = {
  /** True when NEXT_PUBLIC_PRODUCTION_DOMAIN is a usable production root. */
  ready: boolean;
  /** Canonical required env names. */
  required: readonly ProductionDomainEnvName[];
  /** Subset of required that are present and usable. */
  present: readonly ProductionDomainEnvName[];
  /** Subset of required that are missing, whitespace-only, localhost, or placeholder. */
  missing: readonly ProductionDomainEnvName[];
  /** True when NEXT_PUBLIC_PRODUCTION_DOMAIN would pass a production-root check. */
  productionDomainReady: boolean;
  /** True when the value is set but still localhost / 127.0.0.1. */
  localhostDetected: boolean;
  /** True when the value looks like a documented paste placeholder. */
  placeholderDetected: boolean;
};

/** Stable list of production-domain env names from launch checklist / .env.example. */
export function listRequiredProductionDomainEnvNames(): ProductionDomainEnvName[] {
  return [...PRODUCTION_DOMAIN_ENV_NAMES];
}

/**
 * True when the host is a local loopback root (never a production suggestedHost).
 * Accepts hostname with or without scheme/port.
 */
export function isProductionDomainLocalhost(trimmed: string): boolean {
  try {
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const host = new URL(withScheme).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host === "::1"
    );
  } catch {
    const lower = trimmed.toLowerCase();
    return (
      lower.includes("localhost") ||
      lower.includes("127.0.0.1") ||
      lower.includes("[::1]")
    );
  }
}

/** Documented .env.example / paste placeholders — not usable production roots. */
export function isProductionDomainPlaceholder(trimmed: string): boolean {
  const lower = trimmed.toLowerCase().replace(/\/$/, "");
  if (
    lower === "example.com" ||
    lower === "www.example.com" ||
    lower === "app.example.com" ||
    lower === "preview.example.com" ||
    lower === "yourdomain.com" ||
    lower === "your-domain.com" ||
    lower === "domain.com" ||
    lower === "localhost" ||
    lower === "changeme" ||
    lower === "todo" ||
    lower === "placeholder"
  ) {
    return true;
  }
  try {
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const host = new URL(withScheme).hostname.toLowerCase();
    return (
      host === "example.com" ||
      host.endsWith(".example.com") ||
      host === "yourdomain.com" ||
      host === "your-domain.com"
    );
  } catch {
    return (
      lower.includes("example.com") ||
      lower.includes("yourdomain.com") ||
      lower.includes("your-domain.com")
    );
  }
}

/**
 * Normalize a production-domain value to a bare hostname (no scheme/path/port).
 * Returns "" when the value cannot be parsed into a hostname.
 */
export function normalizeProductionDomainHost(trimmed: string): string {
  try {
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const host = new URL(withScheme).hostname.toLowerCase();
    return host.replace(/\.$/, "");
  } catch {
    return trimmed
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .split("/")[0]
      ?.split(":")[0]
      ?.replace(/\.$/, "") ?? "";
  }
}

/**
 * True when the value is a usable non-localhost production root hostname
 * (and not a documented placeholder). Bare hostnames preferred; schemes/paths
 * are stripped before validation.
 */
export function isProductionDomainConfigured(
  raw: string | undefined,
): boolean {
  if (typeof raw !== "string") {
    return false;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (isProductionDomainLocalhost(trimmed)) {
    return false;
  }
  if (isProductionDomainPlaceholder(trimmed)) {
    return false;
  }
  const host = normalizeProductionDomainHost(trimmed);
  if (!host || host.includes(" ") || !host.includes(".")) {
    return false;
  }
  // Reject multi-label preview-style roots that still look like the preview
  // subdomain (preview.*) — operators should set the bare production root.
  if (host.startsWith("preview.")) {
    return false;
  }
  return true;
}

/**
 * Assess whether the production root domain is configured for handoff hosts.
 * Env presence only — does not resolve DNS or call Vercel.
 * NEXT_PUBLIC_PREVIEW_DOMAIN alone does not count as ready.
 */
export function assessProductionDomainEnvReadiness(
  env: EnvLike = process.env,
): ProductionDomainEnvReadiness {
  const required = listRequiredProductionDomainEnvNames();
  const raw = env.NEXT_PUBLIC_PRODUCTION_DOMAIN;
  const trimmed =
    typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : "";
  const localhostDetected =
    trimmed.length > 0 && isProductionDomainLocalhost(trimmed);
  const placeholderDetected =
    trimmed.length > 0 &&
    !localhostDetected &&
    (isProductionDomainPlaceholder(trimmed) ||
      normalizeProductionDomainHost(trimmed).startsWith("preview."));
  const productionDomainReady = isProductionDomainConfigured(raw);
  const present: ProductionDomainEnvName[] = productionDomainReady
    ? ["NEXT_PUBLIC_PRODUCTION_DOMAIN"]
    : [];
  const missing: ProductionDomainEnvName[] = productionDomainReady
    ? []
    : ["NEXT_PUBLIC_PRODUCTION_DOMAIN"];
  return {
    ready: productionDomainReady,
    required,
    present,
    missing,
    productionDomainReady,
    localhostDetected,
    placeholderDetected,
  };
}
