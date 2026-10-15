#!/usr/bin/env node
// Self-hosted changelog: public page, RSS/JSON feed, "What's new" embed. Zero dependencies.
//   ADMIN_KEY=... PUBLIC_URL=https://changelog.example.com COMPANY_NAME=Acme node server.mjs
import http from "node:http";
import fs from "node:fs";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { newState, createEntry, updateEntry, setStatus, remove, published, publicEntry, toRss, toJsonFeed, stats, CATEGORIES } from "./store.mjs";
import { renderIndex, renderEntry, renderAdmin } from "./page.mjs";
import { widgetSource } from "./widget.mjs";

export { newState };
const env = process.env;

const readBody = (req, max = 40_000) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on("data", (c) => { size += c.length; if (size > max) { reject(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
});
const bearerOk = (req, key) => {
  const a = Buffer.from(req.headers.authorization || ""), b = Buffer.from(`Bearer ${key}`);
  return Boolean(key) && a.length === b.length && timingSafeEqual(a, b);
};

// cfg: {state, save, adminKey, publicUrl, company, color, now}
export function handler(cfg) {
  const now = cfg.now || Date.now;
  const company = cfg.company || "Our product";
  const meta = { title: `${company} changelog`, link: cfg.publicUrl, description: `What's new in ${company}` };
  return async (req, res) => {
    const url = new URL(req.url, "http://x");
    const send = (code, body, type = "application/json", extra = {}) => {
      res.writeHead(code, { "content-type": type, "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", ...extra });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    const fail = (code, error) => send(code, { error });
    const html = (code, body, csp = "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'") => send(code, body, "text/html; charset=utf-8", { "content-security-policy": csp, "cache-control": "public, max-age=60" });
    try {
      const p = url.pathname;
      if (p === "/healthz") return send(200, "ok\n", "text/plain");
      if (p === "/embed.js" && req.method === "GET") return send(200, widgetSource(), "text/javascript; charset=utf-8", { "cache-control": "public, max-age=3600" });
      if (p === "/changelog.json" && req.method === "GET") {
        const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit")) || 10));
        return send(200, published(cfg.state, { tag: url.searchParams.get("tag") || "", limit }).map(publicEntry), "application/json", { "access-control-allow-origin": "*", "cache-control": "public, max-age=60" });
      }
      if (p === "/feed.xml" && req.method === "GET") return send(200, toRss(cfg.state, meta), "application/rss+xml; charset=utf-8", { "cache-control": "public, max-age=300" });
      if (p === "/feed.json" && req.method === "GET") return send(200, toJsonFeed(cfg.state, meta), "application/feed+json; charset=utf-8", { "cache-control": "public, max-age=300" });
      if (p === "/" && req.method === "GET") {
        const category = CATEGORIES.includes(url.searchParams.get("category")) ? url.searchParams.get("category") : "";
        return html(200, renderIndex({ entries: published(cfg.state, { category, limit: 100 }), company, color: cfg.color, link: cfg.publicUrl, category }));
      }
      const e = p.match(/^\/e\/([a-z0-9-]+)$/);
      if (e && req.method === "GET") {
        const entry = published(cfg.state, { limit: 2000 }).find((x) => x.slug === e[1]);
        return entry ? html(200, renderEntry({ entry, company, color: cfg.color, link: cfg.publicUrl })) : send(404, "not found\n", "text/plain");
      }
      if (p === "/admin" && req.method === "GET") return html(200, renderAdmin({ company, color: cfg.color }), "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'");

      if (p.startsWith("/v1/")) {
        if (!bearerOk(req, cfg.adminKey)) return fail(401, "admin key required");
        if (req.method === "GET" && p === "/v1/summary") return send(200, stats(cfg.state));
        if (p === "/v1/entries") {
          if (req.method === "GET") return send(200, cfg.state.entries.slice(-500));
          if (req.method === "POST") {
            const out = createEntry(cfg.state, JSON.parse((await readBody(req)) || "{}"), { id: randomBytes(6).toString("hex"), now: now() });
            if (out.error) return fail(400, out.error);
            cfg.save(); return send(201, out.entry);
          }
        }
        const m = p.match(/^\/v1\/entries\/([a-f0-9]+)(?:\/(status))?$/);
        if (m) {
          const body = req.method === "POST" || req.method === "PATCH" ? JSON.parse((await readBody(req)) || "{}") : {};
          let out;
          if (req.method === "POST" && m[2]) out = setStatus(cfg.state, m[1], body.status, now(), body.publishedAt);
          else if (req.method === "PATCH" && !m[2]) out = updateEntry(cfg.state, m[1], body, now());
          else if (req.method === "DELETE" && !m[2]) out = remove(cfg.state, m[1]);
          if (out) { if (out.error) return fail(out.error.startsWith("no such") ? 404 : 400, out.error); cfg.save(); return send(200, out.entry || out); }
        }
      }
      return send(404, "not found\n", "text/plain");
    } catch (err) {
      console.error("request failed:", err.message);
      return send(err.status && err.status < 500 ? err.status : err instanceof SyntaxError ? 400 : 500, { error: err instanceof SyntaxError ? "invalid JSON" : "Something went wrong." });
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
  const cfg = { state, save, adminKey: env.ADMIN_KEY, publicUrl: env.PUBLIC_URL.replace(/\/$/, ""), company: env.COMPANY_NAME, color: env.BRAND_COLOR };
  http.createServer(handler(cfg)).listen(Number(env.PORT || 8080), () => console.log(`changelog-keeper on :${env.PORT || 8080}`));
}
