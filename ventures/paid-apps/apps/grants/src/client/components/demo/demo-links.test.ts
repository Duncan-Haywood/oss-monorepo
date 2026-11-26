import { describe, expect, it } from "vitest";
import {
  isDemoMe,
  productSignupHref,
  resolveDemoTarget,
  STATIC_DEMO_PATH,
  safeRedirect,
} from "./demo-links";

const DEMO = "https://grants-demo.example.org";

describe("resolveDemoTarget", () => {
  it("links to the static sandbox when no live demo is configured", () => {
    expect(resolveDemoTarget({ origin: "https://grants.example.org" })).toEqual({
      href: STATIC_DEMO_PATH,
      startsSession: false,
    });
    expect(resolveDemoTarget({ demoUrl: "not a url", origin: null }).href).toBe(STATIC_DEMO_PATH);
    expect(resolveDemoTarget({ demoUrl: "javascript:alert(1)", origin: null }).href).toBe(
      STATIC_DEMO_PATH,
    );
  });

  it("links to the demo deployment from production (and while prerendering)", () => {
    for (const origin of ["https://grants.example.org", null]) {
      expect(resolveDemoTarget({ demoUrl: `${DEMO}/`, origin })).toEqual({
        href: DEMO,
        startsSession: false,
      });
    }
  });

  it("starts a session on the demo host", () => {
    expect(resolveDemoTarget({ demoUrl: DEMO, origin: DEMO })).toEqual({
      href: DEMO,
      startsSession: true,
    });
    expect(resolveDemoTarget({ demoMode: "true", origin: "http://localhost:5173" })).toEqual({
      href: "/",
      startsSession: true,
    });
  });
});

describe("helpers", () => {
  it("only follows same-origin app paths", () => {
    expect(safeRedirect("/orgs/org_123")).toBe("/orgs/org_123");
    for (const bad of ["//evil.example", "https://evil.example/orgs/1", "/orgs/<x>", 42, null]) {
      expect(safeRedirect(bad)).toBeNull();
    }
  });

  it("sends 'Start your own' to the product's sign-up when known", () => {
    expect(productSignupHref("https://grants.example.org/")).toBe(
      "https://grants.example.org/signup",
    );
    expect(productSignupHref("https://marisstella.app/grants")).toBe(
      "https://marisstella.app/grants/signup",
    );
    expect(productSignupHref("https://marisstella.app/grants/")).toBe(
      "https://marisstella.app/grants/signup",
    );
    expect(productSignupHref(undefined)).toBe("/signup");
  });

  it("recognizes demo visitors from /api/me", () => {
    expect(isDemoMe({ user: {}, memberships: [], isDemo: true })).toBe(true);
    expect(isDemoMe({ user: {}, memberships: [] })).toBe(false);
    expect(isDemoMe(null)).toBe(false);
  });
});
