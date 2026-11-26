// Request URL rewriting for the base path (src/shared/base-path.ts).
import { normalizeBasePath, withBase } from "@shared/base-path";

/** The same request (method, headers, body) at another pathname; the request itself if unchanged. */
export function withPathname(request: Request, pathname: string): Request {
  const url = new URL(request.url);
  if (url.pathname === pathname) return request;
  url.pathname = pathname;
  return new Request(url.toString(), request);
}

/**
 * The public form of a request the Worker routed without its base path: Better Auth matches the
 * public path (`${BASE_PATH}/api/auth/*`), so routes/auth.ts hands it this.
 */
export function withBasePath(request: Request, basePath: string | undefined): Request {
  const base = normalizeBasePath(basePath);
  return withPathname(request, withBase(base, new URL(request.url).pathname));
}
