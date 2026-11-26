// Cloudflare Access (Zero Trust) as an extra gate in front of internal surfaces. Customer sign-in
// stays in Better Auth; Access only guards operator surfaces (docs/AUTH.md).
//
// When CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD are set:
//   - /api/admin/* requires a valid `Cf-Access-Jwt-Assertion` JWT, IN ADDITION to requirePlatformAdmin
//     (routes/admin.ts), so a stolen admin session alone is not enough;
//   - with CF_ACCESS_PROTECT_ALL=true, every Worker route requires it (demo/staging host), except the
//     health probe and the signature-verified billing webhook (give those an Access Bypass app).
// Neither set: no-op. One set without the other, or a malformed team domain: fail closed (403) on
// the routes that would be protected, so a half-done setup never silently opens the admin API.
//
// Validation follows https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/:
// RS256 signature against the team's JWKS (https://<team>.cloudflareaccess.com/cdn-cgi/access/certs,
// matched by `kid`), `iss` = team domain, `aud` contains an AUD tag from CF_ACCESS_AUD (comma-separated
// when several Access applications front this Worker), `exp` in the future, `nbf` not
// in the future. Keys are cached per isolate and refetched when an unknown `kid` shows up (Access
// rotates keys every 6 weeks; the old key stays valid for 7 days). WebCrypto only, no dependencies.
//
// The Worker only runs for /api/* (wrangler.jsonc `run_worker_first`): the SPA's static files are
// protected by the Access application at the edge, not by this middleware. They hold no tenant data.
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { Env } from "../env";
import type { AppEnv } from "../types";

export const CF_ACCESS_JWT_HEADER = "Cf-Access-Jwt-Assertion";
const TEAM_DOMAIN_SUFFIX = ".cloudflareaccess.com";
/** Keep fetched keys this long before refreshing them on the next request. */
export const JWKS_TTL_MS = 60 * 60 * 1000;
/** An unknown `kid` triggers a refetch at most this often (forged kids can't hammer the endpoint). */
export const JWKS_MIN_REFETCH_MS = 30 * 1000;
const JWKS_TIMEOUT_MS = 5_000;
/** Allowed clock skew for exp/nbf. */
export const CLOCK_SKEW_S = 30;

/** Paths that stay reachable without Access under CF_ACCESS_PROTECT_ALL (they have their own auth). */
export const PROTECT_ALL_EXEMPT: readonly RegExp[] = [
  /^\/api\/health(\/|$)/,
  /^\/api\/billing\/webhook(\/|$)/,
];

export interface AccessConfig {
  /** Normalized issuer, e.g. "https://acme.cloudflareaccess.com". */
  issuer: string;
  certsUrl: string;
  /** Accepted Access application AUD tags (CF_ACCESS_AUD, comma-separated). */
  audiences: string[];
}

/** Claims of an Access application token (users carry email; service tokens carry common_name). */
export interface AccessJwtPayload {
  aud: string | string[];
  iss: string;
  exp: number;
  nbf?: number;
  iat?: number;
  sub?: string;
  email?: string;
  common_name?: string;
  type?: string;
  [claim: string]: unknown;
}

export interface AccessIdentity {
  /** User email, or the service token's client id (common_name). */
  subject: string;
  email: string | null;
  serviceToken: boolean;
}

declare module "hono" {
  interface ContextVariableMap {
    /** Set when a valid Cloudflare Access JWT came with the request. */
    cfAccess: AccessIdentity | undefined;
  }
}

export class AccessJwtError extends Error {
  constructor(
    readonly reason: string,
    readonly unavailable = false,
  ) {
    super(`access_jwt_${reason}`);
    this.name = "AccessJwtError";
  }
}

type AccessEnv = Pick<Env, "CF_ACCESS_TEAM_DOMAIN" | "CF_ACCESS_AUD" | "CF_ACCESS_PROTECT_ALL">;

/**
 * "acme", "acme.cloudflareaccess.com" or "https://acme.cloudflareaccess.com/" ->
 * "https://acme.cloudflareaccess.com". Anything else (other hosts, paths) -> null.
 */
export function normalizeTeamDomain(raw: string | undefined): string | null {
  let v = raw?.trim().toLowerCase().replace(/\/+$/, "");
  if (!v) return null;
  if (!v.includes(".") && !v.includes("/")) v = `${v}${TEAM_DOMAIN_SUFFIX}`;
  if (!v.startsWith("https://")) v = `https://${v}`;
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return null;
  }
  const team = url.hostname.slice(0, -TEAM_DOMAIN_SUFFIX.length);
  const ok =
    url.protocol === "https:" &&
    url.hostname.endsWith(TEAM_DOMAIN_SUFFIX) &&
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(team) &&
    url.pathname === "/" &&
    !url.search &&
    !url.port &&
    !url.username;
  return ok ? `https://${url.hostname}` : null;
}

