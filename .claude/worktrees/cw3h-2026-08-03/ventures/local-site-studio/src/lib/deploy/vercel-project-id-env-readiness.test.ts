import { describe, expect, it } from "vitest";
import {
  VERCEL_PROJECT_ID_ENV_NAMES,
  assessVercelProjectIdEnvReadiness,
  isVercelProjectIdConfigured,
  isVercelProjectIdPlaceholder,
  listRequiredVercelProjectIdEnvNames,
} from "./vercel-project-id-env-readiness";

describe("listRequiredVercelProjectIdEnvNames", () => {
  it("lists VERCEL_PROJECT_ID in stable order", () => {
    expect(listRequiredVercelProjectIdEnvNames()).toEqual([
      ...VERCEL_PROJECT_ID_ENV_NAMES,
    ]);
    expect(listRequiredVercelProjectIdEnvNames()).toEqual([
      "VERCEL_PROJECT_ID",
    ]);
  });
});

describe("isVercelProjectIdPlaceholder", () => {
  it("flags documented paste placeholders", () => {
    expect(isVercelProjectIdPlaceholder("changeme")).toBe(true);
    expect(isVercelProjectIdPlaceholder("project")).toBe(true);
    expect(isVercelProjectIdPlaceholder("project_id")).toBe(true);
    expect(isVercelProjectIdPlaceholder("your_project")).toBe(true);
    expect(isVercelProjectIdPlaceholder("your-project-id")).toBe(true);
    expect(isVercelProjectIdPlaceholder("prj_xxx")).toBe(true);
    expect(isVercelProjectIdPlaceholder("prj_changeme")).toBe(true);
    expect(isVercelProjectIdPlaceholder("xxx")).toBe(true);
    expect(isVercelProjectIdPlaceholder("placeholder")).toBe(true);
  });

  it("accepts non-placeholder project id strings", () => {
    expect(isVercelProjectIdPlaceholder("prj_abc123DEF")).toBe(false);
    expect(isVercelProjectIdPlaceholder("prj_live_client_shared")).toBe(false);
  });
});

describe("isVercelProjectIdConfigured", () => {
  it("rejects missing, empty, and whitespace-only values", () => {
    expect(isVercelProjectIdConfigured(undefined)).toBe(false);
    expect(isVercelProjectIdConfigured("")).toBe(false);
    expect(isVercelProjectIdConfigured("   ")).toBe(false);
    expect(isVercelProjectIdConfigured("\t")).toBe(false);
  });

  it("rejects placeholders", () => {
    expect(isVercelProjectIdConfigured("changeme")).toBe(false);
    expect(isVercelProjectIdConfigured("  prj_xxx  ")).toBe(false);
  });

  it("accepts a trimmed non-placeholder project id", () => {
    expect(isVercelProjectIdConfigured("prj_abc123DEF")).toBe(true);
    expect(isVercelProjectIdConfigured("  prj_abc123DEF  ")).toBe(true);
  });
});

describe("assessVercelProjectIdEnvReadiness", () => {
  it("reports missing when env is empty", () => {
    const result = assessVercelProjectIdEnvReadiness({});
    expect(result.ready).toBe(false);
    expect(result.required).toEqual(["VERCEL_PROJECT_ID"]);
    expect(result.present).toEqual([]);
    expect(result.missing).toEqual(["VERCEL_PROJECT_ID"]);
    expect(result.projectIdReady).toBe(false);
    expect(result.placeholderDetected).toBe(false);
  });

  it("treats whitespace-only as missing (not placeholder)", () => {
    const result = assessVercelProjectIdEnvReadiness({
      VERCEL_PROJECT_ID: "   ",
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(["VERCEL_PROJECT_ID"]);
    expect(result.placeholderDetected).toBe(false);
  });

  it("flags placeholders as not ready", () => {
    const result = assessVercelProjectIdEnvReadiness({
      VERCEL_PROJECT_ID: "prj_xxx",
    });
    expect(result.ready).toBe(false);
    expect(result.projectIdReady).toBe(false);
    expect(result.placeholderDetected).toBe(true);
    expect(result.missing).toEqual(["VERCEL_PROJECT_ID"]);
  });

  it("is ready when VERCEL_PROJECT_ID is a non-placeholder id", () => {
    const result = assessVercelProjectIdEnvReadiness({
      VERCEL_PROJECT_ID: "prj_abc123DEF",
    });
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.present).toEqual(["VERCEL_PROJECT_ID"]);
    expect(result.projectIdReady).toBe(true);
    expect(result.placeholderDetected).toBe(false);
  });
});
