// /api/orgs/:orgId/billing — plan, usage and limits (any member); checkout and portal (admins).
import { checkoutSchema } from "@shared/api/schemas";
import { Hono } from "hono";
import { unauthorized } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import { billingSummary, startCheckout, startPortal } from "../../services/billing";
import type { AppEnv } from "../../types";

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
