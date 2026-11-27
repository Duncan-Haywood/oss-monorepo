// Worker bindings + secrets. Bindings come from wrangler.jsonc (worker-configuration.d.ts, regenerate
// with `pnpm cf-typegen`). Secrets are set with `wrangler secret put` / .dev.vars, never committed.
import type { EmailSendBinding } from "./ports/email";

export interface Secrets {
  ANTHROPIC_API_KEY?: string;
  AUTH_SECRET?: string;
  /**
   * Sender for account mail ("Job Shop Quote <no-reply@example.org>"). With the `EMAIL` send_email
   * binding it turns on real mail (ports/email.ts, docs/EMAIL.md); without it every message is only
   * logged as not sent.
   */
  EMAIL_FROM?: string;
  /**
   * Paid plans ship dark. "paddle" + BILLING_API_KEY + BILLING_WEBHOOK_SECRET turns checkout on
   * (ports/billing.ts, docs/BILLING.md); anything else leaves every shop on the free plan.
   */
  BILLING_PROVIDER?: string;
  /** Owner-only Paddle API key (a pdl_sdbx_ key selects the sandbox). */
  BILLING_API_KEY?: string;
  /** Owner-only: secret of the Paddle notification destination for /api/billing/webhook. */
  BILLING_WEBHOOK_SECRET?: string;
  /** JSON {"shop":"pri_…","shop:annual":"pri_…",…}, read back from Paddle by the catalog sync. */
  BILLING_PRICE_IDS?: string;
  /**
   * Domain whose mail Cloudflare Email Routing sends to this worker (the `rfq@` rule
   * with subaddressing, scripts/email-routing.mjs; docs/EMAIL.md):
   * shops receive RFQs at `rfq+{token}@{domain}`. Empty leaves inbound email off.
   */
  INBOUND_EMAIL_DOMAIN?: string;
  /**
   * Platform admins (comma-separated emails; verified addresses only) for /api/admin/*. Set on the
   * worker by .github/workflows/set-admins.yml, never committed. Unset = nobody.
   */
  PLATFORM_ADMIN_EMAILS?: string;
  /**
   * The owner console's (apps/admin) credential for /api/admin/*: `Authorization: Bearer <token>`,
   * at least 32 characters. Set by set-admins.yml; unset = the bearer path is closed.
   */
  ADMIN_SERVICE_TOKEN?: string;
  /**
   * Read-only token for agents measuring progress: GET /api/admin/metrics only (aggregate counts,
   * MRR), never the account lists. At least 32 characters; set by set-admins.yml; unset = closed.
   */
  ADMIN_METRICS_TOKEN?: string;
  /** "on" = email PLATFORM_ADMIN_EMAILS on each new paid subscription (needs account mail). */
  OWNER_NOTIFICATIONS?: string;
  /**
   * QuickBooks Online (docs/QUICKBOOKS.md), dark until all five are set: the owner's Intuit app's
   * client id and secret, the registered redirect URI (`<APP_URL>/api/integrations/quickbooks/callback`),
   * a 32+ character key the stored tokens are encrypted under, and `sandbox` or `production`.
   */
  QBO_CLIENT_ID?: string;
  QBO_CLIENT_SECRET?: string;
  QBO_REDIRECT_URI?: string;
  QBO_TOKEN_KEY?: string;
  QBO_ENVIRONMENT?: string;
  /** Test-only: full DDL injected by vitest.worker.config.ts */
  TEST_SCHEMA_SQL?: string;
}

/** Optional until the sender domain is onboarded (docs/EMAIL.md); absent in tests. */
export interface OptionalBindings {
  EMAIL?: EmailSendBinding;
}

export type Env = CloudflareBindings & Secrets & OptionalBindings;

export const isFake = (env: Env) => env.FAKE_EXTERNALS === "true" || env.APP_ENV === "test";
export const isProd = (env: Env) => env.APP_ENV === "production";
