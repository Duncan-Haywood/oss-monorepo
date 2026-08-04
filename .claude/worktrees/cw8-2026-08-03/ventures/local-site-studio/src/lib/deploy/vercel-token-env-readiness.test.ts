import { describe, expect, it } from "vitest";
import {
  VERCEL_TOKEN_ENV_NAMES,
  assessVercelTokenEnvReadiness,
  isVercelTokenConfigured,
  isVercelTokenPlaceholder,
  listRequiredVercelTokenEnvNames,
} from "./vercel-token-env-readiness";

describe("listRequiredVercelTokenEnvNames", () => {
  it("lists VERCEL_TOKEN in stable order", () => {
    expect(listRequiredVercelTokenEnvNames()).toEqual([
      ...VERCEL_TOKEN_ENV_NAMES,
    ]);
    expect(listRequiredVercelTokenEnvNames()).toEqual(["VERCEL_TOKEN"]);
  });
});

describe("isVercelTokenPlaceholder", () => {
  it("flags documented paste placeholders", () => {
    expect(isVercelTokenPlaceholder("changeme")).toBe(true);
    expect(isVercelTokenPlaceholder("token")).toBe(true);
    expect(isVercelTokenPlaceholder("vercel")).toBe(true);
    expect(isVercelTokenPlaceholder("xxx")).toBe(true);
    expect(isVercelTokenPlaceholder("your_token")).toBe(true);
    expect(isVercelTokenPlaceholder("your-token-here")).toBe(true);
    expect(isVercelTokenPlaceholder("placeholder")).toBe(true);
  });

  it("accepts non-placeholder token strings", () => {
    expect(isVercelTokenPlaceholder("abc123secret")).toBe(false);
    expect(isVercelTokenPlaceholder("vercel_abcDEF012345")).toBe(false);
  });
});

describe("isVercelTokenConfigured", () => {
  it("rejects missing, empty, and whitespace-only values", () => {
    expect(isVercelTokenConfigured(undefined)).toBe(false);
    expect(isVercelTokenConfigured("")).toBe(false);
    expect(isVercelTokenConfigured("   ")).toBe(false);
    expect(isVercelTokenConfigured("\t")).toBe(false);
  });

  it("rejects placeholders", () => {
    expect(isVercelTokenConfigured("changeme")).toBe(false);
    expect(isVercelTokenConfigured("  token  ")).toBe(false);
  });

  it("accepts a trimmed non-placeholder token", () => {
    expect(isVercelTokenConfigured("vercel_live_abc123")).toBe(true);
    expect(isVercelTokenConfigured("  vercel_live_abc123  ")).toBe(true);
  });
});

describe("assessVercelTokenEnvReadiness", () => {
  it("reports missing when env is empty", () => {
    const result = assessVercelTokenEnvReadiness({});
    expect(result.ready).toBe(false);
    expect(result.required).toEqual(["VERCEL_TOKEN"]);
    expect(result.present).toEqual([]);
    expect(result.missing).toEqual(["VERCEL_TOKEN"]);
    expect(result.tokenReady).toBe(false);
    expect(result.placeholderDetected).toBe(false);
  });

  it("treats whitespace-only as missing (not placeholder)", () => {
    const result = assessVercelTokenEnvReadiness({
      VERCEL_TOKEN: "   ",
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(["VERCEL_TOKEN"]);
    expect(result.placeholderDetected).toBe(false);
  });

  it("flags placeholders as not ready", () => {
    const result = assessVercelTokenEnvReadiness({
      VERCEL_TOKEN: "changeme",
    });
    expect(result.ready).toBe(false);
    expect(result.tokenReady).toBe(false);
    expect(result.placeholderDetected).toBe(true);
    expect(result.missing).toEqual(["VERCEL_TOKEN"]);
  });

  it("is ready when VERCEL_TOKEN is a non-placeholder secret", () => {
    const result = assessVercelTokenEnvReadiness({
      VERCEL_TOKEN: "vercel_live_abc123",
    });
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.present).toEqual(["VERCEL_TOKEN"]);
    expect(result.tokenReady).toBe(true);
    expect(result.placeholderDetected).toBe(false);
  });
});
