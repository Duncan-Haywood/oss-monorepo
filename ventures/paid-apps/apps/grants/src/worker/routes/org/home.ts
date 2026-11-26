// OWNER: home — /api/orgs/:orgId/home: the org's personalized grant plan (services/home).
// Read-only; any member (viewer+) may call it. Actions are filtered to what the caller's role can do.
import { Hono } from "hono";
import { getHomePlan } from "../../services/home";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();

routes.get("/", async (c) => {
  const { orgId, role } = c.var.tenant;
  return c.json(await getHomePlan(c.var.ctx, { orgId, role, userName: c.var.user?.name ?? null }));
});

export default routes;
