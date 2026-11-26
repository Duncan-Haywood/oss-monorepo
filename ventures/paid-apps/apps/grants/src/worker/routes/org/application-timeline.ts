// OWNER: timeline — GET /api/orgs/:orgId/applications/:id/timeline?cursor=&limit=
// (mounted at /applications next to the pipeline's router). Viewer+ (the org router's base role).
// Chronological, cursor-paginated activity: who (AI / person / autopilot / system) did what.

import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../../lib/validate";
import { getApplicationTimeline, MAX_TIMELINE_LIMIT } from "../../services/timeline";
import type { AppEnv } from "../../types";

export const TimelineQuery = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_TIMELINE_LIMIT).optional(),
});

const routes = new Hono<AppEnv>().get(
  "/:id/timeline",
  validate("query", TimelineQuery),
  async (c) => {
    const q = c.req.valid("query");
    const body = await getApplicationTimeline(c.var.ctx, c.var.tenant.orgId, c.req.param("id"), q);
    return c.json(body, 200, { "Cache-Control": "private, no-store" });
  },
);

export default routes;
