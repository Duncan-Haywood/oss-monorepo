#!/usr/bin/env node
// Self-hosted changelog: public page, Atom + JSON feeds, embeddable "What's new" bell. Zero dependencies.
//   ADMIN_KEY=... PUBLIC_URL=https://changelog.example.com COMPANY_NAME=Acme node server.mjs
import http from "node:http";
import fs from "node:fs";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { newState, createEntry, updateEntry, remove, publicEntries, stats, plainText, isPublic } from "./store.mjs";
import { toAtom, toJsonFeed } from "./feed.mjs";
import { renderChangelog, renderAdmin } from "./page.mjs";
import { widgetSource } from "./widget.mjs";

export { newState };
const env = process.env;

const readBody = (req, max = 20_000) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on("data", (c) => { size += c.length; if (size > max) { reject(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
});
const bearerOk = (req, key) => {
  const a = Buffer.from(req.headers.authorization || ""), b = Buffer.from(`Bearer ${key}`);
  return Boolean(key) && a.length === b.length && timingSafeEqual(a, b);
};

// cfg: {state, save, adminKey, publicUrl, company, color, notify, now}
export function handler(cfg) {
  const now = cfg.now || Date.now;
  const company = cfg.company || "Our team";
  const meta = { publicUrl: cfg.publicUrl, company };
  return async (req, res) => {
    const url = new URL(req.url, "http://x");
    const send = (code, body, type = "application/json", extra = {}) => {
      res.writeHead(code, { "content-type": type, "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", ...extra });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    const fail = (code, error) => send(code, { error });
    const html = (code, body, csp = "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'") => send(code, body, "text/html; charset=utf-8", { "content-security-policy": csp });
    const pub = { "access-control-allow-origin": "*", "cache-control": "public, max-age=60" };
    try {
      if (url.pathname === "/healthz") return send(200, "ok\n", "text/plain");
      if (url.pathname === "/embed.js" && req.method === "GET") return send(200, widgetSource(), "text/javascript; charset=utf-8", { "cache-control": "public, max-age=3600" });
      if ((url.pathname === "/" || url.pathname === "/changelog") && req.method === "GET") {
        const tag = url.searchParams.get("tag") || undefined;
        return html(200, renderChangelog({ entries: publicEntries(cfg.state, now(), { limit: 200, tag }), company, color: cfg.color, publicUrl: cfg.publicUrl }));
      }
      if (url.pathname === "/feed.xml" && req.method === "GET") return send(200, toAtom(publicEntries(cfg.state, now(), { limit: 50 }), meta), "application/atom+xml; charset=utf-8", pub);
      if (url.pathname === "/feed.json" && req.method === "GET") return send(200, toJsonFeed(publicEntries(cfg.state, now(), { limit: 50 }), meta), "application/feed+json; charset=utf-8", pub);
      if (url.pathname === "/entries.json" && req.method === "GET") {
        const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit")) || 10));
        return send(200, publicEntries(cfg.state, now(), { limit, tag: url.searchParams.get("tag") || undefined }).map((e) => ({ id: e.id, title: e.title, tag: e.tag, publishAt: e.publishAt, text: plainText(e.body) })), "application/json", pub);
      }
      if (url.pathname === "/admin" && req.method === "GET") return html(200, renderAdmin({ company, color: cfg.color }), "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'");

      if (url.pathname.startsWith("/v1/")) {
        if (!bearerOk(req, cfg.adminKey)) return fail(401, "admin key required");
        if (req.method === "GET" && url.pathname === "/v1/summary") return send(200, stats(cfg.state, now()));
        if (url.pathname === "/v1/entries") {
          if (req.method === "GET") return send(200, [...cfg.state.entries].sort((a, b) => b.publishAt - a.publishAt).slice(0, 500));
          if (req.method === "POST") {
            const out = createEntry(cfg.state, JSON.parse((await readBody(req)) || "{}"), { id: randomBytes(6).toString("hex"), now: now() });
            if (out.error) return fail(400, out.error);
            cfg.save();
            if (cfg.notify && isPublic(out.entry, now())) cfg.notify(out.entry).catch((e) => console.error("notify failed:", e.message));
            return send(201, out.entry);
          }
        }
        const m = url.pathname.match(/^\/v1\/entries\/([a-f0-9]+)$/);
        if (m && req.method === "POST") {
          const out = updateEntry(cfg.state, m[1], JSON.parse((await readBody(req)) || "{}"), now());
          if (out.error) return fail(out.error.startsWith("no such") ? 404 : 400, out.error);
          cfg.save(); return send(200, out.entry);
        }
        if (m && req.method === "DELETE") {
          const out = remove(cfg.state, m[1]);
          if (out.error) return fail(404, out.error);
          cfg.save(); return send(200, out);
        }
      }
      return send(404, "not found\n", "text/plain");
    } catch (e) {
      console.error("request failed:", e.message);
      return send(e.status && e.status < 500 ? e.status : e instanceof SyntaxError ? 400 : 500, { error: e instanceof SyntaxError ? "invalid JSON" : "Something went wrong." });
    }
  };
}

function readJson(path, fallback) {
  try { return JSON.parse(fs.readFileSync(path, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const missing = ["ADMIN_KEY", "PUBLIC_URL"].filter((k) => !env[k]);
  if (missing.length) { console.error(`missing env: ${missing.join(", ")}`); process.exit(1); }
  const statePath = env.STATE || "state.json";
  const state = Object.assign(newState(), readJson(statePath, {}));
  const save = () => { fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(state)); fs.renameSync(`${statePath}.tmp`, statePath); };
  const notify = env.NOTIFY_WEBHOOK ? async (e) => {
    const r = await fetch(env.NOTIFY_WEBHOOK, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: `${env.COMPANY_NAME || "Changelog"}: ${e.title} (${e.tag}) ${env.PUBLIC_URL}/changelog#${e.id}` }) });
    if (!r.ok) throw new Error(`webhook ${r.status}`);
  } : null;
  const cfg = { state, save, adminKey: env.ADMIN_KEY, publicUrl: env.PUBLIC_URL.replace(/\/$/, ""), company: env.COMPANY_NAME, color: env.BRAND_COLOR, notify };
  http.createServer(handler(cfg)).listen(Number(env.PORT || 8080), () => console.log(`changelog-keeper on :${env.PORT || 8080}`));
}
