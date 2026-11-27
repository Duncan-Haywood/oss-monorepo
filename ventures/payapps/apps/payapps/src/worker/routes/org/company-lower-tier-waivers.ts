// /api/orgs/:orgId/lower-tier-waivers: lower-tier waivers across the company's jobs
// (services/payapps/lower-tier-waivers.ts). Read-only, every member on every plan (a downgrade keeps
// the record); the per-pay-app list and its edits stay under /projects/:projectId/lower-tier-waivers.
import { Hono } from "hono";
import { listLowerTierToChase } from "../../services/payapps/lower-tier-waivers";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();

/** Pay applications on active jobs with a lower-tier waiver not yet received, longest wait first. */
routes.get("/outstanding", async (c) =>
  c.json({ items: await listLowerTierToChase(c.var.ctx, c.var.tenant.orgId) }),
);

export default routes;
