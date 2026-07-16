import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  OPERATOR_SESSION_COOKIE,
  createOperatorSessionToken,
  tryCreateSessionFromPassword,
} from "@/lib/auth/operator";

const getLeadBySlug = vi.fn();
const getLeadSlugByCustomDomain = vi.fn();

vi.mock("@/lib/db", () => ({
  getLeadBySlug: (...args: unknown[]) => getLeadBySlug(...args),
  getLeadSlugByCustomDomain: (...args: unknown[]) => getLeadSlugByCustomDomain(...args),
}));

const ROOT = "localsitestudio.com";
const PASSWORD = "correct-horse-battery-staple";

function request(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(url, init);
}

function isNext(response: Response): boolean {
  return response.headers.get("x-middleware-next") === "1";
}

function rewriteTarget(response: Response): string | null {
  return response.headers.get("x-middleware-rewrite");
}

describe("src/proxy.ts orchestration", () => {
  beforeEach(() => {
    getLeadBySlug.mockReset();
    getLeadSlugByCustomDomain.mockReset();
    process.env.NEXT_PUBLIC_PRODUCTION_DOMAIN = ROOT;
    delete process.env.OPERATOR_DASHBOARD_PASSWORD;
  });

  afterEach(() => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_PRODUCTION_DOMAIN;
    delete process.env.OPERATOR_DASHBOARD_PASSWORD;
  });

  it("passes /dashboard through when OPERATOR_DASHBOARD_PASSWORD is unset", async () => {
    const { proxy } = await import("./proxy");
    const response = await proxy(request("http://localhost/dashboard"));
    expect(isNext(response)).toBe(true);
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(getLeadSlugByCustomDomain).not.toHaveBeenCalled();
  });

  it("redirects /dashboard to login when password is set and cookie is missing", async () => {
    process.env.OPERATOR_DASHBOARD_PASSWORD = PASSWORD;
    const { proxy } = await import("./proxy");
    const response = await proxy(request("http://localhost/dashboard/leads"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/dashboard/login?next=%2Fdashboard%2Fleads",
    );
  });

  it("allows /dashboard when a valid operator session cookie is present", async () => {
    process.env.OPERATOR_DASHBOARD_PASSWORD = PASSWORD;
    const token = createOperatorSessionToken(PASSWORD);
    const { proxy } = await import("./proxy");
    const response = await proxy(
      request("http://localhost/dashboard", {
        headers: { cookie: `${OPERATOR_SESSION_COOKIE}=${token}` },
      }),
    );
    expect(isNext(response)).toBe(true);
  });

  it("allows /dashboard when env password has surrounding whitespace (getPassword parity)", async () => {
    // Login signs with trimmed getPassword(); proxy must verify with the same
    // key — raw process.env would reject this cookie and loop to login.
    process.env.OPERATOR_DASHBOARD_PASSWORD = `  ${PASSWORD}  `;
    const token = tryCreateSessionFromPassword(PASSWORD);
    expect(token).not.toBeNull();
    const { proxy } = await import("./proxy");
    const response = await proxy(
      request("http://localhost/dashboard/leads", {
        headers: { cookie: `${OPERATOR_SESSION_COOKIE}=${token!}` },
      }),
    );
    expect(isNext(response)).toBe(true);
  });

  it("treats whitespace-only OPERATOR_DASHBOARD_PASSWORD as open demo at the proxy gate", async () => {
    process.env.OPERATOR_DASHBOARD_PASSWORD = "   ";
    const { proxy } = await import("./proxy");
    const response = await proxy(request("http://localhost/dashboard"));
    expect(isNext(response)).toBe(true);
  });

  it("never gates /dashboard/login even when password is set", async () => {
    process.env.OPERATOR_DASHBOARD_PASSWORD = PASSWORD;
    const { proxy } = await import("./proxy");
    const response = await proxy(request("http://localhost/dashboard/login"));
    expect(isNext(response)).toBe(true);
  });

  it("rewrites / on a preview subdomain to /preview/[slug] when the lead exists", async () => {
    getLeadBySlug.mockResolvedValue({ slug: "joes-plumbing" });
    const { proxy } = await import("./proxy");
    const response = await proxy(
      request("http://joes-plumbing.localsitestudio.com/", {
        headers: { host: "joes-plumbing.localsitestudio.com" },
      }),
    );
    expect(rewriteTarget(response)).toBe(
      "http://joes-plumbing.localsitestudio.com/preview/joes-plumbing",
    );
    expect(getLeadBySlug).toHaveBeenCalledWith("joes-plumbing");
    expect(getLeadSlugByCustomDomain).not.toHaveBeenCalled();
  });

  it("does not rewrite an unrecognized preview subdomain (no demo-catalog fallthrough)", async () => {
    getLeadBySlug.mockResolvedValue(null);
    const { proxy } = await import("./proxy");
    const response = await proxy(
      request("http://unknown-label.localsitestudio.com/", {
        headers: { host: "unknown-label.localsitestudio.com" },
      }),
    );
    expect(isNext(response)).toBe(true);
    expect(rewriteTarget(response)).toBeNull();
    expect(getLeadBySlug).toHaveBeenCalledWith("unknown-label");
    expect(getLeadSlugByCustomDomain).not.toHaveBeenCalled();
  });

  it("rewrites / on a client custom domain to /preview/[slug] when mapped", async () => {
    getLeadSlugByCustomDomain.mockResolvedValue("joes-plumbing");
    const { proxy } = await import("./proxy");
    const response = await proxy(
      request("http://joesplumbing.com/", {
        headers: { host: "joesplumbing.com" },
      }),
    );
    expect(rewriteTarget(response)).toBe("http://joesplumbing.com/preview/joes-plumbing");
    expect(getLeadSlugByCustomDomain).toHaveBeenCalledWith("joesplumbing.com");
    expect(getLeadBySlug).not.toHaveBeenCalled();
  });

  it("skips custom-domain DB lookup on platform hosts (incl. bare production root)", async () => {
    const { proxy } = await import("./proxy");
    const response = await proxy(
      request("http://localsitestudio.com/", {
        headers: { host: "localsitestudio.com" },
      }),
    );
    expect(isNext(response)).toBe(true);
    expect(getLeadSlugByCustomDomain).not.toHaveBeenCalled();
    expect(getLeadBySlug).not.toHaveBeenCalled();
  });

  it("never Host-diverts /api/* or /dashboard/* even on a mapped custom domain", async () => {
    process.env.OPERATOR_DASHBOARD_PASSWORD = PASSWORD;
    const token = createOperatorSessionToken(PASSWORD);
    const { proxy } = await import("./proxy");

    const api = await proxy(
      request("http://joesplumbing.com/api/contact/joes-plumbing", {
        headers: { host: "joesplumbing.com" },
      }),
    );
    expect(isNext(api)).toBe(true);
    expect(rewriteTarget(api)).toBeNull();

    const dash = await proxy(
      request("http://joesplumbing.com/dashboard", {
        headers: {
          host: "joesplumbing.com",
          cookie: `${OPERATOR_SESSION_COOKIE}=${token}`,
        },
      }),
    );
    expect(isNext(dash)).toBe(true);
    expect(rewriteTarget(dash)).toBeNull();
    expect(getLeadSlugByCustomDomain).not.toHaveBeenCalled();
  });

  it("only rewrites the exact root path — /preview/[slug] on a custom domain is untouched", async () => {
    const { proxy } = await import("./proxy");
    const response = await proxy(
      request("http://joesplumbing.com/preview/joes-plumbing", {
        headers: { host: "joesplumbing.com" },
      }),
    );
    expect(isNext(response)).toBe(true);
    expect(getLeadSlugByCustomDomain).not.toHaveBeenCalled();
  });
});
