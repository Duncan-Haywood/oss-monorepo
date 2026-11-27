// /api/orgs/:orgId/digest — the signed-in member's own weekly "money to chase" email for this
// company (services/payapps/digest.ts). Any member can turn it on for themselves (viewers read the
// same cash report); nobody can turn it on for someone else.
import { digestSettingSchema } from "@shared/api/schemas";
import { Hono } from "hono";
import { validate } from "../../lib/validate";
import { getDigestSetting, previewDigest, setDigestSetting } from "../../services/payapps/digest";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();

routes.get("/", async (c) => {
  const { orgId, userId } = c.var.tenant;
  return c.json({
    setting: await getDigestSetting(c.var.ctx, orgId, userId),
    preview: await previewDigest(c.var.ctx, orgId),
  });
});

routes.put("/", validate("json", digestSettingSchema), async (c) => {
  const { orgId, userId } = c.var.tenant;
  return c.json(await setDigestSetting(c.var.ctx, orgId, userId, c.req.valid("json")));
});

export default routes;
