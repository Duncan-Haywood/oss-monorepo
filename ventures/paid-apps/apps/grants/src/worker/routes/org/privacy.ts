// OWNER: privacy agent — /api/orgs/:orgId/privacy (consents, audit log, exports, delete org)

import { CONSENT_SCOPES } from "@shared/enums";
import { and, desc, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { dataExports, organization } from "../../db/schema";
import { AppError, badRequest, conflict, forbidden, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import { enqueue } from "../../queues/enqueue";
import { audit } from "../../services/privacy/audit";
import { listAuditLog } from "../../services/privacy/audit-log";
import {
  canSetScope,
  clientMeta,
  listConsents,
  recordConsent,
} from "../../services/privacy/consents";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();

// --- consents --------------------------------------------------------------------------------

routes.get("/consents", async (c) => {
  const { orgId, userId } = c.var.tenant;
  return c.json(await listConsents(c.var.ctx, orgId, userId));
});

routes.post(
  "/consents",
  validate("json", z.object({ scope: z.enum(CONSENT_SCOPES), granted: z.boolean() })),
  async (c) => {
    const { orgId, userId, role } = c.var.tenant;
    const { scope, granted } = c.req.valid("json");
    if (!canSetScope(role, scope)) throw forbidden("Only admins can change organization consents");
    const meta = clientMeta(c.req.raw.headers);
    const row = await recordConsent(c.var.ctx, {
      orgId,
      userId,
      scope,
      granted,
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestId: c.var.requestId,
    });
    return c.json(row, 201);
  },
);

// --- audit log -------------------------------------------------------------------------------

routes.get(
  "/audit-log",
  requireRole("admin"),
  validate(
    "query",
    z.object({ cursor: z.string().max(200).optional(), limit: z.coerce.number().optional() }),
  ),
  async (c) => {
    const q = c.req.valid("query");
    return c.json(await listAuditLog(c.var.ctx, c.var.tenant.orgId, q));
  },
);

// --- exports ---------------------------------------------------------------------------------

routes.get("/exports", requireRole("admin"), async (c) => {
  const items = await c.var.ctx.db
    .select()
    .from(dataExports)
    .where(eq(dataExports.orgId, c.var.tenant.orgId))
    .orderBy(desc(dataExports.createdAt))
    .limit(50)
    .all();
  return c.json({ items });
});

routes.post("/exports", requireRole("admin"), async (c) => {
  const ctx = c.var.ctx;
  const { orgId, userId } = c.var.tenant;
  const recent = await ctx.db
    .select({ id: dataExports.id })
    .from(dataExports)
    .where(
      and(
        eq(dataExports.orgId, orgId),
        eq(dataExports.status, "pending"),
        gt(dataExports.createdAt, new Date(ctx.now().getTime() - 10 * 60_000)),
      ),
    )
    .get();
  if (recent) throw conflict("An export is already being prepared");
  const id = newId("exp");
  await ctx.db
    .insert(dataExports)
    .values({ id, orgId, requestedBy: userId, status: "pending", createdAt: ctx.now() });
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: userId,
    action: "privacy.export_requested",
    targetType: "data_export",
    targetId: id,
    requestId: c.var.requestId,
  });
  await enqueue(ctx, { type: "privacy.export_org", orgId, exportId: id });
  const row = await ctx.db
    .select()
    .from(dataExports)
    .where(and(eq(dataExports.id, id), eq(dataExports.orgId, orgId)))
    .get();
  return c.json(row, 201);
});

routes.get("/exports/:id", requireRole("admin"), async (c) => {
  const row = await c.var.ctx.db
    .select()
    .from(dataExports)
    .where(and(eq(dataExports.id, c.req.param("id")), eq(dataExports.orgId, c.var.tenant.orgId)))
    .get();
  if (!row) throw notFound("Export");
  return c.json(row);
});

routes.get("/exports/:id/download", requireRole("admin"), async (c) => {
  const ctx = c.var.ctx;
  const { orgId, userId } = c.var.tenant;
  const row = await ctx.db
    .select()
    .from(dataExports)
    .where(and(eq(dataExports.id, c.req.param("id")), eq(dataExports.orgId, orgId)))
    .get();
  if (!row) throw notFound("Export");
  if (row.status === "expired" || (row.expiresAt && row.expiresAt <= ctx.now())) {
    throw new AppError(410, "expired", "This export has expired. Create a new one.");
  }
  if (row.status !== "ready" || !row.r2Key) throw conflict("Export is not ready yet");
  if (!row.r2Key.startsWith(`orgs/${orgId}/`)) throw notFound("Export");
  const obj = await ctx.env.FILES.get(row.r2Key);
  if (!obj) throw notFound("Export");
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: userId,
    action: "privacy.export_downloaded",
    targetType: "data_export",
    targetId: row.id,
    requestId: c.var.requestId,
  });
  const date = row.createdAt.toISOString().slice(0, 10);
  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(obj.size),
      "Content-Disposition": `attachment; filename="grant-autopilot-export-${date}-${row.id}.zip"`,
      "Cache-Control": "no-store",
    },
  });
});

// --- delete organization ---------------------------------------------------------------------

routes.delete(
  "/org",
  requireRole("owner"),
  validate("json", z.object({ confirmName: z.string().max(500) })),
  async (c) => {
    const ctx = c.var.ctx;
    const { orgId, userId } = c.var.tenant;
    const org = await ctx.db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, orgId))
      .get();
    if (!org) throw notFound("Organization");
    if (c.req.valid("json").confirmName.trim() !== org.name.trim()) {
      throw badRequest("Type the organization's exact name to confirm deletion");
    }
    await audit(ctx, {
      orgId,
      actorType: "user",
      actorId: userId,
      action: "organization.deletion_requested",
      targetType: "organization",
      targetId: orgId,
      requestId: c.var.requestId,
    });
    await enqueue(ctx, { type: "privacy.delete_org", orgId, requestedBy: userId });
    return c.json({ queued: true }, 202);
  },
);

export default routes;
