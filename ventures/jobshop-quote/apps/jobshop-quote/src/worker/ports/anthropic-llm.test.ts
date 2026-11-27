import { describe, expect, it } from "vitest";
import { supportsServerFallback } from "./anthropic-llm";

describe("server-side refusal fallback", () => {
  it("is off for Haiku models, which have none, and on for Sonnet and Opus", () => {
    expect(supportsServerFallback("claude-haiku-5-5")).toBe(false);
    expect(supportsServerFallback("claude-sonnet-5-5")).toBe(true);
    expect(supportsServerFallback("claude-opus-5-5")).toBe(true);
  });
});
