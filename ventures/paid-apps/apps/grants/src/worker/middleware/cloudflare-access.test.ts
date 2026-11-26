import { Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../types";
import {
  type AccessJwtPayload,
  accessRequiredFor,
  accessSetup,
  CF_ACCESS_JWT_HEADER,
  clearAccessKeyCache,
  cloudflareAccess,
  JWKS_MIN_REFETCH_MS,
  normalizeTeamDomain,
  verifyAccessJwt,
} from "./cloudflare-access";

const TEAM = "https://acme.cloudflareaccess.com";
const CERTS = `${TEAM}/cdn-cgi/access/certs`;
const AUD = "4714c1358e65fe4b408ad6d432a5f878f08194bdb4752441fd56faefa9b2b6f2";
const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);
const nowS = Math.floor(NOW / 1000);
const env = { CF_ACCESS_TEAM_DOMAIN: TEAM, CF_ACCESS_AUD: AUD };

interface TestKey {
  kid: string;
  keys: CryptoKeyPair;
  jwk: JsonWebKey & { kid: string; alg: string; use: string };
}

async function makeKey(kid: string): Promise<TestKey> {
  const keys = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pub = await crypto.subtle.exportKey("jwk", keys.publicKey);
  return { kid, keys, jwk: { kty: "RSA", n: pub.n, e: pub.e, kid, alg: "RS256", use: "sig" } };
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const b64urlJson = (v: unknown) => b64url(new TextEncoder().encode(JSON.stringify(v)));

async function sign(
  key: TestKey,
  claims: Partial<AccessJwtPayload> = {},
  header: Record<string, unknown> = {},
): Promise<string> {
  const h = b64urlJson({ alg: "RS256", kid: key.kid, typ: "JWT", ...header });
  const p = b64urlJson({
    aud: [AUD],
    iss: TEAM,
    email: "ops@marisstella.app",
    sub: "user-uuid",
    type: "app",
    iat: nowS - 60,
    nbf: nowS - 60,
    exp: nowS + 3600,
    ...claims,
  });
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key.keys.privateKey,
    new TextEncoder().encode(`${h}.${p}`),
  );
  return `${h}.${p}.${b64url(new Uint8Array(sig))}`;
}

/** Serves the JWKS Cloudflare publishes at /cdn-cgi/access/certs, from a mutable key list. */
function certsEndpoint(initial: TestKey[]) {
  let published = initial;
  const fetch = vi.fn(async (url: RequestInfo | URL) => {
    if (String(url) !== CERTS) return new Response("not found", { status: 404 });
    return Response.json({
      keys: published.map((k) => k.jwk),
      public_cert: { kid: published[0]?.kid, cert: "-----BEGIN CERTIFICATE-----..." },
      public_certs: published.map((k) => ({ kid: k.kid, cert: "..." })),
    });
  });
  return { fetch, publish: (keys: TestKey[]) => (published = keys) };
}

let k1: TestKey;
let k2: TestKey;
beforeAll(async () => {
  [k1, k2] = await Promise.all([makeKey("kid-1"), makeKey("kid-2")]);
});
beforeEach(() => clearAccessKeyCache());

const config = { issuer: TEAM, certsUrl: CERTS, audiences: [AUD] };

describe("normalizeTeamDomain / accessSetup", () => {
  it("accepts the team name, host or URL", () => {
    for (const v of ["acme", "acme.cloudflareaccess.com", "https://acme.cloudflareaccess.com/"]) {
      expect(normalizeTeamDomain(v)).toBe(TEAM);
    }
  });

  it("refuses other hosts, paths and http", () => {
    for (const v of [
      "https://evil.example",
      "https://acme.cloudflareaccess.com.evil.example",
      "https://acme.cloudflareaccess.com/cdn-cgi",
      "http://acme.cloudflareaccess.com",
      "https://a.b.cloudflareaccess.com",
      "",
    ]) {
      expect(normalizeTeamDomain(v)).toBeNull();
    }
  });

  it("is off without config and invalid when half configured", () => {
    expect(accessSetup({})).toEqual({ state: "off" });
    expect(accessSetup({ CF_ACCESS_AUD: AUD }).state).toBe("invalid");
    expect(accessSetup({ CF_ACCESS_TEAM_DOMAIN: TEAM }).state).toBe("invalid");
    expect(accessSetup({ ...env, CF_ACCESS_TEAM_DOMAIN: "https://evil.example" }).state).toBe(
      "invalid",
    );
    expect(accessSetup(env)).toEqual({ state: "on", config });
  });

  it("protects /api/admin always and everything else only with PROTECT_ALL", () => {
    expect(accessRequiredFor("/api/admin", env)).toBe(true);
    expect(accessRequiredFor("/api/admin/orgs", env)).toBe(true);
    expect(accessRequiredFor("/api/administrator", env)).toBe(false);
    expect(accessRequiredFor("/api/orgs", env)).toBe(false);
    const all = { ...env, CF_ACCESS_PROTECT_ALL: "true" };
    expect(accessRequiredFor("/api/orgs", all)).toBe(true);
    expect(accessRequiredFor("/api/auth/sign-in/email", all)).toBe(true);
    expect(accessRequiredFor("/api/health", all)).toBe(false);
    expect(accessRequiredFor("/api/health/deep", all)).toBe(false);
    expect(accessRequiredFor("/api/billing/webhook", all)).toBe(false);
    expect(accessRequiredFor("/api/healthz", all)).toBe(true);
  });
});

