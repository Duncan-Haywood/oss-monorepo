// @ts-check
// Which part of the Worker (worker/index.mjs) answers a path. Its own module so Node tests can
// import it without the Worker build. Proprietary (see ../LICENSE).

/** The free JSON API, off on the hosted product; the same set as pro/serve.mjs (a test checks). */
export const FREE_API_PATHS = new Set(["/v1/validate", "/v1/validate/batch", "/v1/repair", "/v1/generate"]);
/** pro/server.mjs MAX_BODY: a larger body is refused before it is read into memory. */
export const MAX_BODY = 30 * 1024 * 1024;

/**
 * @param {string} pathname @param {string} method
 * @returns {"font" | "off" | "pro"} font: the generator's PDF fonts; off: the free JSON API (404,
 *   as on the container without FREE_API=on); pro: everything else, the paid handler
 */
export function workerRoute(pathname, method) {
  if ((method === "GET" || method === "HEAD") && /^\/fonts\/[A-Za-z0-9-]+\.ttf$/.test(pathname)) return "font";
  if (FREE_API_PATHS.has(pathname)) return "off";
  return "pro";
}
