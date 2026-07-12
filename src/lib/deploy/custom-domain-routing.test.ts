import { describe, expect, it } from "vitest";
import { isPlatformHost, normalizeRequestHost } from "./custom-domain-routing";

describe("normalizeRequestHost", () => {
  it("lowercases, trims, and strips a port", () => {
    expect(normalizeRequestHost("JoesPlumbing.com:443")).toBe("joesplumbing.com");
    expect(normalizeRequestHost(" localhost:3000 ")).toBe("localhost");
  });

  it("strips a trailing dot (FQDN form)", () => {
    expect(normalizeRequestHost("joesplumbing.com.")).toBe("joesplumbing.com");
  });

  it("returns empty string for missing/empty header", () => {
    expect(normalizeRequestHost(null)).toBe("");
    expect(normalizeRequestHost(undefined)).toBe("");
    expect(normalizeRequestHost("")).toBe("");
  });
});

describe("isPlatformHost", () => {
  const root = "localsitestudio.com";

  it("treats localhost and empty host as platform traffic", () => {
    expect(isPlatformHost("localhost", root)).toBe(true);
    expect(isPlatformHost("127.0.0.1", root)).toBe(true);
    expect(isPlatformHost("", root)).toBe(true);
  });

  it("treats any Vercel deployment domain as platform traffic", () => {
    expect(isPlatformHost("my-app-git-main-team.vercel.app", root)).toBe(true);
  });

  it("treats the production root domain and its subdomains as platform traffic", () => {
    expect(isPlatformHost("localsitestudio.com", root)).toBe(true);
    expect(isPlatformHost("joes-plumbing.localsitestudio.com", root)).toBe(true);
  });

  it("does not treat an unrelated domain as platform traffic", () => {
    expect(isPlatformHost("joesplumbing.com", root)).toBe(false);
  });

  it("falls back to false for an unrelated host when no root domain is configured", () => {
    expect(isPlatformHost("joesplumbing.com", "")).toBe(false);
  });
});
