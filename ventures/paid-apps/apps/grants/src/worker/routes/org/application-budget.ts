// OWNER: budgets — /api/orgs/:orgId/applications/:id/budget (mounted at /applications next to the
// pipeline's router). GET: viewer+ (the org router's base role). PUT / propose: editor+, audited.
import { Hono } from "hono";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  BudgetPut,
  getBudget,
  ProposeBody,
  proposeBudget,
  saveBudget,
} from "../../services/budgets";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>()
  .get("/:id/budget", async (c) => {
    const ids = { orgId: c.var.tenant.orgId, applicationId: c.req.param("id") };
    return c.json(await getBudget(c.var.ctx, ids));
  })
  .put("/:id/budget", requireRole("editor"), validate("json", BudgetPut), async (c) => {
    const { orgId, userId } = c.var.tenant;
    const ids = { orgId, applicationId: c.req.param("id") };
    const actor = { userId, requestId: c.var.requestId };
    return c.json(await saveBudget(c.var.ctx, ids, c.req.valid("json"), actor));
  })
  .post("/:id/budget/propose", requireRole("editor"), validate("json", ProposeBody), async (c) => {
    const { orgId, userId } = c.var.tenant;
    const ids = { orgId, applicationId: c.req.param("id") };
    const actor = { userId, requestId: c.var.requestId };
    return c.json(await proposeBudget(c.var.ctx, ids, c.req.valid("json"), actor));
  });

export default routes;
