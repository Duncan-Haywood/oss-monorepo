import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv, Tenant } from "../types";
import {
  authLimiter,
  defaultRateLimitStore,
  FixedWindowStore,
  LLM_ROUTES,
  llmLimiter,
  matchesRoute,
  rateLimit,
  TEST_RATE_LIMIT_HEADER,
  UPLOAD_ROUTES,
  uploadLimiter,
} from "./rate-limit";

type Bindings = Record<string, unknown>;

function appWith(mw: ReturnType<typeof rateLimit>) {
  const app = new Hono<AppEnv>();
  app.use("*", mw);
  app.all("*", (c) => c.json({ ok: true }));
  return app;
}

const post = (app: Hono<AppEnv>, path: string, env: Bindings = {}, headers: HeadersInit = {}) =>
  app.request(path, { method: "POST", headers }, env);

describe("rateLimit (in-memory fixed window fallback)", () => {
  let clock = 0;
  let store: FixedWindowStore;
  beforeEach(() => {
    clock = 60_000 * 16_666_667; // aligned to a 60 s window start
    store = new FixedWindowStore();
  });

  const limiter = () =>
    rateLimit({
      name: "t",
      key: (c) => c.req.header("x-key") ?? "anon",
      limit: 3,
      periodSeconds: 60,
      store,
      now: () => clock,
    });

  it("allows up to the limit, then 429 with Retry-After, then resets in the next window", async () => {
    const app = appWith(limiter());
    for (let i = 0; i < 3; i++) expect((await post(app, "/x")).status).toBe(200);

    clock += 15_000;
    const blocked = await post(app, "/x");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("45");
    expect(await blocked.json()).toEqual({
      error: { code: "rate_limited", message: expect.any(String) },
    });

    clock += 45_000; // next window
    expect((await post(app, "/x")).status).toBe(200);
  });

  it("counts keys independently", async () => {
    const app = appWith(limiter());
    for (let i = 0; i < 3; i++) await post(app, "/x", {}, { "x-key": "a" });
    expect((await post(app, "/x", {}, { "x-key": "a" })).status).toBe(429);
    expect((await post(app, "/x", {}, { "x-key": "b" })).status).toBe(200);
  });

  it("skips requests whose key is empty or that do not match `when`", async () => {
    const app = appWith(
      rateLimit({
        key: (c) => c.req.header("x-key"),
        when: (c) => c.req.method === "POST",
        limit: 1,
        periodSeconds: 60,
        store,
        now: () => clock,
      }),
    );
    for (let i = 0; i < 3; i++) expect((await post(app, "/x")).status).toBe(200); // no key
    for (let i = 0; i < 3; i++) {
      expect((await app.request("/x", { headers: { "x-key": "k" } })).status).toBe(200); // GET
    }
  });

  it("prunes old windows instead of growing without bound", () => {
    const s = new FixedWindowStore(4);
    for (let i = 0; i < 4; i++) s.hit(`k${i}`, 1, 1000, 0);
    expect(s.hit("new", 1, 1000, 5000).allowed).toBe(true);
    expect(s.hit("k0", 1, 1000, 5000).allowed).toBe(true); // old window was dropped
  });
});

describe("rateLimit with a Workers Rate Limiting binding", () => {
  it("uses the binding's decision and namespaced key", async () => {
    const limit = vi
      .fn<(o: { key: string }) => Promise<{ success: boolean }>>()
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false });
    const app = appWith(
      rateLimit({
        name: "llm",
        binding: "LLM_LIMITER",
        key: () => "k",
        limit: 1,
        periodSeconds: 60,
      }),
    );
    const env = { LLM_LIMITER: { limit } };
    expect((await post(app, "/x", env)).status).toBe(200);
    const res = await post(app, "/x", env);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(limit).toHaveBeenCalledWith({ key: "llm:k" });
  });

  it("fails open when the binding errors", async () => {
    const app = appWith(rateLimit({ binding: "B", key: () => "k", limit: 1, periodSeconds: 10 }));
    const env = { B: { limit: () => Promise.reject(new Error("down")) } };
    expect((await post(app, "/x", env)).status).toBe(200);
    expect((await post(app, "/x", env)).status).toBe(200);
  });
});

