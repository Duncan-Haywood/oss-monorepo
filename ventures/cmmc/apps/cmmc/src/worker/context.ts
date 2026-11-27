// Composition root: builds the per-request context with real or fake adapters.
// Services are plain functions that take `ctx: AppContext` as their first argument.
import { createDb, type Db } from "./db/client";
import { type Env, isFake } from "./env";
import { AppError } from "./lib/errors";
import { createLogger, type Logger } from "./lib/logger";
import { AnthropicLlm } from "./ports/anthropic-llm";
import { type BillingProvider, createBillingProvider } from "./ports/billing";
import { createEmailSender, type EmailSender, FakeEmailSender } from "./ports/email";
import { FakeLlm } from "./ports/fake-llm";
import { allFakeHandlers } from "./ports/fake-llm-handlers";
import type { LlmClient } from "./ports/llm";

/** Used when a real deployment has no ANTHROPIC_API_KEY: every call fails with a clear 503. */
const notConfiguredLlm: LlmClient = {
  generateStructured: () => {
    throw new AppError(
      503,
      "llm_not_configured",
      "AI drafting is not configured for this deployment",
    );
  },
  generateText: () => {
    throw new AppError(
      503,
      "llm_not_configured",
      "AI drafting is not configured for this deployment",
    );
  },
};

export interface AppContext {
  env: Env;
  db: Db;
  llm: LlmClient;
  /** R2 bucket for evidence. Keys MUST start with `orgs/{orgId}/` (services/evidence/keys.ts). */
  files: R2Bucket;
  /** Paddle (or the signed fake in tests/demo); null until the owner turns billing on. */
  billing: BillingProvider | null;
  /** Account mail (verify address, reset password); services/auth/emails.ts. */
  email: EmailSender;
  logger: Logger;
  now: () => Date;
}

/** Per-isolate fakes that later requests in the same test run (or offline demo) can read. */
export const testFakes = {
  /** Account mail in tests and the offline demo, kept in memory across requests. */
  email: new FakeEmailSender(),
};

/** Tests and the offline demo keep mail in memory; FAKE_EXTERNALS never applies in production. */
export function usesFakeEmail(env: Pick<Env, "APP_ENV" | "FAKE_EXTERNALS">): boolean {
  if (env.APP_ENV === "production") return false;
  return env.APP_ENV === "test" || env.FAKE_EXTERNALS === "true";
}

export function createAppContext(env: Env, overrides: Partial<AppContext> = {}): AppContext {
  const logger = overrides.logger ?? createLogger({ app: "cmmc" });
  const llm: LlmClient =
    overrides.llm ??
    (isFake(env)
      ? new FakeLlm(allFakeHandlers)
      : env.ANTHROPIC_API_KEY
        ? new AnthropicLlm({ apiKey: env.ANTHROPIC_API_KEY, defaultModel: env.LLM_MODEL })
        : notConfiguredLlm);
  return {
    env,
    db: overrides.db ?? createDb(env.DB),
    llm,
    files: overrides.files ?? env.FILES,
    billing: overrides.billing === undefined ? createBillingProvider(env) : overrides.billing,
    email:
      overrides.email ?? (usesFakeEmail(env) ? testFakes.email : createEmailSender(env, logger)),
    logger,
    now: overrides.now ?? (() => new Date()),
  };
}
