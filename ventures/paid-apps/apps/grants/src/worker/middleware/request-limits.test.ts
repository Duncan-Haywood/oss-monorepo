import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../types";
import { isJsonContentType, MiB, requestLimits, ruleFor } from "./request-limits";

function makeApp() {
  const app = new Hono<AppEnv>();
  app.use("*", requestLimits());
  app.all("*", async (c) => {
    const text = c.req.raw.body ? await c.req.text() : "";
    return c.json({ bytes: text.length });
  });
  // Quiet stand-in for the real app's onError (a body read aborted by the limiter lands here).
  app.onError((_e, c) => c.json({ error: { code: "internal_error", message: "x" } }, 500));
  return app;
}

const JSON_HEADERS = { "content-type": "application/json" };

function streamOf(totalBytes: number, chunk = 64 * 1024) {
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= totalBytes) return controller.close();
      const n = Math.min(chunk, totalBytes - sent);
      sent += n;
      controller.enqueue(new Uint8Array(n).fill(0x20));
    },
  });
}

const streamed = (path: string, bytes: number, headers: Record<string, string> = JSON_HEADERS) =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers,
    body: streamOf(bytes),
    duplex: "half",
  } as RequestInit);

describe("requestLimits", () => {
  it("rejects a declared Content-Length over the route group's cap with 413", async () => {
    const app = makeApp();
    const res = await app.request("/api/orgs/o/facts", {
      method: "POST",
      headers: { ...JSON_HEADERS, "content-length": String(MiB + 1) },
      body: "{}",
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({
      error: { code: "payload_too_large", message: "Request body is too large (max 1 MB)" },
    });
  });

  it("allows uploads up to 26 MiB on upload routes", async () => {
    const app = makeApp();
    const headers = (n: number) => ({
      "content-type": "multipart/form-data; boundary=x",
      "content-length": String(n),
    });
    const ok = await app.request("/api/orgs/o/documents", {
      method: "POST",
      headers: headers(10),
      body: "0123456789",
    });
    expect(ok.status).toBe(200);
    const big = await app.request("/api/orgs/o/documents", {
      method: "POST",
      headers: headers(26 * MiB + 1),
      body: "x",
    });
    expect(big.status).toBe(413);
  });

  it("enforces the cap while streaming bodies without Content-Length", async () => {
    const app = makeApp();
    const over = await app.fetch(streamed("/api/orgs/o/facts", MiB + 10));
    expect(over.status).toBe(413);
    const under = await app.fetch(streamed("/api/orgs/o/facts", 1000));
    expect(under.status).toBe(200);
    expect(await under.json()).toEqual({ bytes: 1000 });
    const largeJson = await app.fetch(streamed("/api/orgs/o/documents/text", 2 * MiB));
    expect(largeJson.status).toBe(200);
  });

  it("requires a JSON content type on JSON routes that carry a body", async () => {
    const app = makeApp();
    const noType = await app.request("/api/orgs/o/facts", {
      method: "POST",
      headers: { "content-type": "text/plain", "content-length": "2" },
      body: "{}",
    });
    expect(noType.status).toBe(415);
    expect(((await noType.json()) as { error: { code: string } }).error.code).toBe(
      "unsupported_media_type",
    );
    const form = await app.request("/api/orgs/o/profile", {
      method: "PATCH",
      headers: { "content-type": "application/x-www-form-urlencoded", "content-length": "3" },
      body: "a=b",
    });
    expect(form.status).toBe(415);
    const ok = await app.request("/api/orgs/o/facts", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8", "content-length": "2" },
      body: "{}",
    });
    expect(ok.status).toBe(200);
  });

  it("lets bodiless writes, GETs, webhooks and auth through without a content type", async () => {
    const app = makeApp();
    expect(
      (await app.request("/api/orgs/o/applications/a/withdraw", { method: "POST" })).status,
    ).toBe(200);
    expect(
      (
        await app.request("/api/orgs/o/x", {
          method: "POST",
          headers: { "content-length": "0" },
        })
      ).status,
    ).toBe(200);
    expect((await app.request("/api/orgs/o/facts")).status).toBe(200);
    const hook = await app.request("/api/billing/webhook", {
      method: "POST",
      headers: { "content-type": "text/plain", "content-length": "5" },
      body: "hello",
    });
    expect(hook.status).toBe(200);
    const auth = await app.request("/api/auth/callback/apple", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "content-length": "3" },
      body: "a=b",
    });
    expect(auth.status).toBe(200);
  });

  it("rejects an invalid Content-Length", async () => {
    const res = await makeApp().request("/api/orgs/o/facts", {
      method: "POST",
      headers: { ...JSON_HEADERS, "content-length": "abc" },
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  it("classifies routes", () => {
    expect(ruleFor("POST", "/api/orgs/o/documents").name).toBe("upload");
    expect(ruleFor("POST", "/api/orgs/o/transcribe").name).toBe("upload");
    expect(ruleFor("POST", "/api/orgs/o/documents/text").name).toBe("large_json");
    expect(ruleFor("DELETE", "/api/orgs/o/documents").name).toBe("json");
    expect(ruleFor("POST", "/api/billing/webhook").name).toBe("webhook");
    expect(ruleFor("POST", "/api/auth/sign-in/email").name).toBe("auth");
    expect(isJsonContentType("application/merge-patch+json")).toBe(true);
    expect(isJsonContentType("text/json")).toBe(false);
    expect(isJsonContentType(undefined)).toBe(false);
  });
});
