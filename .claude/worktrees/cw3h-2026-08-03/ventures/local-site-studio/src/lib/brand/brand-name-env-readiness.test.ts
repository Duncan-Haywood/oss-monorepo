import { describe, expect, it } from "vitest";
import {
  assessBrandNameEnvReadiness,
  BRAND_NAME_ENV_NAMES,
  isBrandNameConfigured,
  isBrandNamePlaceholder,
  listRequiredBrandNameEnvNames,
} from "./brand-name-env-readiness";

describe("listRequiredBrandNameEnvNames", () => {
  it("lists NEXT_PUBLIC_BRAND_NAME in stable order", () => {
    expect(listRequiredBrandNameEnvNames()).toEqual([...BRAND_NAME_ENV_NAMES]);
    expect(listRequiredBrandNameEnvNames()).toEqual([
      "NEXT_PUBLIC_BRAND_NAME",
    ]);
  });
});

describe("isBrandNamePlaceholder", () => {
  it("flags documented paste placeholders", () => {
    expect(isBrandNamePlaceholder("Your Brand")).toBe(true);
    expect(isBrandNamePlaceholder("your brand")).toBe(true);
    expect(isBrandNamePlaceholder("your-brand")).toBe(true);
    expect(isBrandNamePlaceholder("Brand Name")).toBe(true);
    expect(isBrandNamePlaceholder("Your Company")).toBe(true);
    expect(isBrandNamePlaceholder("Company Name")).toBe(true);
    expect(isBrandNamePlaceholder("Acme")).toBe(true);
    expect(isBrandNamePlaceholder("Example")).toBe(true);
    expect(isBrandNamePlaceholder("TODO")).toBe(true);
    expect(isBrandNamePlaceholder("changeme")).toBe(true);
    expect(isBrandNamePlaceholder("placeholder")).toBe(true);
    expect(isBrandNamePlaceholder("Your Brand LLC")).toBe(true);
    expect(isBrandNamePlaceholder("Brand Name Inc")).toBe(true);
    expect(isBrandNamePlaceholder("changeme-brand")).toBe(true);
  });

  it("accepts real-looking brand names", () => {
    expect(isBrandNamePlaceholder("Local Site Studio")).toBe(false);
    expect(isBrandNamePlaceholder("Maris Stella")).toBe(false);
  });
});

describe("isBrandNameConfigured", () => {
  it("rejects missing, empty, and whitespace-only values", () => {
    expect(isBrandNameConfigured(undefined)).toBe(false);
    expect(isBrandNameConfigured("")).toBe(false);
    expect(isBrandNameConfigured("   ")).toBe(false);
    expect(isBrandNameConfigured("\t")).toBe(false);
  });

  it("rejects documented placeholders", () => {
    expect(isBrandNameConfigured("Your Brand")).toBe(false);
    expect(isBrandNameConfigured("  Brand Name  ")).toBe(false);
  });

  it("accepts a trimmed real brand name", () => {
    expect(isBrandNameConfigured("Local Site Studio")).toBe(true);
    expect(isBrandNameConfigured("  Harbor Dental  ")).toBe(true);
  });
});

describe("assessBrandNameEnvReadiness", () => {
  it("reports missing when env is empty", () => {
    const result = assessBrandNameEnvReadiness({});
    expect(result.ready).toBe(false);
    expect(result.required).toEqual(["NEXT_PUBLIC_BRAND_NAME"]);
    expect(result.present).toEqual([]);
    expect(result.missing).toEqual(["NEXT_PUBLIC_BRAND_NAME"]);
    expect(result.brandNameReady).toBe(false);
    expect(result.placeholderDetected).toBe(false);
  });

  it("treats whitespace-only as missing (not placeholder)", () => {
    const result = assessBrandNameEnvReadiness({
      NEXT_PUBLIC_BRAND_NAME: "   ",
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(["NEXT_PUBLIC_BRAND_NAME"]);
    expect(result.placeholderDetected).toBe(false);
  });

  it("does not count legacy NEXT_PUBLIC_APP_NAME as ready", () => {
    const result = assessBrandNameEnvReadiness({
      NEXT_PUBLIC_APP_NAME: "Legacy Brand",
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(["NEXT_PUBLIC_BRAND_NAME"]);
  });

  it("flags placeholder brand names as not ready", () => {
    const result = assessBrandNameEnvReadiness({
      NEXT_PUBLIC_BRAND_NAME: "Your Brand",
    });
    expect(result.ready).toBe(false);
    expect(result.brandNameReady).toBe(false);
    expect(result.placeholderDetected).toBe(true);
    expect(result.missing).toEqual(["NEXT_PUBLIC_BRAND_NAME"]);
  });

  it("is ready when NEXT_PUBLIC_BRAND_NAME is a non-placeholder brand", () => {
    const result = assessBrandNameEnvReadiness({
      NEXT_PUBLIC_BRAND_NAME: "Local Site Studio",
    });
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.present).toEqual(["NEXT_PUBLIC_BRAND_NAME"]);
    expect(result.brandNameReady).toBe(true);
    expect(result.placeholderDetected).toBe(false);
  });
});
