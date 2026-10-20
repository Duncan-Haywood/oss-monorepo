#!/usr/bin/env node
// Self-hosted feedback board, roadmap and changelog. Zero dependencies, state in one JSON file.
//   ADMIN_KEY=... COMPANY_NAME=Acme node server.mjs
// Optional: ALERT_WEBHOOK_URL (Slack/Discord, https) pings on each new idea; RESEND_API_KEY + MAIL_FROM
// emails the author when you mark their idea shipped (DRY_RUN=false turns real email on).
import http from "node:http";
import fs from "node:fs";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { newState, addPost, toggleVote, addComment, setStatus, merge, removePost, list, similarTo, publish, summary, visible, STATUSES } from "./board.mjs";
import { boardPage, postPage, roadmapPage, changelogPage, adminPage, rss, widgetJs } from "./render.mjs";

const env = process.env;

const readBody = (req, max = 100_000) => new Promise((resolve, reject) => {
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

// Fixed-window limiter, one instance per action.
export function limiter(max, windowMs) {
  const hits = new Map();
  return (key, now) => {
    const w = Math.floor(now / windowMs), h = hits.get(key);
    if (!h || h.w !== w) { hits.set(key, { w, n: 1 }); if (hits.size > 10_000) hits.clear(); return true; }
    return ++h.n <= max;
  };
}

const parseCookies = (h) => Object.fromEntries(String(h || "").split(/;\s*/).filter(Boolean).map((c) => { const i = c.indexOf("="); return [c.slice(0, i), c.slice(i + 1)]; }));

// cfg: {state, save, adminKey, company, tagline, accent, homepage, sponsor, now, notify, sendEmail, dryRun, trustProxy, secure, limits}
export function handler(cfg) {
  const now = cfg.now || Date.now;
  const lim = { post: limiter(5, 3_600_000), vote: limiter(60, 60_000), comment: limiter(10, 60_000), read: limiter(300, 60_000), ...cfg.limits };
  const { state } = cfg;
  return async (req, res) => {
    const url = new URL(req.url, "http://x");
    const ip = (cfg.trustProxy && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket.remoteAddress || "?";
    const base = cfg.baseUrl || `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;
    const cookies = parseCookies(req.headers.cookie);
    let voterId = /^[\w-]{20,64}$/.test(cookies.fb_voter || "") ? cookies.fb_voter : null;
    const isNewVoter = !voterId;
    if (!voterId) voterId = randomBytes(18).toString("base64url");
    const admin = adminOk(req, cfg.adminKey);
    const extra = {};
    const send = (code, body, type = "text/html; charset=utf-8", headers = {}) => {
      const h = { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "same-origin", "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'none'; form-action 'self'", ...headers, ...extra };
      if (isNewVoter) h["set-cookie"] = `fb_voter=${voterId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${cfg.secure ? "; Secure" : ""}`;
      res.writeHead(code, h); res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    const json = (code, body, headers = {}) => send(code, body, "application/json", { "access-control-allow-origin": "*", ...headers });
    const redirect = (to) => send(303, "", "text/plain", { location: to });
    try {
      if (!lim.read(ip, now())) return send(429, "slow down\n", "text/plain");
      const path = url.pathname, post = req.method === "POST";

      if (path === "/healthz") return send(200, "ok\n", "text/plain");
      if (req.method === "GET" || req.method === "HEAD") {
        if (path === "/") return send(200, boardPage(cfg, state, { voterId, status: STATUSES.includes(url.searchParams.get("status")) ? url.searchParams.get("status") : "", sort: url.searchParams.get("sort"), q: url.searchParams.get("q") }));
        if (path === "/roadmap") return send(200, roadmapPage(cfg, state));
        if (path === "/changelog") return send(200, changelogPage(cfg, state));
        if (path === "/changelog.rss") return send(200, rss(cfg, state, base), "application/rss+xml; charset=utf-8");
        if (path === "/widget.js") return send(200, widgetJs(base), "text/javascript; charset=utf-8", { "cache-control": "public, max-age=3600" });
        if (path === "/api/changelog") return json(200, state.changelog.slice(0, 50));
        if (path === "/api/similar") return json(200, similarTo(state, url.searchParams.get("q") || "").map((r) => ({ id: r.id, title: r.post.title, votes: r.post.votes.length, score: r.score })));
        if (path === "/api/posts") return json(200, list(state, { status: url.searchParams.get("status") || undefined }).map(pub));
        if (path === "/admin") { if (!admin) return send(401, "admin key required\n", "text/plain", { "www-authenticate": 'Basic realm="admin"' }); return send(200, adminPage(cfg, state, summary(state))); }
        if (path === "/api/summary") { if (!admin) return json(401, { error: "admin key required" }); return json(200, summary(state)); }
        const m = path.match(/^\/p\/(p\d+)$/);
        if (m) { const p = state.posts[m[1]]; if (!p) return send(404, "not found\n", "text/plain"); if (p.mergedInto) return redirect(`/p/${p.mergedInto}`); return send(200, postPage(cfg, state, p, { voterId, admin })); }
        return send(404, "not found\n", "text/plain");
      }
      if (req.method !== "POST") return send(405, "method not allowed\n", "text/plain");

      // CSRF: a cross-site form must not ride the browser's cached admin credentials.
      const origin = req.headers.origin;
      if (origin && origin !== "null" && new URL(origin).host !== req.headers.host && !(req.headers.authorization || "").startsWith("Bearer ")) return send(403, "cross-site request refused\n", "text/plain");

      const raw = await readBody(req);
      const isJson = (req.headers["content-type"] || "").includes("json");
      const f = isJson ? JSON.parse(raw || "{}") : Object.fromEntries(new URLSearchParams(raw));
      const done = (to, body) => (isJson ? json(200, body) : redirect(to));
      let m;

      if (path === "/posts") {
        if (f.website) return done("/", { ok: true }); // honeypot: pretend success
        if (!lim.post(ip, now())) return send(429, "too many ideas from this address; try again later\n", "text/plain");
        const p = addPost(state, { ...f, voterId }, now()); cfg.save();
        cfg.notify?.(`New idea on ${cfg.company}: "${p.title}" ${base}/p/${p.id}`);
        return done(`/p/${p.id}`, { ok: true, id: p.id });
      }
      if ((m = path.match(/^\/p\/(p\d+)\/vote$/))) {
        if (!lim.vote(ip, now())) return send(429, "slow down\n", "text/plain");
        const r = toggleVote(state, m[1], voterId); cfg.save();
        return done(req.headers.referer && new URL(req.headers.referer).host === req.headers.host ? new URL(req.headers.referer).pathname + new URL(req.headers.referer).search : `/p/${m[1]}`, { ok: true, ...r });
      }
      if ((m = path.match(/^\/p\/(p\d+)\/comments$/))) {
        if (f.website) return done(`/p/${m[1]}`, { ok: true });
        if (!lim.comment(ip, now())) return send(429, "slow down\n", "text/plain");
        addComment(state, m[1], { text: f.text, author: f.author, admin }, now()); cfg.save();
        return done(`/p/${m[1]}`, { ok: true });
      }

      // everything below is the team's
      if (!admin) return send(401, "admin key required\n", "text/plain", { "www-authenticate": 'Basic realm="admin"' });
      if ((m = path.match(/^\/admin\/p\/(p\d+)\/status$/))) {
        let id = m[1];
        if (f.mergeInto) id = merge(state, id, String(f.mergeInto).trim()).id;
        else {
          const before = state.posts[id]?.status, p = setStatus(state, id, f.status, now());
          if (before !== "shipped" && p.status === "shipped" && p.email && !p.notified) {
            p.notified = true;
            const msg = { to: p.email, subject: `Shipped: ${p.title}`, text: `Good news: "${p.title}", which you suggested on ${cfg.company}, has shipped.\n\n${base}/changelog\n` };
            if (cfg.dryRun) console.log(`[dry run] would email ${p.email}: ${msg.subject}`);
            else cfg.sendEmail?.(msg).catch((e) => console.error("email failed:", e.message));
          }
        }
        cfg.save();
        return done(`/p/${id}`, { ok: true, id });
      }
      if ((m = path.match(/^\/admin\/p\/(p\d+)\/delete$/))) { if (!removePost(state, m[1])) return send(404, "not found\n", "text/plain"); cfg.save(); return done("/", { ok: true }); }
      if (path === "/admin/changelog") {
        const tags = Array.isArray(f.tags) ? f.tags : String(f.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
        publish(state, { ...f, tags }, now()); cfg.save();
        return done("/changelog", { ok: true });
      }
      return send(404, "not found\n", "text/plain");
    } catch (e) {
      if (e.status !== 400 && e.status !== 404 && e.status !== 413 && e.status !== 429) console.error("request failed:", e.message);
      const code = e instanceof SyntaxError ? 400 : e.status || 500;
      return send(code, `${code === 500 ? "error" : e.message}\n`, "text/plain");
    }
  };
}

const pub = (p) => ({ id: p.id, title: p.title, body: p.body, status: p.status, votes: p.votes.length, comments: p.comments.length, created: new Date(p.created).toISOString() });

function readJson(path, fallback) {
  try { return JSON.parse(fs.readFileSync(path, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; }
}

const webhook = (url) => async (text) => {
  try { const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, content: text }) }); if (!r.ok) console.error(`webhook ${r.status}`); } catch (e) { console.error("webhook failed:", e.message); }
};

async function sendResend(msg) {
  const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ from: env.MAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text }) });
  if (!res.ok) throw new Error(`resend ${res.status}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!env.ADMIN_KEY || env.ADMIN_KEY.length < 12) { console.error("ADMIN_KEY (12+ characters) is required"); process.exit(1); }
  if (env.ALERT_WEBHOOK_URL && !/^https:\/\//.test(env.ALERT_WEBHOOK_URL)) { console.error("ALERT_WEBHOOK_URL must be https"); process.exit(1); }
  const dryRun = env.DRY_RUN !== "false";
  if (!dryRun && (!env.RESEND_API_KEY || !env.MAIL_FROM)) { console.error("DRY_RUN=false needs RESEND_API_KEY and MAIL_FROM"); process.exit(1); }
  const statePath = env.STATE || "state.json";
  const state = { ...newState(), ...readJson(statePath, {}) };
  const save = () => { fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(state), { mode: 0o600 }); fs.renameSync(`${statePath}.tmp`, statePath); };
  save();
  const cfg = {
    state, save, adminKey: env.ADMIN_KEY, company: env.COMPANY_NAME || "Feedback", tagline: env.TAGLINE || "What should we build next?", accent: env.ACCENT_COLOR,
    homepage: env.HOMEPAGE || "https://github.com/Duncan-Haywood/fp-monorepo/tree/main/ventures/feedback-board", sponsor: env.HIDE_SPONSOR_LINK !== "true",
    baseUrl: env.PUBLIC_URL, trustProxy: env.TRUST_PROXY === "true", secure: env.PUBLIC_URL ? env.PUBLIC_URL.startsWith("https:") : env.TRUST_PROXY === "true",
    notify: env.ALERT_WEBHOOK_URL ? webhook(env.ALERT_WEBHOOK_URL) : null, sendEmail: sendResend, dryRun,
  };
  http.createServer(handler(cfg)).listen(Number(env.PORT || 8080), () => console.log(`feedback-board on :${env.PORT || 8080} (${visible(state).length} ideas)`));
}
