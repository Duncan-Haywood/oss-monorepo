// Composition root: builds the per-request context with real or fake adapters.
// Services are plain functions that take `ctx: AppContext` as their first argument.
import { createDb, type Db } from "./db/client";
import { llmCalls } from "./db/schema";
import { type Env, isFake } from "./env";
import { AppError } from "./lib/errors";
import { newId } from "./lib/ids";
import { createLogger, type Logger } from "./lib/logger";
import { createQboGateway, type QboGateway } from "./ports/accounting";
import { AnthropicLlm } from "./ports/anthropic-llm";
import { type BillingProvider, createBillingProvider } from "./ports/billing";
import { BudgetedLlm } from "./ports/budgeted-llm";
import { FakeDocumentConverter, WorkersAiConverter } from "./ports/converter";
import type { DocumentConverter } from "./ports/document-converter";
import { createEmailSender, type EmailSender, FakeEmailSender } from "./ports/email";
import { type FakeHandler, FakeLlm } from "./ports/fake-llm";
import { allFakeHandlers } from "./ports/fake-llm-handlers";
import { withFileStore } from "./ports/file-store";
import { CadFeaturesGeometry, FakeGeometry, type GeometryExtractor } from "./ports/geometry";
import type { LlmClient, LlmRequestBase, LlmUsage } from "./ports/llm";
import { planLlmCapMicros } from "./services/billing";
import { createLlmBudgetGuard, type LlmBudgetGuard } from "./services/guards/llm-budget";

/** Used when a real deployment has no ANTHROPIC_API_KEY: every call fails with a clear 503. */
const notConfiguredLlm: LlmClient = {
  generateStructured: () => {
    throw new AppError(503, "llm_not_configured", "AI extraction is not configured");
  },
  generateText: () => {
    throw new AppError(503, "llm_not_configured", "AI extraction is not configured");
  },
};

export interface AppContext {
  env: Env;
  db: Db;
  llm: LlmClient;
  converter: DocumentConverter;
  geometry: GeometryExtractor;
  /** Account mail (verify address, reset password); services/auth/emails.ts. */
  email: EmailSender;
  /** Paddle (or the signed fake in tests/demo); null until the owner turns billing on. */
  billing: BillingProvider | null;
  /** QuickBooks Online (or the fake in tests/demo); null until the owner sets the Intuit keys. */
  qbo: QboGateway | null;
  logger: Logger;
  now: () => Date;
}

/**
 * Per-isolate fakes so tests can register fixtures that later requests see: CAD geometry by file
 * name, and FakeLlm handler overrides by purpose (e.g. a fabricating extractor).
 */
export const testFakes = {
  geometry: new FakeGeometry(),
  llmHandlers: new Map<string, FakeHandler>(),
  /** When set, the fake LLM is wrapped in BudgetedLlm with this guard (spend-cap route tests). */
  llmBudget: null as LlmBudgetGuard | null,
  /** Account mail in tests and the offline demo, kept in memory across requests. */
  email: new FakeEmailSender(),
};

/** Tests and the offline demo keep mail in memory; FAKE_EXTERNALS is refused in production. */
export function usesFakeEmail(env: Pick<Env, "APP_ENV" | "FAKE_EXTERNALS">): boolean {
  if (env.APP_ENV === "production") return false;
  return env.APP_ENV === "test" || env.FAKE_EXTERNALS === "true";
}

const withTestBudget = (llm: LlmClient): LlmClient =>
  testFakes.llmBudget ? new BudgetedLlm(llm, testFakes.llmBudget) : llm;

export function assertRuntimeEnv(env: Pick<Env, "APP_ENV" | "TEST_SCHEMA_SQL">): void {
  if (env.APP_ENV === "test" && !env.TEST_SCHEMA_SQL) {
    throw new Error("APP_ENV=test outside the test runner: refusing to start");
  }
}

export function createAppContext(rawEnv: Env, overrides: Partial<Omit<AppContext, "env">> = {}) {
  assertRuntimeEnv(rawEnv);
  // FILES is R2 when bound, else D1 (ports/file-store.ts), so the app runs before R2 is switched on.
  const env = withFileStore(rawEnv);
  const db = overrides.db ?? createDb(env.DB);
  const logger = overrides.logger ?? createLogger({ app: "jobshop-quote", env: env.APP_ENV });
  const fake = isFake(env);

  const recordUsage = async (
    purpose: string,
    usage: LlmUsage,
    req: LlmRequestBase,
    error?: string,
  ) => {
    try {
      await db.insert(llmCalls).values({
        id: newId("llm"),
        orgId: req.orgId ?? null,
        purpose,
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheWriteTokens: usage.cacheWriteTokens,
        costMicros: usage.costMicros,
        latencyMs: usage.latencyMs,
        stopReason: usage.stopReason,
        error: error ?? null,
      });
    } catch (e) {
      logger.warn("llm_usage.record_failed", { purpose, error: String(e) });
    }
  };

  const llm: LlmClient =
    overrides.llm ??
    (fake
      ? withTestBudget(
          new FakeLlm({ ...allFakeHandlers, ...Object.fromEntries(testFakes.llmHandlers) }),
        )
      : env.ANTHROPIC_API_KEY
        ? // Spend caps (per-org monthly, global daily kill switch) run before every real call.
          new BudgetedLlm(
            new AnthropicLlm({
              apiKey: env.ANTHROPIC_API_KEY,
              defaultModel: env.LLM_MODEL,
              onUsage: recordUsage,
            }),
            // The shop's plan sets its monthly AI ceiling (src/shared/plans.ts llmMonthlyCapUsd).
            createLlmBudgetGuard(env, db, logger, {
              orgCapMicros: (orgId) => planLlmCapMicros(db, orgId, new Date()),
            }),
          )
        : notConfiguredLlm);

  const ctx: AppContext = {
    env,
    db,
    llm,
    converter:
      overrides.converter ?? (fake ? new FakeDocumentConverter() : new WorkersAiConverter(env.AI)),
    // The CAD parser is local TypeScript, not an outside service: only the worker tests (which
    // register geometry by file name) use the fake; the offline demo and e2e measure real files.
    geometry:
      overrides.geometry ??
      (env.APP_ENV === "test" ? testFakes.geometry : new CadFeaturesGeometry()),
    email:
      overrides.email ?? (usesFakeEmail(env) ? testFakes.email : createEmailSender(env, logger)),
    billing: overrides.billing === undefined ? createBillingProvider(env) : overrides.billing,
    qbo: overrides.qbo === undefined ? createQboGateway(env) : overrides.qbo,
    logger,
    now: overrides.now ?? (() => new Date()),
  };
  return ctx;
}
