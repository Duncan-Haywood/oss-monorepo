// /api/unsubscribe/affirmation-reminders?o=&u=&t= — the affirmation reminder email's signed
// unsubscribe link (lib/unsubscribe-token.ts), no session needed. Mounted before the session
// middleware. Same shape as apps/payapps/src/worker/routes/unsubscribe.ts.
// - GET says which organization the link is for and whether the email is still on. It never changes
//   anything: mail scanners and link previews fetch GET links.
// - POST turns it off. Mail providers send RFC 8058 one-click POSTs here from the List-Unsubscribe
//   header (body "List-Unsubscribe=One-Click", ignored: the query string carries the link), and the
//   /unsubscribe page sends the same POST when the member presses the button.
// A bad or missing signature answers 404, the same as an unknown link.
import { type Context, Hono } from "hono";
import { notFound } from "../lib/errors";
import { unsubscribeSecret, verifyUnsubscribe } from "../lib/unsubscribe-token";
import {
  reminderUnsubscribeStatus,
  unsubscribeReminders,
} from "../services/affirmations/reminders";
import type { AppEnv } from "../types";

const routes = new Hono<AppEnv>();

async function link(c: Context<AppEnv>) {
  const orgId = c.req.query("o") ?? "";
  const userId = c.req.query("u") ?? "";
  const token = c.req.query("t") ?? "";
  const secret = unsubscribeSecret(c.env);
  if (!secret || !(await verifyUnsubscribe(secret, orgId, userId, token))) {
    throw notFound("Unsubscribe link");
  }
  return { orgId, userId };
}

routes.get("/affirmation-reminders", async (c) => {
  const { orgId, userId } = await link(c);
  return c.json(await reminderUnsubscribeStatus(c.var.ctx, orgId, userId));
});

routes.post("/affirmation-reminders", async (c) => {
  const { orgId, userId } = await link(c);
  await unsubscribeReminders(c.var.ctx, orgId, userId);
  return c.json(await reminderUnsubscribeStatus(c.var.ctx, orgId, userId));
});

export default routes;
