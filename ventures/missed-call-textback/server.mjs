// Self-host agent: point your Twilio number's call status callback at /voice and its incoming-message
// webhook at /sms. Missed calls get one text (engine.mjs rules); STOP/START/HELP are handled; any other
// reply is forwarded to OWNER_NUMBER. Without Twilio keys it runs in dry-run mode and only logs.
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { decide, applySent, handleInbound, checkConfig, DEFAULTS } from "./engine.mjs";
import { validSignature, twiml, sendSms } from "./twilio.mjs";
import { pathToFileURL } from "node:url";

export function configFromEnv(env = process.env) {
  const hours = env.OPEN_HOURS_JSON ? JSON.parse(env.OPEN_HOURS_JSON) : DEFAULTS.hours;
  return {
    ...DEFAULTS, hours,
    businessName: env.BUSINESS_NAME || "", timeZone: env.TIMEZONE || DEFAULTS.timeZone, bookingLink: env.BOOKING_LINK || "",
    ownNumbers: (env.OWN_NUMBERS || "").split(",").map((s) => s.trim()).filter(Boolean),
    ...(env.OPEN_MESSAGE ? { openMessage: env.OPEN_MESSAGE } : {}), ...(env.AFTER_HOURS_MESSAGE ? { afterHoursMessage: env.AFTER_HOURS_MESSAGE } : {}),
    ...(env.COOLDOWN_HOURS ? { cooldownHours: Number(env.COOLDOWN_HOURS) } : {}), ...(env.DAILY_CAP ? { dailyCap: Number(env.DAILY_CAP) } : {}),
  };
}

export function createApp({ config, env = process.env, now = () => Date.now(), send = sendSms, load, save, log = console.log }) {
  const creds = { accountSid: env.TWILIO_ACCOUNT_SID, authToken: env.TWILIO_AUTH_TOKEN, from: env.TWILIO_FROM };
  const live = Boolean(creds.accountSid && creds.authToken && creds.from) && env.DRY_RUN !== "1";
  const publicUrl = (env.PUBLIC_URL || "").replace(/\/$/, "");
  let state = load();
  let queue = state.queue || [];
  const persist = () => save({ ...state, queue });

  async function deliver(to, body) {
    if (!live) { log(`[dry-run] would text ${to}: ${body}`); return { dryRun: true }; }
    return send({ ...creds, to, body });
  }

  async function onCall(p) {
    const d = decide({ from: p.From, callStatus: p.CallStatus, dialCallStatus: p.DialCallStatus, recordingUrl: p.RecordingUrl }, now(), config, state);
    if (d.action === "send") { await deliver(d.to, d.body); state = applySent(state, d.to, now(), config.timeZone); }
    else if (d.action === "defer") { queue.push({ to: d.to, body: d.body, sendAt: d.sendAt }); state = { ...state, lastText: { ...state.lastText, [d.to]: now() } }; }
    log(`call from ${p.From}: ${d.action} (${d.reason})`);
    persist();
    return d;
  }

  async function flush() {
    const due = queue.filter((q) => q.sendAt <= now()), rest = queue.filter((q) => q.sendAt > now());
    for (const q of due) {
      if (state.optOut?.[q.to]) continue;
      try { await deliver(q.to, q.body); state = applySent(state, q.to, now(), config.timeZone); } catch (e) { log("send failed: " + e.message); rest.push({ ...q, sendAt: now() + 15 * 60000 }); }
    }
    queue = rest; persist(); return due.length;
  }

  async function onSms(p) {
    const r = handleInbound({ from: p.From, body: p.Body, now: now() }, config, state);
    state = r.state; persist();
    if (r.kind === "message" && env.OWNER_NUMBER && live) {
      try { await send({ ...creds, to: env.OWNER_NUMBER, body: `Reply from ${p.From}: ${String(p.Body).slice(0, 300)}` }); } catch (e) { log("forward failed: " + e.message); }
    }
    return r;
  }

  const handler = async (req, res) => {
    const url = new URL(req.url, "http://x");
    if (req.method === "GET" && url.pathname === "/health") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: true, live, queued: queue.length })); }
    if (req.method !== "POST" || !["/voice", "/sms"].includes(url.pathname)) { res.writeHead(404); return res.end("not found"); }
    let raw = ""; for await (const c of req) { raw += c; if (raw.length > 20000) { res.writeHead(413); return res.end(); } }
    const params = Object.fromEntries(new URLSearchParams(raw));
    if (live || env.REQUIRE_SIGNATURE === "1") {
      if (!validSignature(creds.authToken, publicUrl + url.pathname, params, req.headers["x-twilio-signature"])) { res.writeHead(403); return res.end("bad signature"); }
    }
    if (url.pathname === "/voice") { await onCall(params); res.writeHead(204); return res.end(); }
    const r = await onSms(params);
    res.writeHead(200, { "Content-Type": "text/xml" }); res.end(twiml(r.reply));
  };
  return { handler, onCall, onSms, flush, get state() { return state; }, get queue() { return queue; }, live };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = configFromEnv(), problems = checkConfig(config);
  if (problems.length) { console.error("Fix the settings first:\n- " + problems.join("\n- ")); process.exit(1); }
  const file = process.env.STATE_FILE || "state.json";
  const app = createApp({ config, load: () => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {}), save: (s) => writeFileSync(file, JSON.stringify(s)) });
  setInterval(() => app.flush().catch((e) => console.error(e)), 60000);
  createServer((q, s) => app.handler(q, s).catch((e) => { console.error(e); s.writeHead(500); s.end(); })).listen(Number(process.env.PORT || 8787), () => console.log(`missed-call-textback ${app.live ? "LIVE" : "dry-run"} on :${process.env.PORT || 8787}`));
}
