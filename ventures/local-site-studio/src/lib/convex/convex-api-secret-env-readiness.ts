/**
 * Operator-visible readiness for the Convex API shared secret.
 *
 * ConvexUrlEnvBanner already covers a missing/placeholder NEXT_PUBLIC_CONVEX_URL.
 * This helper covers the next blocker: every convex/*.ts public query/mutation
 * is protected by requireApiSecret (convex/lib/apiSecret.ts), so once the URL
 * is configured, an unset server-only CONVEX_API_SECRET makes every Convex
 * call throw and silently fall back to instance-local SQLite (same
 * degraded-but-safe path as any other Convex outage) with no other dashboard
 * signal — see convex-public-function-api-secret in prompt_process.tsx.
 *
 * Matches src/lib/db.ts client init: `process.env.CONVEX_API_SECRET ?? ""`.
 * Only relevant once NEXT_PUBLIC_CONVEX_URL is itself configured — hidden
 * (ready) otherwise, since ConvexUrlEnvBanner already owns that case.
 *
 * Pure: pass an env map in tests; production call sites use process.env.
 * Env presence only — does not call Convex and cannot verify the secret
 * actually matches the value configured on the Convex deployment itself
 * (that would require a live round-trip call, out of scope for a
 * login/dashboard-load readiness check).
 */

import { isConvexUrlConfigured } from "./convex-url-env-readiness";

export type EnvLike = NodeJS.ProcessEnv | Record<string, string | undefined>;

export const CONVEX_API_SECRET_ENV_NAMES = ["CONVEX_API_SECRET"] as const;

export type ConvexApiSecretEnvName =
  (typeof CONVEX_API_SECRET_ENV_NAMES)[number];

export type ConvexApiSecretEnvReadiness = {
  /** True when the secret is set, or NEXT_PUBLIC_CONVEX_URL isn't configured (not relevant). */
  ready: boolean;
  /** Canonical required env names. */
  required: readonly ConvexApiSecretEnvName[];
  /** Subset of required that are present. */
  present: readonly ConvexApiSecretEnvName[];
  /** Subset of required that are missing or whitespace-only. */
  missing: readonly ConvexApiSecretEnvName[];
  /** True when NEXT_PUBLIC_CONVEX_URL is itself a usable, non-placeholder deployment URL. */
  convexUrlConfigured: boolean;
  /** True when CONVEX_API_SECRET is non-empty after trim. */
  apiSecretConfigured: boolean;
};

function envValuePresent(env: EnvLike, name: string): boolean {
  const raw = env[name];
  return typeof raw === "string" && raw.trim().length > 0;
}

/** Stable list of Convex API secret env names from launch checklist / .env.example. */
export function listRequiredConvexApiSecretEnvNames(): ConvexApiSecretEnvName[] {
  return [...CONVEX_API_SECRET_ENV_NAMES];
}

/**
 * Assess whether CONVEX_API_SECRET is set given NEXT_PUBLIC_CONVEX_URL's
 * own readiness. Env presence only — does not validate the secret against
 * the Convex deployment and does not fake-complete a live round-trip check.
 */
export function assessConvexApiSecretEnvReadiness(
  env: EnvLike = process.env,
): ConvexApiSecretEnvReadiness {
  const required = listRequiredConvexApiSecretEnvNames();
  const convexUrlConfigured = isConvexUrlConfigured(env.NEXT_PUBLIC_CONVEX_URL);
  const apiSecretConfigured = envValuePresent(env, "CONVEX_API_SECRET");
  const present: ConvexApiSecretEnvName[] = apiSecretConfigured
    ? ["CONVEX_API_SECRET"]
    : [];
  const missing: ConvexApiSecretEnvName[] = apiSecretConfigured
    ? []
    : ["CONVEX_API_SECRET"];
  return {
    ready: !convexUrlConfigured || apiSecretConfigured,
    required,
    present,
    missing,
    convexUrlConfigured,
    apiSecretConfigured,
  };
}
