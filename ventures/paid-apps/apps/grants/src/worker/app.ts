// HTTP API. Route files are owned by domain modules (see docs/ARCHITECTURE.md); this file only mounts them.
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { AppError } from "./lib/errors";
import { cloudflareAccess } from "./middleware/cloudflare-access";
import { contextMiddleware } from "./middleware/context";
import { observability } from "./middleware/observability";
import { authLimiter, llmLimiter, uploadLimiter } from "./middleware/rate-limit";
import { requestLimits } from "./middleware/request-limits";
import { originCheck, securityHeaders } from "./middleware/security";
import { sessionMiddleware } from "./middleware/session";
import { requireOrg } from "./middleware/tenant";
import adminRoutes from "./routes/admin";
import authRoutes from "./routes/auth";
import billingWebhookRoutes from "./routes/billing-webhook";
import calendarFeedRoutes from "./routes/calendar-feed";
import demoRoutes from "./routes/demo";
import emailUnsubscribeRoutes from "./routes/email-unsubscribe";
import healthRoutes from "./routes/health";
import integrationsPublicRoutes from "./routes/integrations-public";
import internalRoutes from "./routes/internal";
import legalRoutes from "./routes/legal";
import letterRoutes from "./routes/letters";
import meRoutes from "./routes/me";
import newsletterRoutes from "./routes/newsletter";
import applicationBudgetRoutes from "./routes/org/application-budget";
import applicationExportRoutes from "./routes/org/application-export";
import applicationTimelineRoutes from "./routes/org/application-timeline";
import applicationRoutes from "./routes/org/applications";
import approvalPolicyRoutes from "./routes/org/approval-policies";
import attachmentRoutes from "./routes/org/attachments";
import awardRoutes from "./routes/org/awards";
import billingRoutes from "./routes/org/billing";
import calendarRoutes from "./routes/org/calendar";
import documentRoutes from "./routes/org/documents";
import eligibilityRoutes from "./routes/org/eligibility";
import emailPreferenceRoutes from "./routes/org/email-preferences";
import factRoutes from "./routes/org/facts";
import funderRoutes from "./routes/org/funders";
import guideRoutes from "./routes/org/guide";
import homeRoutes from "./routes/org/home";
import importRoutes from "./routes/org/imports";
import integrationRoutes from "./routes/org/integrations";
import interviewRoutes from "./routes/org/interviews";
import matchRoutes from "./routes/org/matches";
import memberRoutes from "./routes/org/members";
import notificationRoutes from "./routes/org/notifications";
import opportunityRoutes from "./routes/org/opportunities";
import privacyRoutes from "./routes/org/privacy";
import profileRoutes from "./routes/org/profile";
import projectRoutes from "./routes/org/projects";
import prospectRoutes from "./routes/org/prospects";
import reviewRoutes from "./routes/org/reviews";
import searchRoutes from "./routes/org/search";
import submissionRoutes from "./routes/org/submissions";
import transcribeRoutes from "./routes/org/transcribe";
import updateRoutes from "./routes/org/updates";
import watchlistRoutes from "./routes/org/watchlist";
import orgRoutes from "./routes/orgs";
import type { AppEnv } from "./types";

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use("*", observability());
  app.use("*", contextMiddleware);
  app.use("*", securityHeaders);
  // Cloudflare Access JWT on /api/admin/* (and every route with CF_ACCESS_PROTECT_ALL=true) when
  // CF_ACCESS_TEAM_DOMAIN + CF_ACCESS_AUD are set; no-op otherwise. requirePlatformAdmin still applies.
  app.use("*", cloudflareAccess());
  app.use("/api/*", requestLimits());

  // Unauthenticated, signature-verified, not subject to the Origin check.
  app.route("/api/billing/webhook", billingWebhookRoutes);
  // Slack-signed (SLACK_SIGNING_SECRET); outside the Origin check and session.
  app.route("/api/integrations", integrationsPublicRoutes);
  app.route("/api/internal", internalRoutes);
  app.route("/api/health", healthRoutes);
  app.route("/api/legal", legalRoutes);
  // Public ICS feed: the unguessable token in the URL is the credential (calendar apps send no
  // cookies). Before the session middleware so a stray cookie never triggers a session lookup.
  app.route("/api/calendar", calendarFeedRoutes);
  // Public newsletter signup / confirm / unsubscribe and one-click unsubscribe for team
  // notifications. Before the Origin check: mail providers POST the RFC 8058 one-click unsubscribe
  // server-side; subscribe and confirm apply originCheck themselves. Tokens are the credential.
  app.route("/api/newsletter", newsletterRoutes);
  app.route("/api/email", emailUnsubscribeRoutes);

  app.use("/api/*", originCheck);
  app.use("/api/auth/*", authLimiter);
  app.route("/api/auth", authRoutes);
  app.use("/api/*", sessionMiddleware);
  app.route("/api/me", meRoutes);
  // Platform operators only (requirePlatformAdmin inside the router; Cloudflare Access above).
  app.route("/api/admin", adminRoutes);
  app.route("/api/orgs", orgRoutes);
  // Partner letter upload links (no login; the token is the only credential, rate-limited inside).
  app.route("/api/letters", letterRoutes);
  app.route("/api/demo", demoRoutes);

  // Tenant-scoped routes. requireOrg() verifies membership in :orgId (min role: viewer);
  // routers add requireRole("editor") etc. for writes.
  const org = new Hono<AppEnv>();
  org.use("*", requireOrg("viewer"));
  org.use("*", llmLimiter, uploadLimiter);
  org.route("/", profileRoutes);
  org.route("/home", homeRoutes);
  org.route("/members", memberRoutes);
  org.route("/documents", documentRoutes);
  org.route("/search", searchRoutes);
  org.route("/facts", factRoutes);
  org.route("/projects", projectRoutes);
  org.route("/interviews", interviewRoutes);
  org.route("/transcribe", transcribeRoutes);
  org.route("/updates", updateRoutes);
  org.route("/opportunities", opportunityRoutes);
  org.route("/eligibility", eligibilityRoutes);
  org.route("/imports", importRoutes);
  org.route("/matches", matchRoutes);
  org.route("/applications", applicationRoutes);
  org.route("/applications", applicationExportRoutes);
  org.route("/applications", applicationBudgetRoutes);
  org.route("/applications", attachmentRoutes); // /:id/attachments, /:id/support-letters
  org.route("/applications", applicationTimelineRoutes);
  org.route("/reviews", reviewRoutes);
  org.route("/approval-policies", approvalPolicyRoutes);
  org.route("/submissions", submissionRoutes);
  org.route("/awards", awardRoutes);
  org.route("/privacy", privacyRoutes);
  org.route("/billing", billingRoutes);
  org.route("/watchlist", watchlistRoutes);
  org.route("/prospects", prospectRoutes);
  org.route("/funders", funderRoutes);
  org.route("/notifications", notificationRoutes);
  org.route("/integrations", integrationRoutes);
  org.route("/guide", guideRoutes);
  org.route("/", emailPreferenceRoutes); // /email-preferences, /digest/preview
  org.route("/", calendarRoutes); // /calendar/*, /opportunities/:id/calendar.ics
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
