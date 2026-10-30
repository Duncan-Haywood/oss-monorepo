// Babysitting Business Kit: automated follow-through. Pure functions, safe in the browser
// and on the server. Given the desk and the time, planAutomations() says which messages
// are due: a booking confirmation, a reminder the day before, a thank-you (with a
// testimonial ask) after the first sit with a family, a rebook nudge after a quiet spell,
// unpaid reminders at 3 and 10 days, and a birthday note for families who opted in.
//
// Nothing here sends anything. automations-server.mjs sends through the sitter's own
// Resend and Twilio accounts, outside quiet hours, once per message (the `sent` map in
// desk.automations survives restarts because it is part of the saved desk).

import { expandBookings, unpaid, quote, referenceRequest, rebookMessage, daysBetween, toMin, fmtMin, DAYS } from "./engine.mjs";

export const RULES = {
  confirm: "Confirm a sit when it is saved",
  reminder: "Remind the family 24 hours before a sit",
  thankYou: "Thank a family after the first sit, and ask for a testimonial",
  rebook: "Invite a family back after a quiet spell",
  unpaid: "Remind about an unpaid sit at 3 and 10 days",
  birthday: "Send a birthday note for a child (families you opt in)",
};

export const DEFAULT_AUTOMATIONS = {
  confirm: false, reminder: false, thankYou: false, rebook: false, unpaid: false, birthday: false,
  rebookDays: "", // blank = the profile's "invite families back after" days
  quietStart: "20:00",
  quietEnd: "08:00",
  prefer: "email", // email | sms | both: the other channel is used when the preferred one is missing
  testimonialLink: "",
  mailingAddress: "",
};

export const UNPAID_STEPS = [3, 10];
const UNPAID_WINDOW = 30; // days after which an unpaid sit is left to the sitter, not automated
const THANKS_WINDOW = 14; // days after a first sit that a thank-you still makes sense
const REBOOK_WINDOW = 90; // a family quiet for longer than rebookDays + this is not nudged
const MAX_LOG = 300;
const SENT_KEEP_DAYS = 400;
const MAX_FAILURES = 3;

// 47 CFR 64.1200(a)(10) names stop, quit, end, revoke, opt out, cancel and unsubscribe;
// STOPALL and OPTOUT are common variants, treated the same.
export const STOP_WORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "OPT OUT", "REVOKE"];
export const START_WORDS = ["START", "UNSTOP", "YES"];

export function automationSettings(profile = {}) {
  const a = { ...DEFAULT_AUTOMATIONS, ...((profile && profile.automations) || {}) };
  const n = Number(a.rebookDays);
  a.rebookDays = a.rebookDays !== "" && Number.isFinite(n) && n > 0 ? n : Number(profile.rebookAfterDays) || 30;
  if (!["email", "sms", "both"].includes(a.prefer)) a.prefer = "email";
  if (!Number.isFinite(toMin(a.quietStart))) a.quietStart = DEFAULT_AUTOMATIONS.quietStart;
  if (!Number.isFinite(toMin(a.quietEnd))) a.quietEnd = DEFAULT_AUTOMATIONS.quietEnd;
  return a;
}

export function anyRuleOn(profile) {
  const a = automationSettings(profile);
  return Object.keys(RULES).some((k) => a[k] === true);
}

// The automation state kept in the desk: what was sent, a log the app shows, opt-outs.
export function automationState(desk) {
  const s = (desk && desk.automations && typeof desk.automations === "object") ? desk.automations : {};
  return {
    sent: s.sent && typeof s.sent === "object" ? s.sent : {},
    log: Array.isArray(s.log) ? s.log.filter((x) => x && typeof x === "object") : [],
    optOuts: s.optOuts && typeof s.optOuts === "object" ? s.optOuts : {},
  };
}

// ---------- time, in the sitter's local wall clock ----------

export function wallClock(ms, tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz || undefined, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, min: (Number(parts.hour) % 24) * 60 + Number(parts.minute) };
}
const wallMin = (date, min) => Date.parse(`${date}T00:00:00Z`) / 6e4 + min;

