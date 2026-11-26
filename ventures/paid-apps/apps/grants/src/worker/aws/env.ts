// Builds grants' `Env` on Lambda from what the AWS SaaS starter hands a product (docs/AWS.md):
//   starter env.pg       node-postgres Pool (IAM auth, TLS)   -> DB (D1-shaped), JOBS, VECTOR_STORE
//   starter env.BUCKET   R2-shaped S3 bucket                   -> FILES (orgs/{orgId}/ keys enforced)
//   starter env.VARS     the module's non-secret `vars`        -> APP_ENV, APP_URL, LLM_MODEL, ...
//   starter env.secret() Secrets Manager                       -> one JSON secret with grants' secrets
//   process.env          Lambda role credentials + `environment` (stacks/llm: LLM_PROVIDER, workspace)
// APPLICATION_PIPELINE is a queue-backed stand-in for the Cloudflare Workflow (./queued-pipeline.ts).
// Bindings with no AWS counterpart are left unset on purpose and the app already handles that:
// *_LIMITER (in-memory limiter per container),
// EMAIL (SES via EMAIL_PROVIDER=ses), VECTORS (VECTOR_STORE instead).
import type { Env } from "../env";
import { createPgD1, type PgPool } from "./pg-d1";
import { PgQueue } from "./pg-queue";
import { PgVectorStore } from "./pg-vector-store";
import { QueuedPipeline } from "./queued-pipeline";
import { createS3Files, type StarterBucket } from "./s3-files";
import { createWorkersAiRest } from "./workers-ai-rest";

/** The parts of the starter's `env` (runtime/src/env.mjs) grants reads. */
export interface StarterEnv {
  pg: PgPool;
  BUCKET?: StarterBucket;
  VARS?: Record<string, string>;
  secret(name: string): Promise<string>;
}

/** Process env keys passed through (Lambda credentials + stacks/llm / SES config). */
export const PASSTHROUGH_ENV = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_REGION",
  "LLM_PROVIDER",
  "ANTHROPIC_AWS_WORKSPACE_ID",
  "SES_REGION",
  "SES_CONFIGURATION_SET",
  "EMAIL_PROVIDER",
] as const;

/** Keys a secret or var may never set: they are bindings this module owns. */
const RESERVED = new Set([
  "DB",
  "FILES",
  "JOBS",
  "AI",
  "VECTORS",
  "VECTOR_STORE",
  "RUNTIME",
  "EMAIL",
  "APPLICATION_PIPELINE",
  "TEST_SCHEMA_SQL",
]);
const KEY = /^[A-Z][A-Z0-9_]{0,63}$/;

/** Parses the app secret (a JSON object of UPPER_SNAKE string values). Throws on anything else. */
export function parseAppSecret(raw: string): Record<string, string> {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    throw new Error("grants app secret is not JSON");
  }
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("grants app secret must be a JSON object");
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (!KEY.test(k) || RESERVED.has(k))
      throw new Error(`grants app secret has a disallowed key: ${k}`);
    if (typeof val !== "string")
      throw new Error(`grants app secret value for ${k} must be a string`);
    out[k] = val;
  }
  return out;
}

function vars(raw: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (KEY.test(k) && !RESERVED.has(k) && typeof v === "string") out[k] = v;
  }
  return out;
}

/** An AI binding that fails clearly when Workers AI credentials are not configured. */
const notConfiguredAi = new Proxy(
  {},
  {
    get() {
      return () =>
        Promise.reject(
          new Error(
            "Workers AI is not configured (CLOUDFLARE_AI_ACCOUNT_ID / CLOUDFLARE_AI_TOKEN)",
          ),
        );
    },
  },
) as Ai;

export async function buildGrantsEnv(
  starter: StarterEnv,
  processEnv: Record<string, string | undefined>,
): Promise<Env> {
  const config = vars(starter.VARS);
  const secretName = config.GRANTS_SECRET_NAME;
  const secrets = secretName ? parseAppSecret(await starter.secret(secretName)) : {};
  const passthrough: Record<string, string> = {};
  for (const k of PASSTHROUGH_ENV) {
    const v = processEnv[k];
    if (v) passthrough[k] = v;
  }
  if (!starter.BUCKET) throw new Error("the starter gave this product no bucket (BUCKET_NAME)");
  const merged = { ...config, ...passthrough, ...secrets };
  if (merged.APP_ENV === "test") throw new Error("APP_ENV=test is not allowed on Lambda");
  const ai =
    merged.CLOUDFLARE_AI_ACCOUNT_ID && merged.CLOUDFLARE_AI_TOKEN
      ? createWorkersAiRest({
          accountId: merged.CLOUDFLARE_AI_ACCOUNT_ID,
          apiToken: merged.CLOUDFLARE_AI_TOKEN,
        })
      : notConfiguredAi;
  return {
    ...merged,
    RUNTIME: "aws",
    DB: createPgD1(starter.pg),
    FILES: createS3Files(starter.BUCKET),
    JOBS: new PgQueue(starter.pg) as unknown as Queue,
    APPLICATION_PIPELINE: new QueuedPipeline(
      new PgQueue(starter.pg),
    ) as unknown as Env["APPLICATION_PIPELINE"],
    VECTOR_STORE: new PgVectorStore(starter.pg),
    AI: ai,
  } as unknown as Env;
}
