import { describe, expect, it } from "vitest";
import { securityHeaders } from "../../next.config";

describe("production browser security headers", () => {
  it("sets the core anti-XSS, anti-clickjacking, and privacy controls", () => {
    const headers = new Map(securityHeaders.map(({ key, value }) => [key.toLowerCase(), value]));

    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("referrer-policy")).toBe("no-referrer");
    expect(headers.get("permissions-policy")).toContain("camera=()");

    const csp = headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("default-src *");
  });
});
