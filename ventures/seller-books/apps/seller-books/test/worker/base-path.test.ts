// Serving under a path prefix (docs/DEPLOY.md, "Path prefix"): the marketing site owns
// https://marisstella.app/seller-books, so the app can be built with BASE_PATH=/seller-books/app and
// share the host. The test Worker runs at the host root, so these call the entry point with
// production-like vars.
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { Env } from "@worker/env";
import worker from "@worker/index";
import { describe, expect, it } from "vitest";

const ORIGIN = "http://localhost:5173";
/** Plain http (no Secure cookies, no required email verification) so the auth flow runs end to end. */
const PREFIXED = {
  ...env,
  BASE_PATH: "/seller-books/app",
  APP_URL: `${ORIGIN}/seller-books/app`,
} as Env;

async function call(url: string, init: RequestInit = {}, e: Env = PREFIXED): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(url, { redirect: "manual", ...init }) as Parameters<typeof worker.fetch>[0],
    e,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

describe("serving under /seller-books/app", () => {
  it("answers the API under the prefix", async () => {
    const res = await call(`${ORIGIN}/seller-books/app/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, app: "seller-books" });
    expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
  });

  it("returns the API's JSON 404 for unknown routes under the prefix", async () => {
    const res = await call(`${ORIGIN}/seller-books/app/api/nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "not_found" } });
  });

  it("does not serve the API outside the prefix, nor a look-alike prefix", async () => {
    for (const path of [
      "/api/health",
      "/seller-books/api/health",
      "/seller-books/apps/api/health",
    ]) {
      const res = await call(`${ORIGIN}${path}`);
      expect(res.status, path).toBe(404);
    }
  });

  it("points the host root at the app, keeping the query", async () => {
    const res = await call(`${ORIGIN}/?ref=x`);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/seller-books/app/?ref=x");
  });

  it("keeps the session behind the prefix: sign-up sets a prefixed cookie that /api/me accepts", async () => {
    const email = `base-${crypto.randomUUID()}@example.test`;
    const signUp = await call(`${ORIGIN}/seller-books/app/api/auth/sign-up/email`, {
      method: "POST",
      headers: { Origin: ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "long-enough-password", name: "Base Path" }),
    });
    expect(signUp.status).toBe(200);
    const setCookie = signUp.headers.getSetCookie().find((c) => c.includes("session_token="));
    expect(setCookie).toMatch(/Path=\/seller-books\/app(;|$)/);
    const cookie = setCookie?.split(";")[0] ?? "";

    const me = await call(`${ORIGIN}/seller-books/app/api/me`, { headers: { Cookie: cookie } });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ user: { email } });
  });

  it("still serves auth when APP_URL is missing the prefix (a misconfigured deploy)", async () => {
    const e = { ...PREFIXED, APP_URL: ORIGIN } as Env;
    const res = await call(
      `${ORIGIN}/seller-books/app/api/auth/sign-up/email`,
      {
        method: "POST",
        headers: { Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `nopath-${crypto.randomUUID()}@example.test`,
          password: "long-enough-password",
          name: "No Path",
        }),
      },
      e,
    );
    expect(res.status).toBe(200);
  });

  it("leaves a root build unchanged", async () => {
    const res = await call(`${ORIGIN}/api/health`, {}, { ...env, BASE_PATH: "" } as Env);
    expect(res.status).toBe(200);
  });
});
