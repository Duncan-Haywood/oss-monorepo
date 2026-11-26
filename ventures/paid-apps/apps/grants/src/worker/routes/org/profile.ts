// OWNER: orgs agent — /api/orgs/:orgId (GET org overview), PATCH /profile (editor+), PATCH /settings (admin+),
// GET /settings/automation-preview (any member)

import type { Context } from "hono";
import { Hono } from "hono";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  type ActorMeta,
  getOrgOverview,
  profilePatchSchema,
  settingsPatchSchema,
  updateOrgProfile,
  updateOrgSettings,
} from "../../services/orgs";
import { jsonBody } from "../../services/orgs/validate";
import { AutomationPreviewQuery, automationPreview } from "../../services/review/preview";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();

const actor = (c: Context<AppEnv>): ActorMeta => ({
  userId: c.var.tenant.userId,
  ip: c.req.header("CF-Connecting-IP") ?? null,
  userAgent: c.req.header("User-Agent") ?? null,
  requestId: c.var.requestId,
});

routes.get("/", async (c) => {
  const { orgId, role } = c.var.tenant;
  const overview = await getOrgOverview(c.var.ctx, orgId);
  return c.json({
    org: overview.org,
    role,
    profile: overview.profile,
    settings: overview.settings,
  });
});

routes.patch("/profile", requireRole("editor"), jsonBody(profilePatchSchema), async (c) => {
  const profile = await updateOrgProfile(
    c.var.ctx,
    c.var.tenant.orgId,
    c.req.valid("json"),
    actor(c),
  );
  return c.json(profile);
});

routes.patch("/settings", requireRole("admin"), jsonBody(settingsPatchSchema), async (c) => {
  const settings = await updateOrgSettings(
    c.var.ctx,
    c.var.tenant.orgId,
    c.req.valid("json"),
    actor(c),
  );
  return c.json(settings);
});

/**
 * How four example grants would be routed under the current automation config (any member).
 * Query params preview unsaved automation changes without saving them (see AutomationPreviewQuery).
 */
routes.get("/settings/automation-preview", validate("query", AutomationPreviewQuery), async (c) => {
  return c.json(await automationPreview(c.var.ctx, c.var.tenant.orgId, c.req.valid("query")));
});

export default routes;
