import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { AnthropicLlm } from "./anthropic-llm";
import { createClaudeOnAwsClient } from "./claude-on-aws";
import { FallbackLlm, isProviderUnavailable, type LlmFallbackEvent } from "./fallback-llm";
import {
  type LlmClient,
  LlmRefusalError,
  type LlmRequestBase,
  type LlmUsage,
  type StructuredRequest,
} from "./llm";

const usage = (model: string): LlmUsage => ({
  model,
  inputTokens: 1,
  outputTokens: 1,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costMicros: 1,
  latencyMs: 1,
  stopReason: "end_turn",
});

class StubLlm implements LlmClient {
  calls = 0;
  constructor(
    private readonly name: string,
    private readonly fail?: unknown,
  ) {}
  async generateStructured<T>(_req: StructuredRequest<T>): Promise<{ data: T; usage: LlmUsage }> {
    this.calls++;
    if (this.fail) throw this.fail;
    return { data: { from: this.name } as T, usage: usage(this.name) };
  }
  async generateText(_req: LlmRequestBase): Promise<{ text: string; usage: LlmUsage }> {
    this.calls++;
    if (this.fail) throw this.fail;
    return { text: this.name, usage: usage(this.name) };
  }
}

const apiError = (status: number) =>
  Anthropic.APIError.generate(status, { type: "error", error: { type: "x" } }, "x", new Headers());
const REQ = { purpose: "matching.score", system: "s", prompt: "p" };

describe("isProviderUnavailable", () => {
  it("treats outages, throttling and auth as provider problems, request errors as not", () => {
    for (const s of [401, 403, 408, 409, 429, 500, 503, 529]) {
      expect(isProviderUnavailable(apiError(s))).toBe(true);
    }
    for (const s of [400, 404, 413, 422]) expect(isProviderUnavailable(apiError(s))).toBe(false);
    expect(isProviderUnavailable(new Anthropic.APIConnectionError({ message: "reset" }))).toBe(
      true,
    );
    expect(isProviderUnavailable(new Anthropic.APIConnectionTimeoutError())).toBe(true);
    expect(isProviderUnavailable(new LlmRefusalError("x", "cyber"))).toBe(false);
    expect(isProviderUnavailable(new Error("budget"))).toBe(false);
  });
});

describe("FallbackLlm", () => {
  const make = (fail?: unknown) => {
    const primary = new StubLlm("aws", fail);
    const secondary = new StubLlm("anthropic");
    const events: LlmFallbackEvent[] = [];
    const llm = new FallbackLlm(
      primary,
      secondary,
      { primary: "aws", secondary: "anthropic" },
      (e) => events.push(e),
    );
    return { primary, secondary, events, llm };
  };

  it("uses the primary when it answers", async () => {
    const { llm, secondary, events } = make();
    expect((await llm.generateText(REQ)).text).toBe("aws");
    expect(secondary.calls).toBe(0);
    expect(events).toHaveLength(0);
  });

  it("falls back on 503 and logs the switch", async () => {
    const { llm, events } = make(apiError(503));
    const res = await llm.generateText(REQ);
    expect(res.text).toBe("anthropic");
    expect(res.usage.model).toBe("anthropic");
    expect(events).toEqual([
      {
        purpose: "matching.score",
        from: "aws",
        to: "anthropic",
        status: 503,
        error: "ServiceUnavailableError",
      },
    ]);
    const s = await make(apiError(429)).llm.generateStructured({ ...REQ, schema: {} as never });
    expect(s.data).toEqual({ from: "anthropic" });
  });

  it("does not fall back on 400 or a refusal", async () => {
    const bad = make(apiError(400));
    await expect(bad.llm.generateText(REQ)).rejects.toBeInstanceOf(Anthropic.BadRequestError);
    expect(bad.secondary.calls).toBe(0);
    const refused = make(new LlmRefusalError("x", null));
    await expect(refused.llm.generateText(REQ)).rejects.toBeInstanceOf(LlmRefusalError);
    expect(refused.secondary.calls).toBe(0);
  });

  it("falls back end to end when the AWS endpoint returns 503", async () => {
    let awsCalls = 0;
    const aws = new AnthropicLlm({
      defaultModel: "claude-opus-5-5",
      client: createClaudeOnAwsClient({
        region: "us-east-1",
        workspaceId: "wrkspc_x",
        credentials: { accessKeyId: "AKID", secretAccessKey: "secret" },
        maxRetries: 0,
        fetchImpl: async () => {
          awsCalls++;
          return new Response(
            JSON.stringify({ type: "error", error: { type: "api_error", message: "down" } }),
            { status: 503, headers: { "content-type": "application/json" } },
          );
        },
      }),
    });
    const secondary = new StubLlm("anthropic");
    const llm = new FallbackLlm(aws, secondary, { primary: "aws", secondary: "anthropic" });
    expect((await llm.generateText(REQ)).text).toBe("anthropic");
    expect(awsCalls).toBe(1);
  });
});
