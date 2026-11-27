// HTTP entry: strips the base path (src/shared/base-path.ts) so the Hono app, and every middleware that
// matches on /api/..., sees the same paths in a prefixed build (/seller-books/app/api/*) as in local
// dev and tests (/api/*). Static assets under the base path never reach this code: the build sets
// assets.base_path and run_worker_first: ["<base>/api/*"] (vite.config.ts). Pattern from apps/grants.
import { normalizeBasePath, stripBase, withBase } from "@shared/base-path";
import type { Hono } from "hono";
import type { Env } from "./env";
import { SHARED_SECURITY_HEADERS } from "./middleware/security";
import type { AppEnv } from "./types";

const notFound = () =>
  new Response(JSON.stringify({ error: { code: "not_found", message: "Not found" } }), {
    status: 404,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...SHARED_SECURITY_HEADERS,
    },
  });

/** The same request (method, headers, body) at another pathname; the request itself if unchanged. */
export function withPathname(request: Request, pathname: string): Request {
  const url = new URL(request.url);
  if (url.pathname === pathname) return request;
  url.pathname = pathname;
  return new Request(url.toString(), request);
}

/**
 * The public form of a request the Worker routed without its base path. Better Auth matches the public
 * path (`${BASE_PATH}/api/auth/*`, services/auth/auth.ts), so routes/auth.ts hands it this.
 */
export function withBasePath(request: Request, basePath: string | undefined): Request {
  const base = normalizeBasePath(basePath);
  return withPathname(request, withBase(base, new URL(request.url).pathname));
}

export function createFetchHandler(app: Hono<AppEnv>) {
  return (request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> => {
    const base = normalizeBasePath(env.BASE_PATH);
    if (!base) return app.fetch(request, env, ctx);
    const url = new URL(request.url);
    const stripped = stripBase(base, url.pathname);
    if (stripped === null) {
      // Outside the prefix (a workers.dev host, localhost): point "/" at the app, nothing else is ours.
      if (url.pathname === "/" && (request.method === "GET" || request.method === "HEAD")) {
        return new Response(null, {
          status: 302,
          headers: {
            Location: `${base}/${url.search}`,
            "Cache-Control": "no-store",
            ...SHARED_SECURITY_HEADERS,
          },
        });
      }
      return notFound();
    }
    return app.fetch(withPathname(request, stripped), env, ctx);
  };
}
