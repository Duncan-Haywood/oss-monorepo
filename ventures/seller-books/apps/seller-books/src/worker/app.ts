// HTTP API. This file only mounts routers and renders errors.
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { AppError } from "./lib/errors";
import { authRateLimit } from "./middleware/auth-rate-limit";
import { contextMiddleware } from "./middleware/context";
import { requireCurrentTerms } from "./middleware/legal";
import { originCheck, securityHeaders } from "./middleware/security";
import { sessionMiddleware } from "./middleware/session";
import { requireOrg } from "./middleware/tenant";
import adminRoutes from "./routes/admin";
import authRoutes from "./routes/auth";
import billingRoutes from "./routes/billing";
import healthRoutes from "./routes/health";
import invitationRoutes from "./routes/invitations";
import legalRoutes from "./routes/legal";
import meRoutes from "./routes/me";
import orgBillingRoutes from "./routes/org/billing";
import expenseRoutes from "./routes/org/expenses";
import gettingStartedRoutes from "./routes/org/getting-started";
import importRoutes from "./routes/org/imports";
import inventoryRoutes from "./routes/org/inventory";
import memberRoutes from "./routes/org/members";
import mileageRoutes from "./routes/org/mileage";
import profileRoutes from "./routes/org/profile";
import reportRoutes from "./routes/org/reports";
import saleRoutes from "./routes/org/sales";
import orgRoutes from "./routes/orgs";
import referenceRoutes from "./routes/reference";
import unsubscribeRoutes from "./routes/unsubscribe";
import type { AppEnv } from "./types";

export function createApp() {
  const app = new Hono<AppEnv>();
  app.use("*", contextMiddleware);
  app.use("*", securityHeaders);

  app.route("/api/health", healthRoutes);
  app.route("/api/reference", referenceRoutes);
  // Paddle posts server to server with no Origin and no session: mounted before both
  // (services/billing/service.ts verifies the signature). GET /plans is public.
  app.route("/api/billing", billingRoutes);
  // The reminder email's signed stop link: no session, and mail apps POST it from their own servers.
  app.route("/api/unsubscribe", unsubscribeRoutes);

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
  app.route("/api/orgs", orgRoutes);
  app.route("/api/invitations", invitationRoutes);

  // Tenant-scoped: requireOrg() verifies membership in :orgId (404 for non-members); writes add
  // requireRole("editor") or higher inside each router. Then the current Terms must be accepted
  // (middleware/legal.ts); membership is checked first so a non-member still gets the 404.
  const org = new Hono<AppEnv>();
  org.use("*", requireOrg("viewer"));
  org.use("*", requireCurrentTerms);
  org.route("/", profileRoutes);
  org.route("/members", memberRoutes);
  org.route("/getting-started", gettingStartedRoutes);
  org.route("/imports", importRoutes);
  org.route("/sales", saleRoutes);
  org.route("/inventory", inventoryRoutes);
  org.route("/mileage", mileageRoutes);
  org.route("/expenses", expenseRoutes);
  org.route("/reports", reportRoutes);
  org.route("/billing", orgBillingRoutes);
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
