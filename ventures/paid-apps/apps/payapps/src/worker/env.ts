import type { EmailSendBinding } from "./ports/email";

// Worker bindings + secrets. Bindings come from wrangler.jsonc (worker-configuration.d.ts, regenerate
// with `pnpm cf-typegen`). Secrets are set with `wrangler secret put` / .dev.vars. Never commit them.
export interface Secrets {
  AUTH_SECRET?: string;
  /**
   * Sender for account mail ("PayApps <no-reply@example.org>"), a var in wrangler.jsonc. With the
   * `EMAIL` send_email binding it turns on real mail (ports/email.ts, docs/EMAIL.md); without it
   * every message is only logged as not sent.
   */
  EMAIL_FROM?: string;
  /**
   * Paid plans ship dark. "paddle" + BILLING_API_KEY + BILLING_WEBHOOK_SECRET turns checkout on
   * (ports/billing.ts, docs/BILLING.md); anything else leaves every org on the Free plan.
   */
  BILLING_PROVIDER?: string;
  /** Owner-only: Paddle API key (a pdl_sdbx_ key uses the sandbox). */
  BILLING_API_KEY?: string;
  /** Owner-only: secret of the Paddle notification destination for /api/billing/webhook. */
  BILLING_WEBHOOK_SECRET?: string;
  /** JSON {"solo":"pri_…","solo:annual":"pri_…",…}; the deploy reads it back from Paddle. */
  BILLING_PRICE_IDS?: string;
  /**
   * QuickBooks Online (ports/accounting.ts, docs/QUICKBOOKS.md). Owner-only secrets from the
   * owner's Intuit developer app; with all five set the integration is live, otherwise dark.
   */
  QBO_CLIENT_ID?: string;
  QBO_CLIENT_SECRET?: string;
  /** At least 32 random characters: encrypts stored QuickBooks tokens (lib/token-box.ts). */
  QBO_TOKEN_KEY?: string;
  /** Var: `${APP_URL}/api/integrations/quickbooks/callback`, registered on the Intuit app. */
  QBO_REDIRECT_URI?: string;
  /** Var: "sandbox" or "production". */
  QBO_ENVIRONMENT?: string;
  /** "true" = offline demo: the signed fake billing provider, no network. Never in production. */
  FAKE_EXTERNALS?: string;
  /** Test-only: full DDL injected by vitest.worker.config.ts. */
  TEST_SCHEMA_SQL?: string;
}

/** Optional until the sender domain is onboarded (docs/EMAIL.md); absent in tests. */
export interface OptionalBindings {
  EMAIL?: EmailSendBinding;
  /** R2 bucket for pay-app attachments (services/payapps/attachments.ts). Without it uploads answer 503. */
  FILES?: R2Bucket;
}

export type Env = CloudflareBindings & Secrets & OptionalBindings;

export const isProd = (env: Env) => env.APP_ENV === "production";
