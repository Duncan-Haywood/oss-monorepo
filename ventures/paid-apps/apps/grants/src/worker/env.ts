// Worker bindings + secrets. Bindings come from wrangler.jsonc (see worker-configuration.d.ts,
// regenerate with `pnpm cf-typegen`). Secrets are set with `wrangler secret put` / .dev.vars.
export interface Secrets {
  ANTHROPIC_API_KEY?: string;
  AUTH_SECRET?: string;
  INTERNAL_API_TOKEN?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  SIMPLER_GRANTS_API_KEY?: string;
  RESEND_API_KEY?: string;
  /**
   * "auto" (default) | "cloudflare" | "resend": transactional email provider; "ses" |
   * "ses-with-fallback": Amazon SES for all mail (docs/EMAIL.md, ports/provider-switch.ts).
   */
  EMAIL_PROVIDER?: string;
  /** "anthropic" (default) | "aws" | "aws-with-fallback": Claude provider (ports/provider-switch.ts). */
  LLM_PROVIDER?: string;
  /** AWS credentials for Claude Platform on AWS and SES (transitional scoped IAM user; docs/DEPLOY.md). */
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  /** Only with temporary (STS / role) credentials. */
  AWS_SESSION_TOKEN?: string;
  /** Region of Claude Platform on AWS, and of SES unless SES_REGION is set. */
  AWS_REGION?: string;
  SES_REGION?: string;
  /** SES configuration set for event publishing (bounces, complaints); optional. */
  SES_CONFIGURATION_SET?: string;
  /** Claude Platform on AWS workspace, sent as the `anthropic-workspace-id` header. */
  ANTHROPIC_AWS_WORKSPACE_ID?: string;
  BILLING_PROVIDER?: string; // e.g. "paddle" | "polar" | "none"
  BILLING_API_KEY?: string;
  BILLING_WEBHOOK_SECRET?: string;
  /** JSON map of planKey[:interval] -> provider price id */
  BILLING_PRICE_IDS?: string;
  /**
   * AWS runtime: product name in the starter's platform.entitlements ("grants"). Set, Paddle
   * checkouts carry custom_data user_sub/product and webhooks arrive through the payments
   * sub-stack instead of /api/billing/webhook (docs/AWS.md).
   */
  BILLING_ENTITLEMENT_PRODUCT?: string;
  /** Comma-separated emails with platform admin access (/api/admin). */
  PLATFORM_ADMIN_EMAILS?: string;
  /** Cloudflare Turnstile secret; when set, auth forms need a widget token (docs/AUTH.md). */
  TURNSTILE_SECRET_KEY?: string;
  /** Signing secret of the Slack app that owns the /grants slash command. */
  SLACK_SIGNING_SECRET?: string;
  /** Optional dedicated key for encrypting integration secrets (falls back to AUTH_SECRET). */
  INTEGRATIONS_KEY?: string;
  /** Zero Trust team domain, e.g. https://<team>.cloudflareaccess.com (Access JWT issuer). */
  CF_ACCESS_TEAM_DOMAIN?: string;
  /** Access application AUD tag(s), comma-separated. With the team domain: /api/admin/* needs Access. */
  CF_ACCESS_AUD?: string;
  /** "true" requires the Access JWT on every Worker route (demo/staging host). */
  CF_ACCESS_PROTECT_ALL?: string;
  /** Per-org monthly LLM spend cap in USD (default in services/guards). */
  ORG_MONTHLY_LLM_CAP_USD?: string;
  /** Global daily LLM spend kill switch in USD. */
  GLOBAL_DAILY_LLM_CAP_USD?: string;
  /** "true" runs queue jobs inline (offline demo). */
  INLINE_JOBS?: string;
  /** "true" enables /api/demo routes in production (demo deployment). */
  DEMO_MODE?: string;
  /**
   * "true" lets the cron send the newsletter welcome/nurture sequence (docs/EMAIL_MARKETING.md).
   * Default off: no unattended marketing email until the owner turns it on.
   */
  MARKETING_EMAIL_ENABLED?: string;
  /**
   * The sender's physical postal address, printed in every marketing email (CAN-SPAM). Placeholder:
   * empty until the owner sets a real address; marketing sends stay off while it is empty.
   */
  MARKETING_POSTAL_ADDRESS?: string;
  /** Test-only: full DDL injected by vitest.worker.config.ts */
  TEST_SCHEMA_SQL?: string;
}

/**
 * Set only by the AWS runtime (src/worker/aws/env.ts): adapters that are not Workers bindings.
 * Workers deployments leave them undefined and use VECTORS (Vectorize).
 */
export interface AwsRuntimeBindings {
  /** Postgres-backed per-org vector search (aws/pg-vector-store.ts). */
  VECTOR_STORE?: import("./ports/vector-store").VectorStore;
  /** "aws" on Lambda; unset on Workers. */
  RUNTIME?: string;
}

export type Env = CloudflareBindings & Secrets & AwsRuntimeBindings;

export const isFake = (env: Env) => env.FAKE_EXTERNALS === "true" || env.APP_ENV === "test";
export const isProd = (env: Env) => env.APP_ENV === "production";
