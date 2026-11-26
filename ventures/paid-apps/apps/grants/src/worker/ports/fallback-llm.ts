// LlmClient that tries a primary provider and, when that provider is unavailable for this call,
// repeats the same call on a secondary one. Used for the switch to Claude Platform on AWS
// (`LLM_PROVIDER=aws-with-fallback`: AWS first, first-party Anthropic API on failure).
//
// Falls back only on failures that say "this provider can't serve you right now", where the other
// provider plausibly can: 429, 5xx (incl. 529 overloaded), 408/409, connection errors and timeouts,
// and 401/403 (credentials, IAM or workspace misconfigured on one side). The SDK has already
// retried 408/409/429/5xx/connection errors on the primary by then.
// It never falls back on request errors (400, 404, 413, 422): the same request would fail the same
// way. Refusals and unparseable output (LlmRefusalError / LlmOutputError) are model answers, not
// provider outages, so they propagate too. LLM calls have no side effect beyond cost, so a retry on
// the other provider is safe; the failed primary call is not recorded (onUsage runs on success only).
import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient, LlmRequestBase, LlmUsage, StructuredRequest } from "./llm";

export interface LlmFallbackEvent {
  purpose: string;
  from: string;
  to: string;
  status: number | null;
  error: string;
}

/** True when an error from the primary should send the call to the secondary provider. */
export function isProviderUnavailable(err: unknown): boolean {
  if (err instanceof Anthropic.APIConnectionError) return true; // incl. APIConnectionTimeoutError
  if (err instanceof Anthropic.APIError) {
    const s = err.status;
    if (s === undefined) return false;
    return s === 401 || s === 403 || s === 408 || s === 409 || s === 429 || s >= 500;
  }
  return false;
}

export class FallbackLlm implements LlmClient {
  constructor(
    private readonly primary: LlmClient,
    private readonly secondary: LlmClient,
    private readonly names: { primary: string; secondary: string },
    private readonly onFallback?: (e: LlmFallbackEvent) => void,
  ) {}

  private async run<R extends { usage: LlmUsage }>(
    req: LlmRequestBase,
    call: (client: LlmClient) => Promise<R>,
  ): Promise<R> {
    try {
      return await call(this.primary);
    } catch (err) {
      if (!isProviderUnavailable(err)) throw err;
      this.onFallback?.({
        purpose: req.purpose,
        from: this.names.primary,
        to: this.names.secondary,
        status: err instanceof Anthropic.APIError ? (err.status ?? null) : null,
        error: err instanceof Error ? err.name : "unknown",
      });
      return call(this.secondary);
    }
  }

  generateStructured<T>(req: StructuredRequest<T>): Promise<{ data: T; usage: LlmUsage }> {
    return this.run(req, (c) => c.generateStructured(req));
  }

  generateText(req: LlmRequestBase): Promise<{ text: string; usage: LlmUsage }> {
    return this.run(req, (c) => c.generateText(req));
  }
}
