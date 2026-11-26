// Owner sign-in for the console: Cloudflare Access (Zero Trust) in front of the whole Worker, then
// the same rule as every product: the Access-verified email must be in PLATFORM_ADMIN_EMAILS.
// Access is REQUIRED: without CF_ACCESS_TEAM_DOMAIN + CF_ACCESS_AUD every API request is refused,
// so a half-configured deploy never opens the dashboard. Access verifies the email itself (one-time
// PIN or the IdP), which is what "verified email" means here.
//
// JWT checks (same as apps/grants middleware/cloudflare-access.ts, which this adapts): RS256 against
// the team's JWKS matched by kid, iss = team domain, aud contains CF_ACCESS_AUD, exp/nbf with 30 s
// skew. Access service tokens (no email claim) are refused: the console is for a person.
import { isPlatformAdminEmail } from "../../../packages/admin-metrics/src/index.ts";

export const CF_ACCESS_JWT_HEADER = "Cf-Access-Jwt-Assertion";
const TEAM_SUFFIX = ".cloudflareaccess.com";
const JWKS_TTL_MS = 60 * 60 * 1000;
const JWKS_MIN_REFETCH_MS = 30 * 1000;
const CLOCK_SKEW_S = 30;

export interface AccessConfig {
  issuer: string;
  certsUrl: string;
  audiences: string[];
}

export class AccessError extends Error {
  readonly reason: string;
  readonly unavailable: boolean;
  constructor(reason: string, unavailable = false) {
    super(`access_${reason}`);
    this.reason = reason;
    this.unavailable = unavailable;
  }
}

export function normalizeTeamDomain(raw: string | undefined): string | null {
  let v = raw?.trim().toLowerCase().replace(/\/+$/, "");
  if (!v) return null;
  if (!v.includes(".") && !v.includes("/")) v = `${v}${TEAM_SUFFIX}`;
  if (!v.startsWith("https://")) v = `https://${v}`;
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return null;
  }
  const team = url.hostname.slice(0, -TEAM_SUFFIX.length);
  const ok =
    url.protocol === "https:" &&
    url.hostname.endsWith(TEAM_SUFFIX) &&
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(team) &&
    url.pathname === "/" &&
    !url.search &&
    !url.port &&
    !url.username;
  return ok ? `https://${url.hostname}` : null;
}

