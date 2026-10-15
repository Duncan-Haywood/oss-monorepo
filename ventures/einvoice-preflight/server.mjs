// Self-hostable HTTP API for e-invoice preflight. Zero dependencies: Node 20+.
//
//   POST /v1/validate        raw body = one invoice (JSON, UBL/CII XML or a
//                            Factur-X PDF). Content-Type picks the filename
//                            extension; ?name=invoice.xml overrides it.
//     add ?profile=xrechnung to also apply the German BR-DE rules (XR-nnn),
//     or ?profile=peppol for the Peppol BIS Billing 3.0 rules (PP-nnn)
//   POST /v1/validate/batch  {"documents":[{"name","content","encoding"?}]}
//                            encoding "base64" is for PDFs; default is text.
//   POST /v1/generate        {"draft":{...},"format":"ubl"|"cii","profile":"xrechnung"|
//                            "peppol"|"en16931"} -> { ok, errors, warnings, totals,
//                            xml, filename, preflight }. See examples/draft-invoice.json.
//   GET  /healthz            liveness probe.
//   GET  /                   the browser checker (index.html), if present.
//
// Everything runs in the deployer's own process. Nothing is stored and
// nothing is forwarded; request bodies live in memory for the length of the
// request. Configuration is by environment variable only (see README).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { generateInvoice } from "./generate.mjs";
import { buildJsonReport, preflightDocuments } from "./report.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DONATE_URL = "https://buymeacoffee.com/duncanhaywood";
const DISCLAIMER =
  "Preflight checks only: not a Peppol or EN 16931 conformance validator, not tax or legal advice. " +
  "Provided as-is without warranty; review results before relying on them.";

