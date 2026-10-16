#!/usr/bin/env node
// Self-hosted booking pages. Zero dependencies, state in one JSON file.
//   ADMIN_KEY=... node server.mjs      then open /admin
// Email: RESEND_API_KEY + MAIL_FROM with DRY_RUN=false (starts in dry run). CALENDAR busy times: set the feed URL in /admin.
import http from "node:http";
import fs from "node:fs";
import dns from "node:dns/promises";
import net from "node:net";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { newState, updateSettings, upsertType, removeType, slotsFor, book, reschedule, cancel, upcoming, dueReminders, purgeOlderThan, toCsv } from "./book.mjs";
import { validZone, longDate, dayKey, addDays, zonedToUtc } from "./slots.mjs";
import { busyFromIcs, buildIcs } from "./ics.mjs";
import { homePage, slotsPage, confirmPage, bookingPage, adminPage, notFoundPage } from "./render.mjs";

const env = process.env;
const DAY = 86_400_000;

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

// cfg: {state, save, adminKey, sponsor, now, notify, sendEmail, dryRun, trustProxy, baseUrl, embedOrigins, external, limits}
//   external(now) -> Promise<[{start,end}]>  busy intervals imported from the host's calendar feed
export function handler(cfg) {
  const now = cfg.now || Date.now;
  const lim = { book: limiter(8, 60_000), read: limiter(300, 60_000), ...cfg.limits };
  const { state } = cfg;
  const mail = (msg) => {
    if (!msg.to) return;
    msg = { ...msg, subject: msg.subject.replace(/[\r\n]+/g, " ").slice(0, 200) };
    if (cfg.dryRun) console.log(`[dry run] would email ${msg.to}: ${msg.subject}`);
    else cfg.sendEmail?.(msg).catch((e) => console.error("email failed:", e.message));
  };
  const hostName = () => state.settings.name || "your host";
  const emailBooking = (kind, b, base) => {
    const type = state.types[b.type]; const label = type?.name || b.type;
    const when = longDate(b.start, b.tz), link = `${base}/b/${b.token}`;
    const lines = { confirmed: `You're booked: ${label} with ${hostName()}.`, rescheduled: `Your booking moved: ${label} with ${hostName()}.`, cancelled: `Cancelled: ${label} with ${hostName()}.`, reminder: `Reminder: ${label} with ${hostName()} is coming up.` }[kind];
    mail({ to: b.email, subject: `${lines.split(":")[0]}: ${label} · ${when}`, text: `${lines}\n\n${when}${type?.location ? `\n${type.location}` : ""}\n\n${kind === "cancelled" ? `Book again: ${base}/e/${b.type}` : `Add to calendar, change or cancel: ${link}\nCalendar file: ${link}.ics`}`, replyTo: state.settings.hostEmail || undefined });
    if (kind !== "reminder") {
      const hw = longDate(b.start, state.settings.tz);
      mail({ to: state.settings.hostEmail, subject: `${kind === "confirmed" ? "New booking" : kind === "rescheduled" ? "Moved" : "Cancelled"}: ${b.name} · ${label} · ${hw}`, text: `${b.name} <${b.email}>\n${label}\n${hw}${b.notes ? `\n\nNotes:\n${b.notes}` : ""}${b.reason ? `\n\nReason: ${b.reason}` : ""}`, replyTo: b.email });
      cfg.notify?.(`${kind === "confirmed" ? "New booking" : kind === "rescheduled" ? "Booking moved" : "Booking cancelled"}: ${b.name.slice(0, 60)} · ${label} · ${hw}`.slice(0, 300));
    }
  };
  cfg.sweep = async () => {
    const t = now();
    const due = dueReminders(state, t);
    for (const b of due) { b.reminded = true; emailBooking("reminder", b, cfg.baseUrl || cfg.lastBase || ""); }
    if (due.length) cfg.save();
    return due.length;
  };

  return async (req, res) => {
    const url = new URL(req.url, "http://x");
    const ip = (cfg.trustProxy && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket.remoteAddress || "?";
    const base = cfg.baseUrl || `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;
    if (!cfg.baseUrl) cfg.lastBase = base;
    const nonce = randomBytes(12).toString("base64url");
    const rcfg = { ...cfg, nonce, externalCount: 0 };
    const embeddable = /^\/(e|b)\//.test(url.pathname) && (cfg.embedOrigins || []).length;
    const send = (code, body, type = "text/html; charset=utf-8", headers = {}) => {
      res.writeHead(code, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "same-origin", "content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; frame-ancestors ${embeddable ? cfg.embedOrigins.join(" ") : "'none'"}; form-action 'self'`, ...headers });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    const redirect = (to) => send(303, "", "text/plain", { location: to });
    const text = (code, msg) => send(code, `${msg}\n`, "text/plain");
    const page = (code, html) => send(code, html);
    const tzOf = (q) => (validZone(q) ? q : state.settings.tz);
    const external = async () => { try { return (await cfg.external?.(now())) || []; } catch (e) { console.error("calendar feed failed:", e.message); return []; } };
    try {
      if (!lim.read(ip, now())) return text(429, "slow down");
      const path = url.pathname; let m;
      if (path === "/healthz") return text(200, "ok");
      if (path === "/" && req.method === "GET") return page(200, homePage(rcfg, state));

      // JSON for custom front ends: /api/slots/<type>?from=YYYY-MM-DD&days=14&tz=...
      if ((m = path.match(/^\/api\/slots\/([a-z0-9-]+)$/)) && req.method === "GET") {
        const type = state.types[m[1]]; if (!type) return text(404, "no such meeting");
        const tz = tzOf(url.searchParams.get("tz")), days = Math.min(31, Math.max(1, Number(url.searchParams.get("days")) || 14));
        const t = now(), from = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("from") || "") ? url.searchParams.get("from") : dayKey(t, tz);
        const [y, mo, d] = from.split("-").map(Number); const lo = zonedToUtc(y, mo, d, 0, 0, tz) ?? t;
        const slots = slotsFor(state, type, { external: await external(), now: t, from: lo, to: lo + days * DAY });
        return send(200, { type: type.slug, minutes: type.minutes, tz, slots: slots.map((s) => ({ start: s, iso: new Date(s).toISOString() })) }, "application/json", { "access-control-allow-origin": "*" });
      }

      if ((m = path.match(/^\/e\/([a-z0-9-]+)(?:\/(at\/(\d+)|book))?$/))) {
        const type = state.types[m[1]]; if (!type) return page(404, notFoundPage(rcfg, "That meeting does not exist."));
        const tz = tzOf(url.searchParams.get("tz"));
        const t = now();
        if (!m[2] && req.method === "GET") {
          const today = dayKey(t, tz), q = url.searchParams.get("from");
          const from = /^\d{4}-\d{2}-\d{2}$/.test(q || "") && q >= today ? q : today, days = 7;
          const [y, mo, d] = from.split("-").map(Number); const lo = zonedToUtc(y, mo, d, 0, 0, tz) ?? t;
          const hi = zonedToUtc(...addDays(from, days).split("-").map(Number), 0, 0, tz) ?? lo + days * DAY;
          const slots = slotsFor(state, type, { external: await external(), now: t, from: lo, to: hi });
          return page(200, slotsPage(rcfg, { type, tz, slots, from, days, now: t, base: `/e/${type.slug}`, heading: type.name, link: (s) => `/e/${type.slug}/at/${s}?tz=${encodeURIComponent(tz)}` }));
        }
        if (m[2]?.startsWith("at/") && req.method === "GET") {
          const start = Number(m[3]);
          if (!slotsFor(state, type, { external: await external(), now: t, from: start, to: start + 1 }).includes(start)) return page(409, slotsPage(rcfg, { type, tz, slots: [], from: dayKey(t, tz), days: 7, now: t, base: `/e/${type.slug}`, heading: type.name, link: () => "#", error: "That time was just taken. Please pick another." }));
          return page(200, confirmPage(rcfg, { type, tz, start }));
        }
        if (m[2] === "book" && req.method === "POST") {
          if (!lim.book(ip, t)) return text(429, "too many attempts; try again in a minute");
          const f = Object.fromEntries(new URLSearchParams(await readBody(req)));
          if (f._gotcha) return redirect(`/e/${type.slug}`); // honeypot: bots learn nothing
          const r = book(state, type.slug, f, t, await external());
          if (r.error) return page(r.status, confirmPage(rcfg, { type, tz: tzOf(f.tz), start: Number(f.start) || t, error: r.error, values: f }));
          cfg.save(); emailBooking("confirmed", r.booking, base);
          return redirect(`/b/${r.booking.token}`);
        }
        return text(405, "method not allowed");
      }

      // A booking, by its secret link.
      if ((m = path.match(/^\/b\/(\w+?)(\.ics|\/cancel|\/reschedule(?:\/at\/(\d+))?)?$/))) {
        const b = Object.values(state.bookings).find((x) => same(x.token, m[1]));
        if (!b) return page(404, notFoundPage(rcfg, "This booking link is not valid."));
        const type = state.types[b.type], tz = tzOf(url.searchParams.get("tz") || b.tz), t = now();
        if (!m[2] && req.method === "GET") return page(200, bookingPage(rcfg, state, b, base, { viewTz: tz, notice: url.searchParams.get("done") === "moved" ? "Your booking was moved." : url.searchParams.get("done") === "cancelled" ? "Your booking was cancelled." : "" }));
        if (m[2] === ".ics" && req.method === "GET") {
          const s = state.settings;
          return send(200, buildIcs({ uid: `${b.id}-${b.token.slice(0, 8)}@slot-keeper`, start: b.start, end: b.end, title: `${type?.name || b.type} with ${hostName()}`, description: `Manage: ${base}/b/${b.token}`, location: type?.location || "", organizer: s.hostEmail ? { name: s.name, email: s.hostEmail } : undefined, attendee: { name: b.name, email: b.email }, status: b.status === "confirmed" ? "CONFIRMED" : "CANCELLED", sequence: b.rev, now: t }), "text/calendar; charset=utf-8", { "content-disposition": 'attachment; filename="booking.ics"' });
        }
        if (m[2] === "/cancel" && req.method === "POST") {
          const f = Object.fromEntries(new URLSearchParams(await readBody(req)));
          if (cancel(b, "invitee", t, f.reason)) { cfg.save(); emailBooking("cancelled", b, base); }
          return redirect(`/b/${b.token}?done=cancelled`);
        }
        if (m[2]?.startsWith("/reschedule") && type && b.status === "confirmed") {
          if (m[3] === undefined && req.method === "GET") {
            const today = dayKey(t, tz), q = url.searchParams.get("from"), from = /^\d{4}-\d{2}-\d{2}$/.test(q || "") && q >= today ? q : today;
            const [y, mo, d] = from.split("-").map(Number); const lo = zonedToUtc(y, mo, d, 0, 0, tz) ?? t;
            const hi = zonedToUtc(...addDays(from, 7).split("-").map(Number), 0, 0, tz) ?? lo + 7 * DAY;
            const slots = slotsFor(state, type, { external: await external(), now: t, from: lo, to: hi, ignoreId: b.id });
            return page(200, slotsPage(rcfg, { type, tz, slots, from, days: 7, now: t, base: `/b/${b.token}/reschedule`, heading: `Move: ${type.name}`, link: (s) => `/b/${b.token}/reschedule/at/${s}?tz=${encodeURIComponent(tz)}` }));
          }
          if (m[3] !== undefined && req.method === "GET") {
            return page(200, confirmMove(rcfg, b, type, tz, Number(m[3])));
          }
          if (m[3] === undefined && req.method === "POST") {
            if (!lim.book(ip, t)) return text(429, "too many attempts; try again in a minute");
            const f = Object.fromEntries(new URLSearchParams(await readBody(req)));
            const r = reschedule(state, b, Number(f.start), t, await external());
            if (r.error) return text(r.status, r.error);
            cfg.save(); emailBooking("rescheduled", b, base);
            return redirect(`/b/${b.token}?done=moved`);
          }
        }
        return text(405, "method not allowed");
      }

      if (path.startsWith("/admin")) {
        if (!adminOk(req, cfg.adminKey)) return send(401, "admin key required\n", "text/plain", { "www-authenticate": 'Basic realm="admin"' });
        const ext = await external(); rcfg.externalCount = ext.length;
        if (req.method === "GET") {
          if (path === "/admin") return page(200, adminPage(rcfg, state, base, now(), {}, url.searchParams.get("error") || ""));
          if (path === "/admin/export.csv") return send(200, toCsv(state), "text/csv; charset=utf-8", { "content-disposition": 'attachment; filename="bookings.csv"' });
          return text(404, "not found");
        }
        if (req.method !== "POST") return text(405, "method not allowed");
        // CSRF: a cross-site page must not ride the browser's cached admin credentials.
        const origin = req.headers.origin;
        if (origin && origin !== "null" && new URL(origin).host !== req.headers.host && !(req.headers.authorization || "").startsWith("Bearer ")) return text(403, "cross-site request refused");
        const f = Object.fromEntries(new URLSearchParams(await readBody(req)));
        const back = (fn) => { try { fn(); cfg.save(); return redirect("/admin"); } catch (e) { if (e.status) throw e; return page(400, adminPage(rcfg, state, base, now(), {}, e.message)); } };
        if (path === "/admin/settings") return back(() => { updateSettings(state, f); cfg.invalidateExternal?.(); });
        if (path === "/admin/types") return back(() => upsertType(state, f));
        if ((m = path.match(/^\/admin\/types\/([a-z0-9-]+)\/delete$/))) return back(() => { if (!removeType(state, m[1])) throw Object.assign(new Error("not found"), { status: 404 }); });
        if ((m = path.match(/^\/admin\/bookings\/(b\d+)\/cancel$/))) {
          const b = state.bookings[m[1]]; if (!b) return text(404, "not found");
          if (cancel(b, "host", now(), f.reason)) { cfg.save(); emailBooking("cancelled", b, base); }
          return redirect("/admin");
        }
      }
      return text(404, "not found");
    } catch (e) {
      if (![400, 404, 413, 429].includes(e.status)) console.error("request failed:", e.message);
      const code = e instanceof SyntaxError ? 400 : e.status || 500;
      return text(code, code === 500 ? "error" : e.message);
    }
  };
}

