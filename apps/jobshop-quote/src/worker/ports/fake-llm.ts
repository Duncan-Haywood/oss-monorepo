// Deterministic LLM for tests and the offline demo (FAKE_EXTERNALS=true).
// Each module registers a handler for its purposes (see src/worker/services/*/fake-handlers.ts and
// src/worker/ports/fake-registry.ts). Handlers receive the full request and must return data that
// passes the request's zod schema. Tests can override handlers per test with `fake.on(purpose, fn)`.
import type { LlmClient, LlmRequestBase, LlmUsage, StructuredRequest } from "./llm";
import { LlmOutputError } from "./llm";

export type FakeHandler = (req: LlmRequestBase) => unknown | Promise<unknown>;

const zeroUsage = (model = "fake-llm"): LlmUsage => ({
  model,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costMicros: 0,
  latencyMs: 0,
  stopReason: "end_turn",
});

export class FakeLlm implements LlmClient {
  readonly calls: LlmRequestBase[] = [];
  private handlers = new Map<string, FakeHandler>();

  constructor(defaults: Record<string, FakeHandler> = {}) {
    for (const [k, v] of Object.entries(defaults)) this.handlers.set(k, v);
  }

  on(purpose: string, handler: FakeHandler): this {
    this.handlers.set(purpose, handler);
    return this;
  }

  private handlerFor(purpose: string): FakeHandler {
    const exact = this.handlers.get(purpose);
    if (exact) return exact;
    // prefix match: "drafting.*"
    for (const [key, h] of this.handlers) {
      if (key.endsWith(".*") && purpose.startsWith(key.slice(0, -1))) return h;
    }
    throw new LlmOutputError(purpose, `FakeLlm has no handler for purpose "${purpose}"`);
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<{ data: T; usage: LlmUsage }> {
    this.calls.push(req);
    const raw = await this.handlerFor(req.purpose)(req);
    const parsed = req.schema.safeParse(raw);
    if (!parsed.success) {
      throw new LlmOutputError(req.purpose, `fake output failed schema: ${parsed.error.message}`);
    }
    return { data: parsed.data, usage: estimateUsage(req, JSON.stringify(raw)) };
  }

  async generateText(req: LlmRequestBase): Promise<{ text: string; usage: LlmUsage }> {
    this.calls.push(req);
    const raw = await this.handlerFor(req.purpose)(req);
    const text = typeof raw === "string" ? raw : JSON.stringify(raw);
    return { text, usage: estimateUsage(req, text) };
  }
}

/** Rough token estimate (chars/4) so cost/usage code paths are exercised in tests. */
function estimateUsage(req: LlmRequestBase, output: string): LlmUsage {
  const input = req.system.length + (req.context?.length ?? 0) + req.prompt.length;
  return {
    ...zeroUsage(),
    inputTokens: Math.ceil(input / 4),
    outputTokens: Math.ceil(output.length / 4),
  };
}
