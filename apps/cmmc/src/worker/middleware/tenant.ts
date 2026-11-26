// Tenant isolation: every /api/orgs/:orgId/* route runs behind requireOrg(), which verifies the
// signed-in user is a member of :orgId and exposes c.var.tenant. Services MUST scope every query
// by tenant.orgId, never by an id taken from the request body.
import { type MemberRole, ROLE_RANK } from "@shared/enums";
import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { member } from "../db/schema";
import { forbidden, notFound, unauthorized } from "../lib/errors";
import type { AppEnv } from "../types";

const roleRequired = (minRole: MemberRole) =>
  forbidden(`This action needs ${minRole} access. Ask an owner or admin of your organization.`);

export const requireOrg = (minRole: MemberRole = "viewer") =>
  createMiddleware<AppEnv>(async (c, next) => {
    const user = c.var.user;
    if (!user) throw unauthorized();
    const orgId = c.req.param("orgId");
    if (!orgId) throw notFound("Organization");
    const row = await c.var.ctx.db
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.organizationId, orgId), eq(member.userId, user.id)))
      .get();
    // 404 (not 403) so org ids cannot be probed.
    if (!row) throw notFound("Organization");
    const role = (row.role in ROLE_RANK ? row.role : "viewer") as MemberRole;
    if (ROLE_RANK[role] < ROLE_RANK[minRole]) throw roleRequired(minRole);
    c.set("tenant", { orgId, userId: user.id, role });
    await next();
  });

/** Use inside an org-scoped router for endpoints needing more than the router's base role. */
export const requireRole = (minRole: MemberRole) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const tenant = c.var.tenant;
    if (!tenant) throw unauthorized();
    if (ROLE_RANK[tenant.role] < ROLE_RANK[minRole]) throw roleRequired(minRole);
    await next();
  });
