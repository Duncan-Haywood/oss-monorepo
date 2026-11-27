// /api/orgs/:orgId/rfis: RFIs across the company's jobs (services/payapps/rfis.ts). Read-only, every
// member; the per-job log and its edits stay under /projects/:projectId/rfis.
import { Hono } from "hono";
import { listOverdueRfis } from "../../services/payapps/rfis";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();

/** Sent RFIs past their response date with no answer, on active jobs, most days overdue first. */
routes.get("/overdue", async (c) =>
  c.json({ items: await listOverdueRfis(c.var.ctx, c.var.tenant.orgId) }),
);

export default routes;