describe("presets", () => {
  beforeEach(() => defaultRateLimitStore.clear());

  const tenantApp = (mw: ReturnType<typeof rateLimit>, tenant: Tenant) => {
    const app = new Hono<AppEnv>();
    const org = new Hono<AppEnv>();
    org.use("*", async (c, next) => {
      c.set("tenant", tenant);
      await next();
    });
    org.use("*", mw);
    org.all("*", (c) => c.json({ ok: true }));
    app.route("/api/orgs/:orgId", org);
    return app;
  };
  const enforce = { [TEST_RATE_LIMIT_HEADER]: "enforce" };

  it("route tables cover the LLM and upload endpoints", () => {
    const p = (s: string) => `/api/orgs/org_1${s}`;
    for (const [m, path] of [
      ["POST", "/applications"],
      ["POST", "/applications/app_1/regenerate"],
      ["PATCH", "/applications/app_1/sections/need"],
      ["POST", "/interviews"],
      ["POST", "/interviews/int_1/answer"],
      ["POST", "/interviews/int_1/complete"],
      ["POST", "/interviews/transcript"],
      ["POST", "/imports/opportunity-url"],
      ["POST", "/imports/rfp"],
      ["POST", "/matches/rescore"],
      ["POST", "/transcribe"],
    ] as const) {
      expect(matchesRoute(LLM_ROUTES, m, p(path)), `${m} ${path}`).toBe(true);
    }
    expect(matchesRoute(LLM_ROUTES, "GET", p("/applications"))).toBe(false);
    expect(matchesRoute(LLM_ROUTES, "POST", p("/applications/app_1/withdraw"))).toBe(false);
    expect(matchesRoute(UPLOAD_ROUTES, "POST", p("/documents"))).toBe(true);
    expect(matchesRoute(UPLOAD_ROUTES, "POST", p("/documents/doc_1/reprocess"))).toBe(false);
  });

  it("llmLimiter limits per org + user and is opt-in under APP_ENV=test", async () => {
    const env = { APP_ENV: "test" };
    const a = tenantApp(llmLimiter, { orgId: "org_1", userId: "usr_a", role: "editor" });
    const b = tenantApp(llmLimiter, { orgId: "org_1", userId: "usr_b", role: "editor" });
    const url = "/api/orgs/org_1/applications/app_1/regenerate";
    for (let i = 0; i < 30; i++) expect((await post(a, url, env, enforce)).status).toBe(200);
    expect((await post(a, url, env, enforce)).status).toBe(429);
    expect((await post(a, url, env)).status).toBe(200); // tests without the header are not limited
    expect((await post(b, url, env, enforce)).status).toBe(200); // other user, own bucket
    // Non-LLM endpoints are untouched.
    expect((await post(a, "/api/orgs/org_1/facts", env, enforce)).status).toBe(200);
  });

  it("uploadLimiter limits per org", async () => {
    const a = tenantApp(uploadLimiter, { orgId: "org_2", userId: "usr_a", role: "editor" });
    const b = tenantApp(uploadLimiter, { orgId: "org_2", userId: "usr_b", role: "editor" });
    const url = "/api/orgs/org_2/documents";
    for (let i = 0; i < 10; i++) await post(a, url);
    for (let i = 0; i < 10; i++) await post(b, url);
    expect((await post(a, url)).status).toBe(429);
    expect((await post(b, url)).status).toBe(429);
  });

  it("authLimiter limits POSTs per client IP", async () => {
    const app = appWith(authLimiter);
    const ip = (v: string) => ({ "cf-connecting-ip": v });
    for (let i = 0; i < 20; i++) await post(app, "/api/auth/sign-in/email", {}, ip("1.1.1.1"));
    expect((await post(app, "/api/auth/sign-in/email", {}, ip("1.1.1.1"))).status).toBe(429);
    expect((await post(app, "/api/auth/sign-in/email", {}, ip("2.2.2.2"))).status).toBe(200);
    expect((await app.request("/api/auth/get-session", { headers: ip("1.1.1.1") })).status).toBe(
      200,
    );
  });
});
