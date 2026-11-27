// /api/orgs/:orgId/projects/:projectId/lower-tier-waivers: the waivers the contractor collects from
// its own suppliers and sub-subcontractors, per pay app (services/payapps/lower-tier-waivers.ts).
// Every member reads (`?payAppId=` for one application's list); editors add, change and delete, on
// a plan with lien waivers (Crew and up).
import {
  lowerTierWaiverSchema,
  lowerTierWaiversBulkSchema,
  updateLowerTierWaiverSchema,
} from "@shared/api/schemas";
import { Hono } from "hono";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  createLowerTierWaiver,
  createLowerTierWaivers,
  deleteLowerTierWaiver,
  listLowerTierWaivers,
  updateLowerTierWaiver,
} from "../../services/payapps/lower-tier-waivers";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();
const editor = requireRole("editor");
const projectId = (c: { req: { param: (k: "projectId") => string | undefined } }) =>
  c.req.param("projectId") ?? "";

routes.get("/", async (c) =>
  c.json(
    await listLowerTierWaivers(
      c.var.ctx,
      c.var.tenant.orgId,
      projectId(c),
      c.req.query("payAppId") || undefined,
    ),
  ),
);

// Registered before "/:id" so the literal segment is never read as an id.
routes.post("/bulk", editor, validate("json", lowerTierWaiversBulkSchema), async (c) => {
  const body = c.req.valid("json");
  return c.json(
    await createLowerTierWaivers(
      c.var.ctx,
      c.var.tenant.orgId,
      projectId(c),
      body.payAppId,
      body.items,
      c.var.tenant.userId,
    ),
    201,
  );
});

routes.post("/", editor, validate("json", lowerTierWaiverSchema), async (c) =>
  c.json(
    await createLowerTierWaiver(
      c.var.ctx,
      c.var.tenant.orgId,
      projectId(c),
      c.req.valid("json"),
      c.var.tenant.userId,
    ),
    201,
  ),
);

routes.patch("/:id", editor, validate("json", updateLowerTierWaiverSchema), async (c) =>
  c.json(
    await updateLowerTierWaiver(
      c.var.ctx,
      c.var.tenant.orgId,
      projectId(c),
      c.req.param("id"),
      c.req.valid("json"),
    ),
  ),
);

routes.delete("/:id", editor, async (c) => {
  await deleteLowerTierWaiver(c.var.ctx, c.var.tenant.orgId, projectId(c), c.req.param("id"));
  return c.json({ ok: true });
});

export default routes;
