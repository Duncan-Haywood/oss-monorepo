// LLM port. All model calls in the app go through this interface so that:
//  - prompts are cache-friendly (stable system + context blocks first, volatile prompt last)
//  - every call is metered (tokens -> cost) and attributable to an org / application
//  - tests and offline demos use a deterministic FakeLlm keyed by `purpose`
import type { z } from "zod";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface LlmUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicros: number;
  latencyMs: number;
  stopReason: string | null;
}

export interface LlmRequestBase {
  /** Dotted purpose key, e.g. "drafting.section". Used for telemetry, per-purpose model config and fakes. */
  purpose: string;
  orgId?: string | null;
  applicationId?: string | null;
  /** Stable instructions. Never interpolate timestamps / ids here (breaks prompt caching). */
  system: string;
  /** Large, stable-per-org context (facts, documents). Placed before `prompt` and cached. */
  context?: string;
  /** The volatile, task-specific instruction. */
  prompt: string;
  effort?: Effort;
  maxTokens?: number;
}

export interface StructuredRequest<T> extends LlmRequestBase {
  schema: z.ZodType<T>;
}

export interface LlmClient {
  generateStructured<T>(req: StructuredRequest<T>): Promise<{ data: T; usage: LlmUsage }>;
  generateText(req: LlmRequestBase): Promise<{ text: string; usage: LlmUsage }>;
}

/** Thrown when the model declines (stop_reason "refusal") even after server-side fallback. */
export class LlmRefusalError extends Error {
  constructor(
    public readonly purpose: string,
    public readonly category: string | null,
  ) {
    super(`Model declined request for ${purpose}${category ? ` (${category})` : ""}`);
    this.name = "LlmRefusalError";
  }
}

/** Thrown when output could not be parsed into the schema (or hit max_tokens). */
export class LlmOutputError extends Error {
  constructor(
    public readonly purpose: string,
    message: string,
  ) {
    super(`${purpose}: ${message}`);
    this.name = "LlmOutputError";
  }
}
