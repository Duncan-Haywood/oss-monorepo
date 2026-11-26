// HTTP entry: canonical-host redirect, then the base path is stripped so the Hono app (and every
// middleware that matches on /api/...) sees the same paths in production (/grants/api/*) as in local
// dev and tests (/api/*). Static assets under the base path never reach this code: the build sets
// assets.base_path and run_worker_first: ["<base>/api/*"] (vite.config.ts).
import { normalizeBasePath, stripBase } from "@shared/base-path";
import type { Hono } from "hono";
import type { Env } from "./env";
import { answersOnEveryHost, canonicalRedirect, redirectStatusFor } from "./lib/canonical-host";
import { withPathname } from "./lib/request-path";
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

function redirect(location: string, status: 301 | 302 | 308): Response {
  return new Response(null, {
    status,
    headers: {
      Location: location,
      // A day: long enough to spare the Worker, short enough to change course.
      "Cache-Control": status === 302 ? "no-store" : "public, max-age=86400",
      ...SHARED_SECURITY_HEADERS,
    },
  });
}

export function createFetchHandler(app: Hono<AppEnv>) {
  return (request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> => {
    const url = new URL(request.url);
    const base = normalizeBasePath(env.BASE_PATH);
    const stripped = stripBase(base, url.pathname);
    // The path as the Hono app sees it. Unprefixed paths only get here on the old host.
    const appPathname = stripped ?? url.pathname;
    const location = canonicalRedirect(url, env.APP_URL, base);
    if (location) {
      if (!answersOnEveryHost(appPathname)) {
        return redirect(location, redirectStatusFor(request.method));
      }
    } else if (stripped === null) {
      // Outside the base path on a host we serve (workers.dev, localhost): point "/" at the app.
      return url.pathname === "/" ? redirect(`${base}/${url.search}`, 302) : notFound();
    }
    return app.fetch(withPathname(request, appPathname), env, ctx);
  };
}
