// Platform admin gate for /api/admin/*. A platform admin is a signed-in user with a VERIFIED email
// that appears in PLATFORM_ADMIN_EMAILS (comma-separated, case-insensitive). Unset or empty var:
// nobody is an admin. Runs after sessionMiddleware.
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { forbidden, unauthorized } from "../lib/errors";
import { audit } from "../services/privacy/audit";
import { isPlatformAdmin } from "../services/watchlist";
import type { AppEnv, SessionUser } from "../types";

/** Pure check (also used by GET /api/me to expose `isPlatformAdmin`). */
export function isPlatformAdminUser(
  env: { PLATFORM_ADMIN_EMAILS?: string },
  user: Pick<SessionUser, "email" | "emailVerified"> | null | undefined,
): boolean {
  if (!user?.emailVerified) return false;
  return isPlatformAdmin(env, user.email);
}

export const requirePlatformAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.var.user;
  if (!user) throw unauthorized();
  if (!isPlatformAdminUser(c.env, user)) {
    c.var.ctx.logger.warn("admin.denied", { userId: user.id });
    throw forbidden("Platform admin access required");
  }
  await next();
});

export interface AdminAuditEntry {
  /** Without the `admin.` prefix, e.g. "comp_granted" -> "admin.comp_granted". */
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Records a platform admin action in the platform audit trail: orgId is always null (so it never
 * shows up in, or is deleted with, a tenant's own audit log); the target org goes in targetId.
 */
export async function auditAdmin(c: Context<AppEnv>, e: AdminAuditEntry): Promise<void> {
  await audit(c.var.ctx, {
    orgId: null,
    actorType: "user",
    actorId: c.var.user?.id ?? null,
    action: `admin.${e.action}`,
    targetType: e.targetType,
    targetId: e.targetId,
    metadata: e.metadata,
    requestId: c.var.requestId,
  });
}
