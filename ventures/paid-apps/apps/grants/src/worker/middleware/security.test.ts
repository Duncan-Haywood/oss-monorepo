import { readFileSync } from "node:fs";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../types";
import { API_CSP, HSTS, originCheck, SHARED_SECURITY_HEADERS, securityHeaders } from "./security";

const app = new Hono<AppEnv>();
app.use("*", securityHeaders);
app.use("/api/*", originCheck);
app.get("/api/thing", (c) => c.json({ ok: true }));
app.post("/api/thing", (c) => c.json({ ok: true }));
app.get("/api/file", (c) =>
  c.body("x", 200, { "Content-Security-Policy": "sandbox; default-src 'none'" }),
);

const devEnv = { APP_ENV: "development", APP_URL: "http://localhost:5173" };
const prodEnv = { APP_ENV: "production", APP_URL: "https://grants.example.org" };

/** Header block for one path pattern in public/_headers (comments and blank lines skipped). */
function assetHeaders(pattern: string): Record<string, string> {
  const out: Record<string, string> = {};
  let inBlock = false;
  for (const line of readFileSync("public/_headers", "utf8").split("\n")) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      inBlock = line.trim() === pattern;
      continue;
    }
    if (!inBlock) continue;
    const i = line.indexOf(":");
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

describe("securityHeaders", () => {
  it("sends the shared headers, a deny-all CSP and no-store on API responses", async () => {
    const res = await app.request("/api/thing", {}, devEnv);
    for (const [k, v] of Object.entries(SHARED_SECURITY_HEADERS))
      expect(res.headers.get(k)).toBe(v);
    expect(res.headers.get("content-security-policy")).toBe(API_CSP);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("strict-transport-security")).toBeNull(); // plain-http dev
  });

  it("keeps a route's own CSP (sandboxed downloads)", async () => {
    const res = await app.request("/api/file", {}, devEnv);
    expect(res.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'");
  });

  it("sends HSTS in production and on https", async () => {
    const prod = await app.request("/api/thing", {}, prodEnv);
    expect(prod.headers.get("strict-transport-security")).toBe(HSTS);
    const https = await app.request("https://preview.example.org/api/thing", {}, devEnv);
    expect(https.headers.get("strict-transport-security")).toBe(HSTS);
  });

  it("never enables CORS for /api", async () => {
    const cross = { Origin: "https://evil.example" };
    const get = await app.request("/api/thing", { headers: cross }, prodEnv);
    const preflight = await app.request(
      "/api/thing",
      { method: "OPTIONS", headers: { ...cross, "Access-Control-Request-Method": "POST" } },
      prodEnv,
    );
    for (const res of [get, preflight]) {
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
      expect(res.headers.get("access-control-allow-credentials")).toBeNull();
    }
    const post = await app.request("/api/thing", { method: "POST", headers: cross }, prodEnv);
    expect(post.status).toBe(403);
  });
});

describe("public/_headers", () => {
  const assets = assetHeaders("/*");

  it("matches the API's shared security headers", () => {
    for (const [k, v] of Object.entries(SHARED_SECURITY_HEADERS)) expect(assets[k]).toBe(v);
    expect(assets["Strict-Transport-Security"]).toBe(HSTS);
  });

  it("has a CSP without inline/eval allowances that upgrades insecure requests", () => {
    const csp = assets["Content-Security-Policy"] ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    // The only external origin is Turnstile's, and only for its script and challenge iframe.
    const TURNSTILE = "https://challenges.cloudflare.com";
    const directive = (name: string) =>
      csp
        .split(";")
        .map((d) => d.trim())
        .find((d) => d.startsWith(`${name} `));
    expect(directive("script-src")).toBe(`script-src 'self' ${TURNSTILE}`);
    expect(directive("frame-src")).toBe(`frame-src ${TURNSTILE}`);
    expect(csp.replaceAll(TURNSTILE, "")).not.toMatch(/'unsafe-inline'|'unsafe-eval'|\*|https?:/);
  });

  it("caches hashed build assets immutably", () => {
    expect(assetHeaders("/assets/*")["Cache-Control"]).toContain("immutable");
  });
});
