// HTTP API. Route files own their logic; this file only mounts them.
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { AppError } from "./lib/errors";
import { authRateLimit } from "./middleware/auth-rate-limit";
import { contextMiddleware } from "./middleware/context";
import { llmLimiter, uploadLimiter } from "./middleware/rate-limit";
import { originCheck, securityHeaders } from "./middleware/security";
import { sessionMiddleware } from "./middleware/session";
import { requireOrg } from "./middleware/tenant";
import adminRoutes from "./routes/admin";
import billingRoutes from "./routes/billing";
import { integrationRoutes } from "./routes/integrations";
import legalRoutes from "./routes/legal";
import orgBillingRoutes from "./routes/org/billing";
import { quickbooksRoutes } from "./routes/org/quickbooks";
import { routingRoutes } from "./routes/org/routings";
import {
  inboundEmailRoutes,
  memberRoutes,
  notificationRoutes,
  orgRootRoutes,
  rateCardRoutes,
} from "./routes/org/shop";
import { costingRoutes, quoteRoutes, rfqRoutes } from "./routes/org/work";
import {
  authRoutes,
  healthRoutes,
  invitationRoutes,
  meRoutes,
  orgsRoutes,
  quoteLinkRoutes,
} from "./routes/public";
import type { AppEnv } from "./types";

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use("*", contextMiddleware);
  app.use("*", securityHeaders);
  app.route("/api/health", healthRoutes);

  // The provider webhook is signed, not cookie-authenticated: it is mounted before the Origin check
  // and the session (services/billing.ts verifies the signature).
  app.route("/api/billing", billingRoutes);

  app.use("/api/*", originCheck);
  // Durable per-IP and per-account limits in front of Better Auth (middleware/auth-rate-limit.ts).
  app.use("/api/auth/*", authRateLimit);
  app.route("/api/auth", authRoutes);
  app.use("/api/*", sessionMiddleware);
  // Public: the legal documents are readable before signing up.
  app.route("/api/legal", legalRoutes);
  app.route("/api/me", meRoutes);
  // Platform admin (owner) API: PLATFORM_ADMIN_EMAILS session or the console's service token.
  app.route("/api/admin", adminRoutes);
  app.route("/api/orgs", orgsRoutes);
  app.route("/api/invitations", invitationRoutes);
  // Public: a customer link to one sent quote (the token is the credential, no session needed).
  app.route("/api/quote-links", quoteLinkRoutes);
  // Intuit's OAuth redirect (QuickBooks Online): the signed-in admin's state is checked there.
  app.route("/api/integrations", integrationRoutes);

  // Tenant-scoped routes: requireOrg() verifies membership in :orgId (min role viewer); routers add
  // requireRole("estimator" | "admin") for writes.
  const org = new Hono<AppEnv>();
  org.use("*", requireOrg("viewer"));
  org.use("*", llmLimiter);
  org.use("*", uploadLimiter);
  org.route("/", orgRootRoutes);
  org.route("/members", memberRoutes);
  org.route("/rate-card", rateCardRoutes);
  org.route("/inbound-email", inboundEmailRoutes);
  org.route("/notifications", notificationRoutes);
  org.route("/rfqs", rfqRoutes);
  org.route("/quotes", quoteRoutes);
  org.route("/costing", costingRoutes);
  org.route("/routings", routingRoutes);
  org.route("/billing", orgBillingRoutes);
  org.route("/quickbooks", quickbooksRoutes);
  app.route("/api/orgs/:orgId", org);

  app.notFound((c) => c.json({ error: { code: "not_found", message: "Not found" } }, 404));

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        err.status,
      );
    }
    if (err instanceof HTTPException) {
      const status = err.status;
      const code = status === 400 ? "bad_request" : status === 401 ? "unauthorized" : "http_error";
      return c.json({ error: { code, message: err.message || "Bad request" } }, status);
    }
    if (err instanceof ZodError) {
      return c.json(
        { error: { code: "validation_error", message: "Invalid request", details: err.issues } },
        400,
      );
    }
    c.var.ctx?.logger.error("unhandled_error", { error: String(err), stack: (err as Error).stack });
    return c.json({ error: { code: "internal_error", message: "Something went wrong" } }, 500);
  });

  return app;
}
