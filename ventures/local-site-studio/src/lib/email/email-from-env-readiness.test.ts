import { describe, expect, it } from "vitest";
import {
  assessEmailFromEnvReadiness,
  EMAIL_FROM_ENV_NAMES,
  formatResendFromHeader,
  isEmailFromConfigured,
  isEmailFromPlaceholder,
  listRequiredEmailFromEnvNames,
} from "./email-from-env-readiness";

describe("listRequiredEmailFromEnvNames", () => {
  it("lists EMAIL_FROM in stable order", () => {
    expect(listRequiredEmailFromEnvNames()).toEqual([...EMAIL_FROM_ENV_NAMES]);
    expect(listRequiredEmailFromEnvNames()).toEqual(["EMAIL_FROM"]);
  });
});

describe("isEmailFromPlaceholder", () => {
  it("flags documented paste / example placeholders", () => {
    expect(isEmailFromPlaceholder("noreply@example.com")).toBe(true);
    expect(isEmailFromPlaceholder("from@example.com")).toBe(true);
    expect(isEmailFromPlaceholder("you@example.com")).toBe(true);
    expect(isEmailFromPlaceholder("email@example.com")).toBe(true);
    expect(isEmailFromPlaceholder("test@example.com")).toBe(true);
    expect(isEmailFromPlaceholder("ops@example.org")).toBe(true);
    expect(isEmailFromPlaceholder("noreply@localhost")).toBe(true);
    expect(isEmailFromPlaceholder("hi@test.com")).toBe(true);
    expect(isEmailFromPlaceholder("changeme")).toBe(true);
    expect(isEmailFromPlaceholder("placeholder")).toBe(true);
    expect(isEmailFromPlaceholder("xxx")).toBe(true);
    expect(isEmailFromPlaceholder("todo")).toBe(true);
    expect(isEmailFromPlaceholder("changeme@brand.com")).toBe(true);
    expect(isEmailFromPlaceholder("your@brand.com")).toBe(true);
    expect(isEmailFromPlaceholder("you@brand.com")).toBe(true);
    expect(isEmailFromPlaceholder("todo@brand.com")).toBe(true);
  });

  it("accepts real-looking From addresses", () => {
    expect(isEmailFromPlaceholder("noreply@marisstella.app")).toBe(false);
    expect(isEmailFromPlaceholder("outreach@updates.localsitestudio.com")).toBe(
      false,
    );
    expect(isEmailFromPlaceholder("hello@acme.cafe")).toBe(false);
  });
});

describe("isEmailFromConfigured", () => {
  it("rejects missing, empty, and whitespace-only values", () => {
    expect(isEmailFromConfigured(undefined)).toBe(false);
    expect(isEmailFromConfigured("")).toBe(false);
    expect(isEmailFromConfigured("   ")).toBe(false);
    expect(isEmailFromConfigured("\t")).toBe(false);
  });

  it("rejects documented placeholders", () => {
    expect(isEmailFromConfigured("noreply@example.com")).toBe(false);
    expect(isEmailFromConfigured("  from@example.com  ")).toBe(false);
  });

  it("accepts a trimmed real From address", () => {
    expect(isEmailFromConfigured("noreply@marisstella.app")).toBe(true);
    expect(isEmailFromConfigured("  hello@acme.cafe  ")).toBe(true);
  });
});

describe("formatResendFromHeader", () => {
  it("wraps bare email with display name", () => {
    expect(
      formatResendFromHeader("Local Site Studio", "noreply@marisstella.app"),
    ).toBe("Local Site Studio <noreply@marisstella.app>");
  });

  it("preserves an already-formatted Name <email> value", () => {
    expect(
      formatResendFromHeader(
        "Ignored",
        "Custom Brand <hello@acme.cafe>",
      ),
    ).toBe("Custom Brand <hello@acme.cafe>");
  });

  it("returns bare email when display name is empty", () => {
    expect(formatResendFromHeader("  ", "hello@acme.cafe")).toBe(
      "hello@acme.cafe",
    );
  });
});

describe("assessEmailFromEnvReadiness", () => {
  it("reports missing when env is empty", () => {
    const result = assessEmailFromEnvReadiness({});
    expect(result.ready).toBe(false);
    expect(result.required).toEqual(["EMAIL_FROM"]);
    expect(result.present).toEqual([]);
    expect(result.missing).toEqual(["EMAIL_FROM"]);
    expect(result.emailFromReady).toBe(false);
    expect(result.placeholderDetected).toBe(false);
  });

  it("treats whitespace-only as missing (not placeholder)", () => {
    const result = assessEmailFromEnvReadiness({ EMAIL_FROM: "   " });
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(["EMAIL_FROM"]);
    expect(result.placeholderDetected).toBe(false);
  });

  it("flags example.com placeholders as not ready", () => {
    const result = assessEmailFromEnvReadiness({
      EMAIL_FROM: "noreply@example.com",
    });
    expect(result.ready).toBe(false);
    expect(result.emailFromReady).toBe(false);
    expect(result.placeholderDetected).toBe(true);
    expect(result.missing).toEqual(["EMAIL_FROM"]);
  });

  it("is ready when EMAIL_FROM is a non-placeholder address", () => {
    const result = assessEmailFromEnvReadiness({
      EMAIL_FROM: "noreply@marisstella.app",
    });
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.present).toEqual(["EMAIL_FROM"]);
    expect(result.emailFromReady).toBe(true);
    expect(result.placeholderDetected).toBe(false);
  });
});
