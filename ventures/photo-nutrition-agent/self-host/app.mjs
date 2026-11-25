// HTTP surface. node:http only.
//
//   /mcp                         MCP (Streamable HTTP, stateless)          API auth
//   /api/tools/<name>            the same tools as REST                    API auth
//   /openapi.json                OpenAPI for Custom GPT Actions            public
//   /api/export | restore | erase | maintenance                            API auth
//   /v1/device/*                 the iPhone agent                          DEVICE auth
//   /.well-known/oauth-*, /register, /authorize, /token                    OAuth
import { handleMcp } from "./mcp.mjs";
import { callTool, TOOLS } from "./tools.mjs";
import { openApiDoc } from "./openapi.mjs";
import { authorizePage } from "./auth.mjs";
import { ingestPhoto, runMaintenance, presentPhoto, PausedError } from "./pipeline.mjs";
import { healthKitFeed } from "./meals.mjs";
import { getPolicy } from "./policy.mjs";
import { localDate } from "./nutrition.mjs";

const SMALL = 256 * 1024;
const LARGE = 10 * 1024 * 1024;

const METRIC_FIELDS = ["body_mass_kg", "body_fat_pct", "lean_mass_kg", "active_kcal", "resting_kcal", "steps", "sleep_hours", "exercise_minutes", "strength_minutes", "dietary_kcal_other_apps"];

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error("request body too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function parseBody(req, limit = SMALL) {
  const raw = await readBody(req, limit);
  if (!raw) return {};
  const type = String(req.headers["content-type"] || "");
  if (type.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(raw));
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error("body is not valid JSON"), { status: 400 });
  }
}

function send(res, status, body, headers = {}) {
  const isStr = typeof body === "string";
  res.writeHead(status, {
    "content-type": isStr ? "text/html; charset=utf-8" : "application/json",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    ...headers,
  });
  res.end(body == null ? "" : isStr ? body : JSON.stringify(body));
}

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, mcp-protocol-version", "access-control-allow-methods": "GET, POST, OPTIONS" };

