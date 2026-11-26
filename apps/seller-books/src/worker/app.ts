// HTTP API. This file only mounts routers and renders errors.
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { AppError } from "./lib/errors";
import { authRateLimit } from "./middleware/auth-rate-limit";
import { contextMiddleware } from "./middleware/context";
import { originCheck, securityHeaders } from "./middleware/security";
import { sessionMiddleware } from "./middleware/session";
import { requireOrg } from "./middleware/tenant";
import authRoutes from "./routes/auth";
import billingRoutes from "./routes/billing";
import healthRoutes from "./routes/health";
import invitationRoutes from "./routes/invitations";
import legalRoutes from "./routes/legal";
import meRoutes from "./routes/me";
import orgBillingRoutes from "./routes/org/billing";
import expenseRoutes from "./routes/org/expenses";
import importRoutes from "./routes/org/imports";
import inventoryRoutes from "./routes/org/inventory";
import memberRoutes from "./routes/org/members";
import mileageRoutes from "./routes/org/mileage";
import profileRoutes from "./routes/org/profile";
import reportRoutes from "./routes/org/reports";
import saleRoutes from "./routes/org/sales";
import orgRoutes from "./routes/orgs";
import referenceRoutes from "./routes/reference";
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

  app.use("/api/*", originCheck);
  // Durable per-IP and per-account limits in front of Better Auth (middleware/auth-rate-limit.ts).
  app.use("/api/auth/*", authRateLimit);
  app.route("/api/auth", authRoutes);
  app.use("/api/*", sessionMiddleware);
  // Public: the legal documents are readable before signing up.
  app.route("/api/legal", legalRoutes);
  app.route("/api/me", meRoutes);
  app.route("/api/orgs", orgRoutes);
  app.route("/api/invitations", invitationRoutes);

  // Tenant-scoped: requireOrg() verifies membership in :orgId (404 for non-members); writes add
  // requireRole("editor") or higher inside each router.
  const org = new Hono<AppEnv>();
  org.use("*", requireOrg("viewer"));
  org.route("/", profileRoutes);
  org.route("/members", memberRoutes);
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
