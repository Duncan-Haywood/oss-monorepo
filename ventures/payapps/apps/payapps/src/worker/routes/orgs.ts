import { createOrgSchema } from "@shared/api/schemas";
import { Hono } from "hono";
import { unauthorized } from "../lib/errors";
import { validate } from "../lib/validate";
import { createOrg, listMemberships } from "../services/orgs";
import { sendWelcomeEmail } from "../services/payapps/onboarding";
import type { AppEnv } from "../types";

const routes = new Hono<AppEnv>();

routes.post("/", validate("json", createOrgSchema), async (c) => {
  const user = c.var.user;
  if (!user) throw unauthorized();
  const created = await createOrg(c.var.ctx, user.id, c.req.valid("json").name);
  // Best effort, never throws: the company exists whether or not the welcome email goes.
  await sendWelcomeEmail(c.var.ctx, created.orgId, user.id);
  return c.json(created, 201);
});

routes.get("/", async (c) => {
  const user = c.var.user;
  if (!user) throw unauthorized();
  const items = await listMemberships(c.var.ctx, user.id);
  return c.json({ items: items.map((m) => ({ id: m.orgId, name: m.orgName, role: m.role })) });
});

export default routes;
