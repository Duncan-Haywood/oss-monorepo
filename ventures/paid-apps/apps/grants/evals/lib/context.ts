// Minimal AppContext for running drafting + grounding in plain Node (tsx), outside workerd.
// - llm: AnthropicLlm when ANTHROPIC_API_KEY is set (and --fake is not), else FakeLlm(allFakeHandlers);
//   either way every call's usage is accumulated by a UsageMeter, tagged with the current phase.
// - db: a recording stub whose query chains resolve to [] / undefined (no D1 in Node).
// - ports the eval does not need (embedder, vectors, ...) throw on use and are recorded, so the
//   report says exactly which seams the modules reached for.
// Only type imports from context.ts / db/client.ts: importing them for real would pull in D1/Workers AI.

import type { AppContext } from "@worker/context";
import type { Db } from "@worker/db/client";
import type { Env } from "@worker/env";
import type { Logger } from "@worker/lib/logger";
import { AnthropicLlm } from "@worker/ports/anthropic-llm";
import { FakeLlm } from "@worker/ports/fake-llm";
import { allFakeHandlers } from "@worker/ports/fake-llm-handlers";
import type { LlmClient, LlmRequestBase, LlmUsage, StructuredRequest } from "@worker/ports/llm";
import { getTableName, is, Table } from "drizzle-orm";
import { anthropicApiKey, hasAnthropicCredentials } from "./credentials";

export interface UsageRecord {
  phase: string;
  purpose: string;
  usage: LlmUsage;
  error?: string;
}

export interface UsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicros: number;
}

export class UsageMeter {
  readonly records: UsageRecord[] = [];
  phase = "unscoped";

  add(purpose: string, usage: LlmUsage, error?: string) {
    this.records.push({ phase: this.phase, purpose, usage, ...(error ? { error } : {}) });
  }

  totals(filter: (r: UsageRecord) => boolean = () => true): UsageTotals {
    const t: UsageTotals = {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costMicros: 0,
    };
    for (const r of this.records) {
      if (!filter(r)) continue;
      t.calls += 1;
      t.inputTokens += r.usage.inputTokens;
      t.outputTokens += r.usage.outputTokens;
      t.cacheReadTokens += r.usage.cacheReadTokens;
      t.cacheWriteTokens += r.usage.cacheWriteTokens;
      t.costMicros += r.usage.costMicros;
    }
    return t;
  }

  /** Wraps a client that does not report usage itself (FakeLlm). */
  wrap(inner: LlmClient): LlmClient {
    return {
      generateStructured: async <T>(req: StructuredRequest<T>) => {
        const out = await inner.generateStructured(req);
        this.add(req.purpose, out.usage);
        return out;
      },
      generateText: async (req: LlmRequestBase) => {
        const out = await inner.generateText(req);
        this.add(req.purpose, out.usage);
        return out;
      },
    };
  }
}

export interface LogEntry {
  level: "debug" | "info" | "warn" | "error";
  msg: string;
  data?: Record<string, unknown>;
}

function recordingLogger(
  sink: LogEntry[],
  echo: boolean,
  bindings: Record<string, unknown> = {},
): Logger {
  const log = (level: LogEntry["level"]) => (msg: string, data?: Record<string, unknown>) => {
    const entry: LogEntry = { level, msg, data: { ...bindings, ...data } };
    sink.push(entry);
    if (echo || level === "error") console.error(`[${level}] ${msg} ${JSON.stringify(entry.data)}`);
  };
  return {
    debug: log("debug"),
    info: log("info"),
    warn: log("warn"),
    error: log("error"),
    child: (b) => recordingLogger(sink, echo, { ...bindings, ...b }),
  };
}

/** What the modules under test touched on the stub context (reported so they can expose cleaner seams). */
export interface StubAccess {
  db: string[];
  ports: string[];
}

const tableOf = (v: unknown): string | null => (is(v, Table) ? getTableName(v as Table) : null);

/**
 * Drizzle-shaped stub: any chain (`select().from(t).where(...).orderBy(...).limit(n)`) is accepted;
 * `.all()` / awaiting resolves to [], `.get()` to undefined, `.run()` to a D1-like result.
 */
export function createStubDb(access: StubAccess): Db {
  const chain = (op: string, table: string | null): unknown =>
    new Proxy(() => undefined, {
      get(_t, prop) {
        if (typeof prop === "symbol") return undefined;
        const done = (result: unknown) => {
          access.db.push(`${op}${table ? ` ${table}` : ""} -> ${prop}`);
          return result;
        };
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => resolve(done([]));
        }
        if (prop === "all") return async () => done([]);
        if (prop === "get") return async () => done(undefined);
        if (prop === "run") return async () => done({ success: true, meta: { changes: 0 } });
        return (...args: unknown[]) => chain(op, table ?? args.map(tableOf).find(Boolean) ?? null);
      },
    });
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (typeof prop === "symbol") return undefined;
        if (prop === "batch") {
          return async (qs: unknown[]) => {
            access.db.push(`batch(${qs.length})`);
            return qs.map(() => []);
          };
        }
        return (...args: unknown[]) => chain(String(prop), args.map(tableOf).find(Boolean) ?? null);
      },
    },
  ) as Db;
}

/** A port the eval does not provide: records the access and throws (modules should degrade). */
function unavailable<T extends object>(name: string, access: StubAccess): T {
  return new Proxy({} as T, {
    get(_t, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      access.ports.push(`${name}.${prop}`);
      return () => {
        throw new Error(`evals: ctx.${name}.${prop} is not available outside the worker`);
      };
    },
  });
}

export interface EvalContext {
  ctx: AppContext;
  meter: UsageMeter;
  logs: LogEntry[];
  access: StubAccess;
  mode: "fake" | "anthropic";
  model: string;
}

export function createEvalContext(opts: { fake: boolean; verbose?: boolean }): EvalContext {
  const apiKey = anthropicApiKey();
  const model = process.env.LLM_MODEL || "claude-haiku-5-5";
  const mode = opts.fake || !hasAnthropicCredentials() ? "fake" : "anthropic";
  const meter = new UsageMeter();
  const logs: LogEntry[] = [];
  const access: StubAccess = { db: [], ports: [] };

  const llm: LlmClient =
    mode === "anthropic"
      ? new AnthropicLlm({
          ...(apiKey ? { apiKey } : {}),
          defaultModel: model,
          onUsage: (purpose, usage, _req, error) => meter.add(purpose, usage, error),
        })
      : meter.wrap(new FakeLlm(allFakeHandlers));

  // Only the Env fields the modules read in Node; everything else is a Worker binding.
  const env = {
    APP_ENV: "eval",
    FAKE_EXTERNALS: mode === "fake" ? "true" : "false",
    LLM_MODEL: model,
  } as Partial<Env> as Env;

  const ctx: AppContext = {
    env,
    db: createStubDb(access),
    llm,
    embedder: unavailable("embedder", access),
    vectors: unavailable("vectors", access),
    converter: unavailable("converter", access),
    transcriber: unavailable("transcriber", access),
    email: unavailable("email", access),
    web: unavailable("web", access),
    billing: null,
    logger: recordingLogger(logs, !!opts.verbose),
    now: () => new Date(),
    defer: (p) => {
      p.catch((e: unknown) =>
        logs.push({ level: "error", msg: "defer.failed", data: { error: String(e) } }),
      );
    },
  };
  return { ctx, meter, logs, access, mode, model };
}
