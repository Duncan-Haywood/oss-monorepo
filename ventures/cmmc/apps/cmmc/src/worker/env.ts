// Worker bindings + secrets. Bindings come from wrangler.jsonc (worker-configuration.d.ts,
// regenerate with `pnpm cf-typegen`). Secrets are set with `wrangler secret put` / .dev.vars, never here.
import type { EmailSendBinding } from "./ports/email";

export interface Secrets {
  /**
   * Sender for account mail ("CMMC Workspace <no-reply@example.org>"). With the `EMAIL` send_email
   * binding it turns on real mail (ports/email.ts, docs/EMAIL.md); without it every message is only
   * logged as not sent, and nobody can confirm an address or reset a password.
   */
  EMAIL_FROM?: string;
  ANTHROPIC_API_KEY?: string;
  AUTH_SECRET?: string;
  /**
   * Paid plans ship dark. "paddle" + BILLING_API_KEY + BILLING_WEBHOOK_SECRET turns checkout on
   * (ports/billing.ts, docs/BILLING.md); anything else leaves every org on the free Level 1 plan.
   */
  BILLING_PROVIDER?: string;
  /** Owner-only Paddle API key (a pdl_sdbx_ key selects the sandbox). */
  BILLING_API_KEY?: string;
  /** Owner-only: secret of the Paddle notification destination for /api/billing/webhook. */
  BILLING_WEBHOOK_SECRET?: string;
  /** JSON {"level2":"pri_…","level2:annual":"pri_…",…}, read back from Paddle by the catalog sync. */
  BILLING_PRICE_IDS?: string;
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
  /** Test-only: full DDL injected by vitest.worker.config.ts */
  TEST_SCHEMA_SQL?: string;
}

/** Optional until the sender domain is onboarded (docs/EMAIL.md); absent in tests. */
interface OptionalBindings {
  EMAIL?: EmailSendBinding;
}

export type Env = CloudflareBindings & Secrets & OptionalBindings;

export const isFake = (env: Env) => env.FAKE_EXTERNALS === "true" || env.APP_ENV === "test";
export const isProd = (env: Env) => env.APP_ENV === "production";
