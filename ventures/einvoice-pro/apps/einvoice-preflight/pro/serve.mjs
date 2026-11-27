// @ts-check
// One process for the hosted product: the paid API and workspace (pro/server.mjs) and the free
// pages (../server.mjs: the browser checker, the generator and the ES modules they import).
// Proprietary (see ../LICENSE, part 2). This is the container's start command (../Dockerfile.pro).
//
//   node pro/serve.mjs     PORT (8080) and every variable pro/server.mjs reads (PRO_DB_FILE, ADMIN_TOKEN,
//                          billing, LLM, sign-up caps, TRUST_PROXY).
//                          FREE_API=on also serves the free JSON API (/v1/validate, /v1/validate/batch,
//                          /v1/repair, /v1/generate). It is off by default: the free pages check
//                          invoices in the browser and never call it, and it has no metering, so a
//                          hosted copy would only spend CPU for anonymous callers. The free server's
//                          own variables (EINVOICE_API_KEY, EINVOICE_RATE_LIMIT_PER_MIN, ...) apply
//                          to it when on.
//
// Routing, first match wins:
//   /healthz, /app, /app/*            -> paid
//   /fonts/<name>.ttf                 -> the generator page's PDF fonts (../fonts/; the free server has no route)
//   the free API paths                -> free with FREE_API=on, else a JSON 404 naming /v1/check
//   any other /v1/*                   -> paid (unknown ones answer the paid API's JSON 404)
//   /api/admin/*                      -> paid (the owner console's admin API, admin.mjs)
//   everything else                   -> free (/, /index.html, /create.html, /*.mjs, else 404)
import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createApp, loadConfig } from "../server.mjs";
import { createBilling } from "./billing.mjs";
import { loadLlmFromEnv } from "./llm.mjs";
import { createProHandler } from "./server.mjs";
import { openSqliteStore } from "./sql-store.mjs";
import { FileStore, MemoryStore } from "./store.mjs";

/** The free server's JSON API: the only /v1 paths that go to it. */
export const FREE_API_PATHS = new Set(["/v1/validate", "/v1/validate/batch", "/v1/repair", "/v1/generate"]);

/** The fonts create.html fetches for its Factur-X PDF, read once at start-up by exact file name. */
const FONTS_DIR = new URL("../fonts/", import.meta.url); // docker-copy: ok (a directory; Dockerfile.pro copies it as ./fonts)
const FONTS = new Map(
  readdirSync(FONTS_DIR)
    .filter((f) => /^[A-Za-z0-9-]+\.ttf$/.test(f))
    .map((f) => [`/fonts/${f}`, readFileSync(new URL(f, FONTS_DIR))]),
);

/**
 * Which half answers a path.
 * @param {string} pathname @param {{ freeApi: boolean }} opts @returns {"pro" | "free" | "off"}
 */
export function routeFor(pathname, opts) {
  if (pathname === "/healthz" || pathname === "/app" || pathname.startsWith("/app/")) return "pro";
  if (FREE_API_PATHS.has(pathname)) return opts.freeApi ? "free" : "off";
  if (pathname === "/v1" || pathname.startsWith("/v1/")) return "pro";
  if (pathname.startsWith("/api/admin/")) return "pro";
  return "free";
}

/**
 * The combined request handler. The free half is the MIT server's own handler, reached through
 * the `request` event of the server it builds (never listened on), so its code stays unchanged.
 * @param {{ pro: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => unknown,
 *   env?: Record<string, string | undefined> }} deps
 */
export function createCombinedHandler(deps) {
  const env = deps.env ?? {};
  const freeApi = env.FREE_API === "on";
  const free = createApp(loadConfig({ ...env, EINVOICE_SERVE_UI: "1" }));
  /** @param {import("node:http").IncomingMessage} req @param {import("node:http").ServerResponse} res */
  return function handle(req, res) {
    let pathname = "/";
    try {
      pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    } catch {
      // A malformed target falls through to the free server, which answers 404.
    }
    const font = req.method === "GET" || req.method === "HEAD" ? FONTS.get(pathname) : undefined;
    if (font) {
      res.writeHead(200, { "content-type": "font/ttf", "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" });
      res.end(req.method === "HEAD" ? undefined : font);
      return;
    }
    const to = routeFor(pathname, { freeApi });
    if (to === "pro") return deps.pro(req, res);
    if (to === "off") {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
      res.end(JSON.stringify({ error: { code: "not_found", message: "The free JSON API is not served here. Use POST /v1/check with an API key." } }));
      return;
    }
    free.emit("request", req, res);
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const env = process.env;
  const kind = env.PRO_DB_FILE ? "sqlite" : env.PRO_DATA_FILE ? "file" : "memory";
  const store = env.PRO_DB_FILE
    ? await openSqliteStore(env.PRO_DB_FILE)
    : env.PRO_DATA_FILE
      ? new FileStore(env.PRO_DATA_FILE)
      : new MemoryStore();
  const llm = await loadLlmFromEnv(env);
  const port = Number(env.PORT) || 8080;
  const now = () => new Date();
  const billing = createBilling({ env, store, now });
  const pro = createProHandler({ store, llm, env, now, billing });
  createServer(createCombinedHandler({ pro, env })).listen(port, () => {
    const paid = billing.available ? `on (${billing.providerName})` : "dark";
    console.log(
      `einvoice-preflight on :${port}: free pages + pro API (store: ${kind}, explanations: ${llm ? "templates + model" : "templates only"}, paid plans: ${paid}, free API: ${env.FREE_API === "on" ? "on" : "off"})`,
    );
  });
}
