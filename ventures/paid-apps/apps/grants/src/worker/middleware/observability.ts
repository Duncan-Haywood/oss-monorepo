// Structured access log (one JSON line per API request) + `x-request-id` response header.
//
// Logged: method, matched route PATTERN (e.g. /api/orgs/:orgId/applications/:id — never the raw path
// or query string), status, duration, orgId/userId when known, colo. Never bodies, headers, IPs or
// query strings. Requests slower than SLOW_REQUEST_MS log at warn, 5xx at error.
//
// Mount FIRST (before contextMiddleware) so the duration covers the whole request; it reads
// c.var.ctx / requestId / user / tenant after the downstream middleware set them.
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";
import { createLogger, type Logger } from "../lib/logger";
import type { AppEnv, Tenant } from "../types";

export const SLOW_REQUEST_MS = 2000;
export const REQUEST_ID_HEADER = "x-request-id";

export interface AccessLogEntry {
  method: string;
  route: string;
  status: number;
  durationMs: number;
  orgId?: string;
  userId?: string;
  colo?: string;
  slow?: true;
}

/** The registered pattern of the handler that produced the response; "unmatched" for 404s. */
export function routePatternOf(c: Context<AppEnv>, status: number): string {
  let pattern = "";
  try {
    pattern = routePath(c);
  } catch {
    pattern = "";
  }
  if (!pattern || (status === 404 && pattern.includes("*"))) return "unmatched";
  return pattern;
}

export interface ObservabilityOptions {
  slowMs?: number;
  now?: () => number;
  /** Logger used when the request context never got created (e.g. contextMiddleware threw). */
  fallbackLogger?: Logger;
}

export function observability(opts: ObservabilityOptions = {}) {
  const slowMs = opts.slowMs ?? SLOW_REQUEST_MS;
  const now = opts.now ?? Date.now;
  return createMiddleware<AppEnv>(async (c, next) => {
    const started = now();
    let threw = false;
    try {
      await next();
    } catch (e) {
      threw = true;
      throw e;
    } finally {
      // `finally` so the line is written even if something below rethrows past onError.
      const status = threw ? 500 : c.res.status;
      const durationMs = now() - started;
      const requestId =
        (c.get("requestId") as string | undefined) ?? c.req.header("cf-ray") ?? crypto.randomUUID();
      if (!threw) c.header(REQUEST_ID_HEADER, requestId);

      const tenant = c.get("tenant") as Tenant | undefined;
      const user = c.get("user") as { id: string } | null | undefined;
      const cf = (c.req.raw as unknown as { cf?: { colo?: unknown } }).cf;
      const entry: AccessLogEntry = {
        method: c.req.method,
        route: routePatternOf(c, status),
        status,
        durationMs,
        ...(tenant?.orgId ? { orgId: tenant.orgId } : {}),
        ...((tenant?.userId ?? user?.id) ? { userId: tenant?.userId ?? user?.id } : {}),
        ...(typeof cf?.colo === "string" ? { colo: cf.colo } : {}),
        ...(durationMs > slowMs ? { slow: true as const } : {}),
      };
      const logger =
        c.var.ctx?.logger ??
        (opts.fallbackLogger ?? createLogger({ app: "grant-autopilot" })).child({ requestId });
      const data = entry as unknown as Record<string, unknown>;
      if (status >= 500) logger.error("http.request", data);
      else if (entry.slow) logger.warn("http.request", data);
      else logger.info("http.request", data);
    }
  });
}
