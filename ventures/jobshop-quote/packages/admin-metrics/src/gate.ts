// The platform-admin gate, shared by every product. Two ways in, both server-enforced:
//   1. A signed-in user whose VERIFIED email is in PLATFORM_ADMIN_EMAILS (comma-separated,
//      case-insensitive; unset or empty = nobody). Same rule as apps/grants.
//   2. The owner console's service credential: `Authorization: Bearer <ADMIN_SERVICE_TOKEN>`.
//      Unset, or shorter than MIN_SERVICE_TOKEN_LENGTH, = the bearer path is closed.
// Neither value is ever committed; .github/workflows/set-admins.yml stores them on the workers.

export const MIN_SERVICE_TOKEN_LENGTH = 32;

/** Parsed, lower-cased admin email list. */
export function parseAdminEmails(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

/** True only for a verified email on the list. */
export function isPlatformAdminEmail(
  raw: string | null | undefined,
  user: { email?: string | null; emailVerified?: boolean | null } | null | undefined,
): boolean {
  if (!user?.emailVerified || !user.email) return false;
  return parseAdminEmails(raw).includes(user.email.trim().toLowerCase());
}

/** The token from an `Authorization: Bearer …` header, or null. */
export function bearerToken(header: string | null | undefined): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
  return m?.[1] ?? null;
}

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

/**
 * Constant-time check of a presented token against the configured one (both hashed first, so the
 * comparison never depends on the secret's length). False when the secret is unset or too short.
 */
export async function verifyServiceToken(
  presented: string | null | undefined,
  configured: string | null | undefined,
): Promise<boolean> {
  if (!presented || !configured || configured.length < MIN_SERVICE_TOKEN_LENGTH) return false;
  const [a, b] = await Promise.all([sha256(presented), sha256(configured)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/**
 * "full": metrics + per-person account lists (platform admins, the owner console).
 * "metrics": aggregate metrics only (ADMIN_METRICS_TOKEN, for agents measuring progress); never
 * the account lists, which carry names and emails.
 */
export type AdminScope = "full" | "metrics";

export type AdminActor =
  | { type: "user"; userId: string; scope: "full" }
  | { type: "service"; name: string; scope: AdminScope };

/** Service name recorded in audit rows for the read-only metrics token. */
export const ADMIN_METRICS_ACTOR = "metrics-agent";

/**
 * What each actor may call under /api/admin: a platform admin (person) anything the router offers;
 * the console's service token reads only (GET); the metrics token only GET …/metrics. Enforced in
 * every product's gate, so a token can never reach an admin write (e.g. grants' comp grant).
 */
export function adminActorMayAccess(actor: AdminActor, method: string, path: string): boolean {
  if (actor.type === "user") return true;
  const read = method === "GET" || method === "HEAD";
  if (!read) return false;
  if (actor.scope === "full") return true;
  return /\/metrics\/?$/.test(path);
}

/** May this actor read per-person data (GET /api/admin/accounts)? */
export const canReadAccounts = (actor: AdminActor): boolean => actor.scope === "full";

/**
 * Which scope a presented bearer token grants: the console's ADMIN_SERVICE_TOKEN → "full", the
 * agents' ADMIN_METRICS_TOKEN → "metrics", anything else → null. Both secrets follow the same
 * rules (≥ MIN_SERVICE_TOKEN_LENGTH, unset = closed). For the sites, which have no sign-in.
 */
export async function serviceTokenScope(
  presented: string | null | undefined,
  tokens: { serviceToken?: string | null; metricsToken?: string | null },
): Promise<AdminScope | null> {
  if (!presented) return null;
  const [full, metrics] = await Promise.all([
    verifyServiceToken(presented, tokens.serviceToken),
    verifyServiceToken(presented, tokens.metricsToken),
  ]);
  if (full) return "full";
  return metrics ? "metrics" : null;
}

/**
 * Decides who (if anyone) may read /api/admin/*. A bearer header that is present but wrong is a
 * denial even when a session would pass, so a leaked-and-rotated token is never silently ignored.
 */
export async function resolveAdminActor(input: {
  authorization: string | null | undefined;
  serviceToken: string | null | undefined;
  /** ADMIN_METRICS_TOKEN: read-only, aggregate metrics only. */
  metricsToken?: string | null | undefined;
  adminEmails: string | null | undefined;
  user: { id: string; email?: string | null; emailVerified?: boolean | null } | null | undefined;
  serviceName?: string;
}): Promise<AdminActor | null> {
  const presented = bearerToken(input.authorization);
  if (presented) {
    const scope = await serviceTokenScope(presented, {
      serviceToken: input.serviceToken,
      metricsToken: input.metricsToken,
    });
    if (scope === "full")
      return { type: "service", name: input.serviceName ?? "admin-console", scope };
    if (scope === "metrics") return { type: "service", name: ADMIN_METRICS_ACTOR, scope };
    return null;
  }
  if (input.user && isPlatformAdminEmail(input.adminEmails, input.user)) {
    return { type: "user", userId: input.user.id, scope: "full" };
  }
  return null;
}
