// API Gateway HTTP API (payload v2) <-> web-standard Request/Response, and a Workers-style
// `fetch(request, env, ctx)` app wrapped as a Lambda handler. A product is just:
//
//   export default { async fetch(request, env, ctx) { ... } }
//
// and its Lambda entry is `export const handler = lambdaHandler(app)` (see src/app-entry.mjs).

const TEXT = /^(text\/|application\/(json|javascript|xml|x-www-form-urlencoded|ld\+json)|image\/svg\+xml)/;

export function toRequest(event) {
  const http = event.requestContext?.http || {};
  const method = http.method || "GET";
  const host = event.headers?.host || event.requestContext?.domainName || "localhost";
  const url = `https://${host}${event.rawPath || "/"}${event.rawQueryString ? `?${event.rawQueryString}` : ""}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(event.headers || {})) if (v != null) headers.set(k, v);
  if (event.cookies?.length) headers.set("cookie", event.cookies.join("; "));
  let body;
  if (event.body != null && method !== "GET" && method !== "HEAD") {
    body = event.isBase64Encoded ? Buffer.from(event.body, "base64") : event.body;
  }
  return new Request(url, { method, headers, body });
}

export async function fromResponse(res) {
  const headers = {};
  res.headers.forEach((v, k) => { if (k !== "set-cookie") headers[k] = v; });
  const cookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get("content-type") || "";
  const isText = buf.length === 0 || TEXT.test(ct);
  return {
    statusCode: res.status,
    headers,
    ...(cookies.length ? { cookies } : {}),
    body: isText ? buf.toString("utf8") : buf.toString("base64"),
    isBase64Encoded: !isText,
  };
}

/** Verified JWT claims from the HTTP API's Cognito authorizer, or null on a public route. */
export function claimsOf(event) {
  return event.requestContext?.authorizer?.jwt?.claims || null;
}

/**
 * Wraps a Workers-style app. `makeEnv(event)` returns the bindings (DB, BUCKET, user, ...).
 * ctx.waitUntil promises are awaited before returning, because Lambda freezes afterwards.
 */
export function lambdaHandler(app, makeEnv) {
  return async (event) => {
    const pending = [];
    const ctx = { waitUntil: (p) => pending.push(Promise.resolve(p).catch((e) => console.error("waitUntil", e))), passThroughOnException() {} };
    let res;
    try {
      res = await app.fetch(toRequest(event), await makeEnv(event), ctx);
    } catch (e) {
      console.error("unhandled", e);
      res = new Response(JSON.stringify({ error: "internal error" }), { status: 500, headers: { "content-type": "application/json" } });
    }
    const out = await fromResponse(res);
    await Promise.all(pending);
    return out;
  };
}