export function isQuiet(min, quietStart = "20:00", quietEnd = "08:00") {
  const s = toMin(quietStart), e = toMin(quietEnd);
  if (s === e) return false;
  return s > e ? min >= s || min < e : min >= s && min < e;
}

// ---------- contacts and opt-outs ----------

export const isEmail = (s) => /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(String(s || "").trim());

// US numbers to E.164 (+1 and ten digits); numbers already written with + are kept.
export function normalizePhone(s) {
  const raw = String(s || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === "1") return `+${digits}`;
  return "";
}

// A family's email and mobile number, from `email`/`phone` fields or the one "phone or
// email" box (which may hold both, separated by a comma or slash).
export function contactsOf(family = {}) {
  const text = [family.email, family.phone, family.contact].filter(Boolean).join(" , ");
  const email = (text.match(/[^\s@<>,;/]+@[^\s@<>,;/]+\.[^\s@<>,;/]+/) || [""])[0];
  let phone = "";
  for (const chunk of text.replace(email, " ").split(/[,;/]|\bor\b/)) { phone = normalizePhone(chunk); if (phone) break; }
  return { email: email.toLowerCase(), phone };
}

export const optKey = (channel, address) => `${channel}:${channel === "email" ? String(address).trim().toLowerCase() : normalizePhone(address)}`;

export function isOptedOut(desk, channel, address) {
  const o = automationState(desk).optOuts[optKey(channel, address)];
  return !!(o && o.out);
}

// Record an opt-out (or an opt back in). Mutates the desk; returns the entry.
export function setOptOut(desk, channel, address, out, via, atIso) {
  desk.automations = automationState(desk);
  const entry = { out: !!out, at: atIso, via };
  desk.automations.optOuts[optKey(channel, address)] = entry;
  return entry;
}

export function smsKeyword(body) {
  const w = String(body || "").trim().toUpperCase().replace(/[.!]+$/, "").replace(/[\s-]+/g, " ");
  if (STOP_WORDS.includes(w)) return "stop";
  if (START_WORDS.includes(w)) return "start";
  return "";
}

// ---------- messages ----------