function confirmMove(cfg, b, type, tz, start) {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Confirm the new time</title></head><body style="font:16px system-ui;max-width:640px;margin:24px auto;padding:0 16px"><h1>Move ${esc(type.name)}</h1><p>New time: <b>${esc(longDate(start, tz))}</b></p><form method="post" action="/b/${esc(b.token)}/reschedule"><input type="hidden" name="start" value="${start}"><button>Confirm new time</button></form><p><a href="/b/${esc(b.token)}/reschedule?tz=${encodeURIComponent(tz)}">Pick another time</a></p></body></html>`;
}

// Refuse anything that is not public https: a calendar feed address is typed by the admin, but the server should still never be a way into the host's network.
export async function safeFeedUrl(u) {
  const url = new URL(u);
  if (url.protocol !== "https:") throw new Error("calendar feed must be https");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  for (const { address } of addrs) if (isPrivate(address)) throw new Error("calendar feed resolves to a private address");
  return url;
}
export function isPrivate(a) {
  if (net.isIPv4(a)) { const [p, q] = a.split(".").map(Number); return p === 10 || p === 127 || p === 0 || (p === 169 && q === 254) || (p === 172 && q >= 16 && q <= 31) || (p === 192 && q === 168) || (p === 100 && q >= 64 && q <= 127) || p >= 224; }
  const x = a.toLowerCase(); if (x.startsWith("::ffff:")) return isPrivate(x.slice(7));
  return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb");
}

// Fetches the host's calendar feed at most every five minutes, and keeps the last good copy if a fetch fails.
export function feedLoader(state, { fetchText, ttl = 300_000 } = {}) {
  let cached = { url: "", at: 0, busy: [] };
  const load = async (now) => {
    const u = state.settings.icsUrl; if (!u) return [];
    if (cached.url === u && now - cached.at < ttl) return cached.busy;
    const prev = cached.url === u ? cached.busy : [];
    cached = { url: u, at: now, busy: prev }; // set first so a slow or failing feed is not hammered
    const raw = await (fetchText || defaultFetch)(u);
    cached = { url: u, at: now, busy: busyFromIcs(raw, { tz: state.settings.tz, from: now - DAY, to: now + 400 * DAY }) };
    return cached.busy;
  };
  load.invalidate = () => { cached = { url: "", at: 0, busy: [] }; };
  return load;
}
async function defaultFetch(u) {
  const url = await safeFeedUrl(u);
  const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { accept: "text/calendar" } });
  if (!res.ok) throw new Error(`feed answered ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 5_000_000) throw new Error("feed is larger than 5 MB");
  return buf.toString("utf8");
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
  const saved = readJson(statePath, {});
  const state = { ...newState(), ...saved, settings: { ...newState().settings, ...(saved.settings || {}) } };
  if (env.HOST_TZ && !saved.settings) state.settings.tz = env.HOST_TZ;
  if (env.HOST_NAME && !saved.settings) state.settings.name = env.HOST_NAME;
  const save = () => { fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(state), { mode: 0o600 }); fs.renameSync(`${statePath}.tmp`, statePath); };
  save();
  const external = feedLoader(state);
  const keepDays = Number(env.RETENTION_DAYS || 0);
  const cfg = {
    state, save, adminKey: env.ADMIN_KEY, sponsor: env.HIDE_SPONSOR_LINK !== "true", baseUrl: env.PUBLIC_URL, trustProxy: env.TRUST_PROXY === "true",
    embedOrigins: (env.EMBED_ORIGINS || "").split(/[\s,]+/).filter((o) => /^https?:\/\/[^\s*;'"]+$/.test(o)),
    notify: env.ALERT_WEBHOOK_URL ? webhook(env.ALERT_WEBHOOK_URL) : null, sendEmail: sendResend, dryRun, external, invalidateExternal: external.invalidate,
  };
  const h = handler(cfg);
  setInterval(() => { cfg.sweep().catch((e) => console.error("reminders failed:", e.message)); if (keepDays > 0 && purgeOlderThan(state, keepDays, Date.now())) save(); }, 60_000).unref();
  http.createServer(h).listen(Number(env.PORT || 8080), () => console.log(`slot-keeper on :${env.PORT || 8080} (${upcoming(state, Date.now()).length} upcoming bookings)`));
}
