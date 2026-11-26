// OWNER: auth agent — Better Auth handler mounted at /api/auth/*
// (sign-up/in/out email+password, Google OAuth when configured, get-session, email verification
// (GET /verify-email, POST /send-verification-email), password reset (POST /request-password-reset,
// POST /reset-password), change-password, update-user, ...).
import { Hono } from "hono";
import { withBasePath } from "../lib/request-path";
import { turnstileGuard } from "../middleware/turnstile";
import { authOptionsForRequest, createAuth } from "../services/auth";
import type { AppEnv } from "../types";

const routes = new Hono<AppEnv>();

// Bot check (Cloudflare Turnstile) on sign-up/in, password reset and verification-email requests.
// No-op without TURNSTILE_SECRET_KEY and in APP_ENV=test (middleware/turnstile.ts).
routes.use("/*", turnstileGuard);

// src/worker/http.ts routes without the base path; Better Auth matches the public path
// (`${BASE_PATH}/api/auth/*`, see authUrls), so it gets the request with the prefix put back.
routes.on(["GET", "POST"], "/*", (c) =>
  createAuth(c.var.ctx, authOptionsForRequest(c.env, c.req.raw)).handler(
    withBasePath(c.req.raw, c.env.BASE_PATH),
  ),
);

export default routes;
