// GET /api/orgs/:orgId -> org + caller's role; PATCH (admin) renames; GET /export (admin) downloads every
// record as one JSON file; DELETE (owner) erases everything, once no paid plan is left to renew.
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { organization } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import { endRenewalConsents } from "../../services/billing/renewal-consents";
import { getSubscription } from "../../services/billing/service";
import { deletionBlocker, exportShop } from "../../services/books/shop-data";
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

// The whole shop as JSON. Admins and the owner only: it carries every member's email address.
routes.get("/export", requireRole("admin"), async (c) => {
  const { orgId } = c.var.tenant;
  const data = await exportShop(c.var.ctx, orgId);
  if (!data) throw notFound("Organization");
  c.var.ctx.logger.info("org.exported", { orgId, counts: data.counts });
  const day = data.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="seller-books-export-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
});

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
      throw badRequest("Type the shop's name to confirm.");
    const sub = await getSubscription(c.var.ctx, orgId);
    const blocker = deletionBlocker(sub);
    if (blocker) throw conflict(blocker);
    // A shop can only be deleted once nothing renews, so any consent record still open ends now, or
    // at the paid period's end when the plan runs to it; the record is kept apart from the shop for
    // California's retention period (billing/renewal-consents.ts). The provider's later "canceled"
    // event finds no shop, so this is the only place that end is recorded.
    const now = c.var.ctx.now();
    const periodEnd = sub?.status !== "canceled" ? sub?.currentPeriodEnd : null;
    await endRenewalConsents(c.var.ctx, { orgId }, periodEnd && periodEnd > now ? periodEnd : now);
    await c.var.ctx.db.delete(organization).where(eq(organization.id, orgId));
    c.var.ctx.logger.info("org.deleted", { orgId });
    return c.json({ ok: true });
  },
);

export default routes;
