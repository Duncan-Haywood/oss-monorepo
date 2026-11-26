// OWNER: digest — one-click unsubscribe for team notification emails (weekly digest, deadline
// nudges), at /api/email/unsubscribe. Mounted before the Origin check and session middleware: mail
// providers POST here (RFC 8058) without cookies. The signed token is the only credential.
//
//   GET  /unsubscribe?token=   → 303 to the unsubscribe page
//   POST /unsubscribe?token=   → { ok, status: unsubscribed | invalid }
import { type NewsletterActionResponse, UNSUBSCRIBE_PATH } from "@shared/newsletter";
import { Hono } from "hono";
import { applyNotificationUnsubscribe } from "../services/digest/unsubscribe";
import type { AppEnv } from "../types";

const noStore = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

const routes = new Hono<AppEnv>()
  .get("/unsubscribe", (c) => {
    const token = (c.req.query("token") ?? "").trim().slice(0, 400);
    return c.redirect(
      token ? `${UNSUBSCRIBE_PATH}?token=${encodeURIComponent(token)}` : UNSUBSCRIBE_PATH,
      303,
    );
  })
  .post("/unsubscribe", async (c) => {
    const token = (c.req.query("token") ?? "").trim().slice(0, 400);
    const status = await applyNotificationUnsubscribe(c.var.ctx, token);
    c.var.ctx.logger.info("notifications.unsubscribe", { status });
    const res: NewsletterActionResponse = { ok: status === "unsubscribed", status };
    return c.json(res, 200, noStore);
  });

export default routes;
