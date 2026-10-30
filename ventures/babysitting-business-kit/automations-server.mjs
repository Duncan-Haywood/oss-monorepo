// Babysitting Business Kit: the sending half of automations.mjs, for server.mjs.
//
//   runAutomations(...)    called by the server's periodic tick; sends what is due
//   automationRoutes(...)  GET|POST /unsubscribe, POST /twilio/inbound (STOP/START),
//                          GET /api/automations/preview (admin key)
//
// Off until the sitter turns rules on in Settings and sets their own keys:
//   RESEND_API_KEY + FROM_EMAIL                       email
//   TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM   texts
//   PUBLIC_URL (https://your-server)                  unsubscribe links and the Twilio webhook URL
//   TZ                                                quiet hours are in this time zone

import { createHmac, timingSafeEqual } from "node:crypto";
import { planAutomations, recordSend, setOptOut, smsKeyword, anyRuleOn, automationState, isEmail, normalizePhone, maskAddress, contactsOf } from "./automations.mjs";

const MAX_PER_TICK = 40;
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && x.length > 0 && timingSafeEqual(x, y); };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const base = (env) => String(env.PUBLIC_URL || "").replace(/\/+$/, "");

export const channelsFrom = (env) => ({
  email: !!(env.RESEND_API_KEY && env.FROM_EMAIL),
  sms: !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM),
});

// Unsubscribe tokens: an HMAC of the address, so a link only unsubscribes its own reader.
const unsubSecret = (env) => env.UNSUBSCRIBE_SECRET || env.ADMIN_KEY || "";
export const unsubToken = (env, email) => createHmac("sha256", unsubSecret(env)).update(`unsub:${String(email).trim().toLowerCase()}`).digest("hex").slice(0, 32);
export function unsubscribeUrl(env, email) {
  if (!/^https:\/\//i.test(base(env)) || !unsubSecret(env)) return "";
  return `${base(env)}/unsubscribe?e=${encodeURIComponent(String(email).toLowerCase())}&t=${unsubToken(env, email)}`;
}

// Twilio signs each webhook: base64 HMAC-SHA1 of the full URL followed by every POST
// parameter, sorted by name, as name+value (twilio.com/docs/usage/security).
export function twilioSignature(authToken, url, params) {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

async function post(fetchImpl, url, init) {
  if (typeof fetchImpl !== "function") return { ok: false, error: "no fetch" };
  try {
    const r = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(8000) });
    if (r && r.ok) return { ok: true };
    let detail = "";
    try { detail = r && typeof r.text === "function" ? (await r.text()).slice(0, 160) : ""; } catch { /* body unreadable */ }
    return { ok: false, error: `HTTP ${r && r.status} ${detail}`.trim() };
  } catch (e) { return { ok: false, error: e && e.message }; }
}

export function sendEmail(env, fetchImpl, { to, subject, body, unsubscribe }) {
  if (!channelsFrom(env).email || !isEmail(to)) return Promise.resolve({ ok: false, error: "email not configured" });
  const headers = unsubscribe ? { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined;
  return post(fetchImpl, "https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.FROM_EMAIL, to: [to], subject, text: body, ...(env.NOTIFY_EMAIL ? { reply_to: env.NOTIFY_EMAIL } : {}), ...(headers ? { headers } : {}) }),
  });
}

export function sendSms(env, fetchImpl, { to, body }) {
  if (!channelsFrom(env).sms || !normalizePhone(to)) return Promise.resolve({ ok: false, error: "texts not configured" });
  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
  return post(fetchImpl, `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Messages.json`, {
    method: "POST",
    headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: normalizePhone(to), From: env.TWILIO_FROM, Body: body }).toString(),
  });
}

export function plan(state, env, nowMs, channels = channelsFrom(env)) {
  return planAutomations(state.desk, { now: nowMs, tz: env.TZ, channels, unsubscribeLink: (email) => unsubscribeUrl(env, email) });
}

