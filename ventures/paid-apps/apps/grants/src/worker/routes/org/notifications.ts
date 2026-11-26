// OWNER: notifications — /api/orgs/:orgId/notifications (the caller's own in-app notifications).
// Every handler is scoped to c.var.tenant (orgId + userId): nobody can list, count or mark another
// member's rows, and another org's ids are 404. Viewers included: these are personal rows.
import { NOTIFICATION_KINDS } from "@shared/notifications";
import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../../lib/validate";
import {
  getPreferences,
  listForUser,
  markAllRead,
  markRead,
  unreadCount,
  updatePreferences,
} from "../../services/notifications";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();

const listQuery = z.object({
  unread: z.enum(["0", "1", "true", "false"]).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const preferencesBody = z.object({
  items: z
    .array(
      z.object({
        kind: z.enum(NOTIFICATION_KINDS),
        inApp: z.boolean().optional(),
        email: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(NOTIFICATION_KINDS.length * 2),
});

const scope = (c: { var: AppEnv["Variables"] }) => ({
  orgId: c.var.tenant.orgId,
  userId: c.var.tenant.userId,
});

routes.get("/", validate("query", listQuery), async (c) => {
  const q = c.req.valid("query");
  return c.json(
    await listForUser(c.var.ctx, scope(c), {
      unreadOnly: q.unread === "1" || q.unread === "true",
      cursor: q.cursor || undefined,
      limit: q.limit,
    }),
  );
});

routes.get("/count", async (c) => {
  return c.json({ unread: await unreadCount(c.var.ctx, scope(c)) });
});

routes.post("/read-all", async (c) => {
  return c.json(await markAllRead(c.var.ctx, scope(c)));
});

routes.post("/:id/read", async (c) => {
  return c.json(await markRead(c.var.ctx, scope(c), c.req.param("id")));
});

routes.get("/preferences", async (c) => {
  return c.json({ items: await getPreferences(c.var.ctx, scope(c)) });
});

routes.put("/preferences", validate("json", preferencesBody), async (c) => {
  const { items } = c.req.valid("json");
  return c.json({ items: await updatePreferences(c.var.ctx, scope(c), items) });
});

export default routes;
