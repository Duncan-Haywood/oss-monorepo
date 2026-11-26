// OWNER: calendar — public, unguessable ICS feed: GET /api/calendar/:token.ics
// Mounted BEFORE the Origin check and session middleware: calendar apps (Google, Outlook, Apple)
// fetch it server-side with no cookies. The token in the URL is the only credential; only its
// SHA-256 is stored. Unknown, malformed and revoked tokens all get the same 404.

import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { notFound } from "../lib/errors";
import { rateLimit, TEST_RATE_LIMIT_HEADER } from "../middleware/rate-limit";
import {
  buildFeedIcs,
  CALENDAR_TOKEN_RE,
  FEED_CACHE_SECONDS,
  hashCalendarToken,
  resolveCalendarToken,
  touchCalendarToken,
} from "../services/calendar";
import type { AppEnv } from "../types";

declare module "hono" {
  interface ContextVariableMap {
    /** SHA-256 of the feed token in the URL (set by parseFeedToken). Never the raw token. */
    calendarTokenHash: string | undefined;
  }
}

/** Per feed token. Calendar apps poll every few hours; this only stops a leaked URL being hammered. */
export const CALENDAR_FEED_LIMIT = { binding: "CALENDAR_LIMITER", limit: 20, periodSeconds: 60 };

const parseFeedToken = createMiddleware<AppEnv>(async (c, next) => {
  const file = c.req.param("file") ?? "";
  const token = file.endsWith(".ics") ? file.slice(0, -4) : "";
  if (!CALENDAR_TOKEN_RE.test(token)) throw notFound("Calendar");
  c.set("calendarTokenHash", await hashCalendarToken(token));
  await next();
});

// Keyed by token hash, not IP: Google and Microsoft fetch every subscriber's feed from shared IPs.
// Guessing is not a concern (256-bit tokens).
const feedLimiter = rateLimit({
  ...CALENDAR_FEED_LIMIT,
  name: "calendar_feed",
  when: (c) => !(c.env?.APP_ENV === "test" && c.req.header(TEST_RATE_LIMIT_HEADER) !== "enforce"),
  key: (c) => {
    const hash = c.get("calendarTokenHash");
    return hash ? `token:${hash}` : null;
  },
  message: "This calendar feed is being refreshed too often. Try again in a minute.",
});

const routes = new Hono<AppEnv>().get("/:file", parseFeedToken, feedLimiter, async (c) => {
  const ctx = c.var.ctx;
  const hash = c.get("calendarTokenHash");
  const feed = hash ? await resolveCalendarToken(ctx, hash) : null;
  if (!feed) throw notFound("Calendar");
  const ics = await buildFeedIcs(ctx, feed);
  await touchCalendarToken(ctx, feed.tokenId);
  return c.body(ics, 200, {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": 'inline; filename="grant-dates.ics"',
    // private: the URL is a secret, keep it out of shared caches.
    "Cache-Control": `private, max-age=${FEED_CACHE_SECONDS}`,
    "X-Robots-Tag": "noindex, nofollow",
  });
});

export default routes;
