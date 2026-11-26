import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppContext } from "../context";
import type { Logger } from "../lib/logger";
import type { AppEnv } from "../types";
import { observability, REQUEST_ID_HEADER } from "./observability";

type Line = { level: string; msg: string; data: Record<string, unknown> };

function capture(): { logger: Logger; lines: Line[] } {
  const lines: Line[] = [];
  const mk = (bindings: Record<string, unknown>): Logger => ({
    debug: (msg, data = {}) => lines.push({ level: "debug", msg, data: { ...bindings, ...data } }),
    info: (msg, data = {}) => lines.push({ level: "info", msg, data: { ...bindings, ...data } }),
    warn: (msg, data = {}) => lines.push({ level: "warn", msg, data: { ...bindings, ...data } }),
    error: (msg, data = {}) => lines.push({ level: "error", msg, data: { ...bindings, ...data } }),
    child: (b) => mk({ ...bindings, ...b }),
  });
  return { logger: mk({}), lines };
}

function makeApp(clock: { t: number }) {
  const { logger, lines } = capture();
  const app = new Hono<AppEnv>();
  app.use("*", observability({ now: () => clock.t }));
  app.use("*", async (c, next) => {
    c.set("requestId", "req_123");
    c.set("ctx", { logger: logger.child({ requestId: "req_123" }) } as unknown as AppContext);
    c.set("user", { id: "usr_1", email: "a@b.c", name: "A", emailVerified: true });
    await next();
  });
  const org = new Hono<AppEnv>();
  org.use("*", async (c, next) => {
    c.set("tenant", { orgId: c.req.param("orgId") ?? "", userId: "usr_1", role: "owner" });
    await next();
  });
  org.get("/applications/:id", (c) => c.json({ ok: true }));
  org.post("/slow", (c) => {
    clock.t += 2500;
    return c.json({ ok: true });
  });
  org.get("/boom", () => {
    throw new Error("boom");
  });
  app.route("/api/orgs/:orgId", org);
  app.onError((_e, c) => c.json({ error: { code: "internal_error", message: "x" } }, 500));
  return { app, lines };
}

describe("observability", () => {
  it("logs one access line with the route pattern (no ids / query) and sets x-request-id", async () => {
    const clock = { t: 1000 };
    const { app, lines } = makeApp(clock);
    const res = await app.request("/api/orgs/org_9/applications/app_7?email=x@y.z");
    expect(res.status).toBe(200);
    expect(res.headers.get(REQUEST_ID_HEADER)).toBe("req_123");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({
      level: "info",
      msg: "http.request",
      data: {
        requestId: "req_123",
        method: "GET",
        route: "/api/orgs/:orgId/applications/:id",
        status: 200,
        durationMs: 0,
        orgId: "org_9",
        userId: "usr_1",
      },
    });
    expect(JSON.stringify(lines)).not.toContain("x@y.z");
    expect(JSON.stringify(lines)).not.toContain("app_7");
  });

  it("logs slow requests at warn and 5xx at error", async () => {
    const clock = { t: 0 };
    const { app, lines } = makeApp(clock);
    await app.request("/api/orgs/org_1/slow", { method: "POST" });
    expect(lines[0]).toMatchObject({
      level: "warn",
      data: { route: "/api/orgs/:orgId/slow", durationMs: 2500, slow: true },
    });
    const boom = await app.request("/api/orgs/org_1/boom");
    expect(boom.status).toBe(500);
    expect(boom.headers.get(REQUEST_ID_HEADER)).toBe("req_123");
    expect(lines[1]).toMatchObject({ level: "error", data: { status: 500 } });
  });

  it("reports unmatched routes without the raw path", async () => {
    const { app, lines } = makeApp({ t: 0 });
    const res = await app.request("/api/orgs/org_1/nope/secret-path");
    expect(res.status).toBe(404);
    expect(lines[0]?.data.route).toBe("unmatched");
  });
});
