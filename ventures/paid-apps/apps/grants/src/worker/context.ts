// Composition root: builds the per-request/per-job context with real or fake adapters.
// Services are plain functions that take `ctx: AppContext` as their first argument.
import { createDb, type Db } from "./db/client";
import { llmCalls } from "./db/schema";
import { type Env, isFake } from "./env";
import { AppError } from "./lib/errors";
import { newId } from "./lib/ids";
import { createLogger, type Logger } from "./lib/logger";
import type { BillingProvider } from "./ports/billing-provider";
import { createBillingProvider } from "./ports/billing-providers";
import { BudgetedLlm } from "./ports/budgeted-llm";
import {
  CategoryRoutedEmailSender,
  CloudflareEmailSender,
  type EmailSendBinding,
  NoMarketingProviderSender,
} from "./ports/cloudflare-email";
import type { DocumentConverter } from "./ports/document-converter";
import type { EmailSender } from "./ports/email";
import type { Embedder } from "./ports/embedder";
import { FakeLlm } from "./ports/fake-llm";
import { allFakeHandlers } from "./ports/fake-llm-handlers";
import {
  FakeDocumentConverter,
  FakeEmailSender,
  FakeEmbedder,
  FakeTranscriber,
  FakeWebFetcher,
  InMemoryVectorStore,
} from "./ports/fakes";
import type { LlmClient, LlmRequestBase, LlmUsage } from "./ports/llm";
import { PoliteWebFetcher } from "./ports/polite-fetcher";
import { createLlmFromEnv, sesEmailRouting } from "./ports/provider-switch";
import { LogEmailSender, ResendEmailSender } from "./ports/resend-email";
import type { Transcriber } from "./ports/transcriber";
import type { VectorStore } from "./ports/vector-store";
import { VectorizeStore } from "./ports/vectorize-store";
import type { WebFetcher } from "./ports/web-fetcher";
import { WorkersAiConverter, WorkersAiEmbedder, WorkersAiTranscriber } from "./ports/workers-ai";
import { createLlmBudgetGuard } from "./services/guards/llm-budget";

/** Used when a real deployment has no LLM provider configured: every call fails with a clear 503. */
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
  embedder: Embedder;
  vectors: VectorStore;
  converter: DocumentConverter;
  transcriber: Transcriber;
  email: EmailSender;
  web: WebFetcher;
  billing: BillingProvider | null;
  logger: Logger;
  now: () => Date;
  /** Run work after the response is sent (ctx.waitUntil); runs inline when unavailable. */
  defer: (p: Promise<unknown>) => void;
}

/** Per-isolate singletons for fakes so state survives across requests in tests and offline demos. */
const fakeSingletons = {
  vectors: new InMemoryVectorStore(),
  email: new FakeEmailSender(),
  web: new FakeWebFetcher(),
};
export const testFakes = fakeSingletons;

export interface ContextOverrides extends Partial<Omit<AppContext, "env">> {
  executionCtx?: Pick<ExecutionContext, "waitUntil">;
}

/** Refuse to run with APP_ENV=test outside the vitest runner (it enables a test-only identity header). */
export function assertRuntimeEnv(env: Pick<Env, "APP_ENV" | "TEST_SCHEMA_SQL">): void {
  if (env.APP_ENV === "test" && !env.TEST_SCHEMA_SQL) {
    throw new Error("APP_ENV=test outside the test runner: refusing to start");
  }
}

