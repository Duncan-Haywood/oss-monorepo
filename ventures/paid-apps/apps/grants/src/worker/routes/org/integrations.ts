// OWNER: integrations — /api/orgs/:orgId/integrations (Slack / Microsoft Teams).
// Reads: any member (no secrets are ever returned: webhook URLs come back redacted).
// Destinations and workspace connections: admin+. Linking your own Slack account: editor+ (only
// editors can share updates from Slack); unlinking yourself: any member.
import type { IntegrationsOverviewDto } from "@shared/integrations";
import { Hono } from "hono";
import { notFound } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  createDestination,
  createDestinationSchema,
  createLinkCode,
  deleteDestination,
  disconnectSlackWorkspace,
  getMySlackLink,
  listDestinations,
  listSlackWorkspaces,
  testDestination,
  unlinkMySlack,
  updateDestination,
  updateDestinationSchema,
} from "../../services/integrations";
import { integrationEnv } from "../../services/integrations/env";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();

const actor = (c: { var: AppEnv["Variables"] }) => ({
  orgId: c.var.tenant.orgId,
  userId: c.var.tenant.userId,
  requestId: c.var.requestId,
});

routes.get("/", async (c) => {
  const ctx = c.var.ctx;
  const { orgId, userId } = c.var.tenant;
  const [destinations, workspaces, myLink] = await Promise.all([
    listDestinations(ctx, orgId),
    listSlackWorkspaces(ctx, orgId),
    getMySlackLink(ctx, orgId, userId),
  ]);
  const body: IntegrationsOverviewDto = {
    destinations,
    slack: {
      commandsConfigured: Boolean(integrationEnv(ctx.env).SLACK_SIGNING_SECRET),
      commandUrl: `${(ctx.env.APP_URL ?? "").replace(/\/+$/, "")}/api/integrations/slack/command`,
      workspaces,
      myLink,
    },
  };
  return c.json(body);
});

routes.post(
  "/destinations",
  requireRole("admin"),
  validate("json", createDestinationSchema),
  async (c) => c.json(await createDestination(c.var.ctx, actor(c), c.req.valid("json")), 201),
);

routes.patch(
  "/destinations/:id",
  requireRole("admin"),
  validate("json", updateDestinationSchema),
  async (c) =>
    c.json(await updateDestination(c.var.ctx, actor(c), c.req.param("id"), c.req.valid("json"))),
);

routes.delete("/destinations/:id", requireRole("admin"), async (c) => {
  await deleteDestination(c.var.ctx, actor(c), c.req.param("id"));
  return c.body(null, 204);
});

routes.post("/destinations/:id/test", requireRole("admin"), async (c) =>
  c.json(await testDestination(c.var.ctx, actor(c), c.req.param("id"))),
);

routes.post("/slack/connect-code", requireRole("admin"), async (c) => {
  const { orgId, userId } = c.var.tenant;
  return c.json(await createLinkCode(c.var.ctx, { orgId, userId, purpose: "connect" }), 201);
});

routes.post("/slack/link-code", requireRole("editor"), async (c) => {
  const { orgId, userId } = c.var.tenant;
  return c.json(await createLinkCode(c.var.ctx, { orgId, userId, purpose: "link" }), 201);
});

routes.delete("/slack/link", async (c) => {
  const { orgId, userId } = c.var.tenant;
  await unlinkMySlack(c.var.ctx, orgId, userId);
  return c.body(null, 204);
});

routes.delete("/slack/workspaces/:teamId", requireRole("admin"), async (c) => {
  const ok = await disconnectSlackWorkspace(c.var.ctx, {
    ...actor(c),
    teamId: c.req.param("teamId"),
  });
  if (!ok) throw notFound("Slack workspace");
  return c.body(null, 204);
});

export default routes;
