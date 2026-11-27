// /api/unsubscribe/digest?o=&u=&t= — the weekly email's signed unsubscribe link (lib/unsubscribe-token.ts),
// and /api/unsubscribe/onboarding?o=&u=&t= — the getting-started reminders' stop link (signed for that
// list only), no session needed. Mounted before the session middleware.
// - GET says which company the link is for and whether the email is still on. It never changes
//   anything: mail scanners and link previews fetch GET links.
// - POST turns it off. Mail providers send RFC 8058 one-click POSTs here from the List-Unsubscribe
//   header (body "List-Unsubscribe=One-Click", ignored: the query string carries the link), and the
//   /unsubscribe page sends the same POST when the member presses the button.
// A bad or missing signature answers 404, the same as an unknown link.
import { type Context, Hono } from "hono";
import { notFound } from "../lib/errors";
import {
  type UnsubscribeList,
  unsubscribeSecret,
  verifyUnsubscribe,
} from "../lib/unsubscribe-token";
import { digestUnsubscribeStatus, unsubscribeDigest } from "../services/payapps/digest";
import { reminderStopStatus, stopReminders } from "../services/payapps/onboarding";
import type { AppEnv } from "../types";

const routes = new Hono<AppEnv>();

async function link(c: Context<AppEnv>, list: UnsubscribeList = "digest") {
  const orgId = c.req.query("o") ?? "";
  const userId = c.req.query("u") ?? "";
  const token = c.req.query("t") ?? "";
  const secret = unsubscribeSecret(c.env);
  if (!secret || !(await verifyUnsubscribe(secret, orgId, userId, token, list))) {
    throw notFound("Unsubscribe link");
  }
  return { orgId, userId };
}

routes.get("/digest", async (c) => {
  const { orgId, userId } = await link(c);
  return c.json(await digestUnsubscribeStatus(c.var.ctx, orgId, userId));
});

routes.post("/digest", async (c) => {
  const { orgId, userId } = await link(c);
  await unsubscribeDigest(c.var.ctx, orgId, userId);
  c.var.ctx.logger.info("digest.unsubscribed", { orgId });
  return c.json(await digestUnsubscribeStatus(c.var.ctx, orgId, userId));
});

routes.get("/onboarding", async (c) => {
  const { orgId, userId } = await link(c, "onboarding");
  return c.json(await reminderStopStatus(c.var.ctx, orgId, userId));
});

routes.post("/onboarding", async (c) => {
  const { orgId, userId } = await link(c, "onboarding");
  await stopReminders(c.var.ctx, orgId, userId);
  c.var.ctx.logger.info("onboarding.reminders_stopped", { orgId });
  return c.json(await reminderStopStatus(c.var.ctx, orgId, userId));
});

export default routes;
