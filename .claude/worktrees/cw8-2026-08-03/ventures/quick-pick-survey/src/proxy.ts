import { NextResponse, type NextRequest } from "next/server";
import { checkOrigin } from "@/lib/originCheck";
import { requestBodyTooLarge } from "@/lib/http";

/**
 * Runs before every `/api` request.
 *
 * One file rather than a line in each of the eighteen mutating handlers: a
 * check that has to be remembered at every call site is a check that will be
 * missing from the nineteenth. The rule and its reasoning live in
 * `src/lib/originCheck.ts`, which is where the tests point too; this is the
 * wiring.
 *
 * Next.js 16 renamed Middleware to Proxy — same convention, same execution
 * point, different filename. See
 * `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`.
 */
export function proxy(req: NextRequest) {
  if (requestBodyTooLarge(req.headers)) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  }

  const verdict = checkOrigin(req.method, req.headers);
  if (!verdict.allowed) {
    console.warn("blocked cross-origin request", {
      path: req.nextUrl.pathname,
      method: req.method,
      reason: verdict.reason,
    });
    return NextResponse.json({ error: "Request blocked." }, { status: 403 });
  }
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export const config = {
  // Only the API. The pages are GETs with nothing to forge, and keeping the
  // matcher narrow keeps this off the path of every static asset.
  matcher: "/api/:path*",
};
