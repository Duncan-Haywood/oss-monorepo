import { describe, expect, it } from "vitest";
import {
  assessOperatorAuthEnvReadiness,
  isOperatorAuthPasswordConfigured,
  isOperatorAuthPasswordPlaceholder,
  listRequiredOperatorAuthEnvNames,
  OPERATOR_AUTH_ENV_NAMES,
} from "./operator-auth-env-readiness";

describe("listRequiredOperatorAuthEnvNames", () => {
  it("lists OPERATOR_DASHBOARD_PASSWORD in stable order", () => {
    expect(listRequiredOperatorAuthEnvNames()).toEqual([...OPERATOR_AUTH_ENV_NAMES]);
    expect(listRequiredOperatorAuthEnvNames()).toEqual([
      "OPERATOR_DASHBOARD_PASSWORD",
    ]);
  });
});

describe("isOperatorAuthPasswordPlaceholder", () => {
  it("flags documented paste placeholders", () => {
    expect(isOperatorAuthPasswordPlaceholder("changeme")).toBe(true);
    expect(isOperatorAuthPasswordPlaceholder("password")).toBe(true);
    expect(isOperatorAuthPasswordPlaceholder("SECRET")).toBe(true);
    expect(isOperatorAuthPasswordPlaceholder("opensecret")).toBe(true);
    expect(isOperatorAuthPasswordPlaceholder("operator")).toBe(true);
    expect(isOperatorAuthPasswordPlaceholder("dashboard")).toBe(true);
    expect(isOperatorAuthPasswordPlaceholder("changeme123")).toBe(true);
    expect(isOperatorAuthPasswordPlaceholder("password!")).toBe(true);
  });

  it("accepts non-placeholder secrets", () => {
    expect(isOperatorAuthPasswordPlaceholder("correct-horse-battery")).toBe(
      false,
    );
  });
});

describe("isOperatorAuthPasswordConfigured", () => {
  it("rejects missing, empty, and whitespace-only values", () => {
    expect(isOperatorAuthPasswordConfigured(undefined)).toBe(false);
    expect(isOperatorAuthPasswordConfigured("")).toBe(false);
    expect(isOperatorAuthPasswordConfigured("   ")).toBe(false);
    expect(isOperatorAuthPasswordConfigured("\t")).toBe(false);
  });

  it("rejects documented placeholders", () => {
    expect(isOperatorAuthPasswordConfigured("changeme")).toBe(false);
    expect(isOperatorAuthPasswordConfigured("  password  ")).toBe(false);
  });

  it("accepts a trimmed real-looking password", () => {
    expect(isOperatorAuthPasswordConfigured("correct-horse-battery")).toBe(
      true,
    );
    expect(isOperatorAuthPasswordConfigured("  s3cure!pass  ")).toBe(true);
  });
});

describe("assessOperatorAuthEnvReadiness", () => {
  it("reports missing when env is empty", () => {
    const result = assessOperatorAuthEnvReadiness({});
    expect(result.ready).toBe(false);
    expect(result.required).toEqual(["OPERATOR_DASHBOARD_PASSWORD"]);
    expect(result.present).toEqual([]);
    expect(result.missing).toEqual(["OPERATOR_DASHBOARD_PASSWORD"]);
    expect(result.passwordReady).toBe(false);
    expect(result.placeholderDetected).toBe(false);
  });

  it("treats whitespace-only as missing (not placeholder)", () => {
    const result = assessOperatorAuthEnvReadiness({
      OPERATOR_DASHBOARD_PASSWORD: "   ",
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(["OPERATOR_DASHBOARD_PASSWORD"]);
    expect(result.placeholderDetected).toBe(false);
  });

  it("flags placeholder passwords as not ready", () => {
    const result = assessOperatorAuthEnvReadiness({
      OPERATOR_DASHBOARD_PASSWORD: "changeme",
    });
    expect(result.ready).toBe(false);
    expect(result.passwordReady).toBe(false);
    expect(result.placeholderDetected).toBe(true);
    expect(result.missing).toEqual(["OPERATOR_DASHBOARD_PASSWORD"]);
  });

  it("is ready when OPERATOR_DASHBOARD_PASSWORD is a non-placeholder secret", () => {
    const result = assessOperatorAuthEnvReadiness({
      OPERATOR_DASHBOARD_PASSWORD: "correct-horse-battery",
    });
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.present).toEqual(["OPERATOR_DASHBOARD_PASSWORD"]);
    expect(result.passwordReady).toBe(true);
    expect(result.placeholderDetected).toBe(false);
  });
});
