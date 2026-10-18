#!/usr/bin/env node
// Self-hosted testimonial collection + embeddable wall. Zero dependencies.
//   ADMIN_KEY=... PUBLIC_URL=https://proof.example.com COMPANY_NAME=Acme node server.mjs
import http from "node:http";
import fs from "node:fs";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { newState, createForm, submit, setStatus, remove, publicWall, stats, toCsv, SLUG_RE } from "./store.mjs";
import { renderForm, renderThanks, renderAdmin } from "./page.mjs";
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

// cfg: {state, save, adminKey, ipSecret, publicUrl, company, color, notify, trustProxy, now}
export function handler(cfg) {
  const now = cfg.now || Date.now;
  const company = cfg.company || "Our team";
  const ipKey = (req) => {
    const ip = (cfg.trustProxy && String(req.headers["x-forwarded-for"] || "").split(",").pop().trim()) || req.socket.remoteAddress || "?";
    return createHmac("sha256", cfg.ipSecret).update(ip).digest("base64url").slice(0, 16); // a daily counter key, not stored with the testimonial
  };
  return async (req, res) => {
    const url = new URL(req.url, "http://x");
    const send = (code, body, type = "application/json", extra = {}) => {
      res.writeHead(code, { "content-type": type, "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", ...extra });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    const fail = (code, error) => send(code, { error });
    const html = (code, body, csp = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'") => send(code, body, "text/html; charset=utf-8", { "content-security-policy": csp });
    try {
      if (url.pathname === "/healthz") return send(200, "ok\n", "text/plain");
      if (url.pathname === "/embed.js" && req.method === "GET") return send(200, widgetSource(), "text/javascript; charset=utf-8", { "cache-control": "public, max-age=3600" });
      if (url.pathname === "/wall.json" && req.method === "GET") {
        const f = url.searchParams.get("form") || "";
        const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit")) || 12));
        return send(200, publicWall(cfg.state, f, limit), "application/json", { "access-control-allow-origin": "*", "cache-control": "public, max-age=60" });
      }
      if (url.pathname === "/admin" && req.method === "GET") return html(200, renderAdmin({ company, color: cfg.color }), "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'");

      const t = url.pathname.match(/^\/t\/([a-z0-9-]+)$/);
      if (t) {
        const form = cfg.state.forms[t[1]];
        if (!form) return send(404, "not found\n", "text/plain");
        if (req.method === "GET") return html(200, renderForm({ form, company, color: cfg.color }));
        if (req.method === "POST") {
          const params = Object.fromEntries(new URLSearchParams(await readBody(req)));
          const out = submit(cfg.state, form, params, { ipKey: ipKey(req), now: now(), id: randomBytes(6).toString("hex") });
          if (out.silent) return html(200, renderThanks({ company, color: cfg.color })); // bots and double-clicks look the same as success
          if (out.error) return html(400, renderForm({ form, company, color: cfg.color, error: out.error }));
          cfg.save();
          if (cfg.notify) cfg.notify({ id: out.item.id, name: out.item.name, form: form.slug }).catch((e) => console.error("notify failed:", e.message));
          return html(200, renderThanks({ company, color: cfg.color }));
        }
      }

      if (url.pathname.startsWith("/v1/")) {
        if (!bearerOk(req, cfg.adminKey)) return fail(401, "admin key required");
        if (req.method === "GET" && url.pathname === "/v1/summary") return send(200, stats(cfg.state));
        if (req.method === "GET" && url.pathname === "/v1/testimonials") return send(200, cfg.state.items.slice(-500));
        if (req.method === "GET" && url.pathname === "/v1/testimonials.csv") return send(200, toCsv(cfg.state.items), "text/csv; charset=utf-8", { "content-disposition": 'attachment; filename="testimonials.csv"' });
        if (url.pathname === "/v1/forms") {
          if (req.method === "GET") return send(200, Object.values(cfg.state.forms).map((f) => ({ ...f, collectUrl: `${cfg.publicUrl}/t/${f.slug}` })));
          if (req.method === "POST") {
            const out = createForm(cfg.state, JSON.parse((await readBody(req)) || "{}"), now());
            if (out.error) return fail(400, out.error);
            cfg.save();
            return send(201, { ...out.form, collectUrl: `${cfg.publicUrl}/t/${out.form.slug}`, embed: `<script src="${cfg.publicUrl}/embed.js" data-form="${out.form.slug}" defer></script>` });
          }
        }
        const st = url.pathname.match(/^\/v1\/testimonials\/([a-f0-9]+)(?:\/(status))?$/);
        if (st && req.method === "POST" && st[2]) {
          const out = setStatus(cfg.state, st[1], JSON.parse((await readBody(req)) || "{}").status);
          if (out.error) return fail(out.error.startsWith("no such") ? 404 : 400, out.error);
          cfg.save(); return send(200, out.item);
        }
        if (st && req.method === "DELETE" && !st[2]) {
          const out = remove(cfg.state, st[1]);
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
  if (!Object.keys(state.forms).length) createForm(state, { slug: "default" }, Date.now());
  const notify = env.NOTIFY_WEBHOOK ? async (m) => {
    const r = await fetch(env.NOTIFY_WEBHOOK, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: `New testimonial from ${m.name} awaiting approval: ${env.PUBLIC_URL}/admin` }) });
    if (!r.ok) throw new Error(`webhook ${r.status}`);
  } : null;
  const cfg = { state, save, adminKey: env.ADMIN_KEY, ipSecret: env.IP_SECRET || randomBytes(16).toString("hex"), publicUrl: env.PUBLIC_URL.replace(/\/$/, ""), company: env.COMPANY_NAME, color: env.BRAND_COLOR, notify, trustProxy: env.TRUST_PROXY === "true" };
  http.createServer(handler(cfg)).listen(Number(env.PORT || 8080), () => console.log(`testimonial-keeper on :${env.PORT || 8080}`));
}
