// The service-wide daily AI cap's arithmetic (the count itself runs in test/worker/ai-capacity.test.ts).
import { describe, expect, it } from "vitest";
import {
  DEFAULT_GLOBAL_DAILY_LLM_CAP_USD,
  dailyCapMicros,
  dailyDraftLimit,
  worstDraftCostMicros,
} from "./ai-capacity";

describe("service-wide daily AI cap", () => {
  it("defaults to $1.50 a day (under the venture's $50 a month) when unset, blank or unreadable", () => {
    expect(DEFAULT_GLOBAL_DAILY_LLM_CAP_USD).toBe(1.5);
    expect(DEFAULT_GLOBAL_DAILY_LLM_CAP_USD * 31).toBeLessThan(50);
    for (const raw of [undefined, "", "  ", "lots", "-5"]) {
      expect(dailyCapMicros(raw)).toBe(1_500_000);
    }
    expect(dailyDraftLimit(undefined, "claude-haiku-5-5")).toBe(375);
  });

  it('"off" disables it and "0" is the kill switch', () => {
    expect(dailyCapMicros("off")).toBeNull();
    expect(dailyDraftLimit("OFF", "claude-haiku-5-5")).toBeNull();
    expect(dailyDraftLimit("0", "claude-haiku-5-5")).toBe(0);
  });

  it("prices one draft at its worst: 20k tokens in, the 4k-token cap out", () => {
    // Haiku 5.5 at $0.10 / $0.50 per million tokens: 2,000 + 2,000 micro-USD.
    expect(worstDraftCostMicros("claude-haiku-5-5")).toBe(4_000);
    // Opus 5.5 at $4 / $20: 80,000 + 80,000.
    expect(worstDraftCostMicros("claude-opus-5-5")).toBe(160_000);
  });

  it("turns dollars into drafts with the configured model's price, so the bound holds on any model", () => {
    expect(dailyDraftLimit("30", "claude-haiku-5-5")).toBe(7_500);
    expect(dailyDraftLimit("30", "claude-opus-5-5")).toBe(187);
    // An unknown model is priced as Opus 5.5 (llm-pricing.ts), the conservative side.
    expect(dailyDraftLimit("30", "some-future-model")).toBe(187);
    expect(dailyDraftLimit("0.008", "claude-haiku-5-5")).toBe(2);
  });
});