const firstName = (f) => String(f.contactName || f.name || "").replace(/\s+family$/i, "").split(" ")[0] || "there";
const kidNames = (f) => (f.kids || []).map((k) => String(k.name || "").trim()).filter(Boolean);
const joinNames = (a) => (a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
const money = (x) => `$${(Math.round(x * 100) / 100).toFixed(2).replace(/\.00$/, "")}`;
const sitDay = (date) => `${DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]} ${date}`;
const signOff = (p) => p.businessName ? `${p.name}, ${p.businessName}` : p.name;

function confirmText(b, occ, f, desk, earlier) {
  const p = desk.profile;
  const price = Number(b.price) > 0 ? `the ${money(Number(b.price))} we agreed` : `about ${money(quote(occ, p.rates, p.holidays).total)} at my rates`;
  const weeks = Number(b.repeatWeeks) > 1 ? ` That's every ${DAYS[new Date(`${b.date}T12:00:00Z`).getUTCDay()]} for ${Number(b.repeatWeeks)} weeks.` : "";
  return `Hi ${firstName(f)}! It's ${p.name}. ${earlier ? "Updated details: I" : "I"}'m confirming babysitting on ${sitDay(occ.date)}, ${occ.start}-${occ.end}${kidNames(f).length ? ` with ${joinNames(kidNames(f))}` : ""}.${weeks} Each sit is ${price}. If anything changes, just reply here.`;
}

function reminderText(occ, f, p, todayDate) {
  const when = occ.date === todayDate ? "today" : "tomorrow";
  return `Hi ${firstName(f)}! It's ${p.name}. Looking forward to seeing ${kidNames(f).length ? joinNames(kidNames(f)) : "the kids"} ${when} at ${occ.start}. Anything new I should know (bedtime, allergies, plans)?`;
}

function thankYouText(f, p, link) {
  const thanks = `Hi ${firstName(f)}! It's ${p.name}. Thank you for having me over${kidNames(f).length ? ` to watch ${joinNames(kidNames(f))}` : ""}. I really enjoyed it.`;
  if (link) return `${thanks} If you have a minute, would you share two or three honest sentences about how it went? ${link} I'll only put your first name and last initial on my website, and only if you say yes.`;
  return `${thanks} ${referenceRequest({ name: f.contactName || f.name }, p, "testimonial").replace(/^Hi [^!]*! It's [^.]*\. /, "")}`;
}

function unpaidText(u, f, p, step) {
  if (step >= 10) return `Hi ${firstName(f)}, it's ${p.name}. Just checking in on ${money(u.owed)} for babysitting on ${sitDay(u.booking.date)}. If it already went through, thank you, and please ignore this!`;
  return `Hi ${firstName(f)}! It's ${p.name}. A friendly reminder about ${money(u.owed)} for babysitting on ${sitDay(u.booking.date)}. Thank you!`;
}

function birthdayText(kid, age, f, p) {
  return `Hi ${firstName(f)}! It's ${p.name}. Happy ${age > 0 ? `${ordinal(age)} ` : ""}birthday to ${kid.name}! I hope it's a wonderful day.`;
}

const SUBJECTS = { confirm: "Your babysitting is confirmed", reminder: "Babysitting reminder", thankYou: "Thank you!", rebook: "Babysitting openings", unpaid: "A friendly reminder", birthday: "Happy birthday!" };

// Footers: the opt-out every automated message carries, and for email the sitter's
// mailing address when they set one (CAN-SPAM asks for one in commercial email).
export function withFooter(channel, text, profile, settings, unsubscribeUrl) {
  if (channel === "sms") return `${text} Reply STOP to opt out.`;
  const lines = [text, "", signOff(profile)];
  if (settings.mailingAddress) lines.push(settings.mailingAddress);
  lines.push(unsubscribeUrl ? `Don't want these emails? Unsubscribe: ${unsubscribeUrl}` : `Don't want these emails? Reply "unsubscribe" and I'll stop.`);
  return lines.join("\n");
}

// ---------- the plan ----------

function birthdayAge(birth, todayDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(birth || ""))) return null;
  const md = birth.slice(5);
  const y = Number(todayDate.slice(0, 4));
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const due = md === "02-29" && !leap ? "02-28" : md;
  return todayDate.slice(5) === due ? y - Number(birth.slice(0, 4)) : null;
}

