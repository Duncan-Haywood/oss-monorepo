#!/usr/bin/env node
// Self-hosted e-signature requests with a hash-chained audit trail. Zero dependencies.
//   ADMIN_KEY=... PUBLIC_URL=https://sign.example.com COMPANY_NAME=Acme node server.mjs
import http from "node:http";
import fs from "node:fs";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { newState, createRequest, view, sign, decline, voidRequest, verify, stats, toCsv, summarize, status } from "./store.mjs";
import { renderSign, renderMessage, renderCertificate, renderAdmin } from "./page.mjs";

export { newState };
const env = process.env;
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

const readBody = (req, max = 60_000) => new Promise((resolve, reject) => {
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
    return createHmac("sha256", cfg.ipSecret).update(ip).digest("base64url").slice(0, 16);
  };
  const signUrl = (r) => `${cfg.publicUrl}/s/${r.id}`, certUrl = (r) => `${cfg.publicUrl}/c/${r.id}`;
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
      if (url.pathname === "/admin" && req.method === "GET") return html(200, renderAdmin({ company, color: cfg.color }), "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'");

      const s = url.pathname.match(/^\/s\/([A-Za-z0-9_-]+)$/);
      if (s) {
        const r = TOKEN_RE.test(s[1]) && cfg.state.requests[s[1]];
        if (!r) return send(404, "not found\n", "text/plain");
        const st = status(r, now());
        if (req.method === "GET") {
          if (st === "signed") return html(200, renderMessage({ c: cfg.color, title: "Already signed", text: "This document has been signed. The sender has the certificate." }));
          if (st !== "pending") return html(200, renderMessage({ c: cfg.color, title: `This request is ${st}`, text: "Please ask the sender for a new link." }));
          view(r, { now: now() }); cfg.save();
          return html(200, renderSign({ r, company, color: cfg.color, token: r.id }));
        }
        if (req.method === "POST") {
          const params = Object.fromEntries(new URLSearchParams(await readBody(req)));
          if (params.action === "decline") {
            const out = decline(r, params, { now: now() });
            if (out.error) return html(400, renderMessage({ c: cfg.color, title: "Not possible", text: out.error }));
            cfg.save(); if (cfg.notify) cfg.notify({ title: r.title, event: "declined" }).catch((e) => console.error("notify failed:", e.message));
            return html(200, renderMessage({ c: cfg.color, title: "Declined", text: "Your response was recorded. Nothing was signed." }));
          }
          const out = sign(cfg.state, r, params, { now: now(), ipKey: ipKey(req) });
          if (out.silent) return html(200, renderMessage({ c: cfg.color, title: "Thank you", text: "Done." }));
          if (out.error) return html(400, st === "pending" ? renderSign({ r, company, color: cfg.color, token: r.id, error: out.error }) : renderMessage({ c: cfg.color, title: "Not possible", text: out.error }));
          cfg.save(); if (cfg.notify) cfg.notify({ title: r.title, event: "signed", name: r.signature.name }).catch((e) => console.error("notify failed:", e.message));
          return html(200, renderMessage({ c: cfg.color, title: "Signed", text: `Thank you, ${r.signature.name}. Your signature was recorded. The certificate link is at ${certUrl(r)}` }));
        }
      }

      const c = url.pathname.match(/^\/c\/([A-Za-z0-9_-]+?)(\.json)?$/);
      if (c && req.method === "GET") {
        const r = TOKEN_RE.test(c[1]) && cfg.state.requests[c[1]];
        if (!r || !r.signature) return send(404, "not found\n", "text/plain");
        const v = verify(r);
        if (c[2]) return send(200, { title: r.title, signedBy: r.signature.name, signedAt: new Date(r.signature.at).toISOString(), docHash: r.docHash, integrity: v, events: r.events });
        return html(200, renderCertificate({ r, v, company, color: cfg.color, certUrl: certUrl(r) }));
      }

      if (url.pathname.startsWith("/v1/")) {
        if (!bearerOk(req, cfg.adminKey)) return fail(401, "admin key required");
        if (req.method === "GET" && url.pathname === "/v1/summary") return send(200, stats(cfg.state, now()));
        if (req.method === "GET" && url.pathname === "/v1/requests.csv") return send(200, toCsv(cfg.state, now()), "text/csv; charset=utf-8", { "content-disposition": 'attachment; filename="signatures.csv"' });
        if (url.pathname === "/v1/requests") {
          if (req.method === "GET") return send(200, Object.values(cfg.state.requests).slice(-500).reverse().map((r) => ({ ...summarize(r, now()), signUrl: signUrl(r), certUrl: r.signature ? certUrl(r) : null })));
          if (req.method === "POST") {
            const out = createRequest(cfg.state, JSON.parse((await readBody(req)) || "{}"), { token: randomBytes(16).toString("base64url"), now: now() });
            if (out.error) return fail(400, out.error);
            cfg.save();
            return send(201, { ...summarize(out.request, now()), signUrl: signUrl(out.request) });
          }
        }
        const v = url.pathname.match(/^\/v1\/requests\/([A-Za-z0-9_-]+)\/void$/);
        if (v && req.method === "POST") {
          const r = TOKEN_RE.test(v[1]) && cfg.state.requests[v[1]];
          if (!r) return fail(404, "no such request");
          const out = voidRequest(r, { now: now() });
          if (out.error) return fail(409, out.error);
          cfg.save(); return send(200, summarize(r, now()));
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
  const notify = env.NOTIFY_WEBHOOK ? async (m) => {
    const r = await fetch(env.NOTIFY_WEBHOOK, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: `"${m.title}" was ${m.event}${m.name ? ` by ${m.name}` : ""}: ${env.PUBLIC_URL}/admin` }) });
    if (!r.ok) throw new Error(`webhook ${r.status}`);
  } : null;
  const cfg = { state, save, adminKey: env.ADMIN_KEY, ipSecret: env.IP_SECRET || randomBytes(16).toString("hex"), publicUrl: env.PUBLIC_URL.replace(/\/$/, ""), company: env.COMPANY_NAME, color: env.BRAND_COLOR, notify, trustProxy: env.TRUST_PROXY === "true" };
  http.createServer(handler(cfg)).listen(Number(env.PORT || 8080), () => console.log(`sign-keeper on :${env.PORT || 8080}`));
}