// Send everything due, once. Quiet hours and turned-off rules send nothing.
let running = false;
export async function runAutomations(state, save, env, nowMs = Date.now(), fetchImpl = globalThis.fetch) {
  if (running) return { sent: 0, failed: 0, quiet: false, due: 0, busy: true };
  running = true;
  try { return await runOnce(state, save, env, nowMs, fetchImpl); } finally { running = false; }
}
async function runOnce(state, save, env, nowMs, fetchImpl) {
  if (!anyRuleOn(state.desk.profile)) return { sent: 0, failed: 0, quiet: false, due: 0 };
  const ch = channelsFrom(env);
  if (!ch.email && !ch.sms) return { sent: 0, failed: 0, quiet: false, due: 0 };
  const p = plan(state, env, nowMs, ch);
  if (p.quiet) return { sent: 0, failed: 0, quiet: true, due: p.messages.length };
  let sent = 0, failed = 0;
  for (const m of p.messages.slice(0, MAX_PER_TICK)) {
    const unsub = m.channel === "email" ? unsubscribeUrl(env, m.to) : "";
    const r = m.channel === "email" ? await sendEmail(env, fetchImpl, { to: m.to, subject: m.subject, body: m.body, unsubscribe: unsub }) : await sendSms(env, fetchImpl, { to: m.to, body: m.body });
    recordSend(state.desk, m, r.ok, new Date(nowMs).toISOString(), r.error);
    if (r.ok) sent++; else failed++;
  }
  if (sent || failed) save();
  return { sent, failed, quiet: false, due: p.messages.length };
}

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>body{font:17px/1.6 Georgia,serif;max-width:36rem;margin:3rem auto;padding:0 1rem;color:#2b2433;background:#fffaf6}button{font:inherit;padding:.5rem 1rem}</style></head><body><h1>${esc(title)}</h1>${body}</body></html>`;

async function readBody(req, limit = 16 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) return null; chunks.push(c); }
  return Buffer.concat(chunks).toString("utf8");
}

// Returns a function (req, url, send) => true when it answered the request.
export function automationRoutes(state, save, env = process.env, now = Date.now, fetchImpl = globalThis.fetch, notify = async () => false) {
  return async (req, url, send) => {
    if (url.pathname === "/unsubscribe" && (req.method === "GET" || req.method === "POST")) {
      const email = String(url.searchParams.get("e") || "").trim().toLowerCase();
      const t = String(url.searchParams.get("t") || "");
      if (!isEmail(email) || !unsubSecret(env) || !same(t, unsubToken(env, email))) { send(400, page("Link not recognised", "<p>This unsubscribe link is incomplete. Reply to the email instead and you will be taken off.</p>")); return true; }
      if (req.method === "GET") {
        send(200, page("Unsubscribe", `<p>Stop automated emails to <strong>${esc(email)}</strong>?</p><form method="post" action="/unsubscribe?e=${encodeURIComponent(email)}&amp;t=${esc(t)}"><button type="submit">Unsubscribe</button></form>`));
        return true;
      }
      await readBody(req);
      setOptOut(state.desk, "email", email, true, "unsubscribe link", new Date(now()).toISOString());
      save();
      await notify("A family unsubscribed", `${maskAddress(email)} will get no more automated emails.`);
      send(200, page("You're unsubscribed", "<p>You will get no more automated emails from this babysitter. You can still write to them any time.</p>"));
      return true;
    }
    if (url.pathname === "/twilio/inbound" && req.method === "POST") {
      const raw = await readBody(req);
      const hookUrl = env.TWILIO_WEBHOOK_URL || (base(env) ? `${base(env)}/twilio/inbound` : "");
      if (!env.TWILIO_AUTH_TOKEN || !hookUrl) { send(503, "Set TWILIO_AUTH_TOKEN and PUBLIC_URL.\n", "text/plain"); return true; }
      if (raw === null) { send(413, "too large\n", "text/plain"); return true; }
      const params = Object.fromEntries(new URLSearchParams(raw));
      if (!same(req.headers["x-twilio-signature"] || "", twilioSignature(env.TWILIO_AUTH_TOKEN, hookUrl, params))) { send(403, "bad signature\n", "text/plain"); return true; }
      const from = normalizePhone(params.From);
      const kw = smsKeyword(params.Body);
      if (from && kw) {
        setOptOut(state.desk, "sms", from, kw === "stop", `text ${String(params.Body).trim().toUpperCase()}`, new Date(now()).toISOString());
        save();
        await notify(kw === "stop" ? "A family texted STOP" : "A family opted back in to texts", `${maskAddress(from)} ${kw === "stop" ? "will get no more automated texts" : "can get automated texts again"}.`);
      } else if (from) {
        const f = state.desk.families.find((x) => contactsOf(x).phone === from);
        await notify(`Text from ${f ? f.name : maskAddress(from)}`, String(params.Body || "").slice(0, 500));
      }
      // Twilio sends its own STOP/START confirmation for long codes; we add nothing.
      send(200, `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, "text/xml; charset=utf-8");
      return true;
    }
    if (url.pathname === "/api/automations/preview" && req.method === "GET") {
      if (!env.ADMIN_KEY) { send(503, "Set ADMIN_KEY.\n", "text/plain"); return true; }
      if (!same(String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""), env.ADMIN_KEY)) { send(401, "admin key required\n", "text/plain"); return true; }
      const at = Date.parse(url.searchParams.get("at") || "") || now();
      const p = plan(state, env, at);
      const st = automationState(state.desk);
      send(200, JSON.stringify({ ...p, channels: channelsFrom(env), recent: st.log.slice(-20).reverse() }), "application/json");
      return true;
    }
    return false;
  };
}
