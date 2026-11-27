// Better Auth handler: sign-up/in/out (email+password), get-session, email verification
// (verify-email, send-verification-email) and password reset (request-password-reset,
// reset-password). Account mail goes through ctx.email (services/auth/emails.ts, docs/EMAIL.md).
import { Hono } from "hono";
import { authOptionsForRequest, createAuth } from "../services/auth/auth";
import type { AppEnv } from "../types";

const routes = new Hono<AppEnv>();
routes.on(["GET", "POST"], "/*", (c) =>
  createAuth(c.var.ctx, authOptionsForRequest(c.env, c.req.raw)).handler(c.req.raw),
);
export default routes;
