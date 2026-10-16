#!/usr/bin/env node
// Self-hosted help center. Zero dependencies, state in one JSON file.
//   ADMIN_KEY=... node server.mjs      then open /admin
import http from "node:http";
import fs from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { newState, updateSettings, saveArticle, removeArticle, importMarkdown, bySlug, find, logSearch, logClick, vote, collections, gapsCsv, published, contactHref } from "./kb.mjs";
import { plain } from "./markdown.mjs";
import { homePage, collectionPage, searchPage, articlePage, notFound, adminPage, editPage, gapsPage, importPage } from "./render.mjs";

const env = process.env;
const readBody = (req, max = 400_000) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on("data", (c) => { size += c.length; if (size > max) { reject(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
});
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
export function adminOk(req, key) {
  if (!key) return false;
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) return same(h.slice(7), key);
  if (h.startsWith("Basic ")) { const p = Buffer.from(h.slice(6), "base64").toString(); return same(p.slice(p.indexOf(":") + 1), key); }
  return false;
}
export function limiter(max, windowMs) {
  const hits = new Map();
  return (key, now) => {
    const w = Math.floor(now / windowMs), h = hits.get(key);
    if (!h || h.w !== w) { hits.set(key, { w, n: 1 }); if (hits.size > 10_000) hits.clear(); return true; }
    return ++h.n <= max;
  };
}

// cfg: {state, save, adminKey, sponsor, now, trustProxy, baseUrl, limits}
export function handler(cfg) {
  const now = cfg.now || Date.now;
  const lim = { read: limiter(300, 60_000), search: limiter(60, 60_000), vote: limiter(10, 60_000), view: limiter(3, 60_000), ...cfg.limits };
  const { state } = cfg;
  let dirty = false, lastSave = 0;
  const persist = (force = false) => { dirty = true; if (force || now() - lastSave > 5000) { cfg.save(); lastSave = now(); dirty = false; } };
  cfg.flush = () => { if (dirty) { cfg.save(); dirty = false; } };
  return async (req, res) => {
    const url = new URL(req.url, "http://x");
    const ip = (cfg.trustProxy && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket.remoteAddress || "?";
    const base = cfg.baseUrl || `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;
    const rcfg = { ...cfg, baseUrl: cfg.baseUrl || "" };
    const send = (code, body, type = "text/html; charset=utf-8", headers = {}) => {
      res.writeHead(code, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "same-origin", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src https:; frame-ancestors 'none'; form-action 'self'", ...headers });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    const redirect = (to) => send(303, "", "text/plain", { location: to });
    const text = (code, msg) => send(code, `${msg}\n`, "text/plain");
    try {
      if (!lim.read(ip, now())) return text(429, "slow down");
      const path = url.pathname; let m;
      if (path === "/healthz") return text(200, "ok");
      if (path === "/robots.txt") return send(200, `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /search\nSitemap: ${base}/sitemap.xml\n`, "text/plain");
      if (path === "/sitemap.xml") return send(200, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${base}/</loc></url>\n${published(state).map((a) => `<url><loc>${base}/a/${a.slug}</loc><lastmod>${new Date(a.updated).toISOString().slice(0, 10)}</lastmod></url>`).join("\n")}\n</urlset>\n`, "application/xml");
      if (path === "/" && req.method === "GET") return send(200, homePage(rcfg, state));

      if (path === "/search" && req.method === "GET") {
        if (!lim.search(ip, now())) return text(429, "too many searches; try again in a minute");
        const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
        const results = q ? find(state, q, 10) : [];
        if (q && logSearch(state, q, results.filter((r) => r.matchedAll).length, now())) persist();
        return send(200, searchPage(rcfg, state, q, results));
      }
      if (path === "/api/search" && req.method === "GET") {
        if (!lim.search(ip, now())) return send(429, { error: "too many searches" }, "application/json");
        const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
        const results = q ? find(state, q, Math.min(10, Number(url.searchParams.get("limit")) || 5)) : [];
        if (q && logSearch(state, q, results.filter((r) => r.matchedAll).length, now())) persist();
        return send(200, { query: q, results: results.map((r) => ({ title: r.article.title, url: `${base}/a/${r.article.slug}?from=${encodeURIComponent(q)}`, collection: r.article.collection, excerpt: plain(r.article.body).slice(0, 200) })) }, "application/json", { "access-control-allow-origin": "*" });
      }
      if ((m = path.match(/^\/c\/([a-z0-9-]+)$/)) && req.method === "GET") {
        const c = collections(state).find((x) => x.slug === m[1]); if (!c) return send(404, notFound(rcfg, state));
        return send(200, collectionPage(rcfg, state, c));
      }
      if ((m = path.match(/^\/a\/([a-z0-9-]+)(\/vote)?$/))) {
        const a = bySlug(state, m[1]); if (!a || a.status !== "published") return send(404, notFound(rcfg, state));
        if (!m[2] && req.method === "GET") {
          if (lim.view(`${ip}:${a.id}`, now())) { a.views++; const from = url.searchParams.get("from"); if (from) logClick(state, from); persist(); }
          return send(200, articlePage(rcfg, state, a, { from: url.searchParams.get("from") || "", voted: url.searchParams.get("voted") || "" }));
        }
        if (m[2] && req.method === "POST") {
          if (!lim.vote(`${ip}:${a.id}`, now())) return text(429, "too many votes; try again later");
          const f = Object.fromEntries(new URLSearchParams(await readBody(req, 5000)));
          if (f.helpful === "yes" || f.helpful === "no") { vote(state, a.id, f.helpful === "yes", f.comment, now()); persist(true); }
          return redirect(`/a/${a.slug}?voted=1`);
        }
        return text(405, "method not allowed");
      }

      if (path.startsWith("/admin")) {
        if (!adminOk(req, cfg.adminKey)) return send(401, "admin key required\n", "text/plain", { "www-authenticate": 'Basic realm="admin"' });
        if (req.method === "GET") {
          if (path === "/admin") return send(200, adminPage(rcfg, state, base));
          if (path === "/admin/new") return send(200, editPage(rcfg, state, null, "", url.searchParams.get("title") ? { title: url.searchParams.get("title").slice(0, 140), body: "", collection: "", tags: [], status: "draft", slug: "" } : null));
          if (path === "/admin/gaps") return send(200, gapsPage(rcfg, state, now()));
          if (path === "/admin/gaps.csv") return send(200, gapsCsv(state), "text/csv; charset=utf-8", { "content-disposition": 'attachment; filename="content-gaps.csv"' });
          if (path === "/admin/import") return send(200, importPage(rcfg, state));
          if (path === "/admin/export.json") return send(200, { articles: Object.values(state.articles), settings: state.settings }, "application/json", { "content-disposition": 'attachment; filename="help-center.json"' });
          if ((m = path.match(/^\/admin\/a\/(a\d+)$/)) && state.articles[m[1]]) return send(200, editPage(rcfg, state, state.articles[m[1]]));
          if ((m = path.match(/^\/admin\/preview\/(a\d+)$/)) && state.articles[m[1]]) return send(200, articlePage(rcfg, state, state.articles[m[1]], { preview: true }));
          return text(404, "not found");
        }
        if (req.method !== "POST") return text(405, "method not allowed");
        const origin = req.headers.origin; // CSRF: a cross-site page must not ride the browser's cached admin credentials.
        if (origin && origin !== "null" && new URL(origin).host !== req.headers.host && !(req.headers.authorization || "").startsWith("Bearer ")) return text(403, "cross-site request refused");
        const f = Object.fromEntries(new URLSearchParams(await readBody(req)));
        if (path === "/admin/settings") { try { updateSettings(state, f); persist(true); return redirect("/admin"); } catch (e) { return send(400, adminPage(rcfg, state, base, e.message)); } }
        if (path === "/admin/save") {
          try { const a = saveArticle(state, f, now()); persist(true); return redirect(`/admin/a/${a.id}`); } catch (e) { return send(400, editPage(rcfg, state, f.id ? state.articles[f.id] : null, e.message, { ...f, tags: f.tags })); }
        }
        if (path === "/admin/import") { const r = importMarkdown(state, f.text || "", now()); persist(true); return r.errors.length && !r.imported ? send(400, importPage(rcfg, state, r.errors.join("; "))) : send(200, adminPage(rcfg, state, base, r.errors.join("; "), `Imported ${r.imported} article${r.imported === 1 ? "" : "s"} as drafts unless marked published.`)); }
        if ((m = path.match(/^\/admin\/a\/(a\d+)\/delete$/))) { if (!removeArticle(state, m[1])) return text(404, "not found"); persist(true); return redirect("/admin"); }
      }
      return send(404, notFound(rcfg, state));
    } catch (e) {
      if (![400, 404, 413, 429].includes(e.status)) console.error("request failed:", e.message);
      const code = e instanceof SyntaxError ? 400 : e.status || 500;
      return text(code, code === 500 ? "error" : e.message);
    }
  };
}

