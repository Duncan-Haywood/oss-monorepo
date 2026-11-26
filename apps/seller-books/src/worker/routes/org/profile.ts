// GET /api/orgs/:orgId -> org + caller's role; PATCH (admin) renames; DELETE (owner) erases everything.
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { organization } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();

routes.get("/", async (c) => {
  const { orgId, role } = c.var.tenant;
  const org = await c.var.ctx.db
    .select()
    .from(organization)
    .where(eq(organization.id, orgId))
    .get();
  if (!org) throw notFound("Organization");
  return c.json({ org: { id: org.id, name: org.name }, role });
});

routes.patch(
  "/",
  requireRole("admin"),
  validate("json", z.object({ name: z.string().trim().min(1).max(120) })),
  async (c) => {
    const { orgId } = c.var.tenant;
    await c.var.ctx.db
      .update(organization)
      .set({ name: c.req.valid("json").name })
      .where(eq(organization.id, orgId));
    return c.json({ ok: true });
  },
);

routes.delete(
  "/",
  requireRole("owner"),
  validate("json", z.object({ confirmName: z.string() })),
  async (c) => {
    const { orgId } = c.var.tenant;
    const org = await c.var.ctx.db
      .select()
      .from(organization)
      .where(eq(organization.id, orgId))
      .get();
    if (!org) throw notFound("Organization");
    if (c.req.valid("json").confirmName.trim() !== org.name)
      throw badRequest("Type the organization name to confirm.");
    await c.var.ctx.db.delete(organization).where(eq(organization.id, orgId));
    c.var.ctx.logger.info("org.deleted", { orgId });
    return c.json({ ok: true });
  },
);

export default routes;
