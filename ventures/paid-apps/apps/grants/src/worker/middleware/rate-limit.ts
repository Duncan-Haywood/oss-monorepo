// Abuse / cost protection: per-key request rate limits.
//
// In production the counters live in Cloudflare's Workers Rate Limiting bindings (`ratelimits` in
// wrangler.jsonc; the binding's own `simple.limit/period` is authoritative there). When the binding is
// absent (unit tests, plain `vite dev`) a fixed-window counter in isolate memory is used instead, with
// `limit` / `periodSeconds` from the options. Keep the two in sync (docs/OPERATIONS.md).
//
// Rate-limit keys may contain client IPs: never log them.
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { AppEnv, Tenant } from "../types";

type Ctx = Context<AppEnv>;

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the caller may retry (for Retry-After). */
  retryAfterSeconds: number;
}

/** Fixed-window counter (per isolate). Good enough for dev/tests; production uses the CF binding. */
export class FixedWindowStore {
  private windows = new Map<string, { windowStart: number; count: number }>();

  constructor(private readonly maxKeys = 10_000) {}

  hit(key: string, limit: number, periodMs: number, nowMs: number): RateLimitDecision {
    const windowStart = Math.floor(nowMs / periodMs) * periodMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + periodMs - nowMs) / 1000));
    let w = this.windows.get(key);
    if (!w || w.windowStart !== windowStart) {
      if (!w && this.windows.size >= this.maxKeys) this.prune(windowStart);
      w = { windowStart, count: 0 };
      this.windows.set(key, w);
    }
    if (w.count >= limit) return { allowed: false, retryAfterSeconds };
    w.count += 1;
    return { allowed: true, retryAfterSeconds };
  }

  private prune(currentWindowStart: number) {
    for (const [k, w] of this.windows) {
      if (w.windowStart < currentWindowStart) this.windows.delete(k);
    }
    // Still full (a flood of distinct keys in one window): drop the oldest half rather than grow.
    if (this.windows.size >= this.maxKeys) {
      let n = Math.floor(this.maxKeys / 2);
      for (const k of this.windows.keys()) {
        if (n-- <= 0) break;
        this.windows.delete(k);
      }
    }
  }

  clear() {
    this.windows.clear();
  }
}

/** Shared by every limiter in the isolate; namespaced per limiter. */
export const defaultRateLimitStore = new FixedWindowStore();

export interface RateLimitOptions {
  /** Bucket key for this request. Return null/undefined/"" to skip limiting this request. */
  key: (c: Ctx) => string | null | undefined;
  /** Requests allowed per window (fallback counter; the CF binding uses its own config). */
  limit: number;
  periodSeconds: number;
  /** Name of a Workers Rate Limiting binding on `c.env`, e.g. "LLM_LIMITER". */
  binding?: string;
  /** Label for logs and the fallback counter's namespace. Defaults to the binding name. */
  name?: string;
  /** Only limit matching requests (e.g. method + path). Defaults to all. */
  when?: (c: Ctx) => boolean;
  message?: string;
  store?: FixedWindowStore;
  now?: () => number;
}

interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

function bindingOf(env: unknown, name: string | undefined): RateLimitBinding | null {
  if (!name || !env || typeof env !== "object") return null;
  const b = (env as Record<string, unknown>)[name];
  return b && typeof (b as RateLimitBinding).limit === "function" ? (b as RateLimitBinding) : null;
}

let seq = 0;

export function rateLimit(opts: RateLimitOptions) {
  const name = opts.name ?? opts.binding ?? `limiter${++seq}`;
  const store = opts.store ?? defaultRateLimitStore;
  const now = opts.now ?? Date.now;
  const periodMs = opts.periodSeconds * 1000;
  const message = opts.message ?? "Too many requests. Please slow down and try again shortly.";

  return createMiddleware<AppEnv>(async (c, next) => {
    if (opts.when && !opts.when(c)) return next();
    const key = opts.key(c);
    if (!key) return next();

    let decision: RateLimitDecision;
    const binding = bindingOf(c.env, opts.binding);
    if (binding) {
      try {
        const { success } = await binding.limit({ key: `${name}:${key}` });
        decision = { allowed: success, retryAfterSeconds: opts.periodSeconds };
      } catch (e) {
        // Fail open: the limiter is a guard, not a dependency.
        c.var.ctx?.logger.warn("rate_limit.binding_error", { limiter: name, error: String(e) });
        decision = { allowed: true, retryAfterSeconds: 0 };
      }
    } else {
      decision = store.hit(`${name}:${key}`, opts.limit, periodMs, now());
    }

    if (decision.allowed) return next();
    c.var.ctx?.logger.warn("rate_limit.blocked", {
      limiter: name,
      method: c.req.method,
      orgId: tenantOf(c)?.orgId,
      userId: c.var.user?.id,
    });
    c.header("Retry-After", String(decision.retryAfterSeconds));
    return c.json({ error: { code: "rate_limited", message } }, 429);
  });
}