/** The Access config, or null when it is missing or malformed (= refuse everything). */
export function accessConfig(env: {
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
}): AccessConfig | null {
  const issuer = normalizeTeamDomain(env.CF_ACCESS_TEAM_DOMAIN);
  const audiences = (env.CF_ACCESS_AUD ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  if (!issuer || !audiences.length) return null;
  return { issuer, certsUrl: `${issuer}/cdn-cgi/access/certs`, audiences };
}

interface CachedKeys {
  keys: Map<string, CryptoKey>;
  fetchedAt: number;
}
const cache = new Map<string, CachedKeys>();

export function clearKeyCache(): void {
  cache.clear();
}

async function fetchKeys(
  certsUrl: string,
  fetchFn: typeof fetch,
  now: number,
): Promise<CachedKeys> {
  let body: { keys?: unknown };
  try {
    const res = await fetchFn(certsUrl, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    body = (await res.json()) as { keys?: unknown };
  } catch {
    throw new AccessError("jwks_unavailable", true);
  }
  const keys = new Map<string, CryptoKey>();
  for (const jwk of Array.isArray(body.keys) ? (body.keys as Record<string, unknown>[]) : []) {
    if (typeof jwk?.kid !== "string" || jwk.kty !== "RSA") continue;
    if (typeof jwk.n !== "string" || typeof jwk.e !== "string") continue;
    if (jwk.alg !== undefined && jwk.alg !== "RS256") continue;
    try {
      keys.set(
        jwk.kid,
        await crypto.subtle.importKey(
          "jwk",
          { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
          { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
          false,
          ["verify"],
        ),
      );
    } catch {
      // skip unusable keys
    }
  }
  if (!keys.size) throw new AccessError("jwks_empty", true);
  return { keys, fetchedAt: now };
}

async function keyFor(kid: string, certsUrl: string, fetchFn: typeof fetch, now: number) {
  const cached = cache.get(certsUrl);
  const hit = cached?.keys.get(kid);
  if (hit && cached && now - cached.fetchedAt < JWKS_TTL_MS) return hit;
  if (cached && now - cached.fetchedAt < JWKS_MIN_REFETCH_MS) {
    if (hit) return hit;
    throw new AccessError("unknown_kid");
  }
  let next: CachedKeys;
  try {
    next = await fetchKeys(certsUrl, fetchFn, now);
  } catch (e) {
    if (hit) return hit;
    throw e;
  }
  cache.set(certsUrl, next);
  const key = next.keys.get(kid);
  if (!key) throw new AccessError("unknown_kid");
  return key;
}

function b64urlBytes(s: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new AccessError("malformed");
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    throw new AccessError("malformed");
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
    if (e instanceof AccessError) throw e;
  }
  throw new AccessError("malformed");
}

/** Verifies an Access JWT; returns its claims or throws AccessError. */
export async function verifyAccessJwt(
  token: string,
  config: AccessConfig,
  opts: { fetch?: typeof fetch; now?: number } = {},
): Promise<Record<string, unknown>> {
  const now = opts.now ?? Date.now();
  if (token.length > 16_384) throw new AccessError("malformed");
  const parts = token.split(".");
  if (parts.length !== 3) throw new AccessError("malformed");
  const [h, p, sig] = parts as [string, string, string];
  const header = b64urlJson(h);
  if (header.alg !== "RS256") throw new AccessError("bad_alg");
  if (typeof header.kid !== "string" || !header.kid) throw new AccessError("missing_kid");
  const key = await keyFor(header.kid, config.certsUrl, opts.fetch ?? fetch, now);
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlBytes(sig),
    new TextEncoder().encode(`${h}.${p}`),
  );
  if (!ok) throw new AccessError("bad_signature");
  const claims = b64urlJson(p);
  const nowS = now / 1000;
  if (claims.iss !== config.issuer) throw new AccessError("bad_issuer");
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.some((a) => typeof a === "string" && config.audiences.includes(a))) {
    throw new AccessError("bad_audience");
  }
  if (typeof claims.exp !== "number" || claims.exp <= nowS - CLOCK_SKEW_S) {
    throw new AccessError("expired");
  }
  if (
    claims.nbf !== undefined &&
    (typeof claims.nbf !== "number" || claims.nbf > nowS + CLOCK_SKEW_S)
  ) {
    throw new AccessError("not_yet_valid");
  }
  return claims;
}

export type OwnerCheck =
  | { ok: true; email: string }
  | { ok: false; status: 401 | 403 | 503; reason: string };

/** Access JWT valid + its email on PLATFORM_ADMIN_EMAILS, or why not. */
export async function checkOwner(
  request: Request,
  env: { CF_ACCESS_TEAM_DOMAIN?: string; CF_ACCESS_AUD?: string; PLATFORM_ADMIN_EMAILS?: string },
  opts: { fetch?: typeof fetch; now?: number } = {},
): Promise<OwnerCheck> {
  const config = accessConfig(env);
  if (!config) return { ok: false, status: 503, reason: "access_not_configured" };
  const token = request.headers.get(CF_ACCESS_JWT_HEADER)?.trim();
  if (!token) return { ok: false, status: 401, reason: "missing_jwt" };
  let claims: Record<string, unknown>;
  try {
    claims = await verifyAccessJwt(token, config, opts);
  } catch (e) {
    const err = e instanceof AccessError ? e : new AccessError("error");
    return { ok: false, status: err.unavailable ? 503 : 401, reason: err.reason };
  }
  const email = typeof claims.email === "string" ? claims.email : null;
  // Access only issues an email claim after verifying it (PIN or IdP).
  if (!email || !isPlatformAdminEmail(env.PLATFORM_ADMIN_EMAILS, { email, emailVerified: true })) {
    return { ok: false, status: 403, reason: "not_platform_admin" };
  }
  return { ok: true, email };
}
