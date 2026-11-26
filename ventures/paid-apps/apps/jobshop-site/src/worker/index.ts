// The Worker in front of the prerendered site. Static pages are served by Workers static assets;
// only /api/* reaches this code (wrangler.jsonc run_worker_first).

import { handleEarlyAccess } from "./early-access";
import { basePath, type Env } from "./env";

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

export function withSecurityHeaders(res: Response): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  return out;
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const base = basePath(env);
    if (url.pathname === `${base}/api/early-access`) {
      return withSecurityHeaders(await handleEarlyAccess(request, env, ctx));
    }
    if (url.pathname.startsWith(`${base}/api/`)) {
      return withSecurityHeaders(
        new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } }),
      );
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
