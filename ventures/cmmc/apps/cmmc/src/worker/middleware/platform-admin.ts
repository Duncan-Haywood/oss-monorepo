// Platform admin gate for /api/admin/* (packages/admin-metrics gate.ts). Two ways in, both checked
// here on the server:
//   - a signed-in user whose VERIFIED email is in PLATFORM_ADMIN_EMAILS (same rule as apps/grants);
//   - the owner console (apps/admin): `Authorization: Bearer <ADMIN_SERVICE_TOKEN>`.
// Both secrets are set on the worker by .github/workflows/set-admins.yml; unset = nobody gets in.
// Runs after sessionMiddleware. Every admin read is written to admin_audit_log (auditAdmin).
import {
  type AdminActor,
  adminActorMayAccess,
  canReadAccounts,
  resolveAdminActor,
} from "@admin-metrics";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { adminAuditLog } from "../db/schema";
import { forbidden, unauthorized } from "../lib/errors";
import { newId } from "../lib/ids";
import type { AppEnv } from "../types";

const actors = new WeakMap<Request, AdminActor>();

export const requirePlatformAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const authorization = c.req.header("Authorization");
  const actor = await resolveAdminActor({
    authorization,
    serviceToken: c.env.ADMIN_SERVICE_TOKEN,
    metricsToken: c.env.ADMIN_METRICS_TOKEN,
    adminEmails: c.env.PLATFORM_ADMIN_EMAILS,
    user: c.var.user,
  });
  if (!actor) {
    c.var.ctx.logger.warn("admin.denied", {
      userId: c.var.user?.id ?? null,
      bearer: Boolean(authorization),
    });
    if (!c.var.user && !authorization) throw unauthorized();
    throw forbidden("Platform admin access required");
  }
  // Tokens are read-only, and the agents' metrics token reaches GET …/metrics only.
  if (!adminActorMayAccess(actor, c.req.method, c.req.path)) {
    c.var.ctx.logger.warn("admin.scope_denied", {
      actor: actor.type === "service" ? actor.name : "user",
    });
    throw forbidden("This credential may not call this admin endpoint");
  }
  actors.set(c.req.raw, actor);
  await next();
});

/** Writes one platform audit row (no org id: it is never part of a tenant's data). */
/**
 * The account lists carry names and emails: refuse them to the read-only metrics token
 * (ADMIN_METRICS_TOKEN, for agents), which may read aggregate metrics only.
 */
export function assertCanReadAccounts(c: Context<AppEnv>): void {
  const actor = actors.get(c.req.raw);
  if (!actor || !canReadAccounts(actor)) {
    throw forbidden("This credential may read aggregate metrics only");
  }
}

export async function auditAdmin(
  c: Context<AppEnv>,
  action: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const actor = actors.get(c.req.raw);
  if (!actor) throw new Error("auditAdmin outside requirePlatformAdmin");
  await c.var.ctx.db.insert(adminAuditLog).values({
    id: newId("aal"),
    actorType: actor.type,
    actorId: actor.type === "user" ? actor.userId : actor.name,
    action: `admin.${action}`,
    metadata: metadata ?? null,
  });
}
