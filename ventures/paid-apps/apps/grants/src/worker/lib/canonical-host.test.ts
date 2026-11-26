import { describe, expect, it } from "vitest";
import {
  answersOnEveryHost,
  canonicalRedirect,
  isDevHost,
  redirectStatusFor,
} from "./canonical-host";

const APP_URL = "https://marisstella.app/grants";
const redirectFor = (url: string, appUrl = APP_URL, base = "/grants") =>
  canonicalRedirect(new URL(url), appUrl, base);

describe("canonicalRedirect", () => {
  it("sends the old host to the canonical URL with path and query", () => {
    expect(redirectFor("https://grants.marisstella.app/x?y=1")).toBe(
      "https://marisstella.app/grants/x?y=1",
    );
    expect(redirectFor("https://grants.marisstella.app/")).toBe("https://marisstella.app/grants/");
    expect(redirectFor("https://grants.marisstella.app")).toBe("https://marisstella.app/grants/");
    expect(redirectFor("https://grants.marisstella.app/orgs/o1/applications?tab=x&b=2")).toBe(
      "https://marisstella.app/grants/orgs/o1/applications?tab=x&b=2",
    );
  });

  it("does not double an existing base path", () => {
    expect(redirectFor("https://grants.marisstella.app/grants/pricing?a=b")).toBe(
      "https://marisstella.app/grants/pricing?a=b",
    );
    expect(redirectFor("https://grants.marisstella.app/grants")).toBe(
      "https://marisstella.app/grants",
    );
  });

  it("serves the canonical host itself", () => {
    expect(redirectFor("https://marisstella.app/grants/api/me")).toBeNull();
    expect(redirectFor("https://MARISSTELLA.app/grants/")).toBeNull();
  });

  it("keeps localhost and workers.dev working", () => {
    expect(redirectFor("http://localhost:5173/x")).toBeNull();
    expect(redirectFor("http://127.0.0.1:8787/x")).toBeNull();
    expect(redirectFor("https://grant-autopilot.marisstella.workers.dev/grants/x")).toBeNull();
  });

  it("never redirects when APP_URL is plain http or invalid (local dev, tests)", () => {
    expect(redirectFor("https://grants.marisstella.app/x", "http://localhost:5173", "")).toBeNull();
    expect(redirectFor("https://grants.marisstella.app/x", "not a url", "")).toBeNull();
  });

  it("works without a base path (a host-root deployment moving hosts)", () => {
    expect(redirectFor("https://old.example.org/a?b=1", "https://new.example.org", "")).toBe(
      "https://new.example.org/a?b=1",
    );
  });
});

describe("isDevHost", () => {
  it("recognizes local and workers.dev hosts only", () => {
    for (const h of ["localhost", "app.localhost", "127.0.0.1", "[::1]", "x.y.workers.dev"]) {
      expect(isDevHost(h)).toBe(true);
    }
    for (const h of ["grants.marisstella.app", "marisstella.app", "workers.dev.evil.test"]) {
      expect(isDevHost(h)).toBe(false);
    }
  });
});

describe("answersOnEveryHost", () => {
  it("covers health checks and cookie-less machine endpoints", () => {
    for (const p of [
      "/api/health",
      "/api/health/deep",
      "/api/billing/webhook",
      "/api/integrations/slack/command",
      "/api/internal/discovery/run",
      "/api/calendar/tok_abc.ics",
    ]) {
      expect(answersOnEveryHost(p)).toBe(true);
    }
  });

  it("redirects everything people use", () => {
    for (const p of ["/", "/x", "/api/me", "/api/auth/sign-in/email", "/api/orgs/o1", "/healthz"]) {
      expect(answersOnEveryHost(p)).toBe(false);
    }
  });
});

describe("redirectStatusFor", () => {
  it("uses 301 for reads and 308 for writes", () => {
    expect(redirectStatusFor("GET")).toBe(301);
    expect(redirectStatusFor("HEAD")).toBe(301);
    expect(redirectStatusFor("POST")).toBe(308);
    expect(redirectStatusFor("DELETE")).toBe(308);
  });
});
