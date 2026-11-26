// The production layout: served under /grants on https://marisstella.app (the catalogue Worker
// forwards /grants/* with the URL unchanged), and the old host grants.marisstella.app 301s there.
// The test Worker runs at the host root, so these call the entry point with production-like vars.
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { Env } from "@worker/env";
import worker from "@worker/index";
import { describe, expect, it } from "vitest";

const PROD = {
  ...env,
  BASE_PATH: "/grants",
  APP_URL: "https://marisstella.app/grants",
} as Env;

/** Plain-http variant (no Secure cookies, no required email verification) for the auth flow. */
const LOCAL = {
  ...env,
  BASE_PATH: "/grants",
  APP_URL: "http://localhost:5173/grants",
} as Env;

async function call(url: string, init: RequestInit = {}, e: Env = PROD): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(url, { redirect: "manual", ...init }) as Parameters<typeof worker.fetch>[0],
    e,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

describe("serving under /grants", () => {
  it("answers /grants/api/health on the canonical host", async () => {
    const res = await call("https://marisstella.app/grants/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
  });

  it("returns the API's JSON 404 for unknown routes under the prefix", async () => {
    const res = await call("https://marisstella.app/grants/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "not_found" } });
  });

  it("does not serve the API outside the prefix on the canonical host", async () => {
    const res = await call("https://marisstella.app/api/health");
    expect(res.status).toBe(404);
  });

  it("keeps the session behind the prefix: sign-up sets a /grants cookie that /grants/api/me accepts", async () => {
    const origin = "http://localhost:5173";
    const email = `base-${crypto.randomUUID()}@example.test`;
    const signUp = await call(
      `${origin}/grants/api/auth/sign-up/email`,
      {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "long-enough-password", name: "Base Path" }),
      },
      LOCAL,
    );
    expect(signUp.status).toBe(200);
    const setCookie = signUp.headers.getSetCookie().find((c) => c.includes("session_token="));
    expect(setCookie).toMatch(/Path=\/grants(;|$)/);
    const cookie = setCookie?.split(";")[0] ?? "";

    const session = await call(
      `${origin}/grants/api/auth/get-session`,
      { headers: { Cookie: cookie } },
      LOCAL,
    );
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({ user: { email } });

    const me = await call(`${origin}/grants/api/me`, { headers: { Cookie: cookie } }, LOCAL);
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ user: { email } });
  });

  it("sends workers.dev visitors at the root to the app", async () => {
    const res = await call("https://grant-autopilot.example.workers.dev/?a=1");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/grants/?a=1");
  });
});

describe("old host grants.marisstella.app", () => {
  it("301s to https://marisstella.app/grants with path and query", async () => {
    const res = await call("https://grants.marisstella.app/x?y=1");
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("https://marisstella.app/grants/x?y=1");
  });

  it("301s the root and does not double an existing prefix", async () => {
    const root = await call("https://grants.marisstella.app/");
    expect(root.headers.get("Location")).toBe("https://marisstella.app/grants/");
    const prefixed = await call("https://grants.marisstella.app/grants/api/me?z=2");
    expect(prefixed.status).toBe(301);
    expect(prefixed.headers.get("Location")).toBe("https://marisstella.app/grants/api/me?z=2");
  });

  it("uses 308 for writes so the method survives", async () => {
    const res = await call("https://grants.marisstella.app/api/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(308);
    expect(res.headers.get("Location")).toBe("https://marisstella.app/grants/api/orgs");
  });

  it("still answers health checks itself (post-deploy smoke test, monitor)", async () => {
    for (const path of ["/grants/api/health", "/api/health"]) {
      const res = await call(`https://grants.marisstella.app${path}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true });
    }
  });

  it("is not redirected by a plain-http APP_URL (local dev, tests)", async () => {
    const res = await call("https://grants.marisstella.app/api/health", {}, {
      ...env,
      BASE_PATH: "",
      APP_URL: "http://localhost:5173",
    } as Env);
    expect(res.status).toBe(200);
  });
});
