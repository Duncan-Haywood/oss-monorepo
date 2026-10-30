// Babysitting Business Kit: the optional self-hosted server. One Node 22 process, no
// dependencies, state in one JSON file. Run it on your own account (Render, Fly, a VPS):
//
//   ADMIN_KEY=... CAL_TOKEN=... STATE=/data/desk.json PORT=8080 node server.mjs
//
// What it adds to the browser app:
//   GET  /                 the app; "Sync" in the app stores the desk here (admin key)
//   GET  /site             your marketing website, built from your profile and consented quotes
//   POST /inquiry          the website's form: becomes a scored lead; optional auto-reply and alert
//   GET  /calendar.ics?t=  your sits as a feed your phone's calendar can subscribe to
//   GET|PUT /api/desk      the desk as JSON (Authorization: Bearer ADMIN_KEY)
//   GET  /api/today        today's to-do list (Authorization: Bearer ADMIN_KEY)
//   a daily digest at DIGEST_HOUR (server time) to your webhook or email
//
// Every outside service is off until you set its variables, on your own accounts:
//   NOTIFY_WEBHOOK_URL (+ NOTIFY_FORMAT ntfy|slack|discord): a ping when a lead arrives
//   RESEND_API_KEY + FROM_EMAIL (+ NOTIFY_EMAIL): email through Resend
//   AUTO_REPLY=1: email the family your reply to their inquiry straight away (only
//     when they gave an email address and the lead is not a decline)
//   AUTO_FOLLOW_UP=1: send due follow-ups to emailed leads with the daily digest
//   LLM_PROVIDER (+ LLM_API_KEY, LLM_MODEL, LLM_BASE_URL; or OLLAMA_HOST): POST /api/draft
//     drafts a blog post on your own model key; /site/blog serves posts you approved

import http from "node:http";
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { normalizeDesk, emptyDesk, buildSite, leadFromForm, scoreLead, leadReply, followUpMessage, todayQueue, toICS, newId } from "./engine.mjs";
import { blogRoute, serverDraft } from "./content.mjs";

