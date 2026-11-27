// HTTP API. Route files own the logic; this file only mounts them.
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { AppError } from "./lib/errors";
import { contextMiddleware } from "./middleware/context";
import { originCheck, securityHeaders } from "./middleware/security";
import { sessionMiddleware } from "./middleware/session";
import { requireOrg } from "./middleware/tenant";
import adminRoutes from "./routes/admin";
import authRoutes from "./routes/auth";
import billingRoutes from "./routes/billing";
import calendarRoutes from "./routes/calendar";
import legalRoutes from "./routes/legal";
import orgRoutes from "./routes/org";
import orgBillingRoutes from "./routes/org/billing";
import { health, me, orgs } from "./routes/public";
import unsubscribeRoutes from "./routes/unsubscribe";
import type { AppEnv } from "./types";

export function createApp() {
  const app = new Hono<AppEnv>();
  app.use("*", contextMiddleware);
  app.use("*", securityHeaders);
  app.route("/api/health", health);
  // The provider webhook is signed, not cookie-authenticated: it is mounted before the Origin check
  // and the session (services/billing.ts verifies the signature). GET /plans is public.
  app.route("/api/billing", billingRoutes);
  // Public: the legal documents are readable before signing up.
  app.route("/api/legal", legalRoutes);
  app.use("/api/*", originCheck);
  app.route("/api/auth", authRoutes);
  // Public: the reminder email's signed unsubscribe link works without signing in (and from mail apps).
  app.route("/api/unsubscribe", unsubscribeRoutes);
  // Public: a calendar app's subscription to the due dates; the secret token in the path is the
  // credential (routes/calendar.ts).
  app.route("/api/calendar", calendarRoutes);
  app.use("/api/*", sessionMiddleware);
  app.route("/api/me", me);
  // Platform admin (owner) API: PLATFORM_ADMIN_EMAILS session or the console's service token.
  app.route("/api/admin", adminRoutes);
  app.use("/api/orgs/:orgId/*", requireOrg());
  app.use("/api/orgs/:orgId", requireOrg());
  app.route("/api/orgs/:orgId/billing", orgBillingRoutes);
  app.route("/api/orgs/:orgId", orgRoutes);
  app.route("/api/orgs", orgs);
  app.all("/api/*", (c) => c.json({ error: { code: "not_found", message: "Not found" } }, 404));

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        err.status,
      );
    }
    if (err instanceof HTTPException) {
      return c.json(
        { error: { code: "http_error", message: err.message || "Bad request" } },
        err.status,
      );
    }
    if (err instanceof ZodError) {
      return c.json(
        { error: { code: "validation_error", message: "Invalid request", details: err.issues } },
        400,
      );
    }
    c.var.ctx?.logger.error("unhandled_error", { error: String(err) });
    return c.json({ error: { code: "internal_error", message: "Something went wrong" } }, 500);
  });
  return app;
}
