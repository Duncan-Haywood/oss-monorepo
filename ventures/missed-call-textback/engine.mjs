// Missed-call text-back decision engine (2026-11-06). Pure functions, no network, no node-only imports,
// so the same file runs in the browser page and in the self-host server. It decides whether one missed
// call should get one text, now or later, and never decides to contact someone more than the rules allow.
// Only ever reduces contact by default: opt-outs win, one text per number per cooldown, quiet hours defer.

export const STOP_WORDS = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit"];
export const START_WORDS = ["start", "yes", "unstop"];
export const HELP_WORDS = ["help", "info"];
const ANON = new Set(["", "anonymous", "unknown", "restricted", "unavailable", "private", "blocked", "+266696687", "+86282452253"]);

/** Carrier keyword handling: the whole message, trimmed, case-insensitive (CTIA-style single words). */
export function classifyKeyword(body) {
  const w = String(body ?? "").trim().toLowerCase().replace(/[.!]+$/, "");
  if (STOP_WORDS.includes(w)) return "stop";
  if (START_WORDS.includes(w)) return "start";
  if (HELP_WORDS.includes(w)) return "help";
  return null;
}

export function isE164(n) { return typeof n === "string" && /^\+[1-9]\d{6,14}$/.test(n); }

const GSM7 = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€";
/** Segments an SMS bills as: GSM-7 is 160 (153 when joined), anything else is UCS-2 at 70 (67 when joined). */
export function smsSegments(text) {
  const s = String(text ?? "");
  let units = 0, gsm = true;
  for (const ch of s) {
    if (GSM7.includes(ch)) units += 1;
    else if (GSM7_EXT.includes(ch)) units += 2;
    else { gsm = false; break; }
  }
  if (gsm) return { encoding: "GSM-7", units, segments: units === 0 ? 0 : units <= 160 ? 1 : Math.ceil(units / 153) };
  const u = [...s].reduce((n, ch) => n + (ch.codePointAt(0) > 0xffff ? 2 : 1), 0);
  return { encoding: "UCS-2", units: u, segments: u <= 70 ? 1 : Math.ceil(u / 67) };
}

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
/** Wall-clock parts of an instant in an IANA time zone. */
export function localParts(ms, timeZone) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone, hour12: false, weekday: "short", hour: "2-digit", minute: "2-digit" });
  const o = Object.fromEntries(f.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return { day: DAYS.indexOf(o.weekday.slice(0, 3).toLowerCase()), hour: Number(o.hour) % 24, minute: Number(o.minute) };
}
function toMin(hhmm) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm)); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; }

export const DEFAULTS = {
  businessName: "",
  timeZone: "America/New_York",
  // Business hours by weekday name: ["08:00", "17:00"] or null for closed.
  hours: { mon: ["08:00", "17:00"], tue: ["08:00", "17:00"], wed: ["08:00", "17:00"], thu: ["08:00", "17:00"], fri: ["08:00", "17:00"], sat: null, sun: null },
  // Texts go out only between these local times; a missed call outside them waits for quietEnd.
  quietStart: "21:00", quietEnd: "08:00",
  cooldownHours: 24,
  dailyCap: 200,
  ownNumbers: [],
  bookingLink: "",
  openMessage: "Hi, this is {business}. Sorry we missed your call. How can we help? Reply here and we will get back to you shortly.{link}",
  afterHoursMessage: "Hi, this is {business}. Sorry we missed your call; we are closed right now and will reply when we open. Tell us what you need here.{link}",
  optOutLine: " Reply STOP to opt out.",
};

export function isOpen(config, ms) {
  const p = localParts(ms, config.timeZone);
  const day = config.hours?.[DAYS[p.day]];
  if (!day) return false;
  const t = p.hour * 60 + p.minute;
  return t >= toMin(day[0]) && t < toMin(day[1]);
}
function inSendWindow(config, ms) {
  const p = localParts(ms, config.timeZone), t = p.hour * 60 + p.minute, s = toMin(config.quietStart), e = toMin(config.quietEnd);
  return t >= e && t < s; // the window runs from quietEnd to quietStart on one day
}
/** First instant at or after `ms` inside the send window (15-minute steps, at most 48 hours). */
export function nextSendTime(config, ms) {
  for (let i = 0; i <= 192; i++) { const t = ms + i * 15 * 60000; if (inSendWindow(config, t)) return t; }
  return null;
}

export function render(template, config, isFirst = true) {
  const link = config.bookingLink ? ` Book online: ${config.bookingLink}` : "";
  let out = String(template).replaceAll("{business}", config.businessName).replaceAll("{link}", link);
  if (isFirst && !/\bSTOP\b/i.test(out)) out += config.optOutLine;
  return out.replace(/\s+/g, " ").trim();
}

