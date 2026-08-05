/**
 * The site, served over HTTP, so the journeys drive it the way a visitor does.
 *
 * This exists because the site has no build step: the "application" is three
 * files nginx serves from a directory. Opening them over `file://` would not
 * do — the page would run under an opaque origin, where the CSP the container
 * sets is absent and relative asset resolution differs from production.
 *
 * It deliberately does **not** reproduce nginx.conf's response headers. What
 * the served origin sets is asserted by `tests/markup-contract.test.mjs`
 * against nginx.conf itself, and a second implementation of those headers here
 * would be a copy that can agree with the test while disagreeing with
 * production. What this serves is file bytes; what it proves is behaviour.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".json", "application/json; charset=utf-8"],
]);

const port = Number.parseInt(process.env.PORT ?? "4173", 10);

const server = http.createServer((request, response) => {
  const requested = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relative = requested === "/" ? "index.html" : requested.replace(/^\/+/, "");

  // Resolve first, then confirm the result is still inside the site. A request
  // for `/../../secrets` must not escape the directory just because this is a
  // test fixture — a traversal here would read the developer's own machine.
  const resolved = path.resolve(SITE_ROOT, relative);
  if (resolved !== SITE_ROOT && !resolved.startsWith(SITE_ROOT + path.sep)) {
    response.writeHead(403).end("forbidden");
    return;
  }

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("not found");
    return;
  }

  response.writeHead(200, {
    "content-type": CONTENT_TYPES.get(path.extname(resolved)) ?? "application/octet-stream",
    // The journeys assert against the working tree, and a cached style.css
    // would let a passing run describe the previous edit.
    "cache-control": "no-store",
  });
  fs.createReadStream(resolved).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`homepage fixture listening on http://127.0.0.1:${port}\n`);
});
