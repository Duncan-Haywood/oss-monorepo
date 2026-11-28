import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AnthropicLlm, supportsServerFallback } from "./anthropic-llm";

describe("server-side refusal fallback", () => {
  it("is off for Haiku models, which have none, and on for Sonnet and Opus", () => {
    expect(supportsServerFallback("claude-haiku-5-5")).toBe(false);
    expect(supportsServerFallback("claude-sonnet-5-5")).toBe(true);
    expect(supportsServerFallback("claude-opus-5-5")).toBe(true);
  });
});

// The SDK is the largest dependency in the Worker bundle, so it is imported on the first model
// call rather than at Worker startup (docs/history/cmmc-worker-cold-start-perf-2026-11-28.md).
describe("SDK loaded on first use", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("has no value import of @anthropic-ai/sdk, only a type import and import() calls", () => {
    const src = readFileSync(new URL("./anthropic-llm.ts", import.meta.url), "utf8");
    const staticImports = [...src.matchAll(/^import\s+(type\s+)?[^;]*?from\s+"([^"]+)"/gms)]
      .filter((m) => m[2]?.startsWith("@anthropic-ai/sdk"))
      .map((m) => Boolean(m[1]));
    expect(staticImports).toEqual([true]);
    expect(src).toContain('import("@anthropic-ai/sdk")');
  });

  const reply = (text: string, stop_reason = "end_turn") => ({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [{ type: "text", text }],
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
  });

  const stubFetch = (body: unknown) => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json", "request-id": "req_test" },
      });
    });
    return calls;
  };

  it("generateText sends the request through the lazily loaded SDK and reads the reply", async () => {
    const calls = stubFetch(reply("hello"));
    const usages: string[] = [];
    const llm = new AnthropicLlm({
      apiKey: "test-key",
      defaultModel: "claude-sonnet-5-5",
      onUsage: (purpose) => {
        usages.push(purpose);
      },
    });
    const out = await llm.generateText({ purpose: "t.text", system: "sys", prompt: "hi" });
    expect(out.text).toBe("hello");
    expect(out.usage.inputTokens).toBe(10);
    expect(usages).toEqual(["t.text"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain("/v1/messages");
    expect(calls[0]?.body.model).toBe("claude-sonnet-5-5");
    expect(calls[0]?.body.fallbacks).toBe("default");

    // A second call on the same instance reuses the client.
    await llm.generateText({ purpose: "t.text", system: "sys", prompt: "again" });
    expect(calls).toHaveLength(2);
  });

  it("generateStructured passes a Zod output format and returns the parsed object", async () => {
    const calls = stubFetch(reply(JSON.stringify({ control: "AC.L2-3.1.1", met: true })));
    const llm = new AnthropicLlm({ apiKey: "test-key", defaultModel: "claude-haiku-5-5" });
    const out = await llm.generateStructured({
      purpose: "t.structured",
      system: "sys",
      prompt: "extract",
      schema: z.object({ control: z.string(), met: z.boolean() }),
    });
    expect(out.data).toEqual({ control: "AC.L2-3.1.1", met: true });
    const config = calls[0]?.body.output_config as { format?: { type?: string } };
    expect(config.format?.type).toBe("json_schema");
    expect(calls[0]?.body.fallbacks).toBeUndefined();
  });

  it("uses a client passed in the options instead of building one", async () => {
    const create = vi.fn(async () => reply("from injected"));
    const client = { beta: { messages: { create } } } as never;
    const llm = new AnthropicLlm({ client, defaultModel: "claude-sonnet-5-5" });
    const out = await llm.generateText({ purpose: "t.inject", system: "sys", prompt: "hi" });
    expect(out.text).toBe("from injected");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("still raises a refusal as LlmRefusalError", async () => {
    stubFetch(reply("", "refusal"));
    const llm = new AnthropicLlm({ apiKey: "test-key", defaultModel: "claude-sonnet-5-5" });
    await expect(
      llm.generateText({ purpose: "t.refuse", system: "sys", prompt: "x" }),
    ).rejects.toMatchObject({ name: "LlmRefusalError", purpose: "t.refuse" });
  });
});
