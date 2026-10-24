#!/usr/bin/env node
// Self-hosted AI support agent. Zero dependencies, state in one JSON file.
//   ADMIN_KEY=... node server.mjs        then open /admin, paste your help articles, and embed /widget.js
// Optional: KNOWLEDGE_FILE (Markdown to start from), KB_SOURCE_URL (a Help Keeper site to import from),
// HANDOFF_WEBHOOK_URL (Support Desk's /in/<token> URL, or any endpoint taking {from, fromName, subject, text} JSON),
// ALLOWED_ORIGINS (sites that may embed the chat; default any), LOG_DAYS (default 90), and a model for the wording:
// ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY or LLM_PROVIDER/LLM_MODEL/LLM_BASE_URL/LLM_API_KEY (ollama works).
import http from "node:http";
import fs from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { configFromEnv, isConfigured, isLocal } from "./byok.mjs";
import { answer } from "./model.mjs";
import { parseKnowledge } from "./agent.mjs";
import { newState, agentOf, logTurn, feedback, purge, stats, gaps, runTests, recalibrate, logCsv, redact } from "./store.mjs";
import { homePage, adminPage } from "./render.mjs";
import { widgetJs } from "./widget.mjs";

const readBody = (req, max = 2_000_000) => new Promise((resolve, reject) => {
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
const isEmail = (s) => /^[^\s@<>]{1,64}@[^\s@<>]+\.[a-z]{2,}$/i.test(s) && s.length <= 200;
const form = (body) => Object.fromEntries(new URLSearchParams(body));

// The Help Keeper import: its /llms.txt lists every published article's raw Markdown at /a/<slug>.md.
export async function importHelpKeeper(base, fetchImpl = fetch) {
  const root = String(base).replace(/\/+$/, "");
  const idx = await fetchImpl(`${root}/llms.txt`).then((r) => { if (!r.ok) throw new Error(`${root}/llms.txt answered ${r.status}`); return r.text(); });
  const links = [...idx.matchAll(/\]\((https?:\/\/[^)\s]+\/a\/([a-z0-9-]+)\.md)\)/g)].filter((m) => m[1].startsWith(root)).slice(0, 500);
  const docs = [];
  for (const [, url, slug] of links) {
    const md = await fetchImpl(url).then((r) => (r.ok ? r.text() : ""));
    if (md.trim()) docs.push(`---\nslug: ${slug}\nurl: ${url.replace(/\.md$/, "")}\n---\n${md.trim()}`);
  }
  if (!docs.length) throw new Error("no articles found in that llms.txt");
  return docs.join("\n\n=====\n\n");
}

