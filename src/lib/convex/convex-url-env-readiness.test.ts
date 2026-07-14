import { describe, expect, it } from "vitest";
import {
  CONVEX_URL_ENV_NAMES,
  assessConvexUrlEnvReadiness,
  isConvexUrlConfigured,
  isConvexUrlPlaceholder,
  listRequiredConvexUrlEnvNames,
  resolveConvexDeploymentUrl,
} from "./convex-url-env-readiness";

describe("listRequiredConvexUrlEnvNames", () => {
  it("lists NEXT_PUBLIC_CONVEX_URL in stable order", () => {
    expect(listRequiredConvexUrlEnvNames()).toEqual([
      ...CONVEX_URL_ENV_NAMES,
    ]);
    expect(listRequiredConvexUrlEnvNames()).toEqual([
      "NEXT_PUBLIC_CONVEX_URL",
    ]);
  });
});

describe("isConvexUrlPlaceholder", () => {
  it("flags documented paste placeholders", () => {
    expect(isConvexUrlPlaceholder("changeme")).toBe(true);
    expect(isConvexUrlPlaceholder("your_convex_url")).toBe(true);
    expect(isConvexUrlPlaceholder("https://example.convex.cloud")).toBe(true);
    expect(isConvexUrlPlaceholder("https://your-deployment.convex.cloud/")).toBe(
      true,
    );
    expect(isConvexUrlPlaceholder("https://xxx.convex.cloud")).toBe(true);
    expect(isConvexUrlPlaceholder("placeholder")).toBe(true);
  });

  it("accepts non-placeholder Convex deployment URLs", () => {
    expect(
      isConvexUrlPlaceholder("https://happy-animal-123.convex.cloud"),
    ).toBe(false);
    expect(
      isConvexUrlPlaceholder("https://local-site-studio.convex.cloud"),
    ).toBe(false);
  });
});

describe("resolveConvexDeploymentUrl", () => {
  it("returns null for missing, empty, and whitespace-only values", () => {
    expect(resolveConvexDeploymentUrl(undefined)).toBeNull();
    expect(resolveConvexDeploymentUrl("")).toBeNull();
    expect(resolveConvexDeploymentUrl("   ")).toBeNull();
    expect(resolveConvexDeploymentUrl("\t")).toBeNull();
  });

  it("returns null for placeholders", () => {
    expect(resolveConvexDeploymentUrl("changeme")).toBeNull();
    expect(
      resolveConvexDeploymentUrl("  https://example.convex.cloud  "),
    ).toBeNull();
  });

  it("returns the trimmed non-placeholder URL", () => {
    expect(
      resolveConvexDeploymentUrl("  https://happy-animal-123.convex.cloud  "),
    ).toBe("https://happy-animal-123.convex.cloud");
  });
});

describe("isConvexUrlConfigured", () => {
  it("rejects missing, empty, whitespace-only, and placeholders", () => {
    expect(isConvexUrlConfigured(undefined)).toBe(false);
    expect(isConvexUrlConfigured("")).toBe(false);
    expect(isConvexUrlConfigured("   ")).toBe(false);
    expect(isConvexUrlConfigured("https://example.convex.cloud")).toBe(false);
  });

  it("accepts a trimmed non-placeholder deployment URL", () => {
    expect(
      isConvexUrlConfigured("https://happy-animal-123.convex.cloud"),
    ).toBe(true);
    expect(
      isConvexUrlConfigured("  https://happy-animal-123.convex.cloud  "),
    ).toBe(true);
  });
});

describe("assessConvexUrlEnvReadiness", () => {
  it("reports missing when env is empty", () => {
    const result = assessConvexUrlEnvReadiness({});
    expect(result.ready).toBe(false);
    expect(result.required).toEqual(["NEXT_PUBLIC_CONVEX_URL"]);
    expect(result.present).toEqual([]);
    expect(result.missing).toEqual(["NEXT_PUBLIC_CONVEX_URL"]);
    expect(result.convexUrlReady).toBe(false);
    expect(result.placeholderDetected).toBe(false);
  });

  it("treats whitespace-only as missing (not placeholder)", () => {
    const result = assessConvexUrlEnvReadiness({
      NEXT_PUBLIC_CONVEX_URL: "   ",
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(["NEXT_PUBLIC_CONVEX_URL"]);
    expect(result.placeholderDetected).toBe(false);
  });

  it("flags placeholders as not ready", () => {
    const result = assessConvexUrlEnvReadiness({
      NEXT_PUBLIC_CONVEX_URL: "https://example.convex.cloud",
    });
    expect(result.ready).toBe(false);
    expect(result.convexUrlReady).toBe(false);
    expect(result.placeholderDetected).toBe(true);
    expect(result.missing).toEqual(["NEXT_PUBLIC_CONVEX_URL"]);
  });

  it("is ready when NEXT_PUBLIC_CONVEX_URL is a non-placeholder URL", () => {
    const result = assessConvexUrlEnvReadiness({
      NEXT_PUBLIC_CONVEX_URL: "https://happy-animal-123.convex.cloud",
    });
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.present).toEqual(["NEXT_PUBLIC_CONVEX_URL"]);
    expect(result.convexUrlReady).toBe(true);
    expect(result.placeholderDetected).toBe(false);
  });
});
