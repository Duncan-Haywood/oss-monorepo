// Composition root: builds the per-request context. Services are plain functions `(ctx, ...)`.
import { createDb, type Db } from "./db/client";
import type { Env } from "./env";
import { createLogger, type Logger } from "./lib/logger";
import { createQboGateway, type QboGateway } from "./ports/accounting";
import { type BillingProvider, createBillingProvider } from "./ports/billing";
import { createEmailSender, type EmailSender, FakeEmailSender } from "./ports/email";
import { withFileStore } from "./ports/file-store";

export interface AppContext {
  env: Env;
  db: Db;
  billing: BillingProvider | null;
  email: EmailSender;
  /** QuickBooks Online, or null while the integration is dark (ports/accounting.ts). */
  qbo: QboGateway | null;
  logger: Logger;
  now: () => Date;
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

/** Tests and the offline demo keep mail in memory; FAKE_EXTERNALS is refused in production. */
export function usesFakeEmail(env: Pick<Env, "APP_ENV" | "FAKE_EXTERNALS">): boolean {
  if (env.APP_ENV === "production") return false;
  return env.APP_ENV === "test" || env.FAKE_EXTERNALS === "true";
}

export function createAppContext(rawEnv: Env, overrides: Partial<Omit<AppContext, "env">> = {}) {
  assertRuntimeEnv(rawEnv);
  // FILES is R2 when bound, else D1 (ports/file-store.ts), so attachments work before R2 is switched on.
  const env = withFileStore(rawEnv);
  const logger = overrides.logger ?? createLogger({ app: "payapps", env: env.APP_ENV });
  return {
    env,
    db: overrides.db ?? createDb(env.DB),
    billing: overrides.billing === undefined ? createBillingProvider(env) : overrides.billing,
    email: overrides.email ?? (usesFakeEmail(env) ? fakeEmail : createEmailSender(env, logger)),
    qbo: overrides.qbo === undefined ? createQboGateway(env) : overrides.qbo,
    logger,
    now: overrides.now ?? (() => new Date()),
  } satisfies AppContext;
}
