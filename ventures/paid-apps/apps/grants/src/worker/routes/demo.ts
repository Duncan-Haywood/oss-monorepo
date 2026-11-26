// OWNER: infra agent — /api/demo/*. Available when FAKE_EXTERNALS=true, DEMO_MODE=true or
// APP_ENV != production; otherwise every /api/demo route is a plain 404 (even for anonymous callers).
// POST /api/demo/seed -> { orgId, created } (signed-in only): creates (once per user) a FICTIONAL sample
// org owned by the caller with documents, facts, projects and sample opportunities so the product can
// be demoed offline.
// POST /api/demo/start -> 201 { orgId, redirect } + session cookie (anonymous): one-click live demo.
// Only on the demo deployment (DEMO_MODE=true AND FAKE_EXTERNALS=true; plain 404 otherwise). Creates a
// throwaway signed-in visitor with the seeded org, expiring after 24h (services/demo/sessions.ts).
// 429 after 5 starts per IP per hour; 503 `demo_full` while the active-session cap is reached.
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { clientIp, rateLimit, TEST_RATE_LIMIT_HEADER } from "../middleware/rate-limit";
import { requireUser } from "../middleware/session";
import { demoSeedAllowed, seedDemoOrg } from "../services/demo";
import {
  DEMO_START_RATE_LIMIT,
  demoSessionsAllowed,
  findActiveDemoSession,
  isDemoSessionUser,
  startDemoSession,
} from "../services/demo/sessions";
import type { AppEnv, SessionUser } from "../types";

const routes = new Hono<AppEnv>();

// Same body as app.notFound so a disabled demo is indistinguishable from an unknown route.
const notFoundBody = { error: { code: "not_found", message: "Not found" } } as const;

const demoGate = createMiddleware<AppEnv>(async (c, next) => {
  if (!demoSeedAllowed(c.env)) return c.json(notFoundBody, 404);
  await next();
});

/** Stricter gate for one-click sessions: never outside the demo deployment. */
const demoSessionGate = createMiddleware<AppEnv>(async (c, next) => {
  if (!demoSessionsAllowed(c.env)) return c.json(notFoundBody, 404);
  await next();
});

/** Per client IP. Worker tests share one IP and opt in with the x-test-rate-limit header. */
const demoStartLimiter = rateLimit({
  ...DEMO_START_RATE_LIMIT,
  name: "demo-start",
  when: (c) => c.env.APP_ENV !== "test" || c.req.header(TEST_RATE_LIMIT_HEADER) === "enforce",
  key: (c) => `ip:${clientIp(c)}`,
  message:
    "You've started several demos in a short time. Please wait a while before starting another one.",
});

routes.use("*", demoGate);

routes.post("/seed", requireUser, async (c) => {
  const user = c.var.user as SessionUser;
  const result = await seedDemoOrg(c.var.ctx, {
    userId: user.id,
    ip: c.req.header("CF-Connecting-IP") ?? null,
    userAgent: c.req.header("User-Agent") ?? null,
    requestId: c.var.requestId,
  });
  return c.json(result, result.created ? 201 : 200);
});

routes.post("/start", demoSessionGate, demoStartLimiter, async (c) => {
  const ctx = c.var.ctx;
  c.header("Cache-Control", "no-store");

  // A visitor who clicks again while their demo is still running goes back to the same org.
  const current = c.var.user;
  if (current && (await isDemoSessionUser(ctx, current.id))) {
    const active = await findActiveDemoSession(ctx, current.id);
    if (active) return c.json({ orgId: active.orgId, redirect: `/orgs/${active.orgId}` }, 200);
  }

  const result = await startDemoSession(ctx, {
    headers: c.req.raw.headers,
    ip: c.req.header("CF-Connecting-IP") ?? null,
    userAgent: c.req.header("User-Agent") ?? null,
    requestId: c.var.requestId,
  });
  if (!result.ok) {
    c.header("Retry-After", "900");
    return c.json(
      {
        error: {
          code: "demo_full",
          message:
            "The live demo is full right now. Please try again in a little while, or sign up to start with your own organization.",
        },
      },
      503,
    );
  }
  for (const sc of result.setCookies) c.header("Set-Cookie", sc, { append: true });
  return c.json({ orgId: result.orgId, redirect: `/orgs/${result.orgId}` }, 201);
});

export default routes;
