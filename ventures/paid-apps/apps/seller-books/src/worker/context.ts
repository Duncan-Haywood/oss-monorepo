// Composition root. Services are plain functions taking `ctx: AppContext` first. External services:
// billing (Paddle, or the signed fake in tests) and account email (Cloudflare Email Service, or the
// in-memory fake in tests and the offline demo); no LLM. A new one gets a port + fake here.
import { createDb, type Db } from "./db/client";
import type { Env } from "./env";
import { createLogger, type Logger } from "./lib/logger";
import { type BillingProvider, createBillingProvider } from "./ports/billing";
import { createEmailSender, type EmailSender, FakeEmailSender } from "./ports/email";

export interface AppContext {
  env: Env;
  db: Db;
  logger: Logger;
  now: () => Date;
  /** Paddle (or the signed fake in tests/demo); null until the owner turns billing on. */
  billing: BillingProvider | null;
  /** Account mail (verify address, reset password); ports/email.ts, docs/EMAIL.md. */
  email: EmailSender;
}

/** Refuse to run with APP_ENV=test outside the vitest runner (it enables a test-only identity header). */
export function assertRuntimeEnv(env: Pick<Env, "APP_ENV" | "TEST_SCHEMA_SQL">): void {
  if (env.APP_ENV === "test" && !env.TEST_SCHEMA_SQL) {
    throw new Error("APP_ENV=test outside the test runner: refusing to start");
  }
}

/** Per-isolate fake so mail survives across requests in tests and the offline demo. */
const fakeEmail = new FakeEmailSender();
export const testFakes = { email: fakeEmail };

/** Tests and the offline demo keep mail in memory; never in production. */
export function usesFakeEmail(env: Pick<Env, "APP_ENV" | "FAKE_EXTERNALS">): boolean {
  if (env.APP_ENV === "production") return false;
  return env.APP_ENV === "test" || env.FAKE_EXTERNALS === "true";
}

export function createAppContext(
  env: Env,
  overrides: Partial<Omit<AppContext, "env">> = {},
): AppContext {
  assertRuntimeEnv(env);
  const logger = overrides.logger ?? createLogger({ app: "seller-books", env: env.APP_ENV });
  return {
    env,
    db: overrides.db ?? createDb(env.DB),
    logger,
    email: overrides.email ?? (usesFakeEmail(env) ? fakeEmail : createEmailSender(env, logger)),
    now: overrides.now ?? (() => new Date()),
    billing: overrides.billing === undefined ? createBillingProvider(env) : overrides.billing,
  };
}
