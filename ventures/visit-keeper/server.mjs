#!/usr/bin/env node
// Self-hosted, cookie-free web analytics. Zero dependencies, state in one JSON file.
//   ADMIN_KEY=... SITES=example.com,blog.example.com node server.mjs
// <script defer src="https://YOUR-HOST/t.js"></script>     the snippet customers paste in
// POST /e            beacon from the snippet (text/plain JSON; sites outside SITES are refused)
// GET  /             dashboard (HTTP Basic: any user, ADMIN_KEY as password)
// GET  /share/<site> read-only dashboard, only for sites listed in PUBLIC_SITES
// GET  /api/stats?site=&days=, /api/stats.csv   Bearer ADMIN_KEY
import http from "node:http";
import fs from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { newState, record, prune, summarize, toCsv, visitorHash, dayKey, siteOf } from "./stats.mjs";
import { dashboard, loginHelp } from "./render.mjs";
import { TRACKER } from "./tracker.mjs";

const env = process.env;
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

export const parseSites = (csv) => {
  const list = String(csv || "").split(",").map((s) => siteOf(s.trim())).filter(Boolean);
  if (!list.length) throw new Error("SITES must list at least one hostname, e.g. example.com");
  for (const s of list) if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(s)) throw new Error(`bad site: ${s}`);
  return [...new Set(list)];
};

// One small token bucket per client address, in memory only. Stops a loop in one page from filling the state.
function limiter(perMinute, now) {
  const buckets = new Map();
  return (key) => {
    const t = now();
    let b = buckets.get(key);
    if (!b || t - b.start >= 60_000) { b = { start: t, n: 0 }; buckets.set(key, b); if (buckets.size > 50_000) for (const [k, v] of buckets) if (t - v.start >= 60_000) buckets.delete(k); }
    return ++b.n <= perMinute;
  };
}

// cfg: {state, save, sites, publicSites?, adminKey, secret, title, trustProxy, countryHeader, now}
export function handler(cfg) {
  const now = cfg.now || Date.now;
  const allowed = new Set(cfg.sites), shared = new Set(cfg.publicSites || []);
  const ok = limiter(cfg.ratePerMinute || 120, now);
  const meta = { title: cfg.title || "Analytics", sites: cfg.sites };
  const clientIp = (req) => (cfg.trustProxy ? String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() : "") || req.socket.remoteAddress || "";
  const basicOk = (req) => { const m = /^Basic (.+)$/.exec(req.headers.authorization || ""); if (!m) return false; const s = Buffer.from(m[1], "base64").toString(); return safeEq(s.slice(s.indexOf(":") + 1), cfg.adminKey); };
  const bearerOk = (req) => safeEq(req.headers.authorization || "", `Bearer ${cfg.adminKey}`) || basicOk(req);
  return async (req, res) => {
    const url = new URL(req.url, "http://x");
    const send = (code, body, type = "application/json", extra = {}) => {
      res.writeHead(code, { "content-type": type, "x-content-type-options": "nosniff", ...extra });
      res.end(typeof body === "string" ? body : JSON.stringify(body, null, 2));
    };
    const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" };
    const page = (summary, share) => send(200, dashboard(summary, { ...meta, share }), "text/html; charset=utf-8", { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:", "cache-control": "private, no-store", "referrer-policy": "no-referrer" });
    const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get("days"), 10) || 30));
    try {
      if (url.pathname === "/healthz") return send(200, "ok\n", "text/plain");
      if (url.pathname === "/t.js" && req.method === "GET") return send(200, TRACKER, "text/javascript; charset=utf-8", { "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" });
      if (url.pathname === "/e") {
        if (req.method === "OPTIONS") return send(204, "", "text/plain", cors);
        if (req.method !== "POST") return send(405, "POST only\n", "text/plain", cors);
        if (req.headers.dnt === "1" || req.headers["sec-gpc"] === "1") return send(202, "", "text/plain", cors);
        const ip = clientIp(req);
        if (!ok(ip)) return send(429, "slow down\n", "text/plain", cors);
        let size = 0; const chunks = [];
        for await (const c of req) { size += c.length; if (size > 4096) return send(413, "too large\n", "text/plain", cors); chunks.push(c); }
        let b; try { b = JSON.parse(Buffer.concat(chunks).toString()); } catch { return send(400, "invalid JSON\n", "text/plain", cors); }
        let u; try { u = new URL(b.u); } catch { return send(400, "bad url\n", "text/plain", cors); }
        const site = siteOf(u.host);
        if (!allowed.has(site)) return send(403, "site not enabled\n", "text/plain", cors);
        const t = now(), ua = String(req.headers["user-agent"] || "");
        const r = record(cfg.state, { site, name: String(b.n || "pageview"), url: b.u, referrer: String(b.r || "").slice(0, 500), value: b.v, hash: visitorHash(cfg.secret, dayKey(t), site, ip, ua), ua, country: req.headers[cfg.countryHeader || "cf-ipcountry"], now: t });
        if (r === "counted") cfg.dirty = true;
        return send(202, "", "text/plain", cors); // the same answer for counted and dropped, so a bot learns nothing
      }
      if (url.pathname.startsWith("/share/") && req.method === "GET") {
        const site = siteOf(decodeURIComponent(url.pathname.slice(7)));
        if (!shared.has(site)) return send(404, "not found\n", "text/plain");
        return page(summarize(cfg.state, site, days, now()), true);
      }
      if (url.pathname === "/" && req.method === "GET") {
        if (!basicOk(req)) return send(401, loginHelp(meta.title), "text/html; charset=utf-8", { "www-authenticate": 'Basic realm="analytics", charset="UTF-8"' });
        const site = siteOf(url.searchParams.get("site") || cfg.sites[0]);
        if (!allowed.has(site)) return send(404, "unknown site\n", "text/plain");
        return page(summarize(cfg.state, site, days, now()), false);
      }
      if (url.pathname === "/api/stats" || url.pathname === "/api/stats.csv") {
        const site = siteOf(url.searchParams.get("site") || "");
        const isShared = shared.has(site);
        if (!isShared && !bearerOk(req)) return send(401, "admin key required\n", "text/plain", { "www-authenticate": 'Basic realm="analytics"' });
        if (!allowed.has(site)) return send(404, "unknown site\n", "text/plain");
        const s = summarize(cfg.state, site, days, now());
        return url.pathname.endsWith(".csv") ? send(200, toCsv(s), "text/csv; charset=utf-8", { "content-disposition": `attachment; filename="${site}-${days}d.csv"` }) : send(200, s);
      }
      return send(404, "not found\n", "text/plain");
    } catch (e) {
      console.error("request failed:", e.message);
      return send(500, "error\n", "text/plain");
    }
  };
}

