// OWNER: watchlist — /api/orgs/:orgId/watchlist (funder pages checked politely for new RFPs)

import { Hono } from "hono";
import { z } from "zod";
import { WATCH_SOURCE_KINDS } from "../../db/schema/watchlist";
import { forbidden } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  createSource,
  deleteSource,
  isPlatformAdmin,
  listEvents,
  listSources,
  requestManualCheck,
  toDto,
  updateSource,
  WATCH_LIMITS,
} from "../../services/watchlist";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();

const interval = z
  .number()
  .int()
  .min(WATCH_LIMITS.minIntervalHours)
  .max(WATCH_LIMITS.maxIntervalHours);

const createBody = z.object({
  url: z.string().trim().min(4).max(2048),
  label: z.string().trim().max(200).optional(),
  funderName: z.string().trim().max(200).optional(),
  kind: z.enum(WATCH_SOURCE_KINDS).optional(),
  checkIntervalHours: interval.optional(),
  /** "platform" (platform admins only) shares the source read-only with every org. */
  scope: z.enum(["org", "platform"]).optional(),
});

const patchBody = z
  .object({
    status: z.enum(["active", "paused"]).optional(),
    checkIntervalHours: interval.optional(),
    label: z.string().trim().max(200).nullable().optional(),
    funderName: z.string().trim().max(200).nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "Nothing to update" });

const eventsQuery = z.object({
  sourceId: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const adminOf = (c: { env: AppEnv["Bindings"]; var: { user: AppEnv["Variables"]["user"] } }) =>
  isPlatformAdmin(c.env, c.var.user?.email ?? null);

routes.get("/", async (c) => {
  const platformAdmin = adminOf(c);
  const rows = await listSources(c.var.ctx, c.var.tenant.orgId);
  return c.json({ items: rows.map((r) => toDto(r, { platformAdmin })) });
});

routes.get("/events", validate("query", eventsQuery), async (c) => {
  const q = c.req.valid("query");
  const items = await listEvents(c.var.ctx, c.var.tenant.orgId, q);
  return c.json({ items });
});

routes.post("/", requireRole("editor"), validate("json", createBody), async (c) => {
  const body = c.req.valid("json");
  const platformAdmin = adminOf(c);
  if (body.scope === "platform" && !platformAdmin) {
    throw forbidden("Only platform admins can add platform-curated sources");
  }
  const row = await createSource(c.var.ctx, {
    orgId: body.scope === "platform" ? null : c.var.tenant.orgId,
    actingOrgId: c.var.tenant.orgId,
    userId: c.var.tenant.userId,
    url: body.url,
    label: body.label ?? null,
    funderName: body.funderName ?? null,
    ...(body.kind ? { kind: body.kind } : {}),
    ...(body.checkIntervalHours ? { checkIntervalHours: body.checkIntervalHours } : {}),
  });
  return c.json(toDto(row, { platformAdmin }), 201);
});

routes.patch("/:id", requireRole("editor"), validate("json", patchBody), async (c) => {
  const platformAdmin = adminOf(c);
  const row = await updateSource(
    c.var.ctx,
    c.var.tenant.orgId,
    c.req.param("id"),
    c.req.valid("json"),
    {
      platformAdmin,
      userId: c.var.tenant.userId,
    },
  );
  return c.json(toDto(row, { platformAdmin }));
});

routes.delete("/:id", requireRole("editor"), async (c) => {
  await deleteSource(c.var.ctx, c.var.tenant.orgId, c.req.param("id"), {
    platformAdmin: adminOf(c),
    userId: c.var.tenant.userId,
  });
  return c.json({ deleted: true });
});

routes.post("/:id/check", requireRole("editor"), async (c) => {
  const res = await requestManualCheck(c.var.ctx, c.var.tenant.orgId, c.req.param("id"), {
    platformAdmin: adminOf(c),
  });
  return c.json(res);
});

export default routes;
