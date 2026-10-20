#!/usr/bin/env node
// Self-hosted surveys and NPS. Zero dependencies, state in one JSON file.
//   ADMIN_KEY=... node server.mjs      then open /admin
import http from "node:http";
import fs from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { newState, saveSurvey, removeSurvey, bySlug, validateAnswers, addResponse, responsesFor, toCsv, bucket } from "./survey.mjs";
import { surveyPage, thanksPage, notFound, adminPage, editPage, resultsPage } from "./render.mjs";

const env = process.env;
const readBody = (req, max = 100_000) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on("data", (c) => { size += c.length; if (size > max) { reject(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
});
// Repeated keys (checkboxes) become arrays.
export function parseForm(body) {
  const out = {};
  for (const [k, v] of new URLSearchParams(body)) out[k] = k in out ? [].concat(out[k], v) : v;
  return out;
}
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

// cfg: {state, save, adminKey, sponsor, now, trustProxy, baseUrl, embedOrigins, alert, limits}
export function handler(cfg) {
  const now = cfg.now || Date.now;
  const lim = { read: limiter(300, 60_000), submit: limiter(10, 60_000), ...cfg.limits };
  const { state } = cfg;
  let dirty = false, lastSave = 0;
  const persist = (force = false) => { dirty = true; if (force || now() - lastSave > 3000) { cfg.save(); lastSave = now(); dirty = false; } };
  cfg.flush = () => { if (dirty) { cfg.save(); dirty = false; } };
  return async (req, res) => {
    const url = new URL(req.url, "http://x");
    const ip = (cfg.trustProxy && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket.remoteAddress || "?";
    const base = cfg.baseUrl || `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;
    const embed = (cfg.embedOrigins || []).join(" ");
    const send = (code, body, type = "text/html; charset=utf-8", headers = {}, frames = "'none'") => {
      res.writeHead(code, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "same-origin", "content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; frame-ancestors ${frames}; form-action 'self'`, ...headers });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    const redirect = (to) => send(303, "", "text/plain", { location: to });
    const text = (code, msg) => send(code, `${msg}\n`, "text/plain");
    try {
      if (!lim.read(ip, now())) return text(429, "slow down");
      const path = url.pathname; let m;
      if (path === "/healthz") return text(200, "ok");
      if (path === "/robots.txt") return send(200, "User-agent: *\nDisallow: /\n", "text/plain");
      if (path === "/" && req.method === "GET") return text(200, "Survey Keeper. Survey links look like /s/<name>; the admin is at /admin.");
      if ((m = path.match(/^\/s\/([a-z0-9-]+)$/))) {
        const s = bySlug(state, m[1]); if (!s) return send(404, notFound());
        const frames = embed || "'none'";
        if (req.method === "GET") return send(200, surveyPage(cfg, s, { ref: url.searchParams.get("ref") || "" }), undefined, {}, frames);
        if (req.method === "POST") {
          if (!lim.submit(ip, now())) return text(429, "too many submissions; try again in a minute");
          const f = parseForm(await readBody(req));
          if (f.website) return send(200, thanksPage(cfg, s), undefined, {}, frames); // honeypot: look successful, store nothing
          if (s.status !== "open") return send(200, surveyPage(cfg, s), undefined, {}, frames);
          const { answers, errors } = validateAnswers(s, f);
          if (Object.keys(errors).length) return send(400, surveyPage(cfg, s, { errors, vals: f, ref: f.ref }), undefined, {}, frames);
          if (!Object.keys(answers).length) return send(400, surveyPage(cfg, s, { errors: { [s.questions[0].id]: "Please answer at least one question" }, vals: f, ref: f.ref }), undefined, {}, frames);
          const r = addResponse(state, s, answers, { now: now(), ref: f.ref }); persist();
          const nq = s.questions.find((q) => q.type === "nps");
          if (cfg.alert && nq && answers[nq.id] != null && bucket(answers[nq.id]) === "detractor") {
            const comment = s.questions.filter((q) => q.type === "text" && answers[q.id]).map((q) => answers[q.id])[0];
            Promise.resolve(cfg.alert({ text: `Survey Keeper: a detractor (${answers[nq.id]}/10) answered "${s.title}"${r.ref ? ` via ${r.ref}` : ""}${comment ? `: ${comment.slice(0, 300)}` : ""}` })).catch(() => {});
          }
          return send(200, thanksPage(cfg, s), undefined, {}, frames);
        }
        return text(405, "method not allowed");
      }
      if (path.startsWith("/admin")) {
        if (!adminOk(req, cfg.adminKey)) return send(401, "admin key required\n", "text/plain", { "www-authenticate": 'Basic realm="admin"' });
        if (req.method === "GET") {
          if (path === "/admin") return send(200, adminPage(cfg, state, base));
          if (path === "/admin/new") return send(200, editPage(cfg, state, null));
          if (path === "/admin/export.json") return send(200, { surveys: Object.values(state.surveys), responses: state.responses }, "application/json", { "content-disposition": 'attachment; filename="survey-keeper.json"' });
          if ((m = path.match(/^\/admin\/s\/(s\d+)(\/results|\/responses\.csv)?$/)) && state.surveys[m[1]]) {
            const s = state.surveys[m[1]];
            if (m[2] === "/results") return send(200, resultsPage(cfg, state, s, base));
            if (m[2]) return send(200, toCsv(s, responsesFor(state, s.id)), "text/csv; charset=utf-8", { "content-disposition": `attachment; filename="${s.slug}.csv"` });
            return send(200, editPage(cfg, state, s));
          }
          return text(404, "not found");
        }
        if (req.method !== "POST") return text(405, "method not allowed");
        const origin = req.headers.origin; // CSRF: a cross-site page must not ride the browser's cached admin credentials.
        if (origin && origin !== "null" && new URL(origin).host !== req.headers.host && !(req.headers.authorization || "").startsWith("Bearer ")) return text(403, "cross-site request refused");
        const f = parseForm(await readBody(req));
        if (path === "/admin/save") {
          try { const s = saveSurvey(state, f, now()); persist(true); return redirect(`/admin/s/${s.id}/results`); } catch (e) { return send(400, editPage(cfg, state, f.id ? state.surveys[f.id] : null, e.message, f)); }
        }
        if ((m = path.match(/^\/admin\/s\/(s\d+)\/delete$/))) { if (!removeSurvey(state, m[1])) return text(404, "not found"); persist(true); return redirect("/admin"); }
      }
      return send(404, notFound());
    } catch (e) {
      if (![400, 404, 413, 429].includes(e.status)) console.error("request failed:", e.message);
      return text(e instanceof SyntaxError ? 400 : e.status || 500, e.status ? e.message : "error");
    }
  };
}

function readJson(path, fallback) { try { return JSON.parse(fs.readFileSync(path, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; } }

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!env.ADMIN_KEY || env.ADMIN_KEY.length < 12) { console.error("ADMIN_KEY (12+ characters) is required"); process.exit(1); }
  const statePath = env.STATE || "state.json";
  const saved = readJson(statePath, null);
  const state = { ...newState(), ...(saved || {}) };
  if (!saved) saveSurvey(state, { title: "Customer pulse", intro: "Two minutes, anonymous.", questions: "nps*: How likely are you to recommend us to a friend or colleague?\ntext: What is the main reason for your score?" }, Date.now());
  const save = () => { fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(state), { mode: 0o600 }); fs.renameSync(`${statePath}.tmp`, statePath); };
  save();
  const hook = env.ALERT_WEBHOOK_URL;
  if (hook && !/^https:\/\//.test(hook)) { console.error("ALERT_WEBHOOK_URL must be https"); process.exit(1); }
  const alert = hook ? (body) => fetch(hook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) }) : null;
  const cfg = { state, save, alert, adminKey: env.ADMIN_KEY, sponsor: env.HIDE_SPONSOR_LINK !== "true", baseUrl: env.PUBLIC_URL, trustProxy: env.TRUST_PROXY === "true", embedOrigins: (env.EMBED_ORIGINS || "").split(",").map((x) => x.trim()).filter((x) => /^https?:\/\/[^\s;'"]+$/.test(x)) };
  const h = handler(cfg);
  setInterval(() => cfg.flush?.(), 5000).unref();
  for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { cfg.flush?.(); process.exit(0); });
  http.createServer(h).listen(Number(env.PORT || 8080), () => console.log(`survey-keeper on :${env.PORT || 8080} (${Object.keys(state.surveys).length} surveys)`));
}
