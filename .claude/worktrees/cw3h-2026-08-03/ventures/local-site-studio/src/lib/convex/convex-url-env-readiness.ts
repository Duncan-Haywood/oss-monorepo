/**
 * Operator-visible readiness for the Convex deployment URL.
 *
 * Stripe / Resend / Vercel / brand banners already cover payment, outbound,
 * Domains API, and CAN-SPAM. Without a real NEXT_PUBLIC_CONVEX_URL, every
 * serverless / multi-instance deploy keeps the SQLite-only path — payments,
 * CRM, handoffs, and inquiries write to instance-local SQLite while other
 * instances (and Convex-first readers) never see them.
 *
 * Matches src/lib/db.ts client init:
 *   missing or whitespace-only → no ConvexHttpClient (SQLite-only).
 * Also flags documented paste placeholders that would otherwise look "set"
 * while still failing every Convex call.
 *
 * Pure: pass an env map in tests; production call sites use process.env.
 * Env presence only — does not ping Convex and does not invent aggregates.
 * Does not fake-complete Places / Buffer / Connect / Price bootstrap.
 */

export type EnvLike = NodeJS.ProcessEnv | Record<string, string | undefined>;

export const CONVEX_URL_ENV_NAMES = ["NEXT_PUBLIC_CONVEX_URL"] as const;

export type ConvexUrlEnvName = (typeof CONVEX_URL_ENV_NAMES)[number];

export type ConvexUrlEnvReadiness = {
  /** True when NEXT_PUBLIC_CONVEX_URL is a usable non-placeholder deployment URL. */
  ready: boolean;
  /** Canonical required env names. */
  required: readonly ConvexUrlEnvName[];
  /** Subset of required that are present and usable. */
  present: readonly ConvexUrlEnvName[];
  /** Subset of required that are missing, whitespace-only, or placeholder. */
  missing: readonly ConvexUrlEnvName[];
  /** True when NEXT_PUBLIC_CONVEX_URL would enable Convex-first persistence. */
  convexUrlReady: boolean;
  /** True when the value looks like a documented paste placeholder. */
  placeholderDetected: boolean;
};

/** Stable list of Convex URL env names from launch checklist / .env.example. */
export function listRequiredConvexUrlEnvNames(): ConvexUrlEnvName[] {
  return [...CONVEX_URL_ENV_NAMES];
}

/** Documented paste placeholders — not usable Convex deployment URLs. */
export function isConvexUrlPlaceholder(trimmed: string): boolean {
  const lower = trimmed.toLowerCase().replace(/\/$/, "");
  if (
    lower === "changeme" ||
    lower === "placeholder" ||
    lower === "xxx" ||
    lower === "your_convex_url" ||
    lower === "your-convex-url" ||
    lower === "convex_url" ||
    lower === "https://example.convex.cloud" ||
    lower === "http://example.convex.cloud" ||
    lower === "https://your-deployment.convex.cloud" ||
    lower === "http://your-deployment.convex.cloud" ||
    lower === "https://xxx.convex.cloud" ||
    lower === "http://xxx.convex.cloud"
  ) {
    return true;
  }
  if (
    lower.startsWith("changeme") ||
    lower.startsWith("your_convex") ||
    lower.startsWith("your-convex") ||
    lower.startsWith("xxx")
  ) {
    return true;
  }
  try {
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const host = new URL(withScheme).hostname.toLowerCase();
    if (
      host === "example.convex.cloud" ||
      host === "your-deployment.convex.cloud" ||
      host === "xxx.convex.cloud" ||
      host === "example.com" ||
      host.endsWith(".example.com")
    ) {
      return true;
    }
  } catch {
    // Fall through to substring checks below.
  }
  return (
    lower.includes("example.convex.cloud") ||
    lower.includes("your-deployment.convex.cloud")
  );
}

/**
 * Trim + placeholder gate shared by readiness and db.ts client init.
 * Returns null when Convex should stay disabled (SQLite-only).
 */
export function resolveConvexDeploymentUrl(
  raw: string | undefined,
): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (isConvexUrlPlaceholder(trimmed)) {
    return null;
  }
  return trimmed;
}

/**
 * True when the value would enable Convex-first persistence (and is not a
 * documented placeholder). Matches resolveConvexDeploymentUrl.
 */
export function isConvexUrlConfigured(raw: string | undefined): boolean {
  return resolveConvexDeploymentUrl(raw) !== null;
}

/**
 * Assess whether NEXT_PUBLIC_CONVEX_URL can leave the SQLite-only path.
 * Env presence only — does not validate the deployment with Convex.
 */
export function assessConvexUrlEnvReadiness(
  env: EnvLike = process.env,
): ConvexUrlEnvReadiness {
  const required = listRequiredConvexUrlEnvNames();
  const raw = env.NEXT_PUBLIC_CONVEX_URL;
  const trimmed =
    typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : "";
  const placeholderDetected =
    trimmed.length > 0 && isConvexUrlPlaceholder(trimmed);
  const convexUrlReady = isConvexUrlConfigured(raw);
  const present: ConvexUrlEnvName[] = convexUrlReady
    ? ["NEXT_PUBLIC_CONVEX_URL"]
    : [];
  const missing: ConvexUrlEnvName[] = convexUrlReady
    ? []
    : ["NEXT_PUBLIC_CONVEX_URL"];
  return {
    ready: convexUrlReady,
    required,
    present,
    missing,
    convexUrlReady,
    placeholderDetected,
  };
}