export function createApp({ store, analyzer, auth, logger = console }) {
  const ctx = { store, analyzer };

  async function route(req, res) {
    const url = new URL(req.url, "http://localhost");
    const p = url.pathname.replace(/\/+$/, "") || "/";
    const m = req.method;

    if (m === "OPTIONS") return send(res, 204, null, CORS);

    // ---------- public ----------
    if (m === "GET" && p === "/healthz") return send(res, 200, { ok: true });
    if (m === "GET" && p === "/") return send(res, 200, { name: "photo-nutrition-agent", mcp: "/mcp", openapi: "/openapi.json", docs: "https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/photo-nutrition-agent" });
    if (m === "GET" && p === "/openapi.json") return send(res, 200, openApiDoc(auth.baseUrl), CORS);
    if (m === "GET" && (p === "/.well-known/oauth-protected-resource" || p === "/.well-known/oauth-protected-resource/mcp")) return send(res, 200, auth.resourceMetadata(), CORS);
    if (m === "GET" && (p === "/.well-known/oauth-authorization-server" || p === "/.well-known/oauth-authorization-server/mcp" || p === "/.well-known/openid-configuration")) return send(res, 200, auth.serverMetadata(), CORS);

    // ---------- OAuth ----------
    if (p === "/register" && m === "POST") return send(res, 201, auth.register(await parseBody(req)), CORS);
    if (p === "/authorize" && m === "GET") {
      const q = Object.fromEntries(url.searchParams);
      auth.validateAuthorizeParams(q);
      return send(res, 200, authorizePage(q), { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https: http://localhost:* http://127.0.0.1:*", "x-frame-options": "DENY" });
    }
    if (p === "/authorize" && m === "POST") {
      const body = await parseBody(req);
      const { password, ...q } = body;
      try {
        const to = auth.approve(q, password);
        return send(res, 302, null, { location: to });
      } catch (e) {
        if (e.protocolError?.error === "access_denied" || e.protocolError?.error === "temporarily_unavailable") return send(res, 401, authorizePage(q, e.message), { "x-frame-options": "DENY" });
        throw e;
      }
    }
    if (p === "/token" && m === "POST") return send(res, 200, auth.token(await parseBody(req), req.headers.authorization), CORS);

    // ---------- device ----------
    if (p.startsWith("/v1/device/")) {
      if (!auth.checkDevice(req.headers.authorization)) return send(res, 401, { error: "device token required" });
      store.setSetting("device_last_seen", store.nowIso());
      return deviceRoute(req, res, p, url);
    }

    // ---------- chat / admin ----------
    if (p === "/mcp" || p.startsWith("/api/")) {
      if (!auth.checkApi(req.headers.authorization)) return send(res, 401, { error: "unauthorized" }, { "www-authenticate": auth.wwwAuthenticate(), ...CORS });
      if (p === "/mcp") {
        if (m === "GET") return send(res, 405, { error: "this server does not open an SSE stream; POST JSON-RPC" }, { allow: "POST" });
        if (m === "DELETE") return send(res, 405, null, { allow: "POST" });
        if (m !== "POST") return send(res, 405, null, { allow: "POST" });
        const r = await handleMcp(ctx, await parseBody(req, SMALL));
        return send(res, r.status, r.body, CORS);
      }
      const tm = /^\/api\/tools\/([a-z_]+)$/.exec(p);
      if (tm && m === "POST") return send(res, 200, await callTool(ctx, tm[1], await parseBody(req)), CORS);
      if (p === "/api/tools" && m === "GET") return send(res, 200, { tools: TOOLS.map((t) => t.name) });
      if (p === "/api/export" && m === "GET") return send(res, 200, store.exportAll({ includeImages: url.searchParams.get("images") === "1" }), { "content-disposition": `attachment; filename="nutrition-export-${localDate(store.nowIso())}.json"` });
      if (p === "/api/restore" && m === "POST") {
        store.restore(await parseBody(req, 200 * 1024 * 1024));
        return send(res, 200, { restored: true });
      }
      if (p === "/api/erase" && m === "POST") {
        const b = await parseBody(req);
        if (b.confirm !== "erase everything") return send(res, 400, { error: 'send {"confirm": "erase everything"}' });
        store.eraseAll();
        auth.revokeAll();
        return send(res, 200, { erased: true });
      }
      if (p === "/api/maintenance" && m === "POST") return send(res, 200, await runMaintenance(ctx));
    }
    return send(res, 404, { error: "not found" });
  }

  async function deviceRoute(req, res, p, url) {
    const m = req.method;
    if (p === "/v1/device/config" && m === "GET") {
      const pol = getPolicy(store);
      return send(res, 200, { paused: pol.paused, min_food_score: pol.min_food_score, non_camera_images: pol.non_camera_images, analyzer: !!analyzer, server_time: store.nowIso() });
    }
    if (p === "/v1/device/heartbeat" && m === "POST") {
      const b = await parseBody(req);
      if (b.time_zone) store.setSetting("current_time_zone", String(b.time_zone));
      store.setSetting("device_last_report", { at: store.nowIso(), ...pick(b, ["app_version", "os_version", "wake_reason", "photo_authorization", "health_authorization", "pending_uploads", "pending_health_writes", "last_scan_at", "last_error", "time_zone"]) });
      const pol = getPolicy(store);
      return send(res, 200, { ok: true, paused: pol.paused, min_food_score: pol.min_food_score, non_camera_images: pol.non_camera_images });
    }
    if (p === "/v1/device/photos/known" && m === "POST") {
      const b = await parseBody(req);
      const ids = Array.isArray(b.asset_ids) ? b.asset_ids.slice(0, 500).map(String) : [];
      return send(res, 200, { known: ids.filter((id) => store.photoByAsset(id)) });
    }
    if (p === "/v1/device/photos" && m === "POST") {
      try {
        const r = await ingestPhoto(ctx, await parseBody(req, LARGE));
        return send(res, r.duplicate_request ? 200 : 201, r);
      } catch (e) {
        if (e instanceof PausedError) return send(res, 503, { error: e.message, paused: true }, { "retry-after": "3600" });
        throw e;
      }
    }
    const ph = /^\/v1\/device\/photos\/([A-Za-z0-9_-]+)$/.exec(p);
    if (ph && m === "GET") {
      const photo = store.photo(ph[1]);
      return photo ? send(res, 200, presentPhoto(photo)) : send(res, 404, { error: "no such photo" });
    }
    if (p === "/v1/device/healthkit/changes" && m === "GET") {
      const since = Number(url.searchParams.get("since") || 0);
      return send(res, 200, healthKitFeed(store, Number.isFinite(since) ? since : 0, Math.min(500, Number(url.searchParams.get("limit") || 200))));
    }
    if (p === "/v1/device/healthkit/ack" && m === "POST") {
      const b = await parseBody(req);
      const results = Array.isArray(b.results) ? b.results : [];
      let ok = 0;
      for (const r of results) {
        if (!r || !r.meal_id || !Number.isInteger(r.version)) continue;
        if (r.ok) {
          store.markHealthKit(r.meal_id, { version: r.version, samples: Array.isArray(r.sample_uuids) ? r.sample_uuids.slice(0, 20) : null });
          ok++;
        } else store.markHealthKit(r.meal_id, { version: r.version, error: r.error || "unknown device error" });
      }
      return send(res, 200, { acknowledged: ok, errors: results.length - ok });
    }
    if (p === "/v1/device/metrics" && m === "POST") {
      const b = await parseBody(req, LARGE);
      let n = 0;
      for (const d of Array.isArray(b.days) ? b.days : []) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d?.date))) continue;
        for (const f of METRIC_FIELDS) {
          const v = Number(d[f]);
          if (d[f] != null && Number.isFinite(v)) {
            store.upsertMetric(d.date, f, v, "healthkit");
            n++;
          }
        }
      }
      return send(res, 200, { stored: n });
    }
    return send(res, 404, { error: "not found" });
  }

  return async function handler(req, res) {
    try {
      await route(req, res);
    } catch (e) {
      if (e.protocolError) return send(res, e.status || 400, e.protocolError, CORS);
      // Domain errors are plain Error with a message meant for the caller; engine errors are bugs.
      const status = e.status || (e instanceof TypeError || e instanceof ReferenceError || e instanceof SyntaxError ? 500 : 400);
      if (status >= 500) logger.error?.(e);
      if (!res.headersSent) send(res, status, { error: status >= 500 ? "internal error" : e.message });
    }
  };
}

function pick(o, keys) {
  const out = {};
  for (const k of keys) if (o?.[k] != null) out[k] = typeof o[k] === "string" ? o[k].slice(0, 300) : o[k];
  return out;
}
