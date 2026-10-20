#!/usr/bin/env node
// Self-hosted booking pages. Zero dependencies, state in one JSON file.
//   ADMIN_KEY=... COMPANY_NAME=Acme node server.mjs
// Optional: BUSY_ICS_URL (your calendar's secret iCal address, https) so booked-elsewhere time is never offered;
// RESEND_API_KEY + MAIL_FROM + HOST_EMAIL with DRY_RUN=false to send invitations; ALERT_WEBHOOK_URL (Slack/Discord).
import http from "node:http";
import fs from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { newState, saveEvent, book, cancel, byToken, slotsFor, feedBusy, dueReminders, purgeOlderThan, toCsv, isEmail } from "./book.mjs";
import { buildIcs, parseIcsBusy, validTz } from "./slot.mjs";
import { eventPage, confirmPage, bookingPage, thanksCancel, adminPage, eventFormPage, esc } from "./render.mjs";

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

const uid = (b) => `${b.id}-${b.token.slice(0, 10)}@slot-keeper`;
const inviteIcs = (b, ev, cfg, method = "REQUEST") => buildIcs({ uid: uid(b), start: b.start, end: b.end, summary: `${b.eventName}: ${cfg.company} and ${b.name}`, description: b.notes, location: ev?.location || "", organizer: cfg.hostEmail ? { name: cfg.company, email: cfg.hostEmail } : null, attendee: { name: b.name, email: b.email }, method, sequence: method === "CANCEL" ? 1 : 0, now: (cfg.now || Date.now)() });

