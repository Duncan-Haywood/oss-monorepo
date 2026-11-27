// HTTP API. Route files own their logic; this file only mounts them.
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { AppError } from "./lib/errors";
import { authRateLimit } from "./middleware/auth-rate-limit";
import { contextMiddleware } from "./middleware/context";
import { originCheck, securityHeaders } from "./middleware/security";
import { sessionMiddleware } from "./middleware/session";
import { requireOrg } from "./middleware/tenant";
import adminRoutes from "./routes/admin";
import authRoutes from "./routes/auth";
import billingRoutes from "./routes/billing";
import integrationRoutes from "./routes/integrations";
import legalRoutes from "./routes/legal";
import meRoutes from "./routes/me";
import orgBillingRoutes from "./routes/org/billing";
import closeoutRoutes from "./routes/org/closeout";
import companyDocumentRoutes from "./routes/org/company-documents";
import companyLowerTierRoutes from "./routes/org/company-lower-tier-waivers";
import companyRfiRoutes from "./routes/org/company-rfis";
import companyScheduleRoutes from "./routes/org/company-schedule";
import companySubmittalRoutes from "./routes/org/company-submittals";
import dailyReportRoutes from "./routes/org/daily-reports";
import digestRoutes from "./routes/org/digest";
import estimateRoutes from "./routes/org/estimates";
import gettingStartedRoutes from "./routes/org/getting-started";
import insuranceRoutes from "./routes/org/insurance";
import jobCostRoutes from "./routes/org/job-cost";
import jobCostQboRoutes from "./routes/org/job-cost-qbo";
import lowerTierWaiverRoutes from "./routes/org/lower-tier-waivers";
import memberRoutes from "./routes/org/members";
import payAppRoutes from "./routes/org/pay-apps";
import priceListRoutes from "./routes/org/price-list";
import projectRoutes from "./routes/org/projects";
import punchListRoutes from "./routes/org/punch-list";
import quickbooksRoutes from "./routes/org/quickbooks";
import reportRoutes from "./routes/org/reports";
import rfiRoutes from "./routes/org/rfis";
import scheduleRoutes from "./routes/org/schedule";
import submittalRoutes from "./routes/org/submittals";
import timesheetRoutes from "./routes/org/timesheets";
import tmTicketRoutes from "./routes/org/tm-tickets";
import orgRoutes from "./routes/orgs";
import unsubscribeRoutes from "./routes/unsubscribe";
import type { AppEnv } from "./types";

export function createApp() {
  const app = new Hono<AppEnv>();
  app.use("*", contextMiddleware);
  app.use("*", securityHeaders);

  // `email` says whether account mail leaves the Worker: a deploy's smoke test checks it, because with
  // verification required (production/HTTPS) nobody can finish signing up without it.
  app.get("/api/health", (c) =>
    c.json({ ok: true, app: "payapps", email: c.var.ctx.email.delivers }),
  );

  app.use("/api/*", originCheck);
  // Durable per-IP and per-account limits in front of Better Auth (middleware/auth-rate-limit.ts).
  app.use("/api/auth/*", authRateLimit);
  app.route("/api/auth", authRoutes);
  // Before the session middleware: the webhook is authenticated by the provider's signature.
  app.route("/api/billing", billingRoutes);
  // Public: the legal documents are readable before signing up.
  app.route("/api/legal", legalRoutes);
  // Public: the weekly email's signed unsubscribe link works without signing in (and from mail apps).
  app.route("/api/unsubscribe", unsubscribeRoutes);
  app.use("/api/*", sessionMiddleware);
  app.route("/api/me", meRoutes);
  // Platform admin (owner) API: PLATFORM_ADMIN_EMAILS session or the console's service token.
  app.route("/api/admin", adminRoutes);
  app.route("/api/orgs", orgRoutes);
  app.route("/api/integrations", integrationRoutes);

  // Tenant-scoped routes: requireOrg() verifies membership in :orgId (min role viewer); routers add
  // requireRole("editor"/"admin") for writes.
  const org = new Hono<AppEnv>();
  org.use("*", requireOrg("viewer"));
  org.route("/members", memberRoutes);
  org.route("/billing", orgBillingRoutes);
  org.route("/reports", reportRoutes);
  org.route("/getting-started", gettingStartedRoutes);
  org.route("/digest", digestRoutes);
  org.route("/insurance", insuranceRoutes);
  org.route("/documents", companyDocumentRoutes);
  org.route("/estimates", estimateRoutes);
  org.route("/price-list", priceListRoutes);
  org.route("/timesheets", timesheetRoutes);
  org.route("/quickbooks", quickbooksRoutes);
  org.route("/rfis", companyRfiRoutes);
  org.route("/schedule", companyScheduleRoutes);
  org.route("/lower-tier-waivers", companyLowerTierRoutes);
  org.route("/submittals", companySubmittalRoutes);
  org.route("/projects/:projectId/pay-apps", payAppRoutes);
  org.route("/projects/:projectId/job-cost/quickbooks", jobCostQboRoutes);
  org.route("/projects/:projectId/job-cost", jobCostRoutes);
  org.route("/projects/:projectId/lower-tier-waivers", lowerTierWaiverRoutes);
  org.route("/projects/:projectId/punch-list", punchListRoutes);
  org.route("/projects/:projectId/schedule", scheduleRoutes);
  org.route("/projects/:projectId/closeout", closeoutRoutes);
  org.route("/projects/:projectId/daily-reports", dailyReportRoutes);
  org.route("/projects/:projectId/tm-tickets", tmTicketRoutes);
  org.route("/projects/:projectId/rfis", rfiRoutes);
  org.route("/projects/:projectId/submittals", submittalRoutes);
  org.route("/projects", projectRoutes);
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
    c.var.ctx?.logger.error("unhandled_error", { error: String(err), stack: (err as Error).stack });
    return c.json({ error: { code: "internal_error", message: "Something went wrong" } }, 500);
  });

  return app;
}
