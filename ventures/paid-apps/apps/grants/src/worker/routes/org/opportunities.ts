// OWNER: discovery agent — /api/orgs/:orgId/opportunities (browse catalog incl. private imports)

import { OPPORTUNITY_STATUSES } from "@shared/enums";
import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  confirmSubmissionEmail,
  getOpportunity,
  listOpportunities,
} from "../../services/discovery";
import type { AppEnv } from "../../types";

const ListQuery = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum([...OPPORTUNITY_STATUSES, "open", "all"]).optional(),
  closingWithinDays: z.coerce.number().int().min(0).max(3650).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const routes = new Hono<AppEnv>()
  .get("/", validate("query", ListQuery), async (c) => {
    const items = await listOpportunities(c.var.ctx, c.var.tenant.orgId, c.req.valid("query"));
    return c.json({ items });
  })
  .get("/:id", async (c) => {
    const opp = await getOpportunity(c.var.ctx, c.var.tenant.orgId, c.req.param("id"));
    return c.json(opp);
  })
  // Imported / watchlist emails are unverified until a person confirms them (submission channel).
  .post(
    "/:id/confirm-submission-email",
    requireRole("editor"),
    validate("json", z.object({ email: z.string().trim().min(3).max(320) })),
    async (c) => {
      const { orgId, userId } = c.var.tenant;
      const opp = await confirmSubmissionEmail(
        c.var.ctx,
        orgId,
        c.req.param("id"),
        c.req.valid("json").email,
        { userId, requestId: c.var.requestId },
      );
      return c.json(opp);
    },
  );

export default routes;
