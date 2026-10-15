#!/usr/bin/env node
// Self-hosted form backend. Zero dependencies, state in one JSON file.
//   ADMIN_KEY=... COMPANY_NAME=Acme node server.mjs
// Optional: ALERT_WEBHOOK_URL (Slack/Discord, https) pings on each real submission; RESEND_API_KEY + MAIL_FROM
// emails the address set on a form (DRY_RUN=false turns real email on).
import http from "node:http";
import fs from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { newState, normalize, score, createForm, addSubmission, recentFingerprints, markSpam, removeSubmission, removeForm, submissions, toCsv, notification } from "./forms.mjs";
import { adminPage, formPage, thanksPage } from "./render.mjs";

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

export function limiter(max, windowMs) {
  const hits = new Map();
  return (key, now) => {
    const w = Math.floor(now / windowMs), h = hits.get(key);
    if (!h || h.w !== w) { hits.set(key, { w, n: 1 }); if (hits.size > 10_000) hits.clear(); return true; }
    return ++h.n <= max;
  };
}

// cfg: {state, save, adminKey, company, sponsor, now, notify, sendEmail, dryRun, trustProxy, baseUrl, limits}
export function handler(cfg) {
  const now = cfg.now || Date.now;
  const lim = { submit: limiter(10, 60_000), read: limiter(300, 60_000), ...cfg.limits };
  const { state } = cfg;
  return async (req, res) => {
    const url = new URL(req.url, "http://x");
    const ip = (cfg.trustProxy && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket.remoteAddress || "?";
    const base = cfg.baseUrl || `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;
    const send = (code, body, type = "text/html; charset=utf-8", headers = {}) => {
      res.writeHead(code, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "same-origin", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; form-action 'self'", ...headers });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    const redirect = (to) => send(303, "", "text/plain", { location: to });
    const needAdmin = () => send(401, "admin key required\n", "text/plain", { "www-authenticate": 'Basic realm="admin"' });
    try {
      if (!lim.read(ip, now())) return send(429, "slow down\n", "text/plain");
      const path = url.pathname;
      const sub = path.match(/^\/f\/([\w]+)$/);

      if (sub && req.method === "OPTIONS") {
        const f = state.forms[sub[1]]; const o = req.headers.origin;
        if (!f || (f.origins.length && !f.origins.includes(o))) return send(403, "origin not allowed\n", "text/plain");
        return send(204, "", "text/plain", { "access-control-allow-origin": f.origins.length ? o : "*", "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type", "access-control-max-age": "600", vary: "origin" });
      }

      if (sub && req.method === "POST") {
        const f = state.forms[sub[1]];
        if (!f) return send(404, "no such form\n", "text/plain");
        const origin = req.headers.origin;
        if (f.origins.length && origin && origin !== "null" && !f.origins.includes(origin)) return send(403, "this form does not accept posts from that site\n", "text/plain");
        const cors = { "access-control-allow-origin": f.origins.length && origin ? origin : "*", vary: "origin" };
        if (!lim.submit(`${ip}:${f.id}`, now())) return send(429, "too many submissions; try again in a minute\n", "text/plain", cors);
        const raw = await readBody(req);
        const isJson = (req.headers["content-type"] || "").includes("json");
        const input = isJson ? JSON.parse(raw || "{}") : Object.fromEntries(new URLSearchParams(raw));
        if (!input || typeof input !== "object" || Array.isArray(input)) return send(400, "expected an object\n", "text/plain", cors);
        const data = normalize(input);
        const verdict = score(data, { honeypot: input._gotcha, loadedAt: input._ts, now: now(), recent: recentFingerprints(state, f.id, now()) });
        const s = addSubmission(state, f.id, data, verdict, now());
        cfg.save();
        if (!s.spam) {
          cfg.notify?.(`New ${f.name} submission: ${Object.values(data).join(" | ").slice(0, 300)}`);
          if (f.notifyEmail) {
            const msg = { to: f.notifyEmail, ...notification(f, s, base) };
            if (cfg.dryRun) console.log(`[dry run] would email ${f.notifyEmail}: ${msg.subject}`);
            else cfg.sendEmail?.(msg).catch((e) => console.error("email failed:", e.message));
          }
        }
        // Spam gets the same answer as a real submission, so bots learn nothing.
        if (isJson || (req.headers.accept || "").includes("application/json")) return send(200, { ok: true }, "application/json", cors);
        return f.redirect ? send(303, "", "text/plain", { ...cors, location: f.redirect }) : send(200, thanksPage(cfg), "text/html; charset=utf-8", cors);
      }

      if (path === "/healthz") return send(200, "ok\n", "text/plain");
      if (path === "/" ) return send(200, "form-inbox: POST to /f/<form id>. Admin at /admin.\n", "text/plain");

      if (path.startsWith("/admin")) {
        if (!adminOk(req, cfg.adminKey)) return needAdmin();
        let m;
        if (req.method === "GET") {
          if (path === "/admin") return send(200, adminPage(cfg, state, base));
          if ((m = path.match(/^\/admin\/f\/(\w+)\.csv$/)) && state.forms[m[1]]) {
            const f = state.forms[m[1]];
            return send(200, toCsv(submissions(state, f.id).reverse()), "text/csv; charset=utf-8", { "content-disposition": `attachment; filename="${f.id}.csv"` });
          }
          if ((m = path.match(/^\/admin\/f\/(\w+)$/)) && state.forms[m[1]]) return send(200, formPage(cfg, state, state.forms[m[1]], base, { showSpam: url.searchParams.get("spam") === "1" }));
          return send(404, "not found\n", "text/plain");
        }
        if (req.method !== "POST") return send(405, "method not allowed\n", "text/plain");
        // CSRF: a cross-site page must not ride the browser's cached admin credentials.
        const origin = req.headers.origin;
        if (origin && origin !== "null" && new URL(origin).host !== req.headers.host && !(req.headers.authorization || "").startsWith("Bearer ")) return send(403, "cross-site request refused\n", "text/plain");
        const f = Object.fromEntries(new URLSearchParams(await readBody(req)));
        if (path === "/admin/forms") { const nf = createForm(state, f, now()); cfg.save(); return redirect(`/admin/f/${nf.id}`); }
        if ((m = path.match(/^\/admin\/s\/(s\d+)\/(spam|ham)$/))) {
          const s = markSpam(state, m[1], m[2] === "spam"); if (!s) return send(404, "not found\n", "text/plain");
          cfg.save(); return redirect(`/admin/f/${s.form}${m[2] === "ham" ? "?spam=1" : ""}`);
        }
        if ((m = path.match(/^\/admin\/s\/(s\d+)\/delete$/))) {
          const s = state.subs.find((x) => x.id === m[1]); if (!s || !removeSubmission(state, m[1])) return send(404, "not found\n", "text/plain");
          cfg.save(); return redirect(`/admin/f/${s.form}`);
        }
        if ((m = path.match(/^\/admin\/f\/(\w+)\/delete$/))) { if (!removeForm(state, m[1])) return send(404, "not found\n", "text/plain"); cfg.save(); return redirect("/admin"); }
      }
      return send(404, "not found\n", "text/plain");
    } catch (e) {
      if (![400, 404, 413, 429].includes(e.status)) console.error("request failed:", e.message);
      const code = e instanceof SyntaxError ? 400 : e.status || 500;
      return send(code, `${code === 500 ? "error" : e.message}\n`, "text/plain");
    }
  };
}

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
    state, save, adminKey: env.ADMIN_KEY, company: env.COMPANY_NAME || "Forms", sponsor: env.HIDE_SPONSOR_LINK !== "true",
    baseUrl: env.PUBLIC_URL, trustProxy: env.TRUST_PROXY === "true",
    notify: env.ALERT_WEBHOOK_URL ? webhook(env.ALERT_WEBHOOK_URL) : null, sendEmail: sendResend, dryRun,
  };
  http.createServer(handler(cfg)).listen(Number(env.PORT || 8080), () => console.log(`form-inbox on :${env.PORT || 8080} (${Object.keys(state.forms).length} forms)`));
}
