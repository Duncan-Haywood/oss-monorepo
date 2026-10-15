#!/usr/bin/env node
// Self-hosted short links with click stats. Zero dependencies.
//   ADMIN_KEY=... BASE_URL=https://go.example.com node server.mjs
import http from "node:http";
import fs from "node:fs";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import * as E from "./engine.mjs";

const env = process.env;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const readBody = (req, max = 300_000) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on("data", (c) => { size += c.length; if (size > max) { reject(Object.assign(new Error("body too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
});
const bearerOk = (req, key) => { const a = Buffer.from(req.headers.authorization || ""), b = Buffer.from(`Bearer ${key}`); return Boolean(key) && a.length === b.length && timingSafeEqual(a, b); };

const view = (l, base) => ({ slug: l.slug, short: base ? `${base}/${l.slug}` : `/${l.slug}`, url: l.url, targets: l.targets, title: l.title, tags: l.tags, createdAt: new Date(l.createdAt).toISOString(), expiresAt: l.expiresAt ? new Date(l.expiresAt).toISOString() : null, maxClicks: l.maxClicks, archived: l.archived, clicks: l.clicks });

// cfg: {state, save, adminKey, baseUrl, rootRedirect, allowHosts, trustProxy, now, rand}
export function handler(cfg) {
  const now = cfg.now || Date.now, rand = cfg.rand || Math.random;
  const hash = (salt, v) => createHmac("sha256", salt).update(v).digest("hex").slice(0, 16);
  const newSalt = () => randomBytes(16).toString("hex");
  return async (req, res) => {
    const url = new URL(req.url, "http://x"), path = url.pathname, q = url.searchParams;
    const json = (code, body) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }); res.end(JSON.stringify(body, null, 2)); };
    const page = (code, title, body) => { res.writeHead(code, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'", "referrer-policy": "no-referrer" }); res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>body{font:16px system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 20px;color:#1d2433}code{word-break:break-all}</style>${body}`); };
    try {
      if (path === "/healthz") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("ok\n"); }
      if (path === "/robots.txt") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("User-agent: *\nDisallow: /\n"); }
      if (path === "/") {
        if (cfg.rootRedirect) { res.writeHead(302, { location: cfg.rootRedirect }); return res.end(); }
        return json(200, { name: "link-keeper", links: Object.keys(cfg.state.links).length, docs: "https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/link-keeper" });
      }

      if (path.startsWith("/v1/")) {
        if (!bearerOk(req, cfg.adminKey)) return json(401, { error: "bad admin key" });
        const a = path.slice(3); let m;
        const get = (slug) => cfg.state.links[decodeURIComponent(slug).toLowerCase()];
        if (req.method === "POST" && a === "/links") {
          const l = E.createLink(cfg.state, JSON.parse((await readBody(req)) || "{}"), now(), { rand, allowHosts: cfg.allowHosts }); cfg.save(); return json(201, view(l, cfg.baseUrl));
        }
        if (req.method === "POST" && a === "/links/bulk") {
          const b = JSON.parse((await readBody(req)) || "{}");
          if (!Array.isArray(b.links) || b.links.length === 0 || b.links.length > 200) return json(400, { error: "send {links:[...]} with 1 to 200 links" });
          const results = b.links.map((x) => { try { return { ok: true, ...view(E.createLink(cfg.state, x, now(), { rand, allowHosts: cfg.allowHosts }), cfg.baseUrl) }; } catch (e) { if (!e.status) throw e; return { ok: false, error: e.message }; } });
          cfg.save(); return json(200, { results });
        }
        if (req.method === "GET" && a === "/links") {
          const tag = q.get("tag"), find = (q.get("q") || "").toLowerCase();
          const list = Object.values(cfg.state.links).filter((l) => (!tag || l.tags.includes(tag)) && (!find || l.slug.toLowerCase().includes(find) || l.url.toLowerCase().includes(find) || l.title.toLowerCase().includes(find)));
          return json(200, { links: list.sort((x, y) => y.createdAt - x.createdAt).slice(0, 500).map((l) => view(l, cfg.baseUrl)) });
        }
        if (req.method === "GET" && a === "/export.csv") { res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="links.csv"' }); return res.end(E.toCsv(cfg.state, now())); }
        if ((m = a.match(/^\/links\/([^/]+)\/stats$/)) && req.method === "GET") {
          const l = get(m[1]); if (!l) return json(404, { error: "no such link" });
          const bad = (v) => v && !/^\d{4}-\d{2}-\d{2}$/.test(v);
          if (bad(q.get("from")) || bad(q.get("to"))) return json(400, { error: "from and to must be YYYY-MM-DD" });
          return json(200, E.stats(l, now(), q.get("from"), q.get("to")));
        }
        if ((m = a.match(/^\/links\/([^/]+)$/))) {
          const l = get(m[1]); if (!l) return json(404, { error: "no such link" });
          if (req.method === "GET") return json(200, view(l, cfg.baseUrl));
          if (req.method === "DELETE") { l.archived = true; cfg.save(); return json(200, view(l, cfg.baseUrl)); }
          if (req.method === "PATCH") {
            const b = JSON.parse((await readBody(req)) || "{}");
            if (b.url != null) { const t = E.checkTarget(b.url, { allowHosts: cfg.allowHosts }); if (!t.ok) return json(400, { error: t.error }); l.url = b.utm ? E.addUtm(t.url, b.utm) : t.url; }
            if (b.title != null) l.title = String(b.title).slice(0, 200);
            if (b.archived != null) l.archived = Boolean(b.archived);
            if (b.expiresAt !== undefined) { const t = b.expiresAt === null ? null : Date.parse(b.expiresAt); if (t !== null && !Number.isFinite(t)) return json(400, { error: "expiresAt must be an ISO date or null" }); l.expiresAt = t; }
            if (b.maxClicks !== undefined) { if (b.maxClicks !== null && (!Number.isInteger(b.maxClicks) || b.maxClicks < 1)) return json(400, { error: "maxClicks must be a whole number of 1 or more, or null" }); l.maxClicks = b.maxClicks; }
            cfg.save(); return json(200, view(l, cfg.baseUrl));
          }
        }
        return json(404, { error: "not found" });
      }

      // Public redirect. "slug+" shows where a link goes without following it.
      if ((req.method === "GET" || req.method === "HEAD") && path.length > 1) {
        let slug = decodeURIComponent(path.slice(1)); const preview = slug.endsWith("+"); if (preview) slug = slug.slice(0, -1);
        const ua = req.headers["user-agent"] || "";
        const r = E.lookup(cfg.state, slug, ua, now());
        if (r.status === "missing") return page(404, "Not found", "<h1>No such link</h1><p>This short link does not exist.</p>");
        if (r.status === "gone") return page(410, "Link ended", `<h1>This link has ended</h1><p>It was ${esc(r.reason)}.</p>`);
        if (preview) return page(200, "Link preview", `<h1>This short link goes to</h1><p><code>${esc(r.link.url)}</code></p><p>Only follow it if you trust the sender.</p>`);
        const ip = (cfg.trustProxy && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket.remoteAddress || "";
        if (req.method === "GET") {
          E.recordClick(cfg.state, r.link, { client: r.client, referer: req.headers.referer, country: req.headers["cf-ipcountry"] || req.headers["x-vercel-ip-country"] || req.headers["x-country"], visitor: ip + "|" + ua, hash, newSalt }, now());
          cfg.touch?.();
        }
        res.writeHead(cfg.status || 302, { location: r.location, "cache-control": "private, max-age=0", "referrer-policy": "no-referrer", "x-robots-tag": "noindex" });
        return res.end();
      }
      return json(404, { error: "not found" });
    } catch (e) {
      const code = e instanceof SyntaxError ? 400 : e.status || 500; if (code === 500) console.error(e);
      return json(code, { error: code === 500 ? "server error" : e instanceof SyntaxError ? "body is not valid JSON" : e.message });
    }
  };
}

export function loadState(file) { try { const s = JSON.parse(fs.readFileSync(file, "utf8")); s.links ||= {}; s.seen ||= {}; return s; } catch { return E.newState(); } }

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!env.ADMIN_KEY || env.ADMIN_KEY.length < 16) { console.error("Set ADMIN_KEY (16+ characters)."); process.exit(1); }
  const file = env.STATE || "/tmp/state.json", state = loadState(file);
  let dirty = false;
  const save = () => { fs.writeFileSync(`${file}.tmp`, JSON.stringify(state)); fs.renameSync(`${file}.tmp`, file); dirty = false; };
  const flush = () => { if (dirty) try { save(); } catch (e) { console.error("save failed:", e.message); } };
  const status = [301, 302, 307, 308].includes(Number(env.REDIRECT_STATUS)) ? Number(env.REDIRECT_STATUS) : 302;
  const srv = http.createServer(handler({
    state, save, adminKey: env.ADMIN_KEY, baseUrl: (env.BASE_URL || "").replace(/\/$/, ""), rootRedirect: env.ROOT_REDIRECT || "", status,
    allowHosts: (env.ALLOW_HOSTS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean), trustProxy: env.TRUST_PROXY === "true", touch: () => { dirty = true; },
  }));
  srv.listen(Number(env.PORT) || 8080, () => console.log(`link-keeper on :${env.PORT || 8080}`));
  // Clicks are batched to disk every few seconds instead of rewriting the file on every redirect.
  setInterval(flush, 5_000).unref();
  setInterval(() => { E.prune(state, Date.now()); dirty = true; }, 3_600_000).unref();
  for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { srv.close(); dirty = true; flush(); process.exit(0); });
}
