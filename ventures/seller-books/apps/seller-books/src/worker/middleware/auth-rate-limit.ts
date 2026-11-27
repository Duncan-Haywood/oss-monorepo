// Durable rate limits on the Better Auth endpoints (/api/auth/*), in D1.
//
// Better Auth's own limiter (services/auth/auth.ts) keeps its counters in each isolate's memory, so
// an attacker spread across Cloudflare's isolates and colos is barely slowed. This middleware runs in
// front of it and counts in the `verification` table (identifier `throttle:auth:...`), the same
// durable fixed-window counter the account emails use (services/auth/emails.ts, allowSend):
//
//  - per client IP (cf-connecting-ip), every state-changing auth endpoint: sign-in, sign-up,
//    password-reset request and use, verification resend, change-password/email;
//  - per account, FAILED email+password sign-ins only (a hash of the normalised address, never the
//    address itself), so a password guesser rotating IPs is stopped at AUTH_ACCOUNT_FAILURES per
//    window. Successful sign-ins never count, and the lock lasts one window, so an attacker who
//    knows an address can delay its owner's next sign-in by at most that long, never lock it out.
//
// Over the limit: 429 with Retry-After and { error: { code: "rate_limited" } }, before Better Auth
// sees the request. On by default wherever the deploy is hardened (production/HTTPS); worker tests
// opt in per request with TEST_AUTH_RATE_LIMIT_HEADER (APP_ENV=test only), like the email
// verification switch. A D1 error fails open (logged): an outage of the counter must not lock
// every customer out of their books.
import { and, eq, gt, like, lt, sql } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import type { AppContext } from "../context";
import { verification } from "../db/schema";
import { isHardened } from "../services/auth/auth";
import type { AppEnv } from "../types";

export const TEST_AUTH_RATE_LIMIT_HEADER = "x-test-auth-rate-limit";
export const AUTH_THROTTLE_PREFIX = "throttle:auth:";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

interface Rule {
  limit: number;
  windowMs: number;
}

/** Per-IP limits by endpoint (POST paths under /api/auth). Anything else POSTed falls to DEFAULT. */
export const AUTH_IP_RULES: Record<string, Rule> = {
  "/sign-in/email": { limit: 20, windowMs: 15 * MINUTE },
  "/sign-up/email": { limit: 10, windowMs: HOUR },
  "/request-password-reset": { limit: 10, windowMs: HOUR },
  "/reset-password": { limit: 20, windowMs: HOUR },
  "/send-verification-email": { limit: 10, windowMs: HOUR },
  "/change-password": { limit: 10, windowMs: 15 * MINUTE },
  "/change-email": { limit: 10, windowMs: HOUR },
};
export const AUTH_IP_DEFAULT: Rule = { limit: 60, windowMs: 15 * MINUTE };

/** Failed email+password sign-ins per account, from any number of IPs. */
export const AUTH_ACCOUNT_FAILURES: Rule = { limit: 10, windowMs: 15 * MINUTE };

type Deps = Pick<AppContext, "db" | "now">;

interface WindowState {
  count: number;
  expiresAt: Date;
}

async function liveWindow(deps: Deps, identifier: string): Promise<WindowState | null> {
  const row = await deps.db
    .select({ value: verification.value, expiresAt: verification.expiresAt })
    .from(verification)
    .where(and(eq(verification.identifier, identifier), gt(verification.expiresAt, deps.now())))
    .get();
  return row ? { count: Number.parseInt(row.value, 10) || 0, expiresAt: row.expiresAt } : null;
}

/**
 * Count one hit against `identifier`. Returns null when allowed, else the seconds until the window
 * ends. The conditional UPDATE keeps concurrent requests from overshooting the limit.
 */
