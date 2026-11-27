// Better Auth handler at /api/auth/*: sign-up/in/out with email + password, get-session, email
// verification (verify-email, send-verification-email) and password reset (request-password-reset,
// reset-password). Account mail goes through ctx.email (services/auth/emails.ts).
import { Hono } from "hono";
import { withBasePath } from "../http";
import { authOptionsForRequest, createAuth } from "../services/auth/auth";
import type { AppEnv } from "../types";

const routes = new Hono<AppEnv>();
// http.ts routes without the base path; Better Auth matches the public path (`${BASE_PATH}/api/auth/*`),
// so it gets the request with the prefix put back (a no-op at the host root).
routes.on(["GET", "POST"], "/*", (c) =>
  createAuth(c.var.ctx, authOptionsForRequest(c.env, c.req.raw)).handler(
    withBasePath(c.req.raw, c.env.BASE_PATH),
  ),
);
export default routes;
