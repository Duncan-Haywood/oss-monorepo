// OWNER: digest — mounted at org root: /api/orgs/:orgId/email-preferences and /digest/preview
import { Hono } from "hono";
import { z } from "zod";
import { requireRole } from "../../middleware/tenant";
import {
  buildWeeklyDigest,
  getEmailPreferences,
  updateEmailPreferences,
} from "../../services/digest";
import { jsonBody } from "../../services/orgs/validate";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();

const preferencesPatch = z
  .object({ weeklyDigest: z.boolean(), deadlineReminders: z.boolean() })
  .partial()
  .strict();

/** The caller's own preferences for this org (any member). */
routes.get("/email-preferences", async (c) => {
  const { orgId, userId } = c.var.tenant;
  return c.json(await getEmailPreferences(c.var.ctx, orgId, userId));
});

routes.put("/email-preferences", jsonBody(preferencesPatch), async (c) => {
  const { orgId, userId } = c.var.tenant;
  return c.json(await updateEmailPreferences(c.var.ctx, orgId, userId, c.req.valid("json")));
});

/** What this week's digest would contain right now (admin+). Sends nothing. */
routes.get("/digest/preview", requireRole("admin"), async (c) => {
  const ctx = c.var.ctx;
  return c.json(await buildWeeklyDigest(ctx, c.var.tenant.orgId, ctx.now()));
});

export default routes;
