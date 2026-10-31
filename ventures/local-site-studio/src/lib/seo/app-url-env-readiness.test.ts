import { describe, expect, it } from "vitest";
import {
  APP_URL_ENV_NAMES,
  assessAppUrlEnvReadiness,
  isAppUrlConfigured,
  isAppUrlLocalhost,
  isAppUrlPlaceholder,
  listRequiredAppUrlEnvNames,
} from "./app-url-env-readiness";

describe("listRequiredAppUrlEnvNames", () => {
  it("lists NEXT_PUBLIC_APP_URL in stable order", () => {
    expect(listRequiredAppUrlEnvNames()).toEqual([...APP_URL_ENV_NAMES]);
    expect(listRequiredAppUrlEnvNames()).toEqual(["NEXT_PUBLIC_APP_URL"]);
  });
});

describe("isAppUrlLocalhost", () => {
  it("flags localhost and loopback hosts (with or without port/scheme)", () => {
    expect(isAppUrlLocalhost("http://localhost:3000")).toBe(true);
    expect(isAppUrlLocalhost("https://localhost")).toBe(true);
    expect(isAppUrlLocalhost("http://127.0.0.1:3000")).toBe(true);
    expect(isAppUrlLocalhost("localhost:3000")).toBe(true);
    expect(isAppUrlLocalhost("http://[::1]:3000")).toBe(true);
  });

  it("accepts public hosts", () => {
    expect(isAppUrlLocalhost("https://app.localsitestudio.com")).toBe(false);
    expect(isAppUrlLocalhost("https://staging.example.org")).toBe(false);
  });
});

describe("isAppUrlPlaceholder", () => {
  it("flags documented example.com paste placeholders", () => {
    expect(isAppUrlPlaceholder("https://example.com")).toBe(true);
    expect(isAppUrlPlaceholder("https://app.example.com")).toBe(true);
    expect(isAppUrlPlaceholder("http://www.example.com/")).toBe(true);
    expect(isAppUrlPlaceholder("app.example.com")).toBe(true);
  });

  it("accepts non-placeholder public origins", () => {
    expect(isAppUrlPlaceholder("https://app.localsitestudio.com")).toBe(false);
    expect(isAppUrlPlaceholder("https://studio.marisstella.app")).toBe(
      false,
    );
  });
});

describe("isAppUrlConfigured", () => {
  it("rejects missing, empty, and whitespace-only values", () => {
    expect(isAppUrlConfigured(undefined)).toBe(false);
    expect(isAppUrlConfigured("")).toBe(false);
    expect(isAppUrlConfigured("   ")).toBe(false);
    expect(isAppUrlConfigured("\t")).toBe(false);
  });

  it("rejects localhost (.env.example default) and placeholders", () => {
    expect(isAppUrlConfigured("http://localhost:3000")).toBe(false);
    expect(isAppUrlConfigured("  http://127.0.0.1:3000  ")).toBe(false);
    expect(isAppUrlConfigured("https://example.com")).toBe(false);
  });

  it("accepts a trimmed public production origin", () => {
    expect(isAppUrlConfigured("https://app.localsitestudio.com")).toBe(true);
    expect(isAppUrlConfigured("  https://app.localsitestudio.com/  ")).toBe(
      true,
    );
  });
});

describe("assessAppUrlEnvReadiness", () => {
  it("reports missing when env is empty", () => {
    const result = assessAppUrlEnvReadiness({});
    expect(result.ready).toBe(false);
    expect(result.required).toEqual(["NEXT_PUBLIC_APP_URL"]);
    expect(result.present).toEqual([]);
    expect(result.missing).toEqual(["NEXT_PUBLIC_APP_URL"]);
    expect(result.appUrlReady).toBe(false);
    expect(result.localhostDetected).toBe(false);
    expect(result.placeholderDetected).toBe(false);
  });

  it("treats whitespace-only as missing (not localhost)", () => {
    const result = assessAppUrlEnvReadiness({
      NEXT_PUBLIC_APP_URL: "   ",
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(["NEXT_PUBLIC_APP_URL"]);
    expect(result.localhostDetected).toBe(false);
    expect(result.placeholderDetected).toBe(false);
  });

  it("flags localhost as not ready", () => {
    const result = assessAppUrlEnvReadiness({
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    });
    expect(result.ready).toBe(false);
    expect(result.appUrlReady).toBe(false);
    expect(result.localhostDetected).toBe(true);
    expect(result.placeholderDetected).toBe(false);
    expect(result.missing).toEqual(["NEXT_PUBLIC_APP_URL"]);
  });

  it("flags example.com placeholders as not ready", () => {
    const result = assessAppUrlEnvReadiness({
      NEXT_PUBLIC_APP_URL: "https://app.example.com",
    });
    expect(result.ready).toBe(false);
    expect(result.placeholderDetected).toBe(true);
    expect(result.localhostDetected).toBe(false);
    expect(result.missing).toEqual(["NEXT_PUBLIC_APP_URL"]);
  });

  it("is ready when NEXT_PUBLIC_APP_URL is a public origin", () => {
    const result = assessAppUrlEnvReadiness({
      NEXT_PUBLIC_APP_URL: "https://app.localsitestudio.com",
    });
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.present).toEqual(["NEXT_PUBLIC_APP_URL"]);
    expect(result.appUrlReady).toBe(true);
    expect(result.localhostDetected).toBe(false);
    expect(result.placeholderDetected).toBe(false);
  });
});
