#!/usr/bin/env node
// Self-hosted shared support inbox. Zero dependencies, state in one JSON file.
//   ADMIN_KEY=... COMPANY_NAME=Acme node server.mjs
// Inbound mail: point Postmark, Mailgun, Resend or any forwarder's inbound webhook at /in/<mailbox token>.
// Optional AI reply drafts on your own key: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY or LLM_PROVIDER/LLM_MODEL/LLM_BASE_URL/LLM_API_KEY.
// Outbound: RESEND_API_KEY + MAIL_FROM (DRY_RUN=false turns real email on). ALERT_WEBHOOK_URL (Slack/Discord, https) pings on new tickets.
import http from "node:http";
import fs from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { newState, createMailbox, normalizeInbound, ingest, addReply, addNote, updateTicket, addMacro, removeMacro, rateTicket, autoClose, purgeOlderThan, toCsv, refOf, isEmail } from "./desk.mjs";
import { configFromEnv } from "./byok.mjs";
import { draftReply } from "./ai.mjs";
import { adminPage, ticketPage, macrosPage, customerPage, thanksPage } from "./render.mjs";

const env = process.env;

const readBody = (req, max = 1_000_000) => new Promise((resolve, reject) => {
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

// Who is calling the admin? "agent" for the shared ADMIN_KEY, an agent's own name for a personal key
// from AGENT_KEYS ("alice:key,bob:key"), or null. Personal keys are checked against every agent so
// the Bearer form needs no user name; Basic also requires the user name to match.
export function parseAgentKeys(raw = "") {
  const out = {};
  for (const part of String(raw).split(",")) {
    const i = part.indexOf(":"), name = part.slice(0, i).trim().replace(/[^\w .-]/g, "").slice(0, 40), key = part.slice(i + 1).trim();
    if (i > 0 && name && key.length >= 12 && name !== "agent") out[name] = key;
  }
  return out;
}
export function agentOf(req, adminKey, agents = {}) {
  const h = req.headers.authorization || "";
  let user = null, secret = null;
  if (h.startsWith("Bearer ")) secret = h.slice(7);
  else if (h.startsWith("Basic ")) { const p = Buffer.from(h.slice(6), "base64").toString(), i = p.indexOf(":"); user = p.slice(0, i); secret = p.slice(i + 1); }
  if (secret === null) return null;
  for (const [name, key] of Object.entries(agents)) if (same(secret, key) && (user === null || user === name)) return name;
  return adminKey && same(secret, adminKey) ? "agent" : null;
}

export function limiter(max, windowMs) {
  const hits = new Map();
  return (key, now) => {
    const w = Math.floor(now / windowMs), h = hits.get(key);
    if (!h || h.w !== w) { hits.set(key, { w, n: 1 }); if (hits.size > 10_000) hits.clear(); return true; }
    return ++h.n <= max;
  };
}

// Text fields of a multipart/form-data body (Mailgun's default). File parts are skipped, never stored.
export function parseMultipart(raw, contentType) {
  const b = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  const out = {};
  if (!b) return out;
  for (const part of raw.split(`--${b[1] || b[2]}`)) {
    const i = part.indexOf("\r\n\r\n"); if (i < 0) continue;
    const head = part.slice(0, i), name = /name="([^"]+)"/i.exec(head);
    if (!name || /filename=/i.test(head) || name[1] === "__proto__") continue;
    out[name[1]] = part.slice(i + 4).replace(/\r\n$/, "");
  }
  return out;
}

async function parseBody(req, max) {
  const raw = await readBody(req, max), type = req.headers["content-type"] || "";
  if (type.includes("json")) { const j = JSON.parse(raw || "{}"); return j && typeof j === "object" && !Array.isArray(j) ? j : {}; }
  if (type.includes("multipart/form-data")) return parseMultipart(raw, type);
  return Object.fromEntries(new URLSearchParams(raw));
}

