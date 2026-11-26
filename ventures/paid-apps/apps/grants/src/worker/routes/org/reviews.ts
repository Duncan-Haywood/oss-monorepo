// OWNER: pipeline agent — /api/orgs/:orgId/reviews (queue, approve/one-click, request changes, feedback)

import { REVIEW_DECISIONS } from "@shared/enums";
import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import { submitReviewDecision } from "../../services/pipeline";
import { addFeedback, FeedbackInput, listFeedback, reviewQueue } from "../../services/review";
import type { AppEnv } from "../../types";

const DecisionBody = z.object({
  decision: z.enum(REVIEW_DECISIONS),
  comments: z.string().max(10_000).optional(),
});

const routes = new Hono<AppEnv>()
  .get("/queue", async (c) => {
    return c.json({ items: await reviewQueue(c.var.ctx, c.var.tenant.orgId) });
  })
  .post(
    "/:applicationId/decision",
    requireRole("reviewer"),
    validate("json", DecisionBody),
    async (c) => {
      const { orgId, userId } = c.var.tenant;
      const body = c.req.valid("json");
      const app = await submitReviewDecision(c.var.ctx, {
        orgId,
        applicationId: c.req.param("applicationId"),
        reviewerId: userId,
        decision: body.decision,
        comments: body.comments,
        requestId: c.var.requestId,
      });
      return c.json(app);
    },
  )
  .post(
    "/:applicationId/feedback",
    requireRole("reviewer"),
    validate("json", FeedbackInput),
    async (c) => {
      const { orgId, userId } = c.var.tenant;
      const row = await addFeedback(c.var.ctx, {
        orgId,
        applicationId: c.req.param("applicationId"),
        userId,
        requestId: c.var.requestId,
        ...c.req.valid("json"),
      });
      return c.json(row, 201);
    },
  )
  .get("/:applicationId/feedback", async (c) => {
    const items = await listFeedback(c.var.ctx, c.var.tenant.orgId, c.req.param("applicationId"));
    return c.json({ items });
  });

export default routes;