/** Problems with a configuration that would make the text unsafe or unusable. */
export function checkConfig(c) {
  const e = [];
  if (!String(c.businessName || "").trim()) e.push("Add your business name: the text must say who is writing.");
  try { new Intl.DateTimeFormat("en-US", { timeZone: c.timeZone }); } catch { e.push(`Unknown time zone "${c.timeZone}". Use an IANA name such as America/Chicago.`); }
  for (const k of ["quietStart", "quietEnd"]) if (Number.isNaN(toMin(c[k]))) e.push(`${k} must look like 08:00.`);
  if (!(c.cooldownHours >= 1)) e.push("The cooldown must be at least 1 hour so nobody is texted twice for a burst of calls.");
  for (const [d, h] of Object.entries(c.hours || {})) if (h && (Number.isNaN(toMin(h[0])) || Number.isNaN(toMin(h[1])) || toMin(h[0]) >= toMin(h[1]))) e.push(`Hours for ${d} must be two times, opening before closing.`);
  for (const key of ["openMessage", "afterHoursMessage"]) {
    const m = render(c[key], { ...DEFAULTS, ...c }, true);
    if (!m.includes(String(c.businessName).trim())) e.push(`${key} must include {business} so the person knows who is texting.`);
    const s = smsSegments(m);
    if (s.segments > 2) e.push(`${key} is ${s.segments} segments (${s.encoding}); shorten it, each segment is billed.`);
  }
  return e;
}

/** A call counts as missed when nobody picked up, or the caller left a voicemail. */
export function isMissed(call) {
  const st = String(call.dialCallStatus || call.callStatus || "").toLowerCase();
  return ["no-answer", "busy", "failed", "canceled"].includes(st) || Boolean(call.recordingUrl);
}

/**
 * Decide what to do about one call. state = { optOut: {number: ms}, lastText: {number: ms}, sentByDay: {YYYY-MM-DD: n} }.
 * Returns { action: "send" | "defer" | "skip", reason, to, body?, sendAt? }. Never mutates state.
 */
export function decide(call, now, configIn, state = {}) {
  const config = { ...DEFAULTS, ...configIn };
  const to = String(call.from ?? "").trim();
  const skip = (reason) => ({ action: "skip", reason, to });
  if (ANON.has(to.toLowerCase())) return skip("The caller hid their number, so there is nobody to text.");
  if (!isE164(to)) return skip("The caller's number is not a valid international-format number.");
  if (!isMissed(call)) return skip("The call was answered, so no text-back.");
  if (config.ownNumbers.includes(to)) return skip("The call came from one of your own numbers.");
  if (state.optOut?.[to]) return skip("This number replied STOP; it stays on the opt-out list until it replies START.");
  if (["landline", "tollFree"].includes(call.lineType)) return skip(`This is a ${call.lineType} number, which cannot receive a normal text.`);
  const last = state.lastText?.[to];
  if (last && now - last < config.cooldownHours * 3600000) return skip(`Already texted this number within ${config.cooldownHours} hours.`);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: config.timeZone }).format(new Date(now));
  if ((state.sentByDay?.[day] || 0) >= config.dailyCap) return skip(`Daily cap of ${config.dailyCap} texts reached; a stuck loop or a spam wave stops here.`);
  const body = render(isOpen(config, now) ? config.openMessage : config.afterHoursMessage, config, true);
  if (!inSendWindow(config, now)) {
    const at = nextSendTime(config, now);
    return at ? { action: "defer", reason: `Quiet hours (${config.quietStart} to ${config.quietEnd}); held until the morning.`, to, body, sendAt: at } : skip("No send window found.");
  }
  return { action: "send", reason: isOpen(config, now) ? "Missed during opening hours." : "Missed outside opening hours.", to, body };
}

/** Apply a decision to the state (returns a new object). */
export function applySent(state, to, now, timeZone) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(now));
  return { ...state, lastText: { ...state.lastText, [to]: now }, sentByDay: { ...state.sentByDay, [day]: (state.sentByDay?.[day] || 0) + 1 } };
}

/** Handle an inbound text: STOP/START/HELP keywords change the opt-out list; anything else is for a human. */
export function handleInbound(msg, config, state = {}) {
  const from = String(msg.from ?? "").trim(), kw = classifyKeyword(msg.body);
  const name = config.businessName || "us";
  if (kw === "stop") return { kind: "stop", state: { ...state, optOut: { ...state.optOut, [from]: msg.now ?? 0 } }, reply: `${name}: you are opted out and will get no more texts. Reply START to opt back in.` };
  if (kw === "start") { const o = { ...state.optOut }; delete o[from]; return { kind: "start", state: { ...state, optOut: o }, reply: `${name}: you are opted back in. Reply STOP to opt out.` }; }
  if (kw === "help") return { kind: "help", state, reply: `${name}: we text back missed calls. Reply STOP to opt out.${config.bookingLink ? " Book: " + config.bookingLink : ""}` };
  return { kind: "message", state, reply: null };
}

/** What missed calls cost, from the owner's own numbers. Nothing here is assumed: every input is typed. */
export function roi(i) {
  const n = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : NaN);
  const missed = n(i.missedPerWeek), reply = n(i.replyPct), book = n(i.closePct), value = n(i.jobValue), cost = n(i.monthlyCost), already = n(i.alreadyCalledBackPct ?? 0);
  if ([missed, reply, book, value, cost, already].some(Number.isNaN)) return { error: "Every field needs a number of zero or more." };
  if (reply > 100 || book > 100 || already > 100) return { error: "Percentages go from 0 to 100." };
  const uncovered = missed * (1 - already / 100);
  const repliesPerWeek = uncovered * reply / 100, jobsPerWeek = repliesPerWeek * book / 100;
  const revenueMonth = jobsPerWeek * value * 52 / 12, net = revenueMonth - cost;
  const breakEvenJobs = value > 0 ? cost / value : null;
  return { uncoveredPerWeek: uncovered, repliesPerWeek, jobsPerWeek, revenueMonth, net, breakEvenJobsPerMonth: breakEvenJobs, paysForItself: net >= 0 };
}
