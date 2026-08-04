import { describe, expect, it } from "vitest";
import {
  assessResendEmailEnvReadiness,
  isResendApiKeyConfigured,
  listRequiredResendEmailEnvNames,
  RESEND_EMAIL_ENV_NAMES,
} from "./resend-env-readiness";

describe("listRequiredResendEmailEnvNames", () => {
  it("lists RESEND_API_KEY in stable order", () => {
    expect(listRequiredResendEmailEnvNames()).toEqual([...RESEND_EMAIL_ENV_NAMES]);
    expect(listRequiredResendEmailEnvNames()).toEqual(["RESEND_API_KEY"]);
  });
});

describe("isResendApiKeyConfigured", () => {
  it("rejects missing, empty, and whitespace-only values", () => {
    expect(isResendApiKeyConfigured(undefined)).toBe(false);
    expect(isResendApiKeyConfigured("")).toBe(false);
    expect(isResendApiKeyConfigured("   ")).toBe(false);
    expect(isResendApiKeyConfigured("\t")).toBe(false);
  });

  it("rejects documented placeholders that sendEmail treats as mock mode", () => {
    expect(isResendApiKeyConfigured("re_placeholder")).toBe(false);
    expect(isResendApiKeyConfigured("re_placeholder_abc")).toBe(false);
    expect(isResendApiKeyConfigured("re_...")).toBe(false);
    expect(isResendApiKeyConfigured("  re_...  ")).toBe(false);
  });

  it("accepts a trimmed real-looking key", () => {
    expect(isResendApiKeyConfigured("re_live_abc123")).toBe(true);
    expect(isResendApiKeyConfigured("  re_test_xyz  ")).toBe(true);
  });
});

describe("assessResendEmailEnvReadiness", () => {
  it("reports missing when env is empty", () => {
    const result = assessResendEmailEnvReadiness({});
    expect(result.ready).toBe(false);
    expect(result.required).toEqual(["RESEND_API_KEY"]);
    expect(result.present).toEqual([]);
    expect(result.missing).toEqual(["RESEND_API_KEY"]);
    expect(result.apiKeyReady).toBe(false);
    expect(result.placeholderDetected).toBe(false);
  });

  it("treats whitespace-only as missing (not placeholder)", () => {
    const result = assessResendEmailEnvReadiness({ RESEND_API_KEY: "   " });
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(["RESEND_API_KEY"]);
    expect(result.placeholderDetected).toBe(false);
  });

  it("flags placeholder keys as not ready", () => {
    const result = assessResendEmailEnvReadiness({
      RESEND_API_KEY: "re_placeholder",
    });
    expect(result.ready).toBe(false);
    expect(result.apiKeyReady).toBe(false);
    expect(result.placeholderDetected).toBe(true);
    expect(result.missing).toEqual(["RESEND_API_KEY"]);
  });

  it("is ready when RESEND_API_KEY is a non-placeholder secret", () => {
    const result = assessResendEmailEnvReadiness({
      RESEND_API_KEY: "re_live_abc123",
    });
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.present).toEqual(["RESEND_API_KEY"]);
    expect(result.apiKeyReady).toBe(true);
    expect(result.placeholderDetected).toBe(false);
  });
});
