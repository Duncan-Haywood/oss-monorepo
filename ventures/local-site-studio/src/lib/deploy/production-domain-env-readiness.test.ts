import { describe, expect, it } from "vitest";
import {
  assessProductionDomainEnvReadiness,
  isProductionDomainConfigured,
  isProductionDomainLocalhost,
  isProductionDomainPlaceholder,
  listRequiredProductionDomainEnvNames,
  normalizeProductionDomainHost,
  PRODUCTION_DOMAIN_ENV_NAMES,
} from "./production-domain-env-readiness";

describe("listRequiredProductionDomainEnvNames", () => {
  it("lists NEXT_PUBLIC_PRODUCTION_DOMAIN in stable order", () => {
    expect(listRequiredProductionDomainEnvNames()).toEqual([
      ...PRODUCTION_DOMAIN_ENV_NAMES,
    ]);
    expect(listRequiredProductionDomainEnvNames()).toEqual([
      "NEXT_PUBLIC_PRODUCTION_DOMAIN",
    ]);
  });
});

describe("isProductionDomainLocalhost", () => {
  it("flags loopback hosts with or without scheme/port", () => {
    expect(isProductionDomainLocalhost("localhost")).toBe(true);
    expect(isProductionDomainLocalhost("http://localhost:3000")).toBe(true);
    expect(isProductionDomainLocalhost("127.0.0.1")).toBe(true);
    expect(isProductionDomainLocalhost("https://127.0.0.1")).toBe(true);
    expect(isProductionDomainLocalhost("[::1]")).toBe(true);
  });

  it("accepts real-looking production roots", () => {
    expect(isProductionDomainLocalhost("localsitestudio.com")).toBe(false);
    expect(isProductionDomainLocalhost("app.harbor.example")).toBe(false);
  });
});

describe("isProductionDomainPlaceholder", () => {
  it("flags documented paste placeholders", () => {
    expect(isProductionDomainPlaceholder("example.com")).toBe(true);
    expect(isProductionDomainPlaceholder("www.example.com")).toBe(true);
    expect(isProductionDomainPlaceholder("app.example.com")).toBe(true);
    expect(isProductionDomainPlaceholder("yourdomain.com")).toBe(true);
    expect(isProductionDomainPlaceholder("your-domain.com")).toBe(true);
    expect(isProductionDomainPlaceholder("changeme")).toBe(true);
    expect(isProductionDomainPlaceholder("TODO")).toBe(true);
    expect(isProductionDomainPlaceholder("placeholder")).toBe(true);
  });

  it("accepts real-looking production roots", () => {
    expect(isProductionDomainPlaceholder("localsitestudio.com")).toBe(false);
    expect(isProductionDomainPlaceholder("marisstella.app")).toBe(false);
  });
});

describe("normalizeProductionDomainHost", () => {
  it("strips scheme, path, and port", () => {
    expect(normalizeProductionDomainHost("https://localsitestudio.com/")).toBe(
      "localsitestudio.com",
    );
    expect(normalizeProductionDomainHost("localsitestudio.com:443")).toBe(
      "localsitestudio.com",
    );
  });
});

describe("isProductionDomainConfigured", () => {
  it("rejects missing, empty, and whitespace-only values", () => {
    expect(isProductionDomainConfigured(undefined)).toBe(false);
    expect(isProductionDomainConfigured("")).toBe(false);
    expect(isProductionDomainConfigured("   ")).toBe(false);
    expect(isProductionDomainConfigured("\t")).toBe(false);
  });

  it("rejects localhost and placeholders", () => {
    expect(isProductionDomainConfigured("localhost")).toBe(false);
    expect(isProductionDomainConfigured("example.com")).toBe(false);
    expect(isProductionDomainConfigured("yourdomain.com")).toBe(false);
  });

  it("rejects preview.* roots (operators should set the bare production root)", () => {
    expect(isProductionDomainConfigured("preview.localsitestudio.com")).toBe(
      false,
    );
  });

  it("rejects bare labels without a dot", () => {
    expect(isProductionDomainConfigured("localhostish")).toBe(false);
    expect(isProductionDomainConfigured("intranet")).toBe(false);
  });

  it("accepts a trimmed real production root", () => {
    expect(isProductionDomainConfigured("localsitestudio.com")).toBe(true);
    expect(isProductionDomainConfigured("  harbor.studio  ")).toBe(true);
  });
});

describe("assessProductionDomainEnvReadiness", () => {
  it("reports missing when env is empty", () => {
    const result = assessProductionDomainEnvReadiness({});
    expect(result.ready).toBe(false);
    expect(result.required).toEqual(["NEXT_PUBLIC_PRODUCTION_DOMAIN"]);
    expect(result.present).toEqual([]);
    expect(result.missing).toEqual(["NEXT_PUBLIC_PRODUCTION_DOMAIN"]);
    expect(result.productionDomainReady).toBe(false);
    expect(result.localhostDetected).toBe(false);
    expect(result.placeholderDetected).toBe(false);
  });

  it("treats whitespace-only as missing (not placeholder)", () => {
    const result = assessProductionDomainEnvReadiness({
      NEXT_PUBLIC_PRODUCTION_DOMAIN: "   ",
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(["NEXT_PUBLIC_PRODUCTION_DOMAIN"]);
    expect(result.placeholderDetected).toBe(false);
  });

  it("does not count NEXT_PUBLIC_PREVIEW_DOMAIN as ready", () => {
    const result = assessProductionDomainEnvReadiness({
      NEXT_PUBLIC_PREVIEW_DOMAIN: "preview.localsitestudio.com",
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(["NEXT_PUBLIC_PRODUCTION_DOMAIN"]);
  });

  it("flags localhost roots as not ready", () => {
    const result = assessProductionDomainEnvReadiness({
      NEXT_PUBLIC_PRODUCTION_DOMAIN: "localhost",
    });
    expect(result.ready).toBe(false);
    expect(result.localhostDetected).toBe(true);
    expect(result.placeholderDetected).toBe(false);
    expect(result.missing).toEqual(["NEXT_PUBLIC_PRODUCTION_DOMAIN"]);
  });

  it("flags placeholder / preview.* roots as not ready", () => {
    const placeholder = assessProductionDomainEnvReadiness({
      NEXT_PUBLIC_PRODUCTION_DOMAIN: "example.com",
    });
    expect(placeholder.ready).toBe(false);
    expect(placeholder.placeholderDetected).toBe(true);
    expect(placeholder.missing).toEqual(["NEXT_PUBLIC_PRODUCTION_DOMAIN"]);

    const previewRoot = assessProductionDomainEnvReadiness({
      NEXT_PUBLIC_PRODUCTION_DOMAIN: "preview.localsitestudio.com",
    });
    expect(previewRoot.ready).toBe(false);
    expect(previewRoot.placeholderDetected).toBe(true);
  });

  it("is ready when NEXT_PUBLIC_PRODUCTION_DOMAIN is a real production root", () => {
    const result = assessProductionDomainEnvReadiness({
      NEXT_PUBLIC_PRODUCTION_DOMAIN: "localsitestudio.com",
    });
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.present).toEqual(["NEXT_PUBLIC_PRODUCTION_DOMAIN"]);
    expect(result.productionDomainReady).toBe(true);
    expect(result.localhostDetected).toBe(false);
    expect(result.placeholderDetected).toBe(false);
  });
});
