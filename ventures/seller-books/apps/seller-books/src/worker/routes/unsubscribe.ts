// /api/unsubscribe/estimate-reminder?o=&u=&t= — the 1040-ES reminder email's signed stop link
// (lib/unsubscribe-token.ts), no session needed. Mounted before the session middleware and the origin
// check (mail providers POST from their own servers). Pattern from apps/payapps (routes/unsubscribe.ts).
// - GET says which shop the link is for and whether the email is still on. It never changes anything:
//   mail scanners and link previews fetch GET links.
// - POST turns it off. Mail providers send RFC 8058 one-click POSTs here from the List-Unsubscribe
//   header (body "List-Unsubscribe=One-Click", ignored: the query string carries the link), and the
//   /unsubscribe page sends the same POST when the member presses the button.
// A bad or missing signature answers 404, the same as an unknown link.
import { type Context, Hono } from "hono";
import { notFound } from "../lib/errors";
import { unsubscribeSecret, verifyUnsubscribe } from "../lib/unsubscribe-token";
import { reminderUnsubscribeStatus, setReminder } from "../services/books/estimate-reminders";
import type { AppEnv } from "../types";

const routes = new Hono<AppEnv>();

async function link(c: Context<AppEnv>) {
  const orgId = c.req.query("o") ?? "";
  const userId = c.req.query("u") ?? "";
  const token = c.req.query("t") ?? "";
  const secret = unsubscribeSecret(c.env);
  if (!secret || !(await verifyUnsubscribe(secret, orgId, userId, token, "estimate-reminder"))) {
    throw notFound("Unsubscribe link");
  }
  return { orgId, userId };
}

routes.get("/estimate-reminder", async (c) => {
  const { orgId, userId } = await link(c);
  return c.json(await reminderUnsubscribeStatus(c.var.ctx, orgId, userId));
});

routes.post("/estimate-reminder", async (c) => {
  const { orgId, userId } = await link(c);
  await setReminder(c.var.ctx, orgId, userId, false);
  c.var.ctx.logger.info("estimate_reminder.unsubscribed", { orgId });
  return c.json(await reminderUnsubscribeStatus(c.var.ctx, orgId, userId));
});

export default routes;
