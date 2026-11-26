// /api/orgs/:orgId/getting-started — the onboarding checklist on the Projects page (any member),
// and /reminders: the signed-in member's own getting-started reminder emails for this company, on
// or off (the same stop row as the email's one-click link; services/payapps/onboarding.ts).
import { reminderSettingSchema } from "@shared/api/schemas";
import { Hono } from "hono";
import { validate } from "../../lib/validate";
import { orgGettingStarted } from "../../services/payapps/getting-started";
import { myReminderSetting, setMyReminders } from "../../services/payapps/onboarding";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();

routes.get("/", async (c) => c.json(await orgGettingStarted(c.var.ctx, c.var.tenant.orgId)));

routes.get("/reminders", async (c) => {
  const t = c.var.tenant;
  return c.json(await myReminderSetting(c.var.ctx, t.orgId, t.userId, t.role));
});

routes.put("/reminders", validate("json", reminderSettingSchema), async (c) => {
  const t = c.var.tenant;
  return c.json(await setMyReminders(c.var.ctx, t.orgId, t.userId, t.role, c.req.valid("json").on));
});

export default routes;
