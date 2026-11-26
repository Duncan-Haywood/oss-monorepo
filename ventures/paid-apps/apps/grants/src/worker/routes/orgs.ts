// OWNER: orgs agent — POST/GET /api/orgs (create org = onboarding step 1, list my orgs)
import { Hono } from "hono";
import { requireUser } from "../middleware/session";
import { requireOrg } from "../middleware/tenant";
import { createOrg, createOrgSchema, getOrgOverview, listUserOrgs } from "../services/orgs";
import { jsonBody } from "../services/orgs/validate";
import type { AppEnv, SessionUser } from "../types";

const routes = new Hono<AppEnv>();

// requireUser per route (not "*"): a wildcard here would also run for every /api/orgs/:orgId/* route.
routes.post("/", requireUser, jsonBody(createOrgSchema), async (c) => {
  const user = c.var.user as SessionUser;
  const { orgId } = await createOrg(c.var.ctx, c.req.valid("json"), {
    userId: user.id,
    ip: c.req.header("CF-Connecting-IP") ?? null,
    userAgent: c.req.header("User-Agent") ?? null,
    requestId: c.var.requestId,
  });
  return c.json({ orgId }, 201);
});

routes.get("/", requireUser, async (c) => {
  const user = c.var.user as SessionUser;
  return c.json({ items: await listUserOrgs(c.var.ctx, user.id) });
});

// The contract spells the overview as `GET /api/orgs/:orgId/`; routes/org/profile.ts serves the
// slash-less form, this serves the trailing-slash form (Hono routing is strict) behind requireOrg.
routes.get("/:orgId/", requireOrg("viewer"), async (c) => {
  const { orgId, role } = c.var.tenant;
  const { org, profile, settings } = await getOrgOverview(c.var.ctx, orgId);
  return c.json({ org, role, profile, settings });
});

export default routes;