export function handler(cfg) {
  const now = cfg.now || (() => Date.now());
  const state = cfg.state;
  const persist = cfg.persist || (() => {});
  const lim = { ask: limiter(20, 60_000), handoff: limiter(5, 60_000) };
  const llm = cfg.llm || {};
  const llmLabel = !isConfigured(llm) ? "off (answers are copied from articles)" : isLocal(llm) ? `a model on your own machine (${llm.model || llm.provider})` : `${llm.provider}${llm.model ? ` ${llm.model}` : ""}, checked against the articles`;
  const origins = (cfg.allowedOrigins || "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);

  return async (req, res) => {
    const url = new URL(req.url, "http://x"), path = url.pathname;
    const ip = (cfg.trustProxy && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket.remoteAddress || "?";
    const base = cfg.publicUrl || `http${cfg.trustProxy && req.headers["x-forwarded-proto"] === "https" ? "s" : ""}://${req.headers.host}`;
    const origin = String(req.headers.origin || "");
    const cors = path.startsWith("/api/") ? { "access-control-allow-origin": !origins.length ? "*" : origins.includes(origin) ? origin : "null", "access-control-allow-headers": "content-type", vary: "origin" } : {};
    const send = (code, body, type = "text/html; charset=utf-8", extra = {}) => {
      res.writeHead(code, { "content-type": type, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", ...(type.startsWith("text/html") ? { "x-frame-options": "DENY", "content-security-policy": "default-src 'self'; style-src 'unsafe-inline' 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:" } : {}), ...cors, ...extra });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    const json = (code, body) => send(code, body, "application/json; charset=utf-8");
    try {
      if (req.method === "OPTIONS" && path.startsWith("/api/")) return send(204, "");
      if (path === "/healthz") return send(200, "ok", "text/plain");
      if (path === "/robots.txt") return send(200, "User-agent: *\nDisallow: /admin\nDisallow: /api/\n", "text/plain");
      if (path === "/widget.js") return send(200, widgetJs(base), "text/javascript; charset=utf-8", { "cache-control": "public, max-age=300" });
      if (path === "/" && req.method === "GET") return send(200, homePage({ base }, state));

      if (path.startsWith("/api/") && req.method === "POST") {
        if (origins.length && origin && !origins.includes(origin)) return json(403, { error: "this site may not use the chat" });
        let b; try { b = JSON.parse(await readBody(req, 50_000) || "{}"); } catch { return json(400, { error: "send JSON" }); }
        if (path === "/api/ask") {
          if (!lim.ask(ip, now())) return json(429, { error: "Too many questions at once; try again in a minute." });
          const q = String(b.q || "").slice(0, 500).trim();
          if (!q) return json(400, { error: "Type a question first." });
          const history = Array.isArray(b.history) ? b.history.slice(-6).map((m) => ({ role: m?.role === "agent" ? "agent" : "customer", text: String(m?.text || "").slice(0, 400) })) : [];
          const d = await answer(agentOf(state), llm, q, { history, fetch: cfg.fetch });
          const row = logTurn(state, d, q, now()); persist();
          return json(200, { id: row.id, action: d.action, text: d.text, citations: d.citations.map((c) => ({ title: c.title, url: c.url })) });
        }
        if (path === "/api/feedback") { if (feedback(state, String(b.id || ""), b.helpful)) persist(); return json(200, { ok: true }); }
        if (path === "/api/handoff") {
          if (!lim.handoff(ip, now())) return json(429, { error: "Too many requests; try again in a minute." });
          const email = String(b.email || "").trim(), name = String(b.name || "").replace(/[\r\n<>]/g, " ").trim().slice(0, 80);
          if (!isEmail(email)) return json(400, { error: "Please give a valid email address so we can reply." });
          const question = String(b.question || "").slice(0, 2000).trim();
          const transcript = (Array.isArray(b.transcript) ? b.transcript : []).slice(-10).map((m) => `${m?.role === "agent" ? "Agent" : "Customer"}: ${String(m?.text || "").slice(0, 600)}`).join("\n\n");
          const h = { at: now(), email, name, question: redact(question), forwarded: false };
          if (cfg.handoffWebhook) {
            const text = `${question}\n\n--- Chat so far (from the support agent) ---\n${transcript}`.trim();
            try {
              const r = await (cfg.fetch || fetch)(cfg.handoffWebhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from: email, fromName: name, subject: `Chat: ${question.slice(0, 80) || "question from the support agent"}`, text }) });
              h.forwarded = r.ok;
            } catch { /* kept in the admin list either way */ }
          }
          state.handoffs.push(h); if (state.handoffs.length > 2000) state.handoffs.shift(); persist();
          return json(200, { ok: true, message: `Thanks. Someone from ${state.settings.name} will reply to ${email}.` });
        }
        return json(404, { error: "not found" });
      }

      if (path.startsWith("/admin")) {
        if (!adminOk(req, cfg.adminKey)) return send(401, "sign in with any user name and your ADMIN_KEY", "text/plain", { "www-authenticate": 'Basic realm="support-agent admin"' });
        if (req.method === "POST" && origin && origin !== base) return send(403, "cross-site form refused", "text/plain");
        const agent = agentOf(state);
        const page = (extra = {}) => send(200, adminPage({ base, bar: agent.threshold, suggestBar: agent.suggestBar, calibrationName: state.calibration ? `fitted on your ${state.calibration.rows} test answers` : agent.examples.length ? "built in (with past questions)" : "built in", webhook: Boolean(cfg.handoffWebhook), llm: llmLabel, kbSource: cfg.kbSource }, state,
          { stats: stats(state, now()), gaps: gaps(state), articles: agent.articles.length, now: now(), ...extra }));
        if (req.method === "GET" && path === "/admin") return page();
        if (req.method === "GET" && path === "/admin/log.csv") return send(200, logCsv(state), "text/csv; charset=utf-8", { "content-disposition": 'attachment; filename="support-agent-log.csv"' });
        if (req.method !== "POST") return send(404, "not found", "text/plain");
        const f = form(await readBody(req));
        let message = "Saved.", report = null;
        try {
          if (path === "/admin/knowledge") {
            const n = parseKnowledge(f.knowledge || "").length;
            if (!n && (f.knowledge || "").trim()) throw new Error("no articles found: each needs a title and some text");
            state.knowledge = String(f.knowledge || "").slice(0, 1_500_000); state.synonyms = String(f.synonyms || "").slice(0, 20_000); state.rev++; message = `Saved ${n} articles.`;
          } else if (path === "/admin/sync") {
            if (!cfg.kbSource) throw new Error("set KB_SOURCE_URL to a Help Keeper site first");
            state.knowledge = await importHelpKeeper(cfg.kbSource, cfg.fetch); state.rev++; message = `Imported ${parseKnowledge(state.knowledge).length} articles from ${cfg.kbSource}.`;
          } else if (path === "/admin/examples") {
            state.examples = String(f.examples || "").slice(0, 2_000_000); state.rev++; message = `Saved ${agentOf(state).examples.length} past questions that name a known article or handoff.`;
          } else if (path === "/admin/tests") {
            state.tests = String(f.tests || "").slice(0, 2_000_000);
            if (f.do === "run") report = runTests(state);
            if (f.do === "bar") { report = runTests(state); state.bar = report.recommended; state.rev++; report = runTests(state); message = `Answer bar set to ${state.bar.toFixed(3)}.`; }
            if (f.do === "calibrate") { report = recalibrate(state); message = `Confidence model fitted on ${state.calibration.rows} answers; bar set to ${state.bar.toFixed(3)}.`; }
          } else if (path === "/admin/settings") {
            state.settings.name = String(f.name || "Support").slice(0, 80); state.settings.contact = isEmail(f.contact || "") ? f.contact : "";
            const num = (v) => (v === undefined || v === "" || !Number.isFinite(+v) ? null : Math.min(1.01, Math.max(0, +v)));
            if (f.resetCalibration) { state.calibration = null; state.bar = null; state.suggestBar = null; }
            else { state.bar = num(f.bar); state.suggestBar = num(f.suggestBar); }
            state.rev++;
          } else return send(404, "not found", "text/plain");
        } catch (e) { message = e.message; }
        persist();
        return page({ message, report });
      }
      return send(404, "not found", "text/plain");
    } catch (e) {
      return send(e.status || 500, e.status ? e.message : "something went wrong", "text/plain");
    }
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const env = process.env;
  if (!env.ADMIN_KEY || env.ADMIN_KEY.length < 12) { console.error("set ADMIN_KEY (12+ characters), e.g. ADMIN_KEY=$(openssl rand -hex 16)"); process.exit(1); }
  const file = env.STATE || "./state.json";
  let state;
  try { state = JSON.parse(fs.readFileSync(file, "utf8")); } catch { state = newState(env.KNOWLEDGE_FILE ? fs.readFileSync(env.KNOWLEDGE_FILE, "utf8") : fs.readFileSync(new URL("./fixtures/sample-kb.md", import.meta.url), "utf8")); }
  let timer = null;
  const write = () => { timer = null; const tmp = `${file}.tmp`; fs.writeFileSync(tmp, JSON.stringify(state)); fs.renameSync(tmp, file); };
  const persist = () => { if (!timer) timer = setTimeout(write, 1000); };
  const days = +(env.LOG_DAYS || 90);
  setInterval(() => { if (purge(state, days, Date.now())) persist(); }, 3600_000).unref();
  purge(state, days, Date.now());
  const server = http.createServer(handler({ state, persist, adminKey: env.ADMIN_KEY, llm: configFromEnv(env), handoffWebhook: env.HANDOFF_WEBHOOK_URL || "",
    kbSource: env.KB_SOURCE_URL || "", allowedOrigins: env.ALLOWED_ORIGINS || "", publicUrl: (env.PUBLIC_URL || "").replace(/\/+$/, ""), trustProxy: env.TRUST_PROXY === "true" }));
  const port = +(env.PORT || 8080);
  server.listen(port, () => console.log(`support agent on http://localhost:${port} (admin at /admin)`));
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { if (timer) { clearTimeout(timer); write(); } process.exit(0); });
}