function intEnv(env, key, fallback) {
  const n = Number.parseInt(env[key] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function profileFrom(url) {
  const profile = url.searchParams.get("profile");
  return profile === "xrechnung" || profile === "peppol" ? profile : "";
}

export function loadConfig(env = process.env) {
  return {
    port: intEnv(env, "PORT", 8080),
    apiKey: env.EINVOICE_API_KEY || "",
    maxBytes: intEnv(env, "EINVOICE_MAX_BYTES", 1_048_576),
    maxBatch: intEnv(env, "EINVOICE_MAX_BATCH", 50),
    rateLimit: intEnv(env, "EINVOICE_RATE_LIMIT_PER_MIN", 120),
    corsOrigin: env.EINVOICE_CORS_ORIGIN || "",
    serveUi: env.EINVOICE_SERVE_UI !== "0",
  };
}

const EXT = [
  [/pdf/i, "invoice.pdf"],
  [/xml/i, "invoice.xml"],
  [/json/i, "invoice.json"],
];

function nameFor(contentType, override) {
  if (override) return override.replace(/[^\w.\- ]/g, "_").slice(0, 100);
  for (const [re, name] of EXT) if (re.test(contentType || "")) return name;
  return "invoice.json";
}

function keyOk(provided, expected) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, `Body exceeds ${limit} bytes.`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function createApp(config = loadConfig()) {
  const hits = new Map();

  function limited(ip, now) {
    const windowStart = now - 60_000;
    const recent = (hits.get(ip) || []).filter((t) => t > windowStart);
    recent.push(now);
    hits.set(ip, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => t > windowStart)) hits.delete(k);
    return recent.length > config.rateLimit;
  }

  function send(res, status, body, extra = {}) {
    const isText = typeof body === "string";
    const headers = {
      "content-type": isText ? "text/html; charset=utf-8" : "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extra,
    };
    if (config.corsOrigin) headers["access-control-allow-origin"] = config.corsOrigin;
    res.writeHead(status, headers);
    res.end(isText ? body : JSON.stringify(body));
  }

  async function handle(req, res) {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname;

    if (req.method === "OPTIONS") {
      send(res, 204, "", {
        "access-control-allow-methods": "POST, GET, OPTIONS",
        "access-control-allow-headers": "authorization, content-type",
      });
      return;
    }
    if (req.method === "GET" && path === "/healthz") {
      send(res, 200, { status: "ok", donate: DONATE_URL });
      return;
    }
    if (req.method === "GET" && path === "/create.html" && config.serveUi) {
      try {
        send(res, 200, await readFile(join(HERE, "create.html"), "utf8"));
      } catch {
        send(res, 404, { error: "UI not bundled in this deployment." });
      }
      return;
    }
    if (req.method === "GET" && (path === "/" || path === "/index.html") && config.serveUi) {
      try {
        send(res, 200, await readFile(join(HERE, "index.html"), "utf8"));
      } catch {
        send(res, 404, { error: "UI not bundled in this deployment." });
      }
      return;
    }
    if (!path.startsWith("/v1/")) {
      send(res, 404, { error: "Not found." });
      return;
    }

    if (config.apiKey) {
      const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
      if (!m || !keyOk(m[1], config.apiKey)) {
        send(res, 401, { error: "Missing or invalid API key." }, { "www-authenticate": "Bearer" });
        return;
      }
    }
    const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress || "?";
    if (limited(ip, Date.now())) {
      send(res, 429, { error: "Rate limit exceeded." }, { "retry-after": "60" });
      return;
    }
    if (req.method !== "POST") {
      send(res, 405, { error: "Use POST." }, { allow: "POST" });
      return;
    }

    if (path === "/v1/validate") {
      const body = await readBody(req, config.maxBytes);
      if (!body.length) throw new HttpError(400, "Empty body.");
      const name = nameFor(req.headers["content-type"], url.searchParams.get("name"));
      const source = name.toLowerCase().endsWith(".pdf") ? new Uint8Array(body) : body.toString("utf8");
      const result = await preflightDocuments([{ name, source }], { maxBytes: config.maxBytes, maxFiles: 1, profile: profileFrom(url) });
      const report = buildJsonReport(result);
      send(res, 200, { ...report, disclaimer: DISCLAIMER });
      return;
    }

    if (path === "/v1/validate/batch") {
      // Base64 inflates by a third, so allow for it on the envelope.
      const raw = await readBody(req, Math.ceil(config.maxBytes * config.maxBatch * 1.4) + 4096);
      let parsed;
      try {
        parsed = JSON.parse(raw.toString("utf8"));
      } catch {
        throw new HttpError(400, "Body must be JSON.");
      }
      const docs = parsed?.documents;
      if (!Array.isArray(docs) || !docs.length) throw new HttpError(400, 'Expected {"documents":[...]}.');
      if (docs.length > config.maxBatch) throw new HttpError(413, `At most ${config.maxBatch} documents per batch.`);
      const inputs = docs.map((d, i) => {
        if (typeof d?.content !== "string") throw new HttpError(400, `documents[${i}].content must be a string.`);
        const name = nameFor("", d.name) || `invoice-${i}.json`;
        const source = d.encoding === "base64" ? new Uint8Array(Buffer.from(d.content, "base64")) : d.content;
        return { name: d.name ? name : `invoice-${i}.json`, source };
      });
      const result = await preflightDocuments(inputs, { maxBytes: config.maxBytes, maxFiles: config.maxBatch, profile: profileFrom(url) });
      send(res, 200, { ...buildJsonReport(result), disclaimer: DISCLAIMER });
      return;
    }

    if (path === "/v1/generate") {
      const raw = await readBody(req, config.maxBytes);
      let parsed;
      try {
        parsed = JSON.parse(raw.toString("utf8"));
      } catch {
        throw new HttpError(400, "Body must be JSON.");
      }
      if (!parsed || typeof parsed !== "object" || typeof parsed.draft !== "object" || parsed.draft === null) {
        throw new HttpError(400, 'Expected {"draft":{...}}.');
      }
      const made = generateInvoice(parsed.draft, { format: parsed.format || "ubl", profile: parsed.profile || "xrechnung" });
      if (!made.ok) {
        send(res, 422, { ...made, disclaimer: DISCLAIMER });
        return;
      }
      const check = buildJsonReport(await preflightDocuments([{ name: made.filename, source: made.xml }], { maxBytes: config.maxBytes, maxFiles: 1 }));
      send(res, 200, { ...made, preflight: { status: check.status, findings: check.errors }, disclaimer: DISCLAIMER });
      return;
    }

    send(res, 404, { error: "Not found." });
  }

  return createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (err instanceof HttpError) send(res, err.status, { error: err.message });
      else send(res, 500, { error: "Internal error." });
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const config = loadConfig();
  createApp(config).listen(config.port, () => {
    console.log(`einvoice-preflight API on :${config.port}${config.apiKey ? " (API key required)" : " (open: set EINVOICE_API_KEY to require a key)"}`);
  });
}
