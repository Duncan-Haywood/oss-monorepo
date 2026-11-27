// /api/calendar/<token>.ics: the affirmation due dates for a calendar app's subscription
// (services/affirmations/calendar-feed.ts). No session: the secret token in the path is the
// credential. Mounted before the session middleware. A malformed, unknown or revoked token answers
// the same 404, so the route says nothing about which tokens exist.
import { Hono } from "hono";
import { notFound } from "../lib/errors";
import { calendarForToken } from "../services/affirmations/calendar-feed";
import type { AppEnv } from "../types";

const routes = new Hono<AppEnv>();

routes.get("/:file", async (c) => {
  const file = c.req.param("file");
  const token = file.endsWith(".ics") ? file.slice(0, -4) : "";
  const ics = token ? await calendarForToken(c.var.ctx, token) : null;
  if (ics === null) throw notFound("Calendar");
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="cmmc-due-dates.ics"',
      "Cache-Control": "private, no-store",
      // The token is in the path: keep it out of search indexes.
      "X-Robots-Tag": "noindex",
    },
  });
});

export default routes;