// cfg: {state, save, adminKey, company, sponsor, now, notify, sendEmail, dryRun, trustProxy, baseUrl, hostEmail, external, embedOrigins, limits}
export function handler(cfg) {
  const now = cfg.now || Date.now;
  const lim = { book: limiter(10, 60_000), read: limiter(300, 60_000), ...cfg.limits };
  const { state } = cfg;
  const ext = () => cfg.external?.() || [];
  const mail = (msg) => {
    if (cfg.dryRun) console.log(`[dry run] would email ${msg.to}: ${msg.subject}`);
    else cfg.sendEmail?.(msg).catch((e) => console.error("email failed:", e.message));
  };
  const link = (base, b) => `${base}/c/${b.token}`;
  const notifyBooked = (b, ev, base, replaced) => {
    const at = (tz) => new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "full", timeStyle: "short" }).format(new Date(b.start));
    mail({ to: b.email, subject: `Confirmed: ${b.eventName} on ${at(b.tz)}`.slice(0, 200), text: `Hi ${b.name},\n\nYou are booked: ${b.eventName} with ${cfg.company}.\nWhen: ${at(b.tz)} (${b.tz})\n${ev?.location ? `Where: ${ev.location}\n` : ""}\nCancel or reschedule: ${link(base, b)}\n`, ics: inviteIcs(b, ev, cfg), replyTo: cfg.hostEmail });
    if (cfg.hostEmail) mail({ to: cfg.hostEmail, subject: `New booking: ${b.name}, ${at(ev?.tz || "UTC")}`.slice(0, 200), text: `${b.name} <${b.email}> booked ${b.eventName}.\nWhen: ${at(ev?.tz || "UTC")} (${ev?.tz || "UTC"})\n${b.notes ? `Notes: ${b.notes}\n` : ""}${replaced ? "This replaces an earlier booking they cancelled.\n" : ""}`, ics: inviteIcs(b, ev, cfg), replyTo: b.email });
    cfg.notify?.(`${replaced ? "Rescheduled" : "New booking"}: ${b.name} · ${b.eventName} · ${new Date(b.start).toISOString().slice(0, 16)}Z`);
  };
  const notifyCancelled = (b, ev, by) => {
    mail({ to: b.email, subject: `Cancelled: ${b.eventName}`.slice(0, 200), text: `Your booking of ${b.eventName} with ${cfg.company} has been cancelled${by === "host" ? " by the host" : ""}.`, ics: inviteIcs(b, ev, cfg, "CANCEL"), replyTo: cfg.hostEmail });
    if (cfg.hostEmail && by !== "host") mail({ to: cfg.hostEmail, subject: `Cancelled: ${b.name}, ${b.eventName}`.slice(0, 200), text: `${b.name} <${b.email}> cancelled ${b.eventName}.`, ics: inviteIcs(b, ev, cfg, "CANCEL") });
    if (by !== "rescheduled") cfg.notify?.(`Cancelled (${by}): ${b.name} · ${b.eventName} · ${new Date(b.start).toISOString().slice(0, 16)}Z`);
  };
  return async (req, res) => {
    const url = new URL(req.url, "http://x");
    const ip = (cfg.trustProxy && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket.remoteAddress || "?";
    const base = cfg.baseUrl || `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;
    const path = url.pathname;
    const embeddable = /^\/b\//.test(path) && cfg.embedOrigins?.length;
    const send = (code, body, type = "text/html; charset=utf-8", headers = {}) => {
      res.writeHead(code, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "same-origin", "content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; frame-ancestors ${embeddable ? cfg.embedOrigins.join(" ") : "'none'"}; form-action 'self'`, ...headers });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    const redirect = (to) => send(303, "", "text/plain", { location: to });
    const plain = (code, text) => send(code, `${text}\n`, "text/plain");
    const needAdmin = () => send(401, "admin key required\n", "text/plain", { "www-authenticate": 'Basic realm="admin"' });
    const cfgNow = { ...cfg, now };
    try {
      if (!lim.read(ip, now())) return plain(429, "slow down");
      const tzOf = (v, ev) => (validTz(v) ? v : ev.tz);
      let m;

      if (path === "/healthz") return plain(200, "ok");
      if (path === "/") return plain(200, "slot-keeper: booking pages at /b/<event>, admin at /admin.");

      if ((m = path.match(/^\/api\/([a-z0-9-]+)\/slots$/))) {
        const ev = state.events[m[1]]; if (!ev) return plain(404, "not found");
        const tz = tzOf(url.searchParams.get("tz"), ev);
        const slots = slotsFor(state, ev, now(), ext());
        return send(200, { event: ev.id, name: ev.name, minutes: ev.minutes, tz, slots: slots.map((s) => ({ start: new Date(s).toISOString(), startMs: s })) }, "application/json", { "access-control-allow-origin": "*" });
      }

      if ((m = path.match(/^\/b\/([a-z0-9-]+)(\/confirm|\/book)?$/))) {
        const ev = state.events[m[1]]; if (!ev) return plain(404, "not found");
        const old = url.searchParams.get("reschedule");
        const prior = old ? byToken(state, old) : null;
        if (!m[2] && req.method === "GET") {
          const tz = tzOf(url.searchParams.get("tz"), ev);
          return send(200, eventPage(cfgNow, ev, slotsFor(state, ev, now(), ext(), prior?.id), { tz, d: url.searchParams.get("d") || "", reschedule: prior?.status === "confirmed" ? old : null }, now()));
        }
        if (m[2] === "/confirm" && req.method === "GET") {
          const start = Number(url.searchParams.get("start")), tz = tzOf(url.searchParams.get("tz"), ev);
          if (!slotsFor(state, ev, now(), ext(), prior?.id).includes(start)) return redirect(`/b/${ev.id}?tz=${encodeURIComponent(tz)}${old ? `&reschedule=${encodeURIComponent(old)}` : ""}`);
          return send(200, confirmPage(cfgNow, ev, start, tz, { reschedule: prior?.status === "confirmed" ? old : null, prefill: prior?.status === "confirmed" ? prior : null }));
        }
        if (m[2] === "/book" && req.method === "POST") {
          if (!lim.book(`${ip}:${ev.id}`, now())) return plain(429, "too many attempts; try again in a minute");
          const f = Object.fromEntries(new URLSearchParams(await readBody(req)));
          if (f._gotcha) return plain(200, "ok");
          const r = book(state, ev.id, f, now(), ext());
          if (r.error) return plain(r.status, r.error);
          cfg.save();
          if (r.replaced) notifyCancelled(r.replaced, ev, "rescheduled");
          notifyBooked(r.booking, ev, base, r.replaced);
          return redirect(`/c/${r.booking.token}`);
        }
        return plain(405, "method not allowed");
      }

      if ((m = path.match(/^\/c\/(\w+?)(\.ics|\/cancel)?$/))) {
        const b = byToken(state, m[1]); if (!b || !same(b.token, m[1])) return plain(404, "not found");
        const ev = state.events[b.event];
        if (m[2] === ".ics") return send(200, inviteIcs(b, ev, cfg, b.status === "confirmed" ? "REQUEST" : "CANCEL"), "text/calendar; charset=utf-8", { "content-disposition": 'attachment; filename="booking.ics"' });
        if (m[2] === "/cancel") {
          if (req.method !== "POST") return plain(405, "method not allowed");
          if (cancel(state, b, "invitee", now())) { cfg.save(); notifyCancelled(b, ev, "invitee"); }
          return send(200, thanksCancel(cfgNow));
        }
        return send(200, bookingPage(cfgNow, b, ev, base));
      }

      if ((m = path.match(/^\/feed\/(\w+)\.ics$/))) {
        if (!same(m[1], state.feedToken)) return plain(404, "not found");
        const body = Object.values(state.bookings).filter((b) => b.status === "confirmed").map((b) => inviteIcs(b, state.events[b.event], cfg).replace(/METHOD:REQUEST\r\n/, "").replace(/^BEGIN:VCALENDAR\r\n[\s\S]*?(?=BEGIN:VEVENT)/, "").replace(/END:VCALENDAR\r\n$/, "")).join("");
        return send(200, `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//slot-keeper//EN\r\nX-WR-CALNAME:${String(cfg.company).replace(/[\r\n,;]/g, " ")} bookings\r\n${body}END:VCALENDAR\r\n`, "text/calendar; charset=utf-8");
      }

      if (path.startsWith("/admin")) {
        if (!adminOk(req, cfg.adminKey)) return needAdmin();
        if (req.method === "GET") {
          if (path === "/admin") return send(200, adminPage(cfgNow, state, base, now()));
          if (path === "/admin/export.csv") return send(200, toCsv(state), "text/csv; charset=utf-8", { "content-disposition": 'attachment; filename="bookings.csv"' });
          if (path === "/admin/event/new") return send(200, eventFormPage(cfgNow, null));
          if ((m = path.match(/^\/admin\/event\/([a-z0-9-]+)$/)) && state.events[m[1]]) return send(200, eventFormPage(cfgNow, state.events[m[1]]));
          return plain(404, "not found");
        }
        if (req.method !== "POST") return plain(405, "method not allowed");
        // CSRF: a cross-site page must not ride the browser's cached admin credentials.
        const origin = req.headers.origin;
        if (origin && origin !== "null" && new URL(origin).host !== req.headers.host && !(req.headers.authorization || "").startsWith("Bearer ")) return plain(403, "cross-site request refused");
        const f = Object.fromEntries(new URLSearchParams(await readBody(req)));
        if (path === "/admin/events") {
          const r = saveEvent(state, f);
          if (r.errors.length) return send(400, eventFormPage(cfgNow, state.events[f.id] || null, r.errors));
          if (!r.event.created) r.event.created = now();
          cfg.save(); return redirect("/admin");
        }
        if ((m = path.match(/^\/admin\/events\/([a-z0-9-]+)\/delete$/))) { delete state.events[m[1]]; cfg.save(); return redirect("/admin"); }
        if ((m = path.match(/^\/admin\/b\/(b\d+)\/cancel$/))) {
          const b = state.bookings[m[1]]; if (!b) return plain(404, "not found");
          if (cancel(state, b, "host", now())) { cfg.save(); notifyCancelled(b, state.events[b.event], "host"); }
          return redirect("/admin");
        }
      }
      return plain(404, "not found");
    } catch (e) {
      if (![400, 404, 413, 429].includes(e.status)) console.error("request failed:", e.message);
      const code = e instanceof SyntaxError ? 400 : e.status || 500;
      return plain(code, code === 500 ? "error" : e.message);
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
  const body = { from: env.MAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text, ...(msg.replyTo ? { reply_to: msg.replyTo } : {}), ...(msg.ics ? { attachments: [{ filename: "invite.ics", content: Buffer.from(msg.ics).toString("base64") }] } : {}) };
  const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`resend ${res.status}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!env.ADMIN_KEY || env.ADMIN_KEY.length < 12) { console.error("ADMIN_KEY (12+ characters) is required"); process.exit(1); }
  for (const k of ["ALERT_WEBHOOK_URL", "BUSY_ICS_URL"]) if (env[k] && !/^https:\/\//.test(env[k])) { console.error(`${k} must be https`); process.exit(1); }
  const dryRun = env.DRY_RUN !== "false";
  if (!dryRun && (!env.RESEND_API_KEY || !env.MAIL_FROM)) { console.error("DRY_RUN=false needs RESEND_API_KEY and MAIL_FROM"); process.exit(1); }
  if (!dryRun && !/^https:\/\//.test(env.PUBLIC_URL || "")) { console.error("DRY_RUN=false needs PUBLIC_URL (https): without it, links in email are built from the request's Host header, which a stranger can forge"); process.exit(1); }
  const statePath = env.STATE || "state.json";
  const state = { ...newState(), ...readJson(statePath, {}) };
  const save = () => { fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(state), { mode: 0o600 }); fs.renameSync(`${statePath}.tmp`, statePath); };
  save();
  const cfg = {
    state, save, adminKey: env.ADMIN_KEY, company: env.COMPANY_NAME || "Bookings", sponsor: env.HIDE_SPONSOR_LINK !== "true", hostEmail: env.HOST_EMAIL || "",
    baseUrl: env.PUBLIC_URL, trustProxy: env.TRUST_PROXY === "true", defaultTz: env.DEFAULT_TZ || "UTC",
    embedOrigins: (env.EMBED_ORIGINS || "").split(/[\s,]+/).filter((o) => /^https:\/\/[\w.-]+(:\d+)?$/.test(o)),
    notify: env.ALERT_WEBHOOK_URL ? webhook(env.ALERT_WEBHOOK_URL) : null, sendEmail: sendResend, dryRun, external: () => feedBusy(feed, Date.now(), { configured: Boolean(env.BUSY_ICS_URL) }),
  };
  // Calendar feed: refreshed every 5 minutes; a failed fetch keeps the last good copy and shows a warning in /admin.
  const feed = { busy: [], at: 0 };
  const refresh = async () => {
    if (!env.BUSY_ICS_URL) return;
    try {
      const r = await fetch(env.BUSY_ICS_URL, { signal: AbortSignal.timeout(10_000), redirect: "follow" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = (await r.text()).slice(0, 5_000_000), t = Date.now();
      feed.busy = parseIcsBusy(text, t - 86_400_000, t + 400 * 86_400_000, Object.values(state.events)[0]?.tz || cfg.defaultTz);
      feed.at = t;
      cfg.feedError = null;
    } catch (e) { cfg.feedError = e.message; console.error("busy feed failed:", e.message); }
  };
  const sweep = () => {
    const t = Date.now(); let changed = false;
    for (const b of dueReminders(state, t, Number(env.REMINDER_HOURS ?? 24))) {
      b.remindedAt = t; changed = true;
      const ev = state.events[b.event], at = new Intl.DateTimeFormat("en-US", { timeZone: b.tz, dateStyle: "full", timeStyle: "short" }).format(new Date(b.start));
      const text = `Reminder: ${b.eventName} with ${cfg.company} is on ${at} (${b.tz}).${ev?.location ? `\nWhere: ${ev.location}` : ""}${cfg.baseUrl ? `\nCancel or reschedule: ${cfg.baseUrl.replace(/\/$/, "")}/c/${b.token}` : ""}`;
      if (dryRun) console.log(`[dry run] would remind ${b.email}`); else sendResend({ to: b.email, subject: `Reminder: ${b.eventName} on ${at}`.slice(0, 200), text, replyTo: cfg.hostEmail }).catch((e) => console.error("reminder failed:", e.message));
    }
    if (purgeOlderThan(state, t, Number(env.RETENTION_DAYS || 0))) changed = true;
    if (changed) save();
  };
  await refresh(); setInterval(refresh, 300_000).unref();
  sweep(); setInterval(sweep, 600_000).unref();
  http.createServer(handler(cfg)).listen(Number(env.PORT || 8080), () => console.log(`slot-keeper on :${env.PORT || 8080} (${Object.keys(state.events).length} event types, ${Object.keys(state.bookings).length} bookings)`));
}
export { isEmail, esc };