// ---------------------------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------------------------

/** Limits as configured on the CF bindings (keep wrangler.jsonc `ratelimits` identical). */
export const RATE_LIMITS = {
  auth: { binding: "AUTH_LIMITER", limit: 20, periodSeconds: 60 },
  llm: { binding: "LLM_LIMITER", limit: 30, periodSeconds: 60 },
  upload: { binding: "UPLOAD_LIMITER", limit: 20, periodSeconds: 60 },
} as const;

/** Worker tests share one isolate and one fake IP; they opt in to limiting with this header. */
export const TEST_RATE_LIMIT_HEADER = "x-test-rate-limit";

const skippedInTests = (c: Ctx) =>
  c.env?.APP_ENV === "test" && c.req.header(TEST_RATE_LIMIT_HEADER) !== "enforce";

const tenantOf = (c: Ctx): Tenant | undefined => c.get("tenant") as Tenant | undefined;

export const clientIp = (c: Ctx) =>
  c.req.header("cf-connecting-ip") ?? c.req.header("x-real-ip") ?? "unknown";

const ORG = "^/api/orgs/[^/]+";

/**
 * Endpoints that trigger Claude calls (drafting, re-verification, interviews, imports, rescoring,
 * fact extraction) or Whisper. Method + full path, matched after requireOrg().
 */
export const LLM_ROUTES: ReadonlyArray<readonly [method: string, path: RegExp]> = [
  ["POST", new RegExp(`${ORG}/applications$`)], // create = draft
  ["POST", new RegExp(`${ORG}/applications/[^/]+/regenerate$`)],
  ["PATCH", new RegExp(`${ORG}/applications/[^/]+/sections/[^/]+$`)], // re-verifies
  ["POST", new RegExp(`${ORG}/interviews$`)], // AI asks the first question
  ["POST", new RegExp(`${ORG}/interviews/[^/]+/(answer|complete)$`)],
  ["POST", new RegExp(`${ORG}/interviews/transcript$`)],
  ["POST", new RegExp(`${ORG}/imports/[^/]+$`)],
  ["POST", new RegExp(`${ORG}/matches/rescore$`)],
  ["POST", new RegExp(`${ORG}/transcribe$`)],
  ["POST", new RegExp(`${ORG}/documents/[^/]+/reprocess$`)],
];

/** File-carrying endpoints (R2 writes + conversion). */
export const UPLOAD_ROUTES: ReadonlyArray<readonly [method: string, path: RegExp]> = [
  ["POST", new RegExp(`${ORG}/documents$`)],
  ["POST", new RegExp(`${ORG}/documents/text$`)],
  ["POST", new RegExp(`${ORG}/imports/rfp$`)],
  ["POST", new RegExp(`${ORG}/interviews/transcript$`)],
  ["POST", new RegExp(`${ORG}/transcribe$`)],
];

export const matchesRoute = (
  routes: ReadonlyArray<readonly [string, RegExp]>,
  method: string,
  path: string,
) => routes.some(([m, re]) => m === method && re.test(path));

/** Per client IP on state-changing Better Auth endpoints (sign-in, sign-up, password reset, ...). */
export const authLimiter = rateLimit({
  ...RATE_LIMITS.auth,
  name: "auth",
  when: (c) => c.req.method === "POST" && !skippedInTests(c),
  key: (c) => `ip:${clientIp(c)}`,
  message: "Too many sign-in attempts. Please wait a minute and try again.",
});

/** Per org + user on LLM-backed endpoints. Mount on the org router after requireOrg(). */
export const llmLimiter = rateLimit({
  ...RATE_LIMITS.llm,
  name: "llm",
  when: (c) => !skippedInTests(c) && matchesRoute(LLM_ROUTES, c.req.method, c.req.path),
  key: (c) => {
    const orgId = tenantOf(c)?.orgId ?? c.req.param("orgId");
    const userId = tenantOf(c)?.userId ?? c.var.user?.id;
    return orgId && userId ? `org:${orgId}:user:${userId}` : null;
  },
  message: "Too many AI requests. Please wait a minute and try again.",
});

/** Per org on upload endpoints. Mount on the org router after requireOrg(). */
export const uploadLimiter = rateLimit({
  ...RATE_LIMITS.upload,
  name: "upload",
  when: (c) => !skippedInTests(c) && matchesRoute(UPLOAD_ROUTES, c.req.method, c.req.path),
  key: (c) => {
    const orgId = tenantOf(c)?.orgId ?? c.req.param("orgId");
    return orgId ? `org:${orgId}` : null;
  },
  message: "Too many uploads. Please wait a minute and try again.",
});