describe("verifyAccessJwt", () => {
  it("accepts a token signed by a published key with the right iss/aud/exp", async () => {
    const { fetch } = certsEndpoint([k1]);
    const claims = await verifyAccessJwt(await sign(k1), config, { fetch, now: NOW });
    expect(claims.email).toBe("ops@marisstella.app");
    expect(fetch).toHaveBeenCalledWith(CERTS, expect.anything());
  });

  it("accepts any of several configured AUD tags", async () => {
    const { fetch } = certsEndpoint([k1]);
    const setup = accessSetup({ ...env, CF_ACCESS_AUD: `other-app, ${AUD}` });
    expect(setup.state === "on" && setup.config.audiences).toEqual(["other-app", AUD]);
    if (setup.state !== "on") throw new Error("unreachable");
    await expect(
      verifyAccessJwt(await sign(k1, { aud: ["other-app"] }), setup.config, { fetch, now: NOW }),
    ).resolves.toBeTruthy();
    await expect(
      verifyAccessJwt(await sign(k1, { aud: ["third-app"] }), setup.config, { fetch, now: NOW }),
    ).rejects.toMatchObject({ reason: "bad_audience" });
  });

  it("accepts a string aud", async () => {
    const { fetch } = certsEndpoint([k1]);
    const token = await sign(k1, { aud: AUD });
    await expect(verifyAccessJwt(token, config, { fetch, now: NOW })).resolves.toBeTruthy();
  });

  it.each([
    ["bad_audience", { aud: ["someone-elses-app"] }],
    ["bad_issuer", { iss: "https://evil.cloudflareaccess.com" }],
    ["expired", { exp: nowS - 120 }],
    ["not_yet_valid", { nbf: nowS + 600 }],
  ])("rejects %s", async (reason, claims) => {
    const { fetch } = certsEndpoint([k1]);
    const token = await sign(k1, claims);
    await expect(verifyAccessJwt(token, config, { fetch, now: NOW })).rejects.toMatchObject({
      reason,
    });
  });

  it("rejects a signature from an unpublished key claiming a published kid", async () => {
    const { fetch } = certsEndpoint([k1]);
    const forged = await sign({ ...k2, kid: "kid-1" });
    await expect(verifyAccessJwt(forged, config, { fetch, now: NOW })).rejects.toMatchObject({
      reason: "bad_signature",
    });
  });

  it("rejects a tampered payload", async () => {
    const { fetch } = certsEndpoint([k1]);
    const [h, , s] = (await sign(k1)).split(".");
    const p = b64urlJson({ aud: [AUD], iss: TEAM, exp: nowS + 3600, email: "attacker@x" });
    await expect(
      verifyAccessJwt(`${h}.${p}.${s}`, config, { fetch, now: NOW }),
    ).rejects.toMatchObject({ reason: "bad_signature" });
  });

  it("rejects alg none / HS256 and malformed tokens without fetching keys", async () => {
    const { fetch } = certsEndpoint([k1]);
    const none = `${b64urlJson({ alg: "none", kid: "kid-1" })}.${b64urlJson({ aud: AUD })}.`;
    const hs = `${b64urlJson({ alg: "HS256", kid: "kid-1" })}.${b64urlJson({ aud: AUD })}.c2ln`;
    for (const [token, reason] of [
      [none, "bad_alg"],
      [hs, "bad_alg"],
      ["not-a-jwt", "malformed"],
      ["a.b.c", "malformed"],
    ] as const) {
      await expect(verifyAccessJwt(token, config, { fetch, now: NOW })).rejects.toMatchObject({
        reason,
      });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("caches the JWKS and refetches on key rotation (rate-limited)", async () => {
    const certs = certsEndpoint([k1]);
    const opts = (now: number) => ({ fetch: certs.fetch, now });
    await verifyAccessJwt(await sign(k1), config, opts(NOW));
    await verifyAccessJwt(await sign(k1), config, opts(NOW + 1000));
    expect(certs.fetch).toHaveBeenCalledTimes(1);

    // Access rotates: kid-2 is published. Right after a fetch an unknown kid does not refetch.
    certs.publish([k2, k1]);
    const rotated = await sign(k2);
    await expect(verifyAccessJwt(rotated, config, opts(NOW + 2000))).rejects.toMatchObject({
      reason: "unknown_kid",
    });
    expect(certs.fetch).toHaveBeenCalledTimes(1);
    // Later it does, and both keys work from then on.
    const later = NOW + JWKS_MIN_REFETCH_MS + 5000;
    await expect(verifyAccessJwt(rotated, config, opts(later))).resolves.toBeTruthy();
    await expect(verifyAccessJwt(await sign(k1), config, opts(later))).resolves.toBeTruthy();
    expect(certs.fetch).toHaveBeenCalledTimes(2);
  });

  it("reports an unreachable certs endpoint as unavailable", async () => {
    const fetch = vi.fn(async () => new Response("down", { status: 502 }));
    await expect(
      verifyAccessJwt(await sign(k1), config, { fetch, now: NOW }),
    ).rejects.toMatchObject({ reason: "jwks_unavailable", unavailable: true });
  });
});

describe("cloudflareAccess middleware", () => {
  function appWith(fetch: typeof globalThis.fetch) {
    const app = new Hono<AppEnv>();
    app.use("*", cloudflareAccess({ fetch, now: () => NOW }));
    app.get("/api/admin/overview", (c) => c.json({ ok: true, access: c.get("cfAccess") }));
    app.get("/api/orgs", (c) => c.json({ ok: true }));
    app.get("/api/health", (c) => c.json({ ok: true }));
    return app;
  }
  const withJwt = (token: string) => ({ headers: { [CF_ACCESS_JWT_HEADER]: token } });

  it("is a no-op when Access is not configured", async () => {
    const { fetch } = certsEndpoint([k1]);
    const res = await appWith(fetch).request("/api/admin/overview", {}, {});
    expect(res.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires the JWT on /api/admin/* and exposes the Access identity", async () => {
    const { fetch } = certsEndpoint([k1]);
    const app = appWith(fetch);
    const missing = await app.request("/api/admin/overview", {}, env);
    expect(missing.status).toBe(403);
    expect(await missing.json()).toEqual({
      error: { code: "access_required", message: "Cloudflare Access authentication required" },
    });

    const ok = await app.request("/api/admin/overview", withJwt(await sign(k1)), env);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      ok: true,
      access: { subject: "ops@marisstella.app", email: "ops@marisstella.app", serviceToken: false },
    });

    const wrongApp = await app.request(
      "/api/admin/overview",
      withJwt(await sign(k1, { aud: ["other-app"] })),
      env,
    );
    expect(wrongApp.status).toBe(403);
  });

  it("identifies service tokens by common_name", async () => {
    const { fetch } = certsEndpoint([k1]);
    const token = await sign(k1, { email: undefined, common_name: "abc123.access" });
    const res = await appWith(fetch).request("/api/admin/overview", withJwt(token), env);
    expect(((await res.json()) as { access: unknown }).access).toEqual({
      subject: "abc123.access",
      email: null,
      serviceToken: true,
    });
  });

  it("leaves customer routes alone unless CF_ACCESS_PROTECT_ALL=true", async () => {
    const { fetch } = certsEndpoint([k1]);
    const app = appWith(fetch);
    expect((await app.request("/api/orgs", {}, env)).status).toBe(200);

    const all = { ...env, CF_ACCESS_PROTECT_ALL: "true" };
    expect((await app.request("/api/orgs", {}, all)).status).toBe(403);
    expect((await app.request("/api/orgs", withJwt(await sign(k1)), all)).status).toBe(200);
    expect((await app.request("/api/health", {}, all)).status).toBe(200);
  });

  it("fails closed when half configured", async () => {
    const { fetch } = certsEndpoint([k1]);
    const app = appWith(fetch);
    const res = await app.request("/api/admin/overview", withJwt(await sign(k1)), {
      CF_ACCESS_AUD: AUD,
    });
    expect(res.status).toBe(403);
    expect((await app.request("/api/orgs", {}, { CF_ACCESS_AUD: AUD })).status).toBe(200);
  });

  it("answers 503 when the certs endpoint is down", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("network");
    });
    const res = await appWith(fetch).request("/api/admin/overview", withJwt(await sign(k1)), env);
    expect(res.status).toBe(503);
  });
});