// Every message the rules would send now, before quiet hours and the sent log are
// applied: [{ key, rule, familyId, text }]. Exported for tests.
export function dueMessages(desk, { now = Date.now(), tz, referenceLink } = {}) {
  const p = desk.profile;
  const a = automationSettings(p);
  const { date: today, min } = wallClock(now, tz);
  const nowM = wallMin(today, min);
  const st = automationState(desk);
  const out = [];
  const fam = (id) => desk.families.find((f) => f.id === id);
  const occs = expandBookings(desk.bookings.filter((b) => b && b.date && Number.isFinite(toMin(b.start)) && Number.isFinite(toMin(b.end))));

  if (a.confirm) {
    for (const b of desk.bookings) {
      const f = fam(b.familyId);
      if (!f || b.status === "cancelled" || !b.date) continue;
      const next = occs.find((o) => o.id === b.id && o.status !== "cancelled" && wallMin(o.date, toMin(o.start)) > nowM);
      if (!next) continue;
      const key = `confirm:${b.id}:${b.date}:${b.start}-${b.end}:${b.repeatWeeks || 1}`;
      const earlier = Object.keys(st.sent).some((k) => k.startsWith(`confirm:${b.id}:`) && k !== key);
      out.push({ key, rule: "confirm", familyId: f.id, text: confirmText(b, next, f, desk, earlier) });
    }
  }
  if (a.reminder) {
    for (const o of occs) {
      if (o.status === "cancelled" || o.status === "done") continue;
      const f = fam(o.familyId);
      const until = wallMin(o.date, toMin(o.start)) - nowM;
      if (f && until > 0 && until <= 1440) out.push({ key: `reminder:${o.key}:${o.date}`, rule: "reminder", familyId: f.id, text: reminderText(o, f, p, today) });
    }
  }
  if (a.thankYou) {
    for (const f of desk.families) {
      const first = occs.find((o) => o.familyId === f.id && o.status !== "cancelled");
      if (!first || first.date >= today) continue;
      const ago = daysBetween(first.date, today);
      if (ago > THANKS_WINDOW) continue;
      const link = (typeof referenceLink === "function" && referenceLink(f, desk)) || a.testimonialLink || "";
      out.push({ key: `thanks:${f.id}`, rule: "thankYou", familyId: f.id, text: thankYouText(f, p, link) });
    }
  }
  if (a.rebook) {
    for (const f of desk.families) {
      const mine = occs.filter((o) => o.familyId === f.id && o.status !== "cancelled");
      if (mine.some((o) => o.date >= today)) continue;
      const last = mine.filter((o) => o.date < today).pop();
      if (!last) continue;
      const quiet = daysBetween(last.date, today);
      if (quiet < a.rebookDays || quiet > a.rebookDays + REBOOK_WINDOW) continue;
      if (f.nudged && f.nudged >= last.date) continue;
      out.push({ key: `rebook:${f.id}:${last.date}`, rule: "rebook", familyId: f.id, text: rebookMessage(f, p, today) });
    }
  }
  if (a.unpaid) {
    for (const u of unpaid(desk, today)) {
      const f = fam(u.booking.familyId);
      if (!f || u.days > UNPAID_WINDOW) continue;
      const step = [...UNPAID_STEPS].reverse().find((s) => u.days >= s);
      if (!step) continue;
      const base = `unpaid:${u.booking.id}:${u.booking.date}`;
      if (UNPAID_STEPS.some((s) => s > step && st.sent[`${base}:${s}`])) continue;
      out.push({ key: `${base}:${step}`, rule: "unpaid", familyId: f.id, text: unpaidText(u, f, p, step) });
    }
  }
  if (a.birthday) {
    for (const f of desk.families) {
      if (f.birthdayNotes !== true) continue;
      for (const [i, k] of (f.kids || []).entries()) {
        const age = birthdayAge(k.birth, today);
        if (age === null || !k.name) continue;
        out.push({ key: `birthday:${f.id}:${k.name || i}:${today.slice(0, 4)}`, rule: "birthday", familyId: f.id, text: birthdayText(k, age, f, p) });
      }
    }
  }
  return out;
}

