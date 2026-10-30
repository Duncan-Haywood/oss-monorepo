// Babysitting Business Kit: the server half of the late-sit check-in (safety.mjs).
//
//   safetyRoutes(...)  GET|POST /safe/<token>   the sitter's own "I'm home safe" page
//                      PUT  /api/safety/checkin  the app starts, extends or ends one (admin key)
//   runSafety(...)     called every minute: reminds the sitter at her home-by time, then
//                      alerts her trusted contact after the grace period
//
// Uses the sending set-up the automations already have, on the sitter's own accounts:
//   TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM   a text to the contact
//   RESEND_API_KEY + FROM_EMAIL                            an email to the contact
//   PUBLIC_URL                                             the link in the sitter's reminder
//   TZ                                                     how times read in the messages
// With neither texts nor email set up, check-ins are refused, so nobody relies on one
// that cannot fire. Quiet hours do NOT apply: a safety alert goes out at any hour,
// unlike the marketing and reminder messages in automations-server.mjs.

import { timingSafeEqual } from "node:crypto";
import { sendEmail, sendSms, channelsFrom } from "./automations-server.mjs";
import { safetyState, normalizeCheckin, checkinAction, checkinDue, alertMessage, allClearMessage, reminderMessage, upsertCheckin, isSafetyToken, deadline } from "./safety.mjs";

const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && x.length > 0 && timingSafeEqual(x, y); };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const base = (env) => String(env.PUBLIC_URL || "").replace(/\/+$/, "");
export const safeLink = (env, token) => (/^https:\/\//i.test(base(env)) ? `${base(env)}/safe/${token}` : "");

// Can this server alert this contact? (texts need Twilio, email needs Resend)
export function canAlert(env, c) {
  const ch = channelsFrom(env);
  return (ch.sms && !!c.contactPhone) || (ch.email && !!c.contactEmail);
}

async function toContact(env, fetchImpl, c, subject, body) {
  const ch = channelsFrom(env);
  const results = [];
  if (ch.sms && c.contactPhone) results.push(await sendSms(env, fetchImpl, { to: c.contactPhone, body }));
  if (ch.email && c.contactEmail) results.push(await sendEmail(env, fetchImpl, { to: c.contactEmail, subject, body }));
  return { ok: results.some((r) => r.ok), error: results.filter((r) => !r.ok).map((r) => r.error).join("; ") };
}

// One pass over the active check-ins. Quiet hours are ignored on purpose.
let running = false;
export async function runSafety(state, save, env, nowMs = Date.now(), fetchImpl = globalThis.fetch, notify = async () => false) {
  if (running) return { reminded: 0, alerted: 0, failed: 0, busy: true };
  running = true;
  try {
    let reminded = 0, alerted = 0, failed = 0;
    const at = new Date(nowMs).toISOString();
    for (const c0 of safetyState(state.desk).checkins) {
      const due = checkinDue(c0, nowMs);
      if (!due) continue;
      const c = { ...c0, log: [...(c0.log || [])], updatedAt: at };
      if (due === "remind") {
        c.reminded = true;
        await notify("Safety check-in: are you home?", reminderMessage(c, safeLink(env, c.token)));
        c.log.push({ at, what: "reminder sent to you" });
        reminded++;
      } else {
        const r = await toContact(env, fetchImpl, c, `Safety check-in: ${state.desk.profile.name || "your friend"} has not checked in`, alertMessage(c, state.desk.profile, env.TZ));
        c.alertTries = (c.alertTries || 0) + 1;
        if (r.ok) { c.status = "alerted"; c.alertedAt = at; c.log.push({ at, what: `alert sent to ${c.contactName}` }); alerted++; await notify("Safety alert sent", `${c.contactName} was told you have not checked in. Tap "I'm home safe" to send them an all-clear.${safeLink(env, c.token) ? ` ${safeLink(env, c.token)}` : ""}`); }
        else { c.log.push({ at, what: `alert failed (try ${c.alertTries}): ${String(r.error || "not configured").slice(0, 120)}` }); failed++; }
      }
      c.log = c.log.slice(-20);
      upsertCheckin(state.desk, c);
    }
    if (reminded || alerted || failed) save();
    return { reminded, alerted, failed };
  } finally { running = false; }
}

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>body{font:18px/1.55 system-ui,sans-serif;max-width:30rem;margin:2rem auto;padding:0 1rem;color:#2b2433;background:#fffaf6}button{font:inherit;font-weight:700;border:0;border-radius:10px;padding:14px 18px;margin:6px 0;width:100%;min-height:48px;background:#9b3f68;color:#fff}button.secondary{background:#efe6ee;color:#2b2433}.note{font-size:.9rem;color:#5f5669}</style></head><body><h1>${esc(title)}</h1>${body}</body></html>`;

async function readBody(req, limit = 8 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) return null; chunks.push(c); }
  return Buffer.concat(chunks).toString("utf8");
}

