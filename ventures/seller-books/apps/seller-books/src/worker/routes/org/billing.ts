// /api/orgs/:orgId/billing: plan, usage and limits (any member); checkout and portal (admins).
import { Hono } from "hono";
import { z } from "zod";
import { unauthorized } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import { billingSummary, startCheckout, startPortal } from "../../services/billing/service";
import type { AppEnv } from "../../types";

const checkoutSchema = z.object({
  plan: z.string().min(1).max(32),
  interval: z.enum(["month", "year"]).default("month"),
  promoCode: z
    .string()
    .trim()
    .max(64)
    .regex(/^[A-Za-z0-9_-]*$/)
    .optional()
    .transform((v) => v || undefined),
});

const routes = new Hono<AppEnv>();

routes.get("/", async (c) => c.json(await billingSummary(c.var.ctx, c.var.tenant.orgId)));

routes.post("/checkout", requireRole("admin"), validate("json", checkoutSchema), async (c) => {
  const user = c.var.user;
  if (!user) throw unauthorized();
  return c.json(await startCheckout(c.var.ctx, c.var.tenant, user.email, c.req.valid("json")));
});

routes.post("/portal", requireRole("admin"), async (c) =>
  c.json(await startPortal(c.var.ctx, c.var.tenant.orgId)),
);

export default routes;
