// /api/orgs/:orgId/submittals: submittals across the company's jobs
// (services/payapps/submittals.ts). Read-only, every member; the per-job log and its edits stay
// under /projects/:projectId/submittals.
import { submittalLogQuerySchema } from "@shared/api/schemas";
import { Hono } from "hono";
import { validate } from "../../lib/validate";
import { isoDay } from "../../services/payapps/cash";
import { listSubmittalsToChase } from "../../services/payapps/submittals";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();

/**
 * Submittals overdue back from the GC, late to send, or returned for resubmittal, on active jobs,
 * delivery-at-risk first. `?today=` is the browser's date, so the list turns over at the user's
 * midnight like the job's own log; the server's date otherwise.
 */
routes.get("/to-chase", validate("query", submittalLogQuerySchema), async (c) => {
  const today = c.req.valid("query").today ?? isoDay(c.var.ctx.now());
  return c.json({ items: await listSubmittalsToChase(c.var.ctx, c.var.tenant.orgId, today) });
});

export default routes;