const readState = (path) => { try { return JSON.parse(fs.readFileSync(path, "utf8")); } catch (e) { if (e.code === "ENOENT") return newState(); throw e; } };

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!env.ADMIN_KEY || env.ADMIN_KEY.length < 12) { console.error("missing env: ADMIN_KEY (at least 12 characters)"); process.exit(1); }
  let sites, publicSites = [];
  try { sites = parseSites(env.SITES); if (env.PUBLIC_SITES) publicSites = parseSites(env.PUBLIC_SITES); } catch (e) { console.error(e.message); process.exit(1); }
  for (const s of publicSites) if (!sites.includes(s)) { console.error(`PUBLIC_SITES lists ${s}, which is not in SITES`); process.exit(1); }
  const statePath = env.STATE || "state.json";
  const state = readState(statePath);
  const cfg = { state, sites, publicSites, adminKey: env.ADMIN_KEY, secret: env.SECRET || env.ADMIN_KEY, title: env.TITLE, trustProxy: env.TRUST_PROXY === "1", countryHeader: (env.COUNTRY_HEADER || "cf-ipcountry").toLowerCase(), ratePerMinute: Number(env.RATE_PER_MINUTE) || 120, dirty: false };
  const save = () => { prune(state, Date.now(), Number(env.RETENTION_DAYS || 730)); fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(state)); fs.renameSync(`${statePath}.tmp`, statePath); cfg.dirty = false; };
  setInterval(() => { if (cfg.dirty) try { save(); } catch (e) { console.error("save failed:", e.message); } }, Number(env.SAVE_EVERY_MS || 15000)).unref?.();
  const server = http.createServer(handler(cfg));
  const stop = () => { try { if (cfg.dirty) save(); } finally { process.exit(0); } };
  process.on("SIGTERM", stop); process.on("SIGINT", stop);
  server.listen(Number(env.PORT || 8080), () => console.log(`visit-keeper on :${env.PORT || 8080} for ${sites.join(", ")}`));
}