const MAX_BODY = 64 * 1024;
const MAX_DESK = 8 * 1024 * 1024;
const MAX_LEADS = 2000;
const FILES = { "/": "index.html", "/index.html": "index.html", "/engine.mjs": "engine.mjs", "/usage.mjs": "usage.mjs", "/content.mjs": "content.mjs", "/content-ui.mjs": "content-ui.mjs", "/byok.mjs": "byok.mjs" };
const TYPES = { html: "text/html; charset=utf-8", mjs: "text/javascript; charset=utf-8" };

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && x.length > 0 && timingSafeEqual(x, y); };
const isEmail = (s) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(s || "").trim());
export const localDate = (ms, tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

export function webhookBody(format, text) {
  if (format === "ntfy") return { type: "text/plain; charset=utf-8", body: text };
  if (format === "discord") return { type: "application/json", body: JSON.stringify({ content: text.slice(0, 1900) }) };
  return { type: "application/json", body: JSON.stringify({ text }) };
}

// Outbound messages: a webhook for the sitter, email through Resend for anyone. Each
// returns false (and logs) when unset or failing; nothing here can break an inquiry.
export function messenger(env, fetchImpl = globalThis.fetch) {
  const call = (url, init) => {
    if (typeof fetchImpl !== "function") return Promise.resolve(false);
    return Promise.resolve().then(() => fetchImpl(url, { ...init, signal: AbortSignal.timeout(8000) })).then((r) => !!(r && r.ok), (e) => { console.error("send failed:", e && e.message); return false; });
  };
  const email = (to, subject, text) => {
    if (!env.RESEND_API_KEY || !env.FROM_EMAIL || !isEmail(to)) return Promise.resolve(false);
    return call("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ from: env.FROM_EMAIL, to: [to], subject, text, ...(env.NOTIFY_EMAIL ? { reply_to: env.NOTIFY_EMAIL } : {}) }) });
  };
  const sitter = async (subject, text) => {
    const sent = [];
    if (/^https?:\/\//i.test(env.NOTIFY_WEBHOOK_URL || "")) {
      const { type, body } = webhookBody(String(env.NOTIFY_FORMAT || "ntfy").toLowerCase(), `${subject}\n${text}`);
      sent.push(await call(env.NOTIFY_WEBHOOK_URL, { method: "POST", headers: { "content-type": type }, body }));
    }
    if (env.NOTIFY_EMAIL) sent.push(await email(env.NOTIFY_EMAIL, subject, text));
    return sent.some(Boolean);
  };
  return { email, sitter };
}

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>body{font:17px/1.6 Georgia,serif;max-width:36rem;margin:3rem auto;padding:0 1rem;color:#2b2433;background:#fffaf6}a{color:#b0507a}</style></head><body><h1>${esc(title)}</h1>${body}</body></html>`;

async function readBody(req, limit = MAX_BODY) {
  let size = 0;
  const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) return null; chunks.push(c); }
  return Buffer.concat(chunks).toString("utf8");
}

export function handler(state, save, env = process.env, now = Date.now, fetchImpl = globalThis.fetch, dir = new URL(".", import.meta.url)) {
  const msg = messenger(env, fetchImpl);
  const hits = new Map();
  return async (req, res) => {
    const send = (code, body, type = TYPES.html, extra = {}) => { res.writeHead(code, { "content-type": type, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", ...extra }); res.end(body); };
    const url = new URL(req.url, "http://x");
    const today = localDate(now(), env.TZ);
    if (url.pathname === "/healthz") return send(200, "ok\n", "text/plain");
    if (req.method === "GET" && FILES[url.pathname]) {
      const f = FILES[url.pathname];
      return send(200, readFileSync(new URL(f, dir)), TYPES[f.split(".").pop()]);
    }
    if (req.method === "GET" && url.pathname === "/site") return send(200, buildSite(state.desk, { formAction: "/inquiry" }));
    if (req.method === "GET" && url.pathname.startsWith("/site/blog")) { const html = blogRoute(state.desk, url.pathname); return html ? send(200, html) : send(404, page("Not found", `<p><a href="/site/blog">All posts</a></p>`)); }
    if (req.method === "POST" && url.pathname === "/inquiry") {
      const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
      const hour = Math.floor(now() / 36e5);
      const key = `${ip}|${hour}`;
      hits.set(key, (hits.get(key) || 0) + 1);
      if (hits.size > 5000) hits.clear();
      if (hits.get(key) > 10) return send(429, page("Slow down", "<p>Too many messages from here. Please try again later.</p>"));
      const raw = await readBody(req);
      if (raw === null) return send(413, page("Too long", "<p>That message was too long.</p>"));
      let fields;
      try { fields = /json/.test(req.headers["content-type"] || "") ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw)); } catch { fields = {}; }
      const thanks = page("Thank you!", `<p>Your message was sent. ${esc(state.desk.profile.name)} will get back to you soon.</p><p><a href="/site">Back</a></p>`);
      if (fields.website) return send(200, thanks); // the honeypot: bots fill it, people never see it
      if (!String(fields.name || "").trim() || !String(fields.contact || "").trim()) return send(400, page("Almost", `<p>Please include your name and a phone number or email.</p><p><a href="/site">Back</a></p>`));
      const lead = leadFromForm(fields, today, newId("lead"));
      const sc = scoreLead(lead, state.desk.profile);
      state.desk.leads.push(lead);
      if (state.desk.leads.length > MAX_LEADS) state.desk.leads.shift();
      if (env.AUTO_REPLY === "1" && isEmail(lead.contact) && sc.tier !== "decline") {
        if (await msg.email(lead.contact.trim(), "Thanks for your babysitting inquiry", leadReply(lead, state.desk.profile, sc))) { lead.followUps = 1; lead.status = "contacted"; lead.lastContact = today; }
      }
      save();
      await msg.sitter(`New babysitting lead: ${lead.name} (${sc.tier}, ${sc.score})`, [`Contact: ${lead.contact}`, lead.kids.length && `Kids: ${lead.kids.join(", ")}`, lead.schedule && `When: ${lead.schedule}`, lead.notes && `Notes: ${lead.notes}`, ...sc.reasons, lead.followUps ? "Auto-reply sent." : "Reply from the app's Today tab."].filter(Boolean).join("\n"));
      return send(200, thanks);
    }
    if (req.method === "GET" && url.pathname === "/calendar.ics") {
      if (!env.CAL_TOKEN || !same(url.searchParams.get("t") || "", env.CAL_TOKEN)) return send(401, "calendar link required\n", "text/plain");
      return send(200, toICS(state.desk, { from: today.slice(0, 4) + "-01-01" }), "text/calendar; charset=utf-8");
    }
    if (url.pathname.startsWith("/api/")) {
      if (!env.ADMIN_KEY) return send(503, "Set ADMIN_KEY.\n", "text/plain");
      const auth = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
      if (!same(auth, env.ADMIN_KEY)) return send(401, "admin key required\n", "text/plain");
      if (url.pathname === "/api/desk" && req.method === "GET") return send(200, JSON.stringify(state.desk), "application/json");
      if (url.pathname === "/api/desk" && req.method === "PUT") {
        const raw = await readBody(req, MAX_DESK);
        if (raw === null) return send(413, "too large\n", "text/plain");
        let incoming;
        try { incoming = JSON.parse(raw); } catch { return send(400, "not JSON\n", "text/plain"); }
        // Leads that arrived through the website since the app last synced are kept.
        const ids = new Set((incoming.leads || []).map((l) => l && l.id));
        const known = new Set(incoming.knownLeadIds || []);
        const fresh = state.desk.leads.filter((l) => !ids.has(l.id) && !known.has(l.id));
        state.desk = normalizeDesk(incoming);
        state.desk.leads.push(...fresh);
        save();
        return send(200, JSON.stringify({ ok: true, added: fresh.length, desk: state.desk }), "application/json");
      }
      if (url.pathname === "/api/draft" && req.method === "POST") { // an AI blog draft on the server's LLM_* keys (content.mjs)
        let body; try { body = JSON.parse((await readBody(req)) || "{}"); } catch { return send(400, "not JSON\n", "text/plain"); }
        const r = await serverDraft(state.desk, body, env, today, fetchImpl);
        if (r.status === 200) save();
        return send(r.status, JSON.stringify(r.json), "application/json");
      }
      if (url.pathname === "/api/today" && req.method === "GET") return send(200, JSON.stringify(todayQueue(state.desk, today)), "application/json");
      return send(404, "not found\n", "text/plain");
    }
    return send(404, "not found\n", "text/plain");
  };
}

// The daily digest: today's to-do list to the sitter, and (with AUTO_FOLLOW_UP=1) the
// follow-ups that are due, emailed to leads who gave an email address.
export async function dailyDigest(state, save, env, today, fetchImpl = globalThis.fetch) {
  const msg = messenger(env, fetchImpl);
  let sent = 0;
  if (env.AUTO_FOLLOW_UP === "1") {
    for (const item of todayQueue(state.desk, today)) {
      if (item.kind !== "lead" || item.step === 0) continue;
      const lead = state.desk.leads.find((l) => l.id === item.id);
      if (!lead || !isEmail(lead.contact)) continue;
      if (await msg.email(lead.contact.trim(), "Following up on your babysitting request", followUpMessage(lead, item.step, state.desk.profile))) {
        lead.followUps = item.step + 1; lead.lastContact = today; lead.status = "contacted"; sent++;
      }
    }
    if (sent) save();
  }
  const items = todayQueue(state.desk, today);
  if (!items.length) return { sent, items: 0 };
  await msg.sitter(`Babysitting to-do for ${today} (${items.length})`, items.map((i) => `• ${i.title}`).join("\n") + (sent ? `\n${sent} follow-up email(s) sent automatically.` : ""));
  return { sent, items: items.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const statePath = process.env.STATE || "desk.json";
  const state = { desk: existsSync(statePath) ? normalizeDesk(JSON.parse(readFileSync(statePath, "utf8"))) : emptyDesk() };
  const save = () => { writeFileSync(statePath + ".tmp", JSON.stringify(state.desk)); renameSync(statePath + ".tmp", statePath); };
  const port = Number(process.env.PORT || 8080);
  http.createServer(handler(state, save)).listen(port, () => console.log(`babysitting desk on :${port}${process.env.ADMIN_KEY ? "" : " (set ADMIN_KEY to sync and read the API)"}`));
  const digestHour = Number(process.env.DIGEST_HOUR ?? 7);
  let lastDigest = "";
  setInterval(() => {
    const d = new Date();
    const today = localDate(d.getTime(), process.env.TZ);
    if (d.getHours() === digestHour && lastDigest !== today) { lastDigest = today; dailyDigest(state, save, process.env, today).catch((e) => console.error("digest failed:", e.message)); }
  }, 5 * 60 * 1000).unref?.();
}
