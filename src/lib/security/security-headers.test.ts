import { describe, expect, it } from "vitest";
import { SECURITY_HEADERS } from "./security-headers";

describe("SECURITY_HEADERS", () => {
  it("denies framing sitewide", () => {
    expect(SECURITY_HEADERS).toContainEqual({ key: "X-Frame-Options", value: "DENY" });
  });

  it("disables MIME sniffing", () => {
    expect(SECURITY_HEADERS).toContainEqual({ key: "X-Content-Type-Options", value: "nosniff" });
  });

  it("limits cross-origin referrer leakage without breaking same-origin nav", () => {
    expect(SECURITY_HEADERS).toContainEqual({
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    });
  });

  it("locks down camera/microphone/geolocation/browsing-topics", () => {
    const permissionsPolicy = SECURITY_HEADERS.find((h) => h.key === "Permissions-Policy");
    expect(permissionsPolicy?.value).toBe(
      "camera=(), microphone=(), geolocation=(), browsing-topics=()",
    );
  });

  it("sends a long-lived HSTS max-age with includeSubDomains + preload", () => {
    const hsts = SECURITY_HEADERS.find((h) => h.key === "Strict-Transport-Security");
    expect(hsts?.value).toBe("max-age=63072000; includeSubDomains; preload");
  });

  it("has no duplicate header keys", () => {
    const keys = SECURITY_HEADERS.map((h) => h.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("does not set Content-Security-Policy (set per-request from proxy.ts instead — see content-security-policy.ts)", () => {
    expect(SECURITY_HEADERS.some((h) => h.key === "Content-Security-Policy")).toBe(false);
  });
});
