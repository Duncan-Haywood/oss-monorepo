// OWNER: auth agent — GET /api/me (user + memberships), invitations addressed to me,
// my sessions (list / revoke one / revoke others) and DELETE /api/me (delete my account).

import { Hono } from "hono";
import { z } from "zod";
import { unauthorized } from "../lib/errors";
import { validate } from "../lib/validate";
import { isPlatformAdminUser } from "../middleware/platform-admin";
import { rateLimit, TEST_RATE_LIMIT_HEADER } from "../middleware/rate-limit";
import {
  acceptInvitation,
  deleteAccount,
  getMyInvitation,
  isHardened,
  listMemberships,
  listMyInvitations,
  listSessions,
  revokeOtherSessions,
  revokeSession,
} from "../services/auth";
import { isDemoSessionUser } from "../services/demo/sessions";
import type { AppEnv, SessionUser } from "../types";

const routes = new Hono<AppEnv>();

const me = (u: SessionUser | null): SessionUser => {
  if (!u) throw unauthorized();
  return u;
};

routes.get("/", async (c) => {
  const user = me(c.var.user);
  const [memberships, isDemo] = await Promise.all([
    listMemberships(c.var.ctx, user.id),
    // Throwaway one-click demo visitor (demo deployment only; no query elsewhere).
    isDemoSessionUser(c.var.ctx, user.id),
  ]);
  const body = {
    user: { id: user.id, email: user.email, name: user.name },
    memberships,
    ...(isDemo ? { isDemo: true as const } : {}),
  };
  return c.json(isPlatformAdminUser(c.env, user) ? { ...body, isPlatformAdmin: true } : body);
});

/** Pending, unexpired invitations sent to my email (used by the /invite/:id page). */
routes.get("/invitations", async (c) => {
  const user = me(c.var.user);
  return c.json({ items: await listMyInvitations(c.var.ctx, user) });
});

/** One invitation by the id in the emailed link (works before the email is verified). */
routes.get("/invitations/:id", async (c) => {
  const user = me(c.var.user);
  return c.json(await getMyInvitation(c.var.ctx, user, c.req.param("id")));
});

routes.post("/invitations/:id/accept", async (c) => {
  const user = me(c.var.user);
  const membership = await acceptInvitation(c.var.ctx, user, c.req.param("id"), c.var.requestId);
  return c.json(membership);
});

// ---------------------------------------------------------------------------------------------
// Sessions (only ever the caller's own; ids of other users' sessions 404 like unknown ids)
// ---------------------------------------------------------------------------------------------

/** `{ items: [{ id, createdAt, lastActiveAt, expiresAt, device, ip (prefix only), current }] }` */
routes.get("/sessions", async (c) => {
  const user = me(c.var.user);
  const items = await listSessions(c.var.ctx, user.id, c.var.authSession?.id ?? null);
  return c.json({ items });
});

routes.post("/sessions/revoke-others", async (c) => {
  const user = me(c.var.user);
  const revoked = await revokeOtherSessions(c.var.ctx, user.id, c.var.authSession?.id ?? null);
  return c.json({ revoked });
});

routes.delete("/sessions/:id", async (c) => {
  const user = me(c.var.user);
  await revokeSession(c.var.ctx, user.id, c.req.param("id"));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------------------------
// Account deletion
// ---------------------------------------------------------------------------------------------

const deleteSchema = z.object({ password: z.string().max(256).optional() });

/** Password guessing through a stolen session: 5 attempts per user per 15 minutes (per isolate). */
const deleteAccountLimiter = rateLimit({
  name: "account-delete",
  limit: 5,
  periodSeconds: 15 * 60,
  key: (c) => c.var.user?.id,
  when: (c) => c.env.APP_ENV !== "test" || c.req.header(TEST_RATE_LIMIT_HEADER) === "enforce",
  message: "Too many attempts. Please wait a few minutes and try again.",
});

routes.delete(
  "/",
  (c, next) => {
    me(c.var.user);
    return next();
  },
  deleteAccountLimiter,
  validate("json", deleteSchema),
  async (c) => {
    const user = me(c.var.user);
    const { password } = c.req.valid("json");
    await deleteAccount(c.var.ctx, user, { password }, c.var.authSession ?? null, c.var.requestId);
    // The session rows are gone (cascade); also clear the cookie in this browser.
    const attrs = "Path=/; Max-Age=0; HttpOnly; SameSite=Lax";
    c.header("Set-Cookie", `better-auth.session_token=; ${attrs}`, { append: true });
    if (isHardened(c.env)) {
      c.header("Set-Cookie", `__Secure-better-auth.session_token=; ${attrs}; Secure`, {
        append: true,
      });
    }
    return c.json({ deleted: true });
  },
);

export default routes;
