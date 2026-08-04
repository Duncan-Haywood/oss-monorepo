import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The route gate's half of the fail-closed contract (see
 * src/lib/auth/operator-fail-closed.test.ts for the server-action chokepoint).
 *
 * On a production build with no usable OPERATOR_DASHBOARD_PASSWORD the proxy
 * used to call NextResponse.next() and serve the dashboard to anyone. It now
 * refuses the whole /dashboard tree — login included, because /dashboard/login
 * cannot mint a session without a password and would only redirect-loop.
 */

const getLeadBySlug = vi.fn();
const getLeadSlugByCustomDomain = vi.fn();

vi.mock("@/lib/db", () => ({
  getLeadBySlug: (...args: unknown[]) => getLeadBySlug(...args),
  getLeadSlugByCustomDomain: (...args: unknown[]) => getLeadSlugByCustomDomain(...args),
}));

const ROOT = "localsitestudio.com";
const PASSWORD = "correct-horse-battery-staple";
const originalNodeEnv = process.env.NODE_ENV;

/** NODE_ENV is typed read-only; these tests need to simulate a production build. */
function setNodeEnv(value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) {
    delete env.NODE_ENV;
  } else {
    env.NODE_ENV = value;
  }
}

function request(url: string) {
  return new NextRequest(url);
}

function isNext(response: Response): boolean {
  return response.headers.get("x-middleware-next") === "1";
}

describe("proxy dashboard gate on a production build", () => {
  beforeEach(() => {
    getLeadBySlug.mockReset();
    getLeadSlugByCustomDomain.mockReset();
    process.env.NEXT_PUBLIC_PRODUCTION_DOMAIN = ROOT;
    setNodeEnv("production");
    delete process.env.OPERATOR_DASHBOARD_PASSWORD;
  });

  afterEach(() => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_PRODUCTION_DOMAIN;
    delete process.env.OPERATOR_DASHBOARD_PASSWORD;
    setNodeEnv(originalNodeEnv);
  });

  it("refuses /dashboard with 503 when the password is unset", async () => {
    const { proxy } = await import("./proxy");
    const response = await proxy(request("http://localhost/dashboard"));
    expect(response.status).toBe(503);
    expect(isNext(response)).toBe(false);
    expect(await response.text()).toContain("OPERATOR_DASHBOARD_PASSWORD");
  });

  it("refuses every dashboard sub-route, not just the index", async () => {
    const { proxy } = await import("./proxy");
    for (const path of [
      "/dashboard/leads",
      "/dashboard/commerce",
      "/dashboard/leads?stage=paid",
    ]) {
      const response = await proxy(request(`http://localhost${path}`));
      expect(response.status, path).toBe(503);
    }
  });

  it("refuses /dashboard/login too, instead of redirect-looping into it", async () => {
    const { proxy } = await import("./proxy");
    const response = await proxy(request("http://localhost/dashboard/login"));
    expect(response.status).toBe(503);
    expect(response.headers.get("location")).toBeNull();
  });

  it("refuses when the password is still a documented placeholder", async () => {
    process.env.OPERATOR_DASHBOARD_PASSWORD = "changeme";
    const { proxy } = await import("./proxy");
    const response = await proxy(request("http://localhost/dashboard"));
    expect(response.status).toBe(503);
  });

  it("leaves the public site alone — only the dashboard is gated", async () => {
    getLeadSlugByCustomDomain.mockResolvedValue(null);
    const { proxy } = await import("./proxy");
    for (const path of ["/", "/checkout", "/api/contact/acme", "/preview/acme"]) {
      const response = await proxy(request(`http://localhost${path}`));
      expect(response.status, path).not.toBe(503);
    }
  });

  it("returns to the normal login redirect once a real password is set", async () => {
    process.env.OPERATOR_DASHBOARD_PASSWORD = PASSWORD;
    const { proxy } = await import("./proxy");
    const response = await proxy(request("http://localhost/dashboard/leads"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/dashboard/login?next=%2Fdashboard%2Fleads",
    );
  });
});
