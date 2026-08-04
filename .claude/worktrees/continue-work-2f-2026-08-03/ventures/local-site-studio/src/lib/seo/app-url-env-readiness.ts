/**
 * Operator-visible readiness for the canonical public app origin.
 *
 * Stripe / Resend / Anthropic / digest / auth banners already cover payment,
 * outbound transport, AI pack quality, digest destination, and dashboard lock.
 * Without a real NEXT_PUBLIC_APP_URL, checkout cancel/success URLs, digest
 * dashboard links, unsubscribe/footer canonicals, email preview links, and
 * SEO siteUrl() silently fall back to request origin or localhost — wrong
 * links once Stripe/Resend secrets are live.
 *
 * Matches siteUrl() / handoff / resend call-site gates:
 *   missing or whitespace-only → treated as unset (falls through to
 *   VERCEL_URL or localhost).
 * Also flags localhost / 127.0.0.1 (the .env.example default) and
 * example.com-style paste placeholders that would otherwise look "set"
 * while still pointing at a non-production origin.
 *
 * Pure: pass an env map in tests; production call sites use process.env.
 * Env presence only — does not resolve DNS and does not invent aggregates.
 */

export type EnvLike = NodeJS.ProcessEnv | Record<string, string | undefined>;

export const APP_URL_ENV_NAMES = ["NEXT_PUBLIC_APP_URL"] as const;

export type AppUrlEnvName = (typeof APP_URL_ENV_NAMES)[number];

export type AppUrlEnvReadiness = {
  /** True when NEXT_PUBLIC_APP_URL is a non-localhost public origin. */
  ready: boolean;
  /** Canonical required env names. */
  required: readonly AppUrlEnvName[];
  /** Subset of required that are present and usable. */
  present: readonly AppUrlEnvName[];
  /** Subset of required that are missing, whitespace-only, localhost, or placeholder. */
  missing: readonly AppUrlEnvName[];
  /** True when NEXT_PUBLIC_APP_URL would pass a production-origin check. */
  appUrlReady: boolean;
  /** True when the value is set but still localhost / 127.0.0.1. */
  localhostDetected: boolean;
  /** True when the value looks like a documented paste placeholder. */
  placeholderDetected: boolean;
};

/** Stable list of app-URL env names from launch checklist / .env.example. */
export function listRequiredAppUrlEnvNames(): AppUrlEnvName[] {
  return [...APP_URL_ENV_NAMES];
}

/**
 * True when the host is a local loopback origin (the .env.example default).
 * Accepts hostname with or without port after URL parse.
 */
export function isAppUrlLocalhost(trimmed: string): boolean {
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

/** Documented .env.example / paste placeholders — not usable production origins. */
export function isAppUrlPlaceholder(trimmed: string): boolean {
  const lower = trimmed.toLowerCase().replace(/\/$/, "");
  if (
    lower === "https://example.com" ||
    lower === "http://example.com" ||
    lower === "https://www.example.com" ||
    lower === "http://www.example.com" ||
    lower === "https://app.example.com" ||
    lower === "http://app.example.com" ||
    lower === "example.com" ||
    lower === "app.example.com"
  ) {
    return true;
  }
  try {
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const host = new URL(withScheme).hostname.toLowerCase();
    return host === "example.com" || host.endsWith(".example.com");
  } catch {
    return lower.includes("example.com");
  }
}

/**
 * True when the value is a usable non-localhost public origin (and not a
 * documented placeholder).
 */
export function isAppUrlConfigured(raw: string | undefined): boolean {
  if (typeof raw !== "string") {
    return false;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (isAppUrlLocalhost(trimmed)) {
    return false;
  }
  if (isAppUrlPlaceholder(trimmed)) {
    return false;
  }
  try {
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(withScheme);
    return Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Assess whether the canonical public app origin is configured for production.
 * Env presence only — does not resolve DNS or call Stripe/Resend.
 */
export function assessAppUrlEnvReadiness(
  env: EnvLike = process.env,
): AppUrlEnvReadiness {
  const required = listRequiredAppUrlEnvNames();
  const raw = env.NEXT_PUBLIC_APP_URL;
  const trimmed =
    typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : "";
  const localhostDetected =
    trimmed.length > 0 && isAppUrlLocalhost(trimmed);
  const placeholderDetected =
    trimmed.length > 0 && !localhostDetected && isAppUrlPlaceholder(trimmed);
  const appUrlReady = isAppUrlConfigured(raw);
  const present: AppUrlEnvName[] = appUrlReady ? ["NEXT_PUBLIC_APP_URL"] : [];
  const missing: AppUrlEnvName[] = appUrlReady ? [] : ["NEXT_PUBLIC_APP_URL"];
  return {
    ready: appUrlReady,
    required,
    present,
    missing,
    appUrlReady,
    localhostDetected,
    placeholderDetected,
  };
}
