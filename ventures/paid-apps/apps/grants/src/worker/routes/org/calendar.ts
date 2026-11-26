// OWNER: calendar — /api/orgs/:orgId/calendar/* (feed tokens + settings) and the single-event
// download /api/orgs/:orgId/opportunities/:id/calendar.ics. Mounted at "/" on the org router.
//
// Roles: any member (viewer+) can create, list and revoke their own "mine" feed; org-wide feeds
// need editor+; admins see and can revoke everyone's feeds and choose whether amounts appear.
import { CALENDAR_SCOPES } from "@shared/api/calendar";
import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  createCalendarToken,
  getCalendarSettings,
  listCalendarTokens,
  opportunityDeadlineIcs,
  revokeCalendarToken,
  updateCalendarSettings,
} from "../../services/calendar";
import type { AppEnv } from "../../types";

const CreateToken = z.object({ scope: z.enum(CALENDAR_SCOPES) }).strict();
const SettingsPatch = z.object({ includeAmounts: z.boolean() }).strict();

const routes = new Hono<AppEnv>()
  .get("/calendar/tokens", async (c) => {
    const items = await listCalendarTokens(c.var.ctx, c.var.tenant);
    return c.json({ items });
  })
  // Returns the secret URL exactly once (responses are Cache-Control: no-store).
  .post("/calendar/tokens", validate("json", CreateToken), async (c) => {
    const created = await createCalendarToken(
      c.var.ctx,
      c.var.tenant,
      c.req.valid("json").scope,
      c.var.requestId,
    );
    return c.json(created, 201);
  })
  .delete("/calendar/tokens/:id", async (c) => {
    await revokeCalendarToken(c.var.ctx, c.var.tenant, c.req.param("id"), c.var.requestId);
    return c.json({ ok: true });
  })
  .get("/calendar/settings", async (c) => {
    return c.json(await getCalendarSettings(c.var.ctx, c.var.tenant.orgId));
  })
  .patch("/calendar/settings", requireRole("admin"), validate("json", SettingsPatch), async (c) => {
    const settings = await updateCalendarSettings(
      c.var.ctx,
      c.var.tenant,
      c.req.valid("json"),
      c.var.requestId,
    );
    return c.json(settings);
  })
  .get("/opportunities/:id/calendar.ics", async (c) => {
    const { ics, filename } = await opportunityDeadlineIcs(
      c.var.ctx,
      c.var.tenant.orgId,
      c.req.param("id"),
    );
    return c.body(ics, 200, {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    });
  });

export default routes;