// What would be sent now, per channel, and what is held back and why. `channels` says
// which services are configured ({ email, sms }); the preview passes both as true.
export function planAutomations(desk, { now = Date.now(), tz, channels = { email: true, sms: true }, referenceLink, unsubscribeLink } = {}) {
  const p = desk.profile;
  const a = automationSettings(p);
  const st = automationState(desk);
  const { date, min } = wallClock(now, tz);
  const quiet = isQuiet(min, a.quietStart, a.quietEnd);
  const messages = [];
  const held = [];
  const failures = {};
  for (const e of st.log) if (!e.ok && e.key) failures[`${e.key}|${e.channel}`] = (failures[`${e.key}|${e.channel}`] || 0) + 1;
  for (const m of dueMessages(desk, { now, tz, referenceLink })) {
    const f = desk.families.find((x) => x.id === m.familyId);
    const name = f ? f.name : m.familyId;
    if (f && f.optOut === true) { held.push({ ...m, family: name, reason: "you turned automated messages off for this family" }); continue; }
    const c = contactsOf(f);
    const usable = { email: !!c.email && !isOptedOut(desk, "email", c.email), sms: !!c.phone && !isOptedOut(desk, "sms", c.phone) };
    const want = a.prefer === "both" ? ["email", "sms"] : a.prefer === "sms" ? ["sms", "email"] : ["email", "sms"];
    // A family that opted out of one channel is not moved to the other one.
    const optedOut = (c.email && !usable.email) || (c.phone && !usable.sms);
    let chosen = (optedOut && a.prefer !== "both" ? want.slice(0, 1) : want).filter((ch) => usable[ch] && channels[ch]);
    if (a.prefer !== "both") chosen = chosen.slice(0, 1);
    if (!chosen.length) {
      const why = !c.email && !c.phone ? "no email or 10-digit mobile number on file"
        : (c.email && isOptedOut(desk, "email", c.email)) || (c.phone && isOptedOut(desk, "sms", c.phone)) ? "the family opted out"
        : "no matching channel is set up on the server (Resend for email, Twilio for texts)";
      held.push({ ...m, family: name, reason: why });
      continue;
    }
    for (const channel of chosen) {
      const sentKey = `${m.key}|${channel}`;
      if (st.sent[sentKey]) continue;
      if ((failures[sentKey] || 0) >= MAX_FAILURES) { held.push({ ...m, family: name, channel, reason: `gave up after ${MAX_FAILURES} failed tries` }); continue; }
      const to = channel === "email" ? c.email : c.phone;
      const unsub = channel === "email" && typeof unsubscribeLink === "function" ? unsubscribeLink(to) : "";
      messages.push({ ...m, sentKey, channel, to, family: name, subject: SUBJECTS[m.rule], body: withFooter(channel, m.text, p, a, unsub) });
    }
  }
  return { date, time: fmtMin(min), quiet, quietUntil: quiet ? a.quietEnd : "", rulesOn: Object.keys(RULES).filter((k) => a[k] === true), messages, held };
}

// Mark one attempt in the desk: on success the message is never sent again.
export function recordSend(desk, msg, ok, atIso, error = "") {
  desk.automations = automationState(desk);
  if (ok) desk.automations.sent[msg.sentKey] = atIso;
  desk.automations.log.push({ id: `${msg.sentKey}@${atIso}`, at: atIso, key: msg.key, rule: msg.rule, channel: msg.channel, familyId: msg.familyId, family: msg.family, to: maskAddress(msg.to), ok: !!ok, text: msg.text, ...(error ? { error: String(error).slice(0, 200) } : {}) });
  trimState(desk.automations, atIso);
}

export function maskAddress(s) {
  const t = String(s || "");
  if (t.includes("@")) { const [u, d] = t.split("@"); return `${u.slice(0, 2)}…@${d}`; }
  return t.length > 4 ? `…${t.slice(-4)}` : t;
}

function trimState(s, atIso) {
  if (s.log.length > MAX_LOG) s.log.splice(0, s.log.length - MAX_LOG);
  const cutoff = new Date(Date.parse(atIso) - SENT_KEEP_DAYS * 864e5).toISOString();
  for (const [k, v] of Object.entries(s.sent)) if (String(v) < cutoff) delete s.sent[k];
}

// The app syncs its whole desk with PUT /api/desk. The server's record of what it sent
// and who opted out must survive that, so the two are merged: sends are unioned, the log
// is unioned by id, and each opt-out keeps its latest change.
export function mergeAutomationState(server, incoming) {
  const a = automationState({ automations: server });
  const b = automationState({ automations: incoming });
  const sent = { ...b.sent };
  for (const [k, v] of Object.entries(a.sent)) if (!sent[k] || String(v) > String(sent[k])) sent[k] = v;
  const byId = new Map();
  for (const e of [...b.log, ...a.log]) byId.set(e.id || `${e.key}@${e.at}`, e);
  const log = [...byId.values()].sort((x, y) => String(x.at).localeCompare(String(y.at))).slice(-MAX_LOG);
  const optOuts = { ...b.optOuts };
  for (const [k, v] of Object.entries(a.optOuts)) if (!optOuts[k] || String(v.at) > String(optOuts[k].at)) optOuts[k] = v;
  return { sent, log, optOuts };
}

// For the Today tab: automatic sends since a date, newest first.
export function recentSends(desk, sinceDate) {
  return automationState(desk).log.filter((e) => e.ok && String(e.at).slice(0, 10) >= sinceDate).reverse();
}
