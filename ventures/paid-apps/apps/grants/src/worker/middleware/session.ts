// OWNER: auth agent. Loads the signed-in user (Better Auth session cookie) into c.var.user.
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { user as userTable } from "../db/schema";
import { unauthorized } from "../lib/errors";
import { createAuth } from "../services/auth";
import type { AppEnv } from "../types";

export const TEST_USER_HEADER = "x-test-user-id";

/** The Better Auth session behind this request (null when anonymous or via the test header). */
export interface AuthSessionInfo {
  id: string;
  createdAt: Date;
}

declare module "hono" {
  interface ContextVariableMap {
    authSession: AuthSessionInfo | null;
  }
}

/** Better Auth's session cookie is `better-auth.session_token` (`__Secure-` prefixed over HTTPS). */
const SESSION_COOKIE_MARKER = "better-auth.session_token=";

export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  c.set("user", null);
  c.set("authSession", null);
  // Test-only identity shortcut. NEVER honored outside APP_ENV=test (set only by vitest config).
  if (c.env.APP_ENV === "test") {
    const testUserId = c.req.header(TEST_USER_HEADER);
    if (testUserId) {
      const row = await c.var.ctx.db
        .select()
        .from(userTable)
        .where(eq(userTable.id, testUserId))
        .get();
      if (row)
        c.set("user", {
          id: row.id,
          email: row.email,
          name: row.name,
          emailVerified: row.emailVerified,
        });
      return next();
    }
  }
  // Skip the Better Auth round-trip entirely for requests without a session cookie.
  const cookie = c.req.header("Cookie");
  let refreshedCookies: string[] = [];
  if (cookie?.includes(SESSION_COOKIE_MARKER)) {
    try {
      const auth = createAuth(c.var.ctx);
      const { headers, response } = await auth.api.getSession({
        headers: c.req.raw.headers,
        returnHeaders: true,
      });
      // Better Auth may roll the session expiry; forward its Set-Cookie so the cookie keeps up.
      refreshedCookies = headers.getSetCookie();
      if (response?.user) {
        c.set("user", {
          id: response.user.id,
          email: response.user.email,
          name: response.user.name,
          emailVerified: response.user.emailVerified,
        });
        c.set("authSession", {
          id: response.session.id,
          createdAt: new Date(response.session.createdAt),
        });
      }
    } catch (e) {
      c.var.ctx.logger.warn("session.resolve_failed", { error: String(e) });
    }
  }
  await next();
  for (const sc of refreshedCookies) c.header("Set-Cookie", sc, { append: true });
});

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.user) throw unauthorized();
  await next();
});
