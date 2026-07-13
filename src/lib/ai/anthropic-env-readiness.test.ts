import { describe, expect, it } from "vitest";
import {
  ANTHROPIC_ENV_NAMES,
  assessAnthropicEnvReadiness,
  isAnthropicApiKeyConfigured,
  isAnthropicApiKeyPlaceholder,
  listRequiredAnthropicEnvNames,
} from "./anthropic-env-readiness";

describe("listRequiredAnthropicEnvNames", () => {
  it("lists ANTHROPIC_API_KEY in stable order", () => {
    expect(listRequiredAnthropicEnvNames()).toEqual([...ANTHROPIC_ENV_NAMES]);
    expect(listRequiredAnthropicEnvNames()).toEqual(["ANTHROPIC_API_KEY"]);
  });
});

describe("isAnthropicApiKeyPlaceholder", () => {
  it("flags documented .env.example placeholders", () => {
    expect(isAnthropicApiKeyPlaceholder("sk-ant-...")).toBe(true);
    expect(isAnthropicApiKeyPlaceholder("sk-ant-…")).toBe(true);
    expect(isAnthropicApiKeyPlaceholder("sk-ant-placeholder")).toBe(true);
    expect(isAnthropicApiKeyPlaceholder("sk-ant-placeholder_abc")).toBe(true);
  });

  it("does not flag real-looking keys", () => {
    expect(isAnthropicApiKeyPlaceholder("sk-ant-api03-abc123")).toBe(false);
  });
});

describe("isAnthropicApiKeyConfigured", () => {
  it("rejects missing, empty, and whitespace-only values", () => {
    expect(isAnthropicApiKeyConfigured(undefined)).toBe(false);
    expect(isAnthropicApiKeyConfigured("")).toBe(false);
    expect(isAnthropicApiKeyConfigured("   ")).toBe(false);
    expect(isAnthropicApiKeyConfigured("\t")).toBe(false);
  });

  it("rejects documented placeholders that would stub-fallback after Anthropic fail", () => {
    expect(isAnthropicApiKeyConfigured("sk-ant-...")).toBe(false);
    expect(isAnthropicApiKeyConfigured("sk-ant-placeholder")).toBe(false);
    expect(isAnthropicApiKeyConfigured("  sk-ant-...  ")).toBe(false);
  });

  it("accepts a trimmed real-looking key", () => {
    expect(isAnthropicApiKeyConfigured("sk-ant-api03-abc123")).toBe(true);
    expect(isAnthropicApiKeyConfigured("  sk-ant-api03-xyz  ")).toBe(true);
  });
});

describe("assessAnthropicEnvReadiness", () => {
  it("reports missing when env is empty", () => {
    const result = assessAnthropicEnvReadiness({});
    expect(result.ready).toBe(false);
    expect(result.required).toEqual(["ANTHROPIC_API_KEY"]);
    expect(result.present).toEqual([]);
    expect(result.missing).toEqual(["ANTHROPIC_API_KEY"]);
    expect(result.apiKeyReady).toBe(false);
    expect(result.placeholderDetected).toBe(false);
  });

  it("treats whitespace-only as missing (not placeholder)", () => {
    const result = assessAnthropicEnvReadiness({ ANTHROPIC_API_KEY: "   " });
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(["ANTHROPIC_API_KEY"]);
    expect(result.placeholderDetected).toBe(false);
  });

  it("flags placeholder keys as not ready", () => {
    const result = assessAnthropicEnvReadiness({
      ANTHROPIC_API_KEY: "sk-ant-...",
    });
    expect(result.ready).toBe(false);
    expect(result.apiKeyReady).toBe(false);
    expect(result.placeholderDetected).toBe(true);
    expect(result.missing).toEqual(["ANTHROPIC_API_KEY"]);
  });

  it("is ready when ANTHROPIC_API_KEY is a non-placeholder secret", () => {
    const result = assessAnthropicEnvReadiness({
      ANTHROPIC_API_KEY: "sk-ant-api03-abc123",
    });
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.present).toEqual(["ANTHROPIC_API_KEY"]);
    expect(result.apiKeyReady).toBe(true);
    expect(result.placeholderDetected).toBe(false);
  });
});
