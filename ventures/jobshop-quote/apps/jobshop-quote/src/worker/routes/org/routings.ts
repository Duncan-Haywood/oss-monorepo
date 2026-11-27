// Routing templates. Mounted under /api/orgs/:orgId/routings behind requireOrg("viewer"); viewers
// can list them (the quote editor shows them), writes need "estimator".
import { routingCreateSchema, routingPatchSchema } from "@shared/routings";
import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  createRouting,
  deleteRouting,
  listRoutings,
  suggestRoutingsFor,
  updateRouting,
} from "../../services/routings";
import type { AppEnv } from "../../types";

const est = requireRole("estimator");

const suggestQuerySchema = z
  .object({
    materialId: z.string().max(64).optional(),
    description: z.string().max(2000).optional(),
    lineId: z.string().max(64).optional(),
  })
  .strict();

export const routingRoutes = new Hono<AppEnv>()
  .get("/", async (c) => c.json({ items: await listRoutings(c.var.ctx, c.var.tenant.orgId) }))
  // Before "/:routingId" routes; read-only, so viewers may call it like the list.
  .get("/suggestions", validate("query", suggestQuerySchema), async (c) => {
    const q = c.req.valid("query");
    return c.json(
      await suggestRoutingsFor(c.var.ctx, c.var.tenant.orgId, {
        materialId: q.materialId || null,
        description: q.description || null,
        lineId: q.lineId || null,
      }),
    );
  })
  .post("/", est, validate("json", routingCreateSchema), async (c) =>
    c.json(
      await createRouting(c.var.ctx, c.var.tenant.orgId, c.var.tenant.userId, c.req.valid("json")),
      201,
    ),
  )
  .patch("/:routingId", est, validate("json", routingPatchSchema), async (c) =>
    c.json(
      await updateRouting(
        c.var.ctx,
        c.var.tenant.orgId,
        c.req.param("routingId"),
        c.req.valid("json"),
      ),
    ),
  )
  .delete("/:routingId", est, async (c) => {
    await deleteRouting(c.var.ctx, c.var.tenant.orgId, c.req.param("routingId"));
    return c.json({ ok: true });
  });