export function createAppContext(env: Env, overrides: ContextOverrides = {}): AppContext {
  assertRuntimeEnv(env);
  const db = overrides.db ?? createDb(env.DB);
  const logger = overrides.logger ?? createLogger({ app: "grant-autopilot", env: env.APP_ENV });
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
        applicationId: req.applicationId ?? null,
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

  // LLM_PROVIDER picks first-party Anthropic (default), Claude Platform on AWS, or AWS with
  // per-call failover to first party (ports/provider-switch.ts).
  const realLlm =
    overrides.llm || fake ? null : createLlmFromEnv(env, { onUsage: recordUsage, logger });
  const llm: LlmClient =
    overrides.llm ??
    (fake
      ? new FakeLlm(allFakeHandlers)
      : realLlm
        ? new BudgetedLlm(realLlm, createLlmBudgetGuard(env, db, logger))
        : // Never fall back to fake output in a real deployment: fail loudly instead.
          notConfiguredLlm);

  const waitUntil = overrides.executionCtx?.waitUntil.bind(overrides.executionCtx);

  return {
    env,
    db,
    llm,
    embedder:
      overrides.embedder ??
      (fake ? new FakeEmbedder() : new WorkersAiEmbedder(env.AI, env.EMBEDDING_MODEL)),
    vectors:
      overrides.vectors ??
      (fake ? fakeSingletons.vectors : (env.VECTOR_STORE ?? new VectorizeStore(env.VECTORS))),
    converter:
      overrides.converter ?? (fake ? new FakeDocumentConverter() : new WorkersAiConverter(env.AI)),
    transcriber:
      overrides.transcriber ??
      (fake ? new FakeTranscriber() : new WorkersAiTranscriber(env.AI, env.TRANSCRIBE_MODEL)),
    email: overrides.email ?? (fake ? fakeSingletons.email : createEmailSender(env, logger)),
    web:
      overrides.web ?? (fake ? fakeSingletons.web : new PoliteWebFetcher(env.CRAWLER_USER_AGENT)),
    billing: overrides.billing !== undefined ? overrides.billing : createBillingProvider(env),
    logger,
    now: overrides.now ?? (() => new Date()),
    defer: overrides.defer ?? ((p) => (waitUntil ? waitUntil(p) : void p)),
  };
}

/**
 * The real email sender (docs/EMAIL.md). `EMAIL_PROVIDER` picks the transactional provider:
 * - "cloudflare": Cloudflare Email Service through the `EMAIL` binding;
 * - "resend": Resend (needs RESEND_API_KEY);
 * - "auto" or unset: Resend while RESEND_API_KEY is set (the setup before 2026-11-24), else Cloudflare.
 * Marketing mail (category "marketing") always goes to Resend when its key is set, because Cloudflare
 * accepts transactional mail only; with no key it fails, so nothing is recorded as sent.
 * With neither provider every email is only logged, as before.
 * - "ses" / "ses-with-fallback": Amazon SES for both categories; with fallback, the senders above
 *   take a message only when SES definitely refused it (ports/provider-switch.ts, docs/EMAIL.md).
 */
export function createEmailSender(
  env: Pick<Env, "EMAIL_PROVIDER" | "RESEND_API_KEY" | "EMAIL_FROM"> &
    Parameters<typeof sesEmailRouting>[0] & { EMAIL?: EmailSendBinding },
  logger: Pick<Logger, "warn"> = createLogger({ app: "grant-autopilot" }),
): EmailSender {
  const resend = env.RESEND_API_KEY
    ? new ResendEmailSender(env.RESEND_API_KEY, env.EMAIL_FROM)
    : null;
  const cloudflare = env.EMAIL ? new CloudflareEmailSender(env.EMAIL, env.EMAIL_FROM) : null;
  const choice = (env.EMAIL_PROVIDER ?? "auto").trim().toLowerCase();
  const transactional =
    choice === "cloudflare" ? cloudflare : choice === "resend" ? resend : (resend ?? cloudflare);
  const ses = sesEmailRouting(
    env,
    {
      transactional,
      marketing: resend,
      transactionalName: transactional === resend ? "resend" : "cloudflare",
    },
    { logger },
  );
  if (ses) return new CategoryRoutedEmailSender(ses.transactional, ses.marketing);
  if (!transactional) return new LogEmailSender();
  return new CategoryRoutedEmailSender(transactional, resend ?? new NoMarketingProviderSender());
}
