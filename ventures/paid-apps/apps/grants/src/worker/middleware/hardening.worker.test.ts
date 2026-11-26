// Smoke test: the hardening middleware composed in front of the real app (as app.ts will mount it)
// leaves real routes working and enforces its rules on them.
import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { setupTenant } from "../../../test/worker/helpers";
import { createApp } from "../app";
import type { AppEnv } from "../types";
import { observability, REQUEST_ID_HEADER } from "./observability";
import { requestLimits } from "./request-limits";

const composed = new Hono<AppEnv>();
composed.use("*", observability());
composed.use("/api/*", requestLimits());
composed.route("/", createApp());

const call = (path: string, init: RequestInit & { as?: string } = {}) => {
  const headers = new Headers(init.headers);
  if (init.as) headers.set("x-test-user-id", init.as);
  return composed.fetch(new Request(`http://localhost:5173${path}`, { ...init, headers }), env);
};

describe("hardening middleware on the real app", () => {
  it("passes valid JSON writes and bodiless writes; rejects non-JSON bodies", async () => {
    const { orgId, userId } = await setupTenant();
    const ok = await call(`/api/orgs/${orgId}/profile`, {
      method: "PATCH",
      as: userId,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ city: "Gallup" }),
    });
    expect(ok.status).toBe(200);
    expect(ok.headers.get(REQUEST_ID_HEADER)).toBeTruthy();

    const plain = await call(`/api/orgs/${orgId}/profile`, {
      method: "PATCH",
      as: userId,
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ city: "Gallup" }),
    });
    expect(plain.status).toBe(415);

    const bodiless = await call(`/api/orgs/${orgId}/applications/app_missing/withdraw`, {
      method: "POST",
      as: userId,
    });
    expect(bodiless.status).toBe(404); // reached the handler
  });

  it("lets multipart uploads reach their handler and caps oversized ones", async () => {
    const { orgId, userId } = await setupTenant();
    const form = new FormData();
    form.set("kind", "other");
    const upload = await call(`/api/orgs/${orgId}/documents`, {
      method: "POST",
      as: userId,
      body: form,
    });
    expect(upload.status).toBe(400); // handler's own "missing file" validation

    const huge = await call(`/api/orgs/${orgId}/documents`, {
      method: "POST",
      as: userId,
      headers: {
        "content-type": "multipart/form-data; boundary=x",
        "content-length": String(27 * 1024 * 1024),
      },
      body: "x",
    });
    expect(huge.status).toBe(413);
  });
});
