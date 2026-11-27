// Loads the signed-in user (Better Auth session cookie) into c.var.user.
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { user as userTable } from "../db/schema";
import { unauthorized } from "../lib/errors";
import { createAuth } from "../services/auth/auth";
import type { AppEnv } from "../types";

export const TEST_USER_HEADER = "x-test-user-id";
const SESSION_COOKIE_MARKER = "better-auth.session_token=";

export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  c.set("user", null);
  // Test-only identity shortcut. NEVER honored outside APP_ENV=test (assertRuntimeEnv guards it).
  if (c.env.APP_ENV === "test") {
    const testUserId = c.req.header(TEST_USER_HEADER);
    if (testUserId) {
      const row = await c.var.ctx.db
        .select()
        .from(userTable)
        .where(eq(userTable.id, testUserId))
        .get();
      if (row) {
        c.set("user", {
          id: row.id,
          email: row.email,
          name: row.name,
          emailVerified: row.emailVerified,
        });
      }
      return next();
    }
  }
  const cookie = c.req.header("Cookie");
  if (cookie?.includes(SESSION_COOKIE_MARKER)) {
    try {
      const res = await createAuth(c.var.ctx).api.getSession({ headers: c.req.raw.headers });
      if (res?.user) {
        c.set("user", {
          id: res.user.id,
          email: res.user.email,
          name: res.user.name,
          emailVerified: res.user.emailVerified === true,
        });
      }
    } catch (e) {
      c.var.ctx.logger.warn("session.resolve_failed", { error: String(e) });
    }
  }
  await next();
});

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.user) throw unauthorized();
  await next();
});