export async function hit(deps: Deps, identifier: string, rule: Rule): Promise<number | null> {
  const now = deps.now();
  const bumped = await deps.db
    .update(verification)
    .set({ value: sql`cast(${verification.value} as integer) + 1`, updatedAt: now })
    .where(
      and(
        eq(verification.identifier, identifier),
        gt(verification.expiresAt, now),
        sql`cast(${verification.value} as integer) < ${rule.limit}`,
      ),
    )
    .returning({ id: verification.id });
  if (bumped.length > 0) return null;
  const live = await liveWindow(deps, identifier);
  if (live) return retryAfter(deps, live);
  // No live window: start one, and sweep expired auth counters so per-IP rows do not pile up.
  await deps.db
    .delete(verification)
    .where(
      and(
        like(verification.identifier, `${AUTH_THROTTLE_PREFIX}%`),
        lt(verification.expiresAt, now),
      ),
    );
  await deps.db.delete(verification).where(eq(verification.identifier, identifier));
  await deps.db.insert(verification).values({
    id: `thr_${crypto.randomUUID().replace(/-/g, "")}`,
    identifier,
    value: "1",
    expiresAt: new Date(now.getTime() + rule.windowMs),
  });
  return null;
}

/** Seconds until the window ends if `identifier` is at or over its limit, else null. No count. */
export async function blocked(deps: Deps, identifier: string, rule: Rule): Promise<number | null> {
  const live = await liveWindow(deps, identifier);
  return live && live.count >= rule.limit ? retryAfter(deps, live) : null;
}

function retryAfter(deps: Deps, w: WindowState): number {
  return Math.max(1, Math.ceil((w.expiresAt.getTime() - deps.now().getTime()) / 1000));
}

/** SHA-256 of the trimmed, lower-cased address: the counter never stores the address itself. */
export async function accountKey(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function authRateLimitEnabled(env: AppEnv["Bindings"], req: Request): boolean {
  if (env.APP_ENV === "test") return req.headers.get(TEST_AUTH_RATE_LIMIT_HEADER) === "1";
  return isHardened(env);
}

/** The auth path below /api/auth, e.g. "/sign-in/email". */
function authPath(url: string): string {
  const path = new URL(url).pathname;
  const i = path.indexOf("/api/auth");
  return i < 0 ? path : path.slice(i + "/api/auth".length) || "/";
}

function tooMany(seconds: number) {
  return new Response(
    JSON.stringify({
      error: {
        code: "rate_limited",
        message: `Too many attempts. Try again in ${seconds < 120 ? `${seconds} seconds` : `${Math.ceil(seconds / 60)} minutes`}.`,
      },
    }),
    {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(seconds) },
    },
  );
}

async function emailFromBody(req: Request): Promise<string | null> {
  try {
    const body = (await req.clone().json()) as { email?: unknown };
    return typeof body?.email === "string" && body.email.trim() ? body.email : null;
  } catch {
    return null;
  }
}

export const authRateLimit = createMiddleware<AppEnv>(async (c, next) => {
  if (c.req.method !== "POST" || !authRateLimitEnabled(c.env, c.req.raw)) return next();
  const ctx = c.var.ctx;
  const path = authPath(c.req.url);
  const ip = c.req.header("cf-connecting-ip")?.trim() || "unknown";
  const rule = AUTH_IP_RULES[path] ?? AUTH_IP_DEFAULT;
  const ruleKey = AUTH_IP_RULES[path] ? path : "*";

  let account: string | null = null;
  try {
    const wait = await hit(ctx, `${AUTH_THROTTLE_PREFIX}ip:${ruleKey}:${ip}`, rule);
    if (wait !== null) {
      ctx.logger.warn("auth.rate_limited", { scope: "ip", path });
      return tooMany(wait);
    }
    if (path === "/sign-in/email") {
      const email = await emailFromBody(c.req.raw);
      if (email) {
        account = `${AUTH_THROTTLE_PREFIX}account:${await accountKey(email)}`;
        const lock = await blocked(ctx, account, AUTH_ACCOUNT_FAILURES);
        if (lock !== null) {
          ctx.logger.warn("auth.rate_limited", { scope: "account", path });
          return tooMany(lock);
        }
      }
    }
  } catch (err) {
    ctx.logger.error("auth.rate_limit_failed", { error: String(err) });
    return next();
  }

  await next();

  // Only a wrong password counts against the account; 403 (email not verified) and 2xx do not.
  if (account && c.res.status === 401) {
    try {
      await hit(ctx, account, AUTH_ACCOUNT_FAILURES);
    } catch (err) {
      ctx.logger.error("auth.rate_limit_failed", { error: String(err) });
    }
  }
});