function statusPage(c, path, env, message = "") {
  const when = new Intl.DateTimeFormat("en-US", { timeZone: env.TZ || undefined, weekday: "short", hour: "numeric", minute: "2-digit" });
  const head = message ? `<p><strong>${esc(message)}</strong></p>` : "";
  if (c.status === "home") return page("You're home safe", `${head}<p>Checked in ${esc(c.homeAt ? when.format(new Date(c.homeAt)) : "")}. Nothing more will be sent.</p>`);
  if (c.status === "cancelled") return page("Check-in cancelled", `${head}<p>Nothing will be sent to ${esc(c.contactName)}.</p>`);
  const form = (action, label, cls = "", extra = "") => `<form method="post" action="${esc(path)}"><input type="hidden" name="action" value="${action}">${extra}<button type="submit"${cls ? ` class="${cls}"` : ""}>${esc(label)}</button></form>`;
  const alerted = c.status === "alerted" ? `<p><strong>${esc(c.contactName)} has been alerted.</strong> Tap below to send them an all-clear.</p>` : `<p>Home by ${esc(when.format(new Date(c.homeBy)))}. ${esc(c.contactName)} is alerted at ${esc(when.format(new Date(deadline(c))))} unless you check in.</p>`;
  return page("Safety check-in", `${head}${alerted}${form("home", "I'm home safe")}${c.status === "active" ? form("extend", "Running late: add 30 minutes", "secondary", `<input type="hidden" name="minutes" value="30">`) + form("extend", "Add 1 hour", "secondary", `<input type="hidden" name="minutes" value="60">`) + form("cancel", "Cancel this check-in", "secondary") : ""}<p class="note">This link is only for you. Keep it private.</p>`);
}

// Returns (req, url, send) => true when it answered the request.
export function safetyRoutes(state, save, env = process.env, now = Date.now, fetchImpl = globalThis.fetch, notify = async () => false) {
  const nostore = { "cache-control": "no-store" };
  return async (req, url, send) => {
    if (url.pathname.startsWith("/safe/") && (req.method === "GET" || req.method === "POST")) {
      const token = url.pathname.slice(6);
      const c = isSafetyToken(token) ? safetyState(state.desk).checkins.find((x) => x.token && same(x.token, token)) : null;
      if (!c) { send(404, page("Link not found", "<p>This check-in link is not valid. Start a new check-in in the app.</p>"), undefined, nostore); return true; }
      if (req.method === "GET") { send(200, statusPage(c, url.pathname, env), undefined, nostore); return true; } // a GET never changes anything (link previews)
      const raw = await readBody(req);
      if (raw === null) { send(413, "too large\n", "text/plain"); return true; }
      const f = Object.fromEntries(new URLSearchParams(raw));
      const r = checkinAction(c, f.action, now(), f.minutes);
      if (!r.ok) { send(200, statusPage(c, url.pathname, env, r.why), undefined, nostore); return true; }
      upsertCheckin(state.desk, r.checkin);
      if (f.action === "home" && c.status === "alerted") {
        const sent = await toContact(env, fetchImpl, r.checkin, "All clear", allClearMessage(r.checkin, state.desk.profile));
        r.checkin.log.push({ at: new Date(now()).toISOString(), what: sent.ok ? "all-clear sent" : "all-clear failed" });
      }
      save();
      send(200, statusPage(r.checkin, url.pathname, env, f.action === "home" ? "Glad you're home." : f.action === "extend" ? "Extended." : "Cancelled."), undefined, nostore);
      return true;
    }
    if (url.pathname === "/api/safety/checkin" && req.method === "PUT") {
      if (!env.ADMIN_KEY) { send(503, "Set ADMIN_KEY.\n", "text/plain"); return true; }
      if (!same(String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""), env.ADMIN_KEY)) { send(401, "admin key required\n", "text/plain"); return true; }
      const raw = await readBody(req, 16 * 1024);
      let body; try { body = JSON.parse(raw || "{}"); } catch { send(400, "not JSON\n", "text/plain"); return true; }
      const n = normalizeCheckin(body || {});
      if (!n.ok) { send(400, JSON.stringify({ ok: false, why: n.why }), "application/json"); return true; }
      const have = safetyState(state.desk).checkins.find((x) => x.id === n.checkin.id);
      if (have && have.token !== n.checkin.token) { send(409, JSON.stringify({ ok: false, why: "That id belongs to another check-in." }), "application/json"); return true; }
      if (n.checkin.status === "active" && !canAlert(env, n.checkin)) { send(409, JSON.stringify({ ok: false, why: "Your server cannot reach this contact: set up texts (Twilio) for a phone number or email (Resend) for an address." }), "application/json"); return true; }
      // The server's copy wins when it is newer (a tap on the link, an alert already sent).
      const keep = have && String(have.updatedAt) > String(n.checkin.updatedAt) ? have : n.checkin;
      upsertCheckin(state.desk, keep);
      save();
      send(200, JSON.stringify({ ok: true, checkin: keep, link: safeLink(env, keep.token) }), "application/json");
      return true;
    }
    return false;
  };
}