export type AccessSetup =
  | { state: "off" }
  | { state: "invalid"; reason: string }
  | { state: "on"; config: AccessConfig };

export function accessSetup(env: AccessEnv): AccessSetup {
  const rawDomain = env.CF_ACCESS_TEAM_DOMAIN?.trim();
  const audiences = (env.CF_ACCESS_AUD ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  if (!rawDomain && !audiences.length) return { state: "off" };
  if (!rawDomain || !audiences.length) {
    return { state: "invalid", reason: "team_domain_and_aud_required" };
  }
  const issuer = normalizeTeamDomain(rawDomain);
  if (!issuer) return { state: "invalid", reason: "bad_team_domain" };
  return {
    state: "on",
    config: { issuer, certsUrl: `${issuer}/cdn-cgi/access/certs`, audiences },
  };
}

export const protectAll = (env: AccessEnv) =>
  env.CF_ACCESS_PROTECT_ALL?.trim().toLowerCase() === "true";

/** Whether this request path needs an Access JWT (given Access is configured). */
export function accessRequiredFor(path: string, env: AccessEnv): boolean {
  if (path === "/api/admin" || path.startsWith("/api/admin/")) return true;
  if (!protectAll(env)) return false;
  return !PROTECT_ALL_EXEMPT.some((re) => re.test(path));
}

// --- JWKS (per-isolate cache) ------------------------------------------------------------------

interface Jwk {
  kid?: unknown;
  kty?: unknown;
  alg?: unknown;
  use?: unknown;
  n?: unknown;
  e?: unknown;
}

interface CachedKeys {
  keys: Map<string, CryptoKey>;
  fetchedAt: number;
}

const jwksCache = new Map<string, CachedKeys>();
const inflight = new Map<string, Promise<CachedKeys>>();

/** Test hook. */
export function clearAccessKeyCache(): void {
  jwksCache.clear();
  inflight.clear();
}

async function importJwk(jwk: Jwk): Promise<CryptoKey | null> {
  if (jwk.kty !== "RSA" || typeof jwk.n !== "string" || typeof jwk.e !== "string") return null;
  if (jwk.alg !== undefined && jwk.alg !== "RS256") return null;
  if (jwk.use !== undefined && jwk.use !== "sig") return null;
  try {
    return await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    return null;
  }
}

async function fetchKeys(certsUrl: string, fetchFn: typeof fetch, now: number) {
  let body: { keys?: unknown };
  try {
    const res = await fetchFn(certsUrl, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(JWKS_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    body = (await res.json()) as { keys?: unknown };
  } catch {
    throw new AccessJwtError("jwks_unavailable", true);
  }
  const keys = new Map<string, CryptoKey>();
  for (const jwk of Array.isArray(body.keys) ? (body.keys as Jwk[]) : []) {
    if (typeof jwk?.kid !== "string") continue;
    const key = await importJwk(jwk);
    if (key) keys.set(jwk.kid, key);
  }
  if (!keys.size) throw new AccessJwtError("jwks_empty", true);
  return { keys, fetchedAt: now };
}

async function keyFor(
  kid: string,
  certsUrl: string,
  fetchFn: typeof fetch,
  now: number,
): Promise<CryptoKey> {
  const cached = jwksCache.get(certsUrl);
  const fresh = cached && now - cached.fetchedAt < JWKS_TTL_MS;
  const hit = cached?.keys.get(kid);
  if (hit && fresh) return hit;
  // Unknown kid (rotation) or stale cache: refetch, but not more than once per JWKS_MIN_REFETCH_MS.
  if (cached && now - cached.fetchedAt < JWKS_MIN_REFETCH_MS) {
    if (hit) return hit;
    throw new AccessJwtError("unknown_kid");
  }
  let pending = inflight.get(certsUrl);
  if (!pending) {
    pending = fetchKeys(certsUrl, fetchFn, now).finally(() => inflight.delete(certsUrl));
    inflight.set(certsUrl, pending);
  }
  let next: CachedKeys;
  try {
    next = await pending;
  } catch (e) {
    // Endpoint down but we still hold the key (stale cache): keep accepting it.
    if (hit) return hit;
    throw e;
  }
  jwksCache.set(certsUrl, next);
  const key = next.keys.get(kid);
  if (!key) throw new AccessJwtError("unknown_kid");
  return key;
}

// --- JWT -------------------------------------------------------------------------------------

function b64urlBytes(s: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new AccessJwtError("malformed");
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    throw new AccessJwtError("malformed");
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlJson(s: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch (e) {
    if (e instanceof AccessJwtError) throw e;
  }
  throw new AccessJwtError("malformed");
}

export interface VerifyAccessJwtOptions {
  fetch?: typeof fetch;
  /** Milliseconds since epoch. */
  now?: number;
}

/** Verifies an Access JWT and returns its claims; throws AccessJwtError otherwise. */
export async function verifyAccessJwt(
  token: string,
  config: AccessConfig,
  opts: VerifyAccessJwtOptions = {},
): Promise<AccessJwtPayload> {
  const now = opts.now ?? Date.now();
  if (token.length > 16_384) throw new AccessJwtError("malformed");
  const parts = token.split(".");
  if (parts.length !== 3) throw new AccessJwtError("malformed");
  const [h, p, sig] = parts as [string, string, string];
  const header = b64urlJson(h);
  if (header.alg !== "RS256") throw new AccessJwtError("bad_alg");
  if (typeof header.kid !== "string" || !header.kid) throw new AccessJwtError("missing_kid");

  const key = await keyFor(header.kid, config.certsUrl, opts.fetch ?? fetch, now);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlBytes(sig),
    new TextEncoder().encode(`${h}.${p}`),
  );
  if (!valid) throw new AccessJwtError("bad_signature");

  const claims = b64urlJson(p);
  const nowS = now / 1000;
  if (claims.iss !== config.issuer) throw new AccessJwtError("bad_issuer");
  const aud = claims.aud;
  const tokenAuds = Array.isArray(aud) ? aud : [aud];
  const audOk = tokenAuds.some((a) => typeof a === "string" && config.audiences.includes(a));
  if (!audOk) throw new AccessJwtError("bad_audience");
  if (typeof claims.exp !== "number" || claims.exp <= nowS - CLOCK_SKEW_S) {
    throw new AccessJwtError("expired");
  }
  if (
    claims.nbf !== undefined &&
    (typeof claims.nbf !== "number" || claims.nbf > nowS + CLOCK_SKEW_S)
  ) {
    throw new AccessJwtError("not_yet_valid");
  }
  return claims as AccessJwtPayload;
}

export function identityOf(claims: AccessJwtPayload): AccessIdentity {
  const email = typeof claims.email === "string" && claims.email ? claims.email : null;
  const serviceToken = !email && typeof claims.common_name === "string";
  return {
    subject: email ?? (serviceToken ? (claims.common_name as string) : (claims.sub ?? "unknown")),
    email,
    serviceToken,
  };
}

// --- middleware --------------------------------------------------------------------------------

const deny = (c: Context<AppEnv>, unavailable = false) =>
  c.json(
    {
      error: unavailable
        ? {
            code: "access_unavailable",
            message: "Cloudflare Access keys are unavailable; retry shortly",
          }
        : { code: "access_required", message: "Cloudflare Access authentication required" },
    },
    unavailable ? 503 : 403,
  );

export interface CloudflareAccessOptions {
  fetch?: typeof fetch;
  now?: () => number;
}

/**
 * Mount once at "*" (before the routers). Requires a valid Access JWT on the paths named by
 * accessRequiredFor; everything else passes through untouched.
 */
export function cloudflareAccess(opts: CloudflareAccessOptions = {}) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const setup = accessSetup(c.env ?? {});
    if (setup.state === "off" || !accessRequiredFor(c.req.path, c.env)) return next();
    const logger = c.var.ctx?.logger;
    if (setup.state === "invalid") {
      logger?.error("access.misconfigured", { reason: setup.reason });
      return deny(c);
    }
    const token = c.req.header(CF_ACCESS_JWT_HEADER)?.trim();
    if (!token) {
      logger?.warn("access.denied", { reason: "missing_jwt", path: c.req.path });
      return deny(c);
    }
    try {
      const claims = await verifyAccessJwt(token, setup.config, {
        fetch: opts.fetch,
        now: opts.now?.(),
      });
      c.set("cfAccess", identityOf(claims));
    } catch (e) {
      const err = e instanceof AccessJwtError ? e : new AccessJwtError("error");
      logger?.warn("access.denied", { reason: err.reason, path: c.req.path });
      return deny(c, err.unavailable);
    }
    return next();
  });
}
