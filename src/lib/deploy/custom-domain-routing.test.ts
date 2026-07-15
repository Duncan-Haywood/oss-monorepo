import { describe, expect, it } from "vitest";
import {
  customDomainHostAliases,
  extractPreviewSubdomainSlug,
  isPlatformHost,
  isPlausibleCustomDomainHost,
  normalizeOperatorCustomDomainHost,
  normalizeRequestHost,
  parseOperatorCustomDomain,
} from "./custom-domain-routing";

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

describe("normalizeOperatorCustomDomainHost", () => {
  it("returns null for empty / whitespace (clear domain)", () => {
    expect(normalizeOperatorCustomDomainHost(null)).toBeNull();
    expect(normalizeOperatorCustomDomainHost(undefined)).toBeNull();
    expect(normalizeOperatorCustomDomainHost("")).toBeNull();
    expect(normalizeOperatorCustomDomainHost("   ")).toBeNull();
  });

  it("strips scheme, path, port, and trailing FQDN dot to a bare host", () => {
    expect(normalizeOperatorCustomDomainHost("https://JoesPlumbing.com/")).toBe(
      "joesplumbing.com",
    );
    expect(normalizeOperatorCustomDomainHost("http://www.joesplumbing.com/path?x=1")).toBe(
      "www.joesplumbing.com",
    );
    expect(normalizeOperatorCustomDomainHost("JoesPlumbing.com:443")).toBe("joesplumbing.com");
    expect(normalizeOperatorCustomDomainHost("  WWW.Example.COM.  ")).toBe("www.example.com");
  });

  it("matches normalizeRequestHost for the common bare-host paste", () => {
    const bare = "joesplumbing.com";
    expect(normalizeOperatorCustomDomainHost(bare)).toBe(normalizeRequestHost(bare));
  });
});

describe("isPlausibleCustomDomainHost", () => {
  it("accepts ordinary public hostnames", () => {
    expect(isPlausibleCustomDomainHost("joesplumbing.com")).toBe(true);
    expect(isPlausibleCustomDomainHost("www.joes-plumbing.co.uk")).toBe(true);
  });

  it("rejects localhost, single labels, spaces, and broken labels", () => {
    expect(isPlausibleCustomDomainHost("localhost")).toBe(false);
    expect(isPlausibleCustomDomainHost("intranet")).toBe(false);
    expect(isPlausibleCustomDomainHost("bad host.com")).toBe(false);
    expect(isPlausibleCustomDomainHost("-bad.com")).toBe(false);
    expect(isPlausibleCustomDomainHost("bad..com")).toBe(false);
  });
});

describe("parseOperatorCustomDomain", () => {
  const root = "localsitestudio.com";

  it("clears on empty input", () => {
    expect(parseOperatorCustomDomain("  ")).toEqual({ ok: true, host: null });
  });

  it("accepts URL pastes as bare hosts", () => {
    expect(parseOperatorCustomDomain("https://joesplumbing.com/menu")).toEqual({
      ok: true,
      host: "joesplumbing.com",
    });
  });

  it("rejects invalid and platform-owned hosts", () => {
    expect(parseOperatorCustomDomain("not a domain").ok).toBe(false);
    expect(parseOperatorCustomDomain("localhost").ok).toBe(false);
    expect(parseOperatorCustomDomain("localsitestudio.com", root).ok).toBe(false);
    expect(parseOperatorCustomDomain("joes-plumbing.localsitestudio.com", root).ok).toBe(
      false,
    );
  });
});

describe("customDomainHostAliases", () => {
  it("returns exact host first, then the www twin for an apex", () => {
    expect(customDomainHostAliases("joesplumbing.com")).toEqual([
      "joesplumbing.com",
      "www.joesplumbing.com",
    ]);
  });

  it("returns www first, then apex when Save kept the www form", () => {
    expect(customDomainHostAliases("www.joesplumbing.com")).toEqual([
      "www.joesplumbing.com",
      "joesplumbing.com",
    ]);
  });

  it("lowercases and strips a trailing FQDN dot", () => {
    expect(customDomainHostAliases("WWW.Example.COM.")).toEqual([
      "www.example.com",
      "example.com",
    ]);
  });

  it("returns empty for blank input", () => {
    expect(customDomainHostAliases("")).toEqual([]);
    expect(customDomainHostAliases("   ")).toEqual([]);
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

describe("extractPreviewSubdomainSlug", () => {
  const root = "localsitestudio.com";

  it("extracts the slug from a {slug}.{root} host", () => {
    expect(extractPreviewSubdomainSlug("joes-plumbing.localsitestudio.com", root)).toBe(
      "joes-plumbing",
    );
  });

  it("returns null for the bare root domain (no subdomain)", () => {
    expect(extractPreviewSubdomainSlug(root, root)).toBeNull();
  });

  it("returns null for an unrelated domain", () => {
    expect(extractPreviewSubdomainSlug("joesplumbing.com", root)).toBeNull();
  });

  it("returns null for a multi-level subdomain", () => {
    expect(extractPreviewSubdomainSlug("staging.joes-plumbing.localsitestudio.com", root)).toBeNull();
  });

  it("returns null for reserved labels like www", () => {
    expect(extractPreviewSubdomainSlug("www.localsitestudio.com", root)).toBeNull();
  });

  it("returns null when no root domain is configured", () => {
    expect(extractPreviewSubdomainSlug("joes-plumbing.localsitestudio.com", "")).toBeNull();
  });

  it("returns null for an empty host", () => {
    expect(extractPreviewSubdomainSlug("", root)).toBeNull();
  });
});
