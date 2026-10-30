// Babysitting Business Kit: the optional self-hosted server. One Node 22 process, no
// dependencies, state in one JSON file. Run it on your own account (Render, Fly, a VPS):
//
//   ADMIN_KEY=... CAL_TOKEN=... STATE=/data/desk.json PORT=8080 node server.mjs
//
// What it adds to the browser app:
//   GET  /                 the app; "Sync" in the app stores the desk here (admin key)
//   GET  /site/...         your marketing website (index, about, policies, faq, robots.txt, sitemap.xml)
//   POST /inquiry          the website's form: becomes a scored lead; optional auto-reply and alert
//   GET|POST /book         open times only (no family data); a request becomes a lead with
//                          status "requested" that the sitter approves in the app
//   GET|POST /ref/<token>  a referee's private link: their words and two separate consents
//   GET  /calendar.ics?t=  your sits as a feed your phone's calendar can subscribe to
//   GET|PUT /api/desk      the desk as JSON (Authorization: Bearer ADMIN_KEY)
//   GET  /api/today        today's to-do list (Authorization: Bearer ADMIN_KEY)
//   GET|POST /intake/<t>   a family's one-time info sheet (token made in the app's Families tab)
//   GET|POST /safe/<t>     the sitter's late-sit check-in link; PUT /api/safety/checkin (safety-server.mjs)
//   GET  /admin            status page; /api/status, /api/backup, /api/restore (backup.mjs)
//   a daily digest at DIGEST_HOUR (server time) to your webhook or email
//
// Every outside service is off until you set its variables, on your own accounts:
//   NOTIFY_WEBHOOK_URL (+ NOTIFY_FORMAT ntfy|slack|discord): a ping when a lead arrives
//   RESEND_API_KEY + FROM_EMAIL (+ NOTIFY_EMAIL): email through Resend
//   AUTO_REPLY=1: email the family your reply to their inquiry straight away (only
//     when they gave an email address and the lead is not a decline)
//   AUTO_FOLLOW_UP=1: send due follow-ups to emailed leads with the daily digest
//   TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM, PUBLIC_URL: texts and unsubscribe
//     links for the automations the sitter turns on in Settings (automations-server.mjs)
//   LLM_PROVIDER (+ LLM_API_KEY, LLM_MODEL, LLM_BASE_URL; or OLLAMA_HOST): POST /api/draft
//     drafts a blog post on your own model key; /site/blog serves posts you approved

import http from "node:http";
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { handleRef, mergeReferences, LIMITS as REF_LIMITS } from "./references.mjs";
import { normalizeDesk, emptyDesk, leadFromForm, scoreLead, leadReply, followUpMessage, todayQueue, toICS, newId } from "./engine.mjs";
import { openSlots, bookingRequest, bookPage, localMinutes } from "./slots.mjs";
import { intakeFormPage, parseIntake, mergeIntake, keepIntakes, isIntakeToken, MAX_INTAKE_BYTES } from "./intake.mjs";
import { buildSiteFiles } from "./site.mjs";
import { creditReferral } from "./print.mjs";
import { mergeAutomationState } from "./automations.mjs";
import { automationRoutes, runAutomations } from "./automations-server.mjs";
import { blogRoute, serverDraft } from "./content.mjs";
import { loadDesk, atomicWrite, backupApi, backupDir, dailyBackup } from "./backup.mjs";
import { mergeSafety } from "./safety.mjs";
import { safetyRoutes, runSafety } from "./safety-server.mjs";