function readJson(path, fallback) { try { return JSON.parse(fs.readFileSync(path, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; } }

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!env.ADMIN_KEY || env.ADMIN_KEY.length < 12) { console.error("ADMIN_KEY (12+ characters) is required"); process.exit(1); }
  const statePath = env.STATE || "state.json";
  const saved = readJson(statePath, null);
  const state = { ...newState(), ...(saved || {}), settings: { ...newState().settings, ...(saved?.settings || {}) } };
  if (!saved) {
    if (env.SITE_NAME) state.settings.name = env.SITE_NAME;
    if (env.CONTACT) try { updateSettings(state, { contact: env.CONTACT }); } catch (e) { console.error(e.message); process.exit(1); }
    saveArticle(state, { title: "Welcome to your help center", collection: "Getting started", status: "published", tags: "start, welcome", body: "# Welcome\n\nThis is your first article. Sign in at `/admin` to edit or delete it.\n\n## What to do next\n\n1. Write an article for each question customers ask most.\n2. Check **Content gaps** weekly: it lists what people searched for and did not find.\n3. Put a link to this site in your product and your support replies." }, Date.now());
  }
  const save = () => { fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(state), { mode: 0o600 }); fs.renameSync(`${statePath}.tmp`, statePath); };
  save();
  const cfg = { state, save, adminKey: env.ADMIN_KEY, sponsor: env.HIDE_SPONSOR_LINK !== "true", baseUrl: env.PUBLIC_URL, trustProxy: env.TRUST_PROXY === "true" };
  const h = handler(cfg);
  setInterval(() => cfg.flush?.(), 5000).unref();
  for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { cfg.flush?.(); process.exit(0); });
  http.createServer(h).listen(Number(env.PORT || 8080), () => console.log(`help-keeper on :${env.PORT || 8080} (${published(state).length} published articles)`));
}
export { contactHref };
