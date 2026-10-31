import { describe, expect, it } from "vitest";
import {
  assessOperatorDigestEmailEnvReadiness,
  isOperatorDigestEmailConfigured,
  isOperatorDigestEmailPlaceholder,
  listRequiredOperatorDigestEmailEnvNames,
  OPERATOR_DIGEST_EMAIL_ENV_NAMES,
} from "./operator-digest-email-env-readiness";

describe("listRequiredOperatorDigestEmailEnvNames", () => {
  it("lists OPERATOR_DIGEST_EMAIL in stable order", () => {
    expect(listRequiredOperatorDigestEmailEnvNames()).toEqual([
      ...OPERATOR_DIGEST_EMAIL_ENV_NAMES,
    ]);
    expect(listRequiredOperatorDigestEmailEnvNames()).toEqual([
      "OPERATOR_DIGEST_EMAIL",
    ]);
  });
});

describe("isOperatorDigestEmailPlaceholder", () => {
  it("flags documented .env.example placeholders", () => {
    expect(isOperatorDigestEmailPlaceholder("you@example.com")).toBe(true);
    expect(isOperatorDigestEmailPlaceholder("operator@example.com")).toBe(true);
    expect(isOperatorDigestEmailPlaceholder("ops@example.org")).toBe(true);
    expect(isOperatorDigestEmailPlaceholder("YOU@EXAMPLE.COM")).toBe(true);
  });

  it("accepts real-looking operator inboxes", () => {
    expect(isOperatorDigestEmailPlaceholder("you@marisstella.app")).toBe(
      false,
    );
    expect(isOperatorDigestEmailPlaceholder("ops@localsitestudio.com")).toBe(
      false,
    );
  });
});

describe("isOperatorDigestEmailConfigured", () => {
  it("rejects missing, empty, and whitespace-only values", () => {
    expect(isOperatorDigestEmailConfigured(undefined)).toBe(false);
    expect(isOperatorDigestEmailConfigured("")).toBe(false);
    expect(isOperatorDigestEmailConfigured("   ")).toBe(false);
    expect(isOperatorDigestEmailConfigured("\t")).toBe(false);
  });

  it("rejects documented placeholders", () => {
    expect(isOperatorDigestEmailConfigured("you@example.com")).toBe(false);
    expect(isOperatorDigestEmailConfigured("  you@example.com  ")).toBe(false);
  });

  it("accepts a trimmed real-looking destination", () => {
    expect(isOperatorDigestEmailConfigured("ops@marisstella.app")).toBe(
      true,
    );
    expect(isOperatorDigestEmailConfigured("  you@localsitestudio.com  ")).toBe(
      true,
    );
  });
});

describe("assessOperatorDigestEmailEnvReadiness", () => {
  it("reports missing when env is empty", () => {
    const result = assessOperatorDigestEmailEnvReadiness({});
    expect(result.ready).toBe(false);
    expect(result.required).toEqual(["OPERATOR_DIGEST_EMAIL"]);
    expect(result.present).toEqual([]);
    expect(result.missing).toEqual(["OPERATOR_DIGEST_EMAIL"]);
    expect(result.digestEmailReady).toBe(false);
    expect(result.placeholderDetected).toBe(false);
  });

  it("treats whitespace-only as missing (not placeholder)", () => {
    const result = assessOperatorDigestEmailEnvReadiness({
      OPERATOR_DIGEST_EMAIL: "   ",
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(["OPERATOR_DIGEST_EMAIL"]);
    expect(result.placeholderDetected).toBe(false);
  });

  it("flags placeholder destinations as not ready", () => {
    const result = assessOperatorDigestEmailEnvReadiness({
      OPERATOR_DIGEST_EMAIL: "you@example.com",
    });
    expect(result.ready).toBe(false);
    expect(result.digestEmailReady).toBe(false);
    expect(result.placeholderDetected).toBe(true);
    expect(result.missing).toEqual(["OPERATOR_DIGEST_EMAIL"]);
  });

  it("is ready when OPERATOR_DIGEST_EMAIL is a non-placeholder inbox", () => {
    const result = assessOperatorDigestEmailEnvReadiness({
      OPERATOR_DIGEST_EMAIL: "ops@marisstella.app",
    });
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.present).toEqual(["OPERATOR_DIGEST_EMAIL"]);
    expect(result.digestEmailReady).toBe(true);
    expect(result.placeholderDetected).toBe(false);
  });
});
