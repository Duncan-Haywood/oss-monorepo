import { describe, expect, it } from "vitest";
import {
  CONVEX_API_SECRET_ENV_NAMES,
  assessConvexApiSecretEnvReadiness,
  listRequiredConvexApiSecretEnvNames,
} from "./convex-api-secret-env-readiness";

describe("listRequiredConvexApiSecretEnvNames", () => {
  it("lists CONVEX_API_SECRET in stable order", () => {
    expect(listRequiredConvexApiSecretEnvNames()).toEqual([
      ...CONVEX_API_SECRET_ENV_NAMES,
    ]);
    expect(listRequiredConvexApiSecretEnvNames()).toEqual([
      "CONVEX_API_SECRET",
    ]);
  });
});

describe("assessConvexApiSecretEnvReadiness", () => {
  it("is ready when NEXT_PUBLIC_CONVEX_URL is not configured, even without the secret", () => {
    const result = assessConvexApiSecretEnvReadiness({});
    expect(result.ready).toBe(true);
    expect(result.convexUrlConfigured).toBe(false);
    expect(result.apiSecretConfigured).toBe(false);
    expect(result.missing).toEqual(["CONVEX_API_SECRET"]);
  });

  it("is ready when the Convex URL is only a documented placeholder", () => {
    const result = assessConvexApiSecretEnvReadiness({
      NEXT_PUBLIC_CONVEX_URL: "https://example.convex.cloud",
    });
    expect(result.ready).toBe(true);
    expect(result.convexUrlConfigured).toBe(false);
  });

  it("is not ready when the Convex URL is configured but the secret is missing", () => {
    const result = assessConvexApiSecretEnvReadiness({
      NEXT_PUBLIC_CONVEX_URL: "https://happy-animal-123.convex.cloud",
    });
    expect(result.ready).toBe(false);
    expect(result.convexUrlConfigured).toBe(true);
    expect(result.apiSecretConfigured).toBe(false);
    expect(result.present).toEqual([]);
    expect(result.missing).toEqual(["CONVEX_API_SECRET"]);
  });

  it("treats a whitespace-only secret as missing", () => {
    const result = assessConvexApiSecretEnvReadiness({
      NEXT_PUBLIC_CONVEX_URL: "https://happy-animal-123.convex.cloud",
      CONVEX_API_SECRET: "   ",
    });
    expect(result.ready).toBe(false);
    expect(result.apiSecretConfigured).toBe(false);
  });

  it("is ready when both the Convex URL and the secret are configured", () => {
    const result = assessConvexApiSecretEnvReadiness({
      NEXT_PUBLIC_CONVEX_URL: "https://happy-animal-123.convex.cloud",
      CONVEX_API_SECRET: "shh-its-a-secret",
    });
    expect(result.ready).toBe(true);
    expect(result.convexUrlConfigured).toBe(true);
    expect(result.apiSecretConfigured).toBe(true);
    expect(result.present).toEqual(["CONVEX_API_SECRET"]);
    expect(result.missing).toEqual([]);
  });
});