const MAX_BODY = 64 * 1024;
const MAX_DESK = 8 * 1024 * 1024;
const MAX_LEADS = 2000;
const FILES = { "/": "index.html", "/index.html": "index.html", "/engine.mjs": "engine.mjs", "/usage.mjs": "usage.mjs", "/taxes.mjs": "taxes.mjs", "/slots.mjs": "slots.mjs", "/intake.mjs": "intake.mjs", "/meet-and-greet.html": "meet-and-greet.html", "/references.mjs": "references.mjs", "/site.mjs": "site.mjs", "/print.mjs": "print.mjs", "/qr.mjs": "qr.mjs", "/automations.mjs": "automations.mjs", "/automations-ui.mjs": "automations-ui.mjs", "/content.mjs": "content.mjs", "/content-ui.mjs": "content-ui.mjs", "/byok.mjs": "byok.mjs", "/safety.mjs": "safety.mjs", "/safety-ui.mjs": "safety-ui.mjs", "/admin": "admin.html" };
const TYPES = { html: "text/html; charset=utf-8", mjs: "text/javascript; charset=utf-8" };
// The installable app (PWA) and the guide pages, so a self-hosted copy works offline and links resolve.
for (const f of ["tabs.mjs", "sw.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png", "babysitting-taxes.html", "how-to-start-a-babysitting-business.html", "how-much-to-charge-for-babysitting.html", "babysitting-references.html", "self-host.html"]) FILES[`/${f}`] = f;
Object.assign(TYPES, { js: "text/javascript; charset=utf-8", webmanifest: "application/manifest+json", svg: "image/svg+xml", png: "image/png" });

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
  const auto = automationRoutes(state, save, env, now, fetchImpl, msg.sitter);
  const safe = safetyRoutes(state, save, env, now, fetchImpl, msg.sitter); // late-sit check-in (safety-server.mjs)
  return async (req, res) => {
    const send = (code, body, type = TYPES.html, extra = {}) => { res.writeHead(code, { "content-type": type, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", ...extra }); res.end(body); };
    const url = new URL(req.url, "http://x");
    const today = localDate(now(), env.TZ);
    if (url.pathname === "/healthz") return send(200, "ok\n", "text/plain");
    if (await auto(req, url, send)) return;
    if (await safe(req, url, send)) return;
    if (req.method === "GET" && FILES[url.pathname]) {
      const f = FILES[url.pathname];
      return send(200, readFileSync(new URL(f, dir)), TYPES[f.split(".").pop()]);
    }
    if (req.method === "GET" && url.pathname.startsWith("/site/blog")) { const html = blogRoute(state.desk, url.pathname); return html ? send(200, html) : send(404, page("Not found", `<p><a href="/site/blog">All posts</a></p>`)); }
    if (req.method === "GET" && url.pathname === "/site") return send(301, "", "text/plain", { location: "/site/" });
    if (req.method === "GET" && url.pathname.startsWith("/site/")) {
      const files = buildSiteFiles(state.desk, { formAction: "/inquiry", today });
      const name = url.pathname.slice(6) || "index.html";
      const f = Object.hasOwn(files, name) ? files[name] : undefined;
      if (f === undefined) return send(404, page("Not found", `<p><a href="/site/">Home</a></p>`));
      const ext = url.pathname.split(".").pop();
      return send(200, f, ext === "txt" ? "text/plain; charset=utf-8" : ext === "xml" ? "application/xml; charset=utf-8" : TYPES.html);
    }
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
      const thanks = page("Thank you!", `<p>Your message was sent. ${esc(state.desk.profile.name)} will get back to you soon.</p><p><a href="/site/">Back</a></p>`);
      if (fields.website) return send(200, thanks); // the honeypot: bots fill it, people never see it
      if (!String(fields.name || "").trim() || !String(fields.contact || "").trim()) return send(400, page("Almost", `<p>Please include your name and a phone number or email.</p><p><a href="/site">Back</a></p>`));
      const lead = creditReferral(leadFromForm(fields, today, newId("lead")), state.desk);
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
    if (url.pathname === "/book" && (req.method === "GET" || req.method === "POST")) {
      // Public booking page: open times only. A request is a lead, never a booking.
      const weeks = Math.min(8, Math.max(1, Number(env.BOOK_WEEKS) || 2));
      const nowMin = localMinutes(now(), env.TZ);
      const slots = () => openSlots(state.desk, { from: today, weeks, nowMin });
      if (req.method === "GET") return send(200, bookPage(state.desk, slots()));
      const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
      const key = `book|${ip}|${Math.floor(now() / 36e5)}`;
      hits.set(key, (hits.get(key) || 0) + 1);
      if (hits.size > 5000) hits.clear();
      if (hits.get(key) > 10) return send(429, page("Slow down", "<p>Too many requests from here. Please try again later.</p>"));
      const raw = await readBody(req);
      if (raw === null) return send(413, page("Too long", "<p>That request was too long.</p>"));
      let fields;
      try { fields = /json/.test(req.headers["content-type"] || "") ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw)); } catch { fields = {}; }
      const thanks = page("Request sent", `<p>Thank you! ${esc(state.desk.profile.name)} will confirm with you soon. Your time is not booked until then.</p><p><a href="/book">Back</a></p>`);
      if (fields && fields.website) return send(200, thanks);
      const r = bookingRequest(fields || {}, state.desk, today, { id: newId("lead"), nowMin, weeks });
      if (!r.ok) return send(400, bookPage(state.desk, slots(), { message: r.why }));
      state.desk.leads.push(r.lead);
      if (state.desk.leads.length > MAX_LEADS) state.desk.leads.shift();
      save();
      await msg.sitter(`Booking request: ${r.lead.name}, ${r.lead.schedule}`, [`Contact: ${r.lead.contact}`, r.lead.kids.length && `Kids: ${r.lead.kids.join(", ")}`, r.lead.notes && `Notes: ${r.lead.notes}`, "Approve or decline it in the app's Schedule tab."].filter(Boolean).join("\n"));
      return send(200, thanks);
    }
    if (url.pathname.startsWith("/intake/")) {
      const token = url.pathname.slice(8);
      const i = isIntakeToken(token) ? state.desk.families.findIndex((f) => f.intakeToken && same(f.intakeToken, token)) : -1;
      const nostore = { "cache-control": "no-store" };
      if (i < 0) return send(404, page("Link not found", "<p>This info-sheet link has already been used or is not valid. Please ask your babysitter directly.</p>"), TYPES.html, nostore);
      if (req.method === "GET") return send(200, intakeFormPage(state.desk, state.desk.families[i], { action: url.pathname }), TYPES.html, nostore);
      if (req.method !== "POST") return send(405, "method not allowed\n", "text/plain");
      const raw = await readBody(req, MAX_INTAKE_BYTES);
      if (raw === null) return send(413, page("Too long", "<p>That was too long to send. Please shorten the longest answers.</p>"));
      const fields = Object.fromEntries(new URLSearchParams(raw));
      const done = page("Thank you!", `<p>${esc(state.desk.profile.name)} has your information. Tell them directly about anything that changes.</p>`);
      if (fields.website) return send(200, done, TYPES.html, nostore);
      const fam = state.desk.families[i] = mergeIntake(state.desk.families[i], parseIntake(fields), today);
      save();
      await msg.sitter(`Family info sheet received: ${fam.name || fam.contactName || "a family"}`, "Sync the app to see it in the Families tab.");
      return send(200, done, TYPES.html, nostore);
    }
    if (url.pathname.startsWith("/ref/") && (req.method === "GET" || req.method === "POST")) {
      // A referee's private link: their words and two separate consents (references.mjs).
      let fields = null;
      if (req.method === "POST") {
        const raw = await readBody(req, REF_LIMITS.body);
        if (raw === null) return send(413, page("Too long", "<p>That was too long. Please shorten it and try again.</p>"));
        fields = Object.fromEntries(new URLSearchParams(raw));
      }
      const out = handleRef(state.desk, req.method, url.pathname.slice(5), fields, now());
      if (out.ref) { state.desk.references = state.desk.references.map((r) => (r.id === out.ref.id ? out.ref : r)); save(); }
      if (out.notice) await msg.sitter("Babysitting reference", out.notice);
      return send(out.code, out.html, TYPES.html, out.headers);
    }
    if (req.method === "GET" && url.pathname === "/calendar.ics") {
      if (!env.CAL_TOKEN || !same(url.searchParams.get("t") || "", env.CAL_TOKEN)) return send(401, "calendar link required\n", "text/plain");
      return send(200, toICS(state.desk, { from: today.slice(0, 4) + "-01-01" }), "text/calendar; charset=utf-8");
    }
    if (url.pathname.startsWith("/api/")) {
      if (!env.ADMIN_KEY) return send(503, "Set ADMIN_KEY.\n", "text/plain");
      const auth = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
      if (!same(auth, env.ADMIN_KEY)) return send(401, "admin key required\n", "text/plain");
      if (await backupApi(req, url, send, state, save, env, now, readBody)) return; // backup.mjs: status, backup, restore
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
        incoming.automations = mergeAutomationState(state.desk.automations, incoming.automations);
        if (Array.isArray(incoming.references)) incoming.references = mergeReferences(state.desk, incoming.references); // keep answers that arrived by link
        incoming.safety = mergeSafety(state.desk.safety, incoming.safety, now()); // keep check-in taps and alerts from the server
        state.desk = normalizeDesk(keepIntakes(state.desk, incoming)); // and info sheets families filled in
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
  const state = { desk: loadDesk(statePath, { dir: backupDir(process.env) }).desk }; // a damaged file is moved aside, never overwritten
  const save = () => atomicWrite(statePath, JSON.stringify(state.desk));
  let lastBackup = "";
  const backup = () => { const t = localDate(Date.now(), process.env.TZ); if (t !== lastBackup) { lastBackup = t; dailyBackup(state, process.env, t); } };
  backup();
  const port = Number(process.env.PORT || 8080);
  http.createServer(handler(state, save)).listen(port, () => console.log(`babysitting desk on :${port}${process.env.ADMIN_KEY ? "" : " (set ADMIN_KEY to sync and read the API)"}`));
  const digestHour = Number(process.env.DIGEST_HOUR ?? 7);
  let lastDigest = "";
  setInterval(() => {
    const d = new Date();
    const today = localDate(d.getTime(), process.env.TZ);
    runAutomations(state, save, process.env, d.getTime()).catch((e) => console.error("automations failed:", e.message));
    if (d.getHours() === digestHour && lastDigest !== today) { lastDigest = today; state.lastDigest = today; dailyDigest(state, save, process.env, today).catch((e) => console.error("digest failed:", e.message)); }
    backup();
  }, 5 * 60 * 1000).unref?.();
  // Late-sit check-ins every minute, at any hour: safety alerts ignore quiet hours.
  const sitterMsg = messenger(process.env).sitter;
  setInterval(() => { runSafety(state, save, process.env, Date.now(), globalThis.fetch, sitterMsg).catch((e) => console.error("safety check failed:", e.message)); }, 60 * 1000).unref?.();
}