// cfg: {state, save, adminKey, company, sponsor, now, notify, sendEmail, dryRun, trustProxy, baseUrl, limits}
export function handler(cfg) {
  const now = cfg.now || Date.now;
  const lim = { submit: limiter(10, 60_000), read: limiter(300, 60_000), inbound: limiter(120, 60_000), ...cfg.limits };
  const { state } = cfg;
  const acked = new Map(); // `${mailbox}:${address}` -> last acknowledgement time; memory only
  const mail = (msg) => {
    if (cfg.dryRun) console.log(`[dry run] would email ${msg.to}: ${msg.subject}`);
    else cfg.sendEmail?.(msg).catch((e) => console.error("email failed:", e.message));
  };
  const afterIngest = (r, base) => {
    const { ticket: t, created } = r; const mb = state.mailboxes[t.mailbox];
    if (!created) return;
    if (t.status !== "spam") cfg.notify?.(`New ticket ${refOf(t)} (${t.priority}) from ${t.requester.email}: ${t.subject}`.slice(0, 300));
    if (t.status === "spam" || !mb.ack) return;
    const k = `${mb.id}:${t.requester.email}`;
    if (acked.has(k) && now() - acked.get(k) < 86_400_000) return;
    if (acked.size > 10_000) acked.clear();
    acked.set(k, now());
    // Only text the operator wrote, plus the ticket reference: nothing the sender typed is echoed back.
    mail({ to: t.requester.email, subject: `Re: ${t.subject} ${refOf(t)}`.slice(0, 200), text: `${mb.ack}\n\nTicket ${refOf(t)}: ${base}/t/${t.token}`, replyTo: mb.replyTo });
  };
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
      let m;

      if (path === "/healthz") return send(200, "ok\n", "text/plain");
      if (path === "/") return send(200, "support-desk: email webhooks at /in/<token>, contact form at /m/<mailbox>, admin at /admin.\n", "text/plain");

      // Inbound email webhook. The unguessable token in the URL is the credential.
      if ((m = path.match(/^\/in\/(\w+)$/)) && req.method === "POST") {
        const mb = Object.values(state.mailboxes).find((x) => same(x.inboundToken, m[1]));
        if (!mb) return send(404, "no such mailbox\n", "text/plain");
        if (!lim.inbound(mb.id, now())) return send(429, "slow down\n", "text/plain");
        const r = ingest(state, mb.id, normalizeInbound(await parseBody(req, 5_000_000)), now(), "email");
        if (r.ticket) { cfg.save(); afterIngest(r, base); }
        return send(200, { ok: true, ...(r.ignored ? { ignored: r.ignored } : { ticket: r.ticket.n }) }, "application/json");
      }

      // Contact form for a website: name, email, subject, message.
      if ((m = path.match(/^\/m\/(\w+)$/))) {
        const mb = state.mailboxes[m[1]];
        const origin = req.headers.origin;
        if (req.method === "OPTIONS") {
          if (!mb || (mb.origins.length && !mb.origins.includes(origin))) return send(403, "origin not allowed\n", "text/plain");
          return send(204, "", "text/plain", { "access-control-allow-origin": mb.origins.length ? origin : "*", "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type", "access-control-max-age": "600", vary: "origin" });
        }
        if (req.method !== "POST") return send(405, "POST a contact form here\n", "text/plain");
        if (!mb) return send(404, "no such mailbox\n", "text/plain");
        if (mb.origins.length && origin && origin !== "null" && !mb.origins.includes(origin)) return send(403, "this form does not accept posts from that site\n", "text/plain");
        const cors = { "access-control-allow-origin": mb.origins.length && origin ? origin : "*", vary: "origin" };
        if (!lim.submit(`${ip}:${mb.id}`, now())) return send(429, "too many messages; try again in a minute\n", "text/plain", cors);
        const b = await parseBody(req, 100_000);
        const isJson = (req.headers["content-type"] || "").includes("json") || (req.headers.accept || "").includes("application/json");
        const p = { fromEmail: String(b.email || "").trim().toLowerCase(), fromName: String(b.name || "").slice(0, 80), subject: String(b.subject || "").trim().slice(0, 200) || "Contact form", text: String(b.message || "").slice(0, 20_000).trim(), messageId: "", inReplyTo: "", automated: false };
        if (b._gotcha) return isJson ? send(200, { ok: true }, "application/json", cors) : send(200, "ok\n", "text/plain", cors); // honeypot: bots learn nothing
        if (!isEmail(p.fromEmail) || !p.text) return send(400, "an email address and a message are required\n", "text/plain", cors);
        const r = ingest(state, mb.id, p, now(), "form");
        if (!r.ticket) return send(400, "that message cannot be accepted\n", "text/plain", cors);
        cfg.save(); afterIngest(r, base);
        return isJson ? send(200, { ok: true, ticket: r.ticket.n }, "application/json", cors) : send(200, thanksPage(cfg, r.ticket), "text/html; charset=utf-8", cors);
      }

      // Customer's own view of their ticket, by secret link.
      if ((m = path.match(/^\/t\/(\w+)$/))) {
        const t = Object.values(state.tickets).find((x) => same(x.token, m[1]));
        if (!t) return send(404, "not found\n", "text/plain");
        if (req.method === "POST") {
          if (!lim.submit(`${ip}:${t.id}`, now())) return send(429, "too many messages; try again in a minute\n", "text/plain");
          const f = Object.fromEntries(new URLSearchParams(await readBody(req, 100_000)));
          if (f.rating) { if (rateTicket(t, f.rating, f.comment, now())) cfg.save(); return redirect(`/t/${t.token}?rated=1`); }
          const text = String(f.text || "").trim();
          if (text) {
            const r = ingest(state, t.mailbox, { fromEmail: t.requester.email, fromName: t.requester.name, subject: `${t.subject} ${refOf(t)}`, text, messageId: "", inReplyTo: "", automated: false }, now(), "portal");
            if (r.ticket) cfg.save();
          }
          return redirect(`/t/${t.token}`);
        }
        return send(200, customerPage(cfg, state, t, url.searchParams.get("rated") ? "Thanks for the feedback." : ""));
      }

      if (path.startsWith("/admin")) {
        const who = agentOf(req, cfg.adminKey, cfg.agents);
        if (!who) return needAdmin();
        const ticket = (n) => Object.values(state.tickets).find((x) => x.n === Number(n));
        if (req.method === "GET") {
          if (path === "/admin") return send(200, adminPage(cfg, state, base, Object.fromEntries(url.searchParams), now()));
          if (path === "/admin/macros") return send(200, macrosPage(cfg, state));
          if (path === "/admin/export.csv") return send(200, toCsv(state), "text/csv; charset=utf-8", { "content-disposition": 'attachment; filename="tickets.csv"' });
          if ((m = path.match(/^\/admin\/t\/(\d+)$/)) && ticket(m[1])) return send(200, ticketPage(cfg, state, ticket(m[1]), base, now(), { macroId: url.searchParams.get("macro") || "" }));
          return send(404, "not found\n", "text/plain");
        }
        if (req.method !== "POST") return send(405, "method not allowed\n", "text/plain");
        // CSRF: a cross-site page must not ride the browser's cached admin credentials.
        const origin = req.headers.origin;
        if (origin && origin !== "null" && new URL(origin).host !== req.headers.host && !(req.headers.authorization || "").startsWith("Bearer ")) return send(403, "cross-site request refused\n", "text/plain");
        const f = Object.fromEntries(new URLSearchParams(await readBody(req, 100_000)));
        if (path === "/admin/mailboxes") { createMailbox(state, f, now()); cfg.save(); return redirect("/admin"); }
        if (path === "/admin/macros") { addMacro(state, f); cfg.save(); return redirect("/admin/macros"); }
        if ((m = path.match(/^\/admin\/macros\/(r\d+)\/delete$/))) { if (!removeMacro(state, m[1])) return send(404, "not found\n", "text/plain"); cfg.save(); return redirect("/admin/macros"); }
        if ((m = path.match(/^\/admin\/t\/(\d+)\/(reply|note|update|delete|draft)$/))) {
          const t = ticket(m[1]); if (!t) return send(404, "not found\n", "text/plain");
          // Drafting only fills the reply box for a human to edit; nothing is saved or emailed.
          if (m[2] === "draft") { const ai = await draftReply(cfg.llm || {}, cfg, state, t, cfg.fetch); return send(200, ticketPage(cfg, state, t, base, now(), { ai })); }
          if (m[2] === "delete") { delete state.tickets[t.id]; cfg.save(); return redirect("/admin"); }
          if (m[2] === "update") updateTicket(t, f, now());
          else {
            const text = String(f.text || "").trim(); if (!text) return send(400, "message is empty\n", "text/plain");
            if (m[2] === "note") addNote(state, t, text, who, now());
            else {
              addReply(state, t, text, { status: f.after, author: who }, now());
              if (!t.assignee && who !== "agent") t.assignee = who;
              const mb = state.mailboxes[t.mailbox];
              mail({ to: t.requester.email, subject: `Re: ${t.subject.replace(/\s*\[#\d+\]/g, "")} ${refOf(t)}`.slice(0, 200), text: `${text}\n\n--\nTicket ${refOf(t)} · ${base}/t/${t.token}`, replyTo: mb?.replyTo });
            }
          }
          cfg.save(); return redirect(`/admin/t/${t.n}`);
        }
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
  const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ from: env.MAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text, ...(msg.replyTo ? { reply_to: msg.replyTo } : {}) }) });
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
  const closeDays = Number(env.AUTO_CLOSE_DAYS || 0), keepDays = Number(env.RETENTION_DAYS || 0);
  const sweep = () => { if (autoClose(state, closeDays) + purgeOlderThan(state, keepDays)) save(); };
  save();
  if (closeDays > 0 || keepDays > 0) { sweep(); setInterval(sweep, 3_600_000).unref(); }
  const agents = parseAgentKeys(env.AGENT_KEYS);
  const cfg = {
    state, save, adminKey: env.ADMIN_KEY, agents, company: env.COMPANY_NAME || "Support", sponsor: env.HIDE_SPONSOR_LINK !== "true",
    baseUrl: env.PUBLIC_URL, trustProxy: env.TRUST_PROXY === "true",
    llm: configFromEnv(env), notify: env.ALERT_WEBHOOK_URL ? webhook(env.ALERT_WEBHOOK_URL) : null, sendEmail: sendResend, dryRun,
  };
  http.createServer(handler(cfg)).listen(Number(env.PORT || 8080), () => console.log(`support-desk on :${env.PORT || 8080} (${Object.keys(state.tickets).length} tickets)`));
}
