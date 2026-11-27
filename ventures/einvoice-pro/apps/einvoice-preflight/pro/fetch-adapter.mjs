// @ts-check
// Runs a Node-style (req, res) handler, the paid API's createProHandler, from a WHATWG fetch
// Request, so the same handler answers on a Node host and in a Cloudflare Worker (worker/index.mjs).
// It covers what pro/server.mjs uses of node:http: method, url, headers, socket.remoteAddress,
// the body as an async iterable of Buffers, writeHead and end. Proprietary (see ../LICENSE, part 2).

/** Statuses whose Response must have no body. */
const NO_BODY = new Set([101, 204, 205, 304]);

/**
 * @param {Request} request
 * @param {{ remoteAddress?: string, maxBody?: number }} [opts] maxBody: refuse a larger
 *   Content-Length with 413 before reading it (the handler's own cap still applies)
 */
export async function toNodeRequest(request, opts = {}) {
  const url = new URL(request.url);
  /** @type {Record<string, string>} */
  const headers = {};
  request.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });
  const hasBody = request.method !== "GET" && request.method !== "HEAD" && request.body !== null;
  const body = hasBody ? Buffer.from(await request.arrayBuffer()) : Buffer.alloc(0);
  return {
    method: request.method,
    url: `${url.pathname}${url.search}`,
    headers,
    socket: { remoteAddress: opts.remoteAddress ?? "unknown" },
    async *[Symbol.asyncIterator]() {
      if (body.length) yield body;
    },
  };
}

/** A ServerResponse stand-in; `response` resolves on end(). */
export function nodeResponseCollector() {
  /** @type {(r: Response) => void} */
  let resolve = () => {};
  /** @type {Promise<Response>} */
  const response = new Promise((r) => {
    resolve = r;
  });
  let status = 200;
  /** @type {Record<string, string>} */
  const headers = {};
  let ended = false;
  const res = {
    headersSent: false,
    /** @param {number} s @param {Record<string, string | number | string[]>} [h] */
    writeHead(s, h = {}) {
      status = s;
      for (const [k, v] of Object.entries(h)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
      res.headersSent = true;
      return res;
    },
    /** @param {string} k @param {string | number} v */
    setHeader(k, v) {
      headers[k.toLowerCase()] = String(v);
    },
    /** @param {string | Uint8Array | null} [chunk] */
    end(chunk) {
      if (ended) return res;
      ended = true;
      const body = chunk === undefined || chunk === null || NO_BODY.has(status) ? null : typeof chunk === "string" ? chunk : new Uint8Array(chunk);
      resolve(new Response(body, { status, headers }));
      return res;
    },
  };
  return { res, response, ended: () => ended };
}

/**
 * Wrap a Node-style handler as a fetch handler.
 * @param {(req: any, res: any) => unknown} handler
 * @param {{ maxBody?: number }} [opts]
 * @returns {(request: Request, info?: { remoteAddress?: string }) => Promise<Response>}
 */
export function fetchHandlerFor(handler, opts = {}) {
  return async (request, info = {}) => {
    const len = Number(request.headers.get("content-length") ?? "0");
    if (opts.maxBody !== undefined && len > opts.maxBody) {
      return Response.json({ error: { code: "too_large", message: `Body exceeds ${opts.maxBody} bytes.` } }, { status: 413, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
    }
    const req = await toNodeRequest(request, { remoteAddress: info.remoteAddress });
    const { res, response, ended } = nodeResponseCollector();
    try {
      await handler(req, res);
    } catch (e) {
      console.error("einvoice-pro: handler threw", e instanceof Error ? e.message.slice(0, 200) : "unknown");
    }
    // A handler that returned without ending the response would leave the request hanging.
    if (!ended()) res.writeHead(500, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }).end(JSON.stringify({ error: { code: "internal", message: "Internal error." } }));
    return response;
  };
}
