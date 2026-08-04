/**
 * Operator-visible readiness for the shared Vercel project fallback.
 *
 * Vercel-token / production-domain / APP_URL banners already cover Domains API
 * auth and suggestedHost root. Without VERCEL_PROJECT_ID, tryProvisionVercelDomain
 * still skips the Domains API unless every handoff gets per-client Assign project
 * — paid handoffs stay awaiting_dns with manual notes while the token looks ready.
 *
 * Matches tryProvisionVercelDomain's project resolution in
 * src/lib/deploy/handoff.ts:
 *   handoff.vercelProjectId?.trim() || process.env.VERCEL_PROJECT_ID?.trim()
 *   missing or whitespace-only → treated as unset (skip when no per-handoff id).
 * Also flags documented paste placeholders (changeme / project / prj_xxx / xxx)
 * that would otherwise look "set" while still failing the Domains API path.
 *
 * Pure: pass an env map in tests; production call sites use process.env.
 * Env presence only — does not call Vercel and does not invent aggregates.
 * Does not replace per-handoff Assign project (that still wins when set).
 */

export type EnvLike = NodeJS.ProcessEnv | Record<string, string | undefined>;

export const VERCEL_PROJECT_ID_ENV_NAMES = ["VERCEL_PROJECT_ID"] as const;

export type VercelProjectIdEnvName =
  (typeof VERCEL_PROJECT_ID_ENV_NAMES)[number];

export type VercelProjectIdEnvReadiness = {
  /** True when VERCEL_PROJECT_ID is a usable non-placeholder shared project id. */
  ready: boolean;
  /** Canonical required env names. */
  required: readonly VercelProjectIdEnvName[];
  /** Subset of required that are present and usable. */
  present: readonly VercelProjectIdEnvName[];
  /** Subset of required that are missing, whitespace-only, or placeholder. */
  missing: readonly VercelProjectIdEnvName[];
  /** True when VERCEL_PROJECT_ID would enable shared-project Domains API fallback. */
  projectIdReady: boolean;
  /** True when the value looks like a documented paste placeholder. */
  placeholderDetected: boolean;
};

/** Stable list of Vercel project id env names from launch checklist / .env.example. */
export function listRequiredVercelProjectIdEnvNames(): VercelProjectIdEnvName[] {
  return [...VERCEL_PROJECT_ID_ENV_NAMES];
}

/** Documented paste placeholders — not usable production project ids. */
export function isVercelProjectIdPlaceholder(trimmed: string): boolean {
  const lower = trimmed.toLowerCase();
  if (
    lower === "changeme" ||
    lower === "project" ||
    lower === "project_id" ||
    lower === "project-id" ||
    lower === "your_project" ||
    lower === "your-project" ||
    lower === "your_project_id" ||
    lower === "your-project-id" ||
    lower === "vercel_project_id" ||
    lower === "prj_xxx" ||
    lower === "prj_changeme" ||
    lower === "xxx" ||
    lower === "placeholder"
  ) {
    return true;
  }
  if (
    lower.startsWith("changeme") ||
    lower.startsWith("your_project") ||
    lower.startsWith("your-project") ||
    lower.startsWith("prj_xxx") ||
    lower.startsWith("prj_changeme") ||
    lower.startsWith("xxx")
  ) {
    return true;
  }
  return false;
}

/**
 * True when the value would enable shared-project Domains API fallback (and is
 * not a documented placeholder). Matches tryProvisionVercelDomain's trim gate.
 */
export function isVercelProjectIdConfigured(raw: string | undefined): boolean {
  if (typeof raw !== "string") {
    return false;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (isVercelProjectIdPlaceholder(trimmed)) {
    return false;
  }
  return true;
}

/**
 * Assess whether shared VERCEL_PROJECT_ID fallback can leave the unconfigured
 * skip path. Env presence only — does not validate the id with Vercel.
 */
export function assessVercelProjectIdEnvReadiness(
  env: EnvLike = process.env,
): VercelProjectIdEnvReadiness {
  const required = listRequiredVercelProjectIdEnvNames();
  const raw = env.VERCEL_PROJECT_ID;
  const trimmed =
    typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : "";
  const placeholderDetected =
    trimmed.length > 0 && isVercelProjectIdPlaceholder(trimmed);
  const projectIdReady = isVercelProjectIdConfigured(raw);
  const present: VercelProjectIdEnvName[] = projectIdReady
    ? ["VERCEL_PROJECT_ID"]
    : [];
  const missing: VercelProjectIdEnvName[] = projectIdReady
    ? []
    : ["VERCEL_PROJECT_ID"];
  return {
    ready: projectIdReady,
    required,
    present,
    missing,
    projectIdReady,
    placeholderDetected,
  };
}
