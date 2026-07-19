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

  it("falls back next=/dashboard when the protected pathname is over-long", async () => {
    process.env.OPERATOR_DASHBOARD_PASSWORD = PASSWORD;
    const { MAX_SAFE_NEXT_PATH_LENGTH } = await import("@/lib/auth/safe-next-path");
    const { proxy } = await import("./proxy");
    const overLongPath =
      "/dashboard/" + "a".repeat(MAX_SAFE_NEXT_PATH_LENGTH);
    expect(overLongPath.length).toBeGreaterThan(MAX_SAFE_NEXT_PATH_LENGTH);
    const response = await proxy(request(`http://localhost${overLongPath}`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/dashboard/login?next=%2Fdashboard",
    );
  });

  it("drops inherited query params from the login redirect Location", async () => {
    process.env.OPERATOR_DASHBOARD_PASSWORD = PASSWORD;
    const { proxy } = await import("./proxy");
    const response = await proxy(
      request("http://localhost/dashboard/leads?probe=" + "x".repeat(4000)),
    );
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toBe(
      "http://localhost/dashboard/login?next=%2Fdashboard%2Fleads",
    );
    expect(location).not.toContain("probe=");
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

  it("skips getLeadBySlug for over-long preview-subdomain Host labels", async () => {
    // Length gate in extractPreviewSubdomainSlug — spoofed Host must not burn CRM.
    const overHost = `${"a".repeat(121)}.${ROOT}`;
    const { proxy } = await import("./proxy");
    const response = await proxy(
      request(`http://${overHost}/`, {
        headers: { host: overHost },
      }),
    );
    expect(isNext(response)).toBe(true);
    expect(rewriteTarget(response)).toBeNull();
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(getLeadSlugByCustomDomain).not.toHaveBeenCalled();
  });

  it("skips getLeadSlugByCustomDomain for over-long custom-domain Host headers", async () => {
    // isPlausibleCustomDomainHost rejects length > 253 before CRM lookup.
    const overHost = `${"x".repeat(250)}.example.com`;
    expect(overHost.length).toBeGreaterThan(253);
    const { proxy } = await import("./proxy");
    const response = await proxy(
      request(`http://${overHost}/`, {
        headers: { host: overHost },
      }),
    );
    expect(isNext(response)).toBe(true);
    expect(rewriteTarget(response)).toBeNull();
    expect(getLeadSlugByCustomDomain).not.toHaveBeenCalled();
    expect(getLeadBySlug).not.toHaveBeenCalled();
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

  describe("Content-Security-Policy (csp-nonce-rollout)", () => {
    it("sends the static-safe policy (no nonce) on a static marketing/docs route", async () => {
      const { proxy } = await import("./proxy");
      const response = await proxy(request("http://localhost/docs/architecture"));
      const csp = response.headers.get("Content-Security-Policy");
      expect(csp).not.toBeNull();
      expect(csp).not.toContain("nonce-");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it("sends the static-safe policy on the platform homepage (no rewrite, still statically generated)", async () => {
      const { proxy } = await import("./proxy");
      const response = await proxy(
        request("http://localsitestudio.com/", { headers: { host: "localsitestudio.com" } }),
      );
      expect(response.headers.get("Content-Security-Policy")).not.toContain("nonce-");
    });

    it("sends a nonce-scoped strict policy on /dashboard when the gate passes through", async () => {
      const { proxy } = await import("./proxy");
      const response = await proxy(request("http://localhost/dashboard"));
      const csp = response.headers.get("Content-Security-Policy");
      expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
      expect(csp).toMatch(/style-src 'self' 'nonce-[^']+'/);
    });

    it("sends no Content-Security-Policy header on the login redirect itself (3xx, no body to render)", async () => {
      process.env.OPERATOR_DASHBOARD_PASSWORD = PASSWORD;
      const { proxy } = await import("./proxy");
      const response = await proxy(request("http://localhost/dashboard/leads"));
      expect(response.status).toBe(307);
      expect(response.headers.get("Content-Security-Policy")).toBeNull();
    });

    it("sends a nonce-scoped policy on /checkout", async () => {
      const { proxy } = await import("./proxy");
      const response = await proxy(request("http://localhost/checkout"));
      expect(response.headers.get("Content-Security-Policy")).toMatch(/nonce-/);
    });

    it("sends a nonce-scoped policy on a directly-requested /preview/[slug] page", async () => {
      const { proxy } = await import("./proxy");
      const response = await proxy(request("http://localhost/preview/joes-plumbing"));
      expect(response.headers.get("Content-Security-Policy")).toMatch(/nonce-/);
    });

    it("sends a nonce-scoped policy on a preview-subdomain rewrite, even though the request path was \"/\"", async () => {
      getLeadBySlug.mockResolvedValue({ slug: "joes-plumbing" });
      const { proxy } = await import("./proxy");
      const response = await proxy(
        request("http://joes-plumbing.localsitestudio.com/", {
          headers: { host: "joes-plumbing.localsitestudio.com" },
        }),
      );
      expect(rewriteTarget(response)).not.toBeNull();
      expect(response.headers.get("Content-Security-Policy")).toMatch(/nonce-/);
    });

    it("issues a fresh nonce per request", async () => {
      const { proxy } = await import("./proxy");
      const first = await proxy(request("http://localhost/dashboard"));
      const second = await proxy(request("http://localhost/dashboard"));
      expect(first.headers.get("Content-Security-Policy")).not.toBe(
        second.headers.get("Content-Security-Policy"),
      );
    });
  });
});
