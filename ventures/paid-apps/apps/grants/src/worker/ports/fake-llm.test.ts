import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FakeLlm } from "./fake-llm";
import { costMicros } from "./llm-pricing";

describe("FakeLlm", () => {
  it("validates handler output against the request schema", async () => {
    const llm = new FakeLlm({ "x.ok": () => ({ n: 1 }), "x.bad": () => ({ n: "one" }) });
    const schema = z.object({ n: z.number() });
    await expect(
      llm.generateStructured({ purpose: "x.ok", system: "s", prompt: "p", schema }),
    ).resolves.toMatchObject({
      data: { n: 1 },
    });
    await expect(
      llm.generateStructured({ purpose: "x.bad", system: "s", prompt: "p", schema }),
    ).rejects.toThrow();
  });

  it("supports prefix handlers", async () => {
    const llm = new FakeLlm({ "drafting.*": () => "ok" });
    await expect(
      llm.generateText({ purpose: "drafting.section", system: "s", prompt: "p" }),
    ).resolves.toMatchObject({ text: "ok" });
  });
});

describe("costMicros", () => {
  it("prices Opus 5.5 at $4/$20 per MTok", () => {
    // 1M input + 100k output = $4 + $2 = $6 = 6,000,000 micro-USD
    expect(
      costMicros("claude-opus-5-5", {
        inputTokens: 1_000_000,
        outputTokens: 100_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }),
    ).toBe(6_000_000);
  });
});
