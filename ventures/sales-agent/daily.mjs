// Sales Agent, milestone 3: the daily run. It reads the task list Sales Cadence Builder wrote, the prospect table (as
// the inbox agent left it) and your suppression list, and answers "what do I do today?": the touches that are due,
// minus anyone who stopped, paused, bounced or is suppressed. Same principle as the inbox agent: it may always drop
// or hold a touch on its own, and it never sends one. Every touch it leaves out is listed with the reason, so the
// run doubles as an audit trail.
import { parseCsv, runInbox, toCsv, iso, toDay, DAY, addBusinessDays, businessDaysBetween } from "./engine.mjs";
import { holidayChecker } from "./holidays.mjs";
import { suppressionIndex } from "./suppression.mjs";

// Statuses the inbox agent sets that end the cadence for good (or, for closed_lost, until its 180-day pause).
const STOPPED = { unsubscribed: "asked to stop", closed_lost: "said no", left: "left the company", replied: "replied; a person takes it from here" };
const digits = (s) => String(s || "").replace(/\D/g, "");
const truthy = (v) => /^(1|y|yes|true|x)$/i.test(String(v || "").trim());
// A subject as a reply or forward would carry it: "Re: Fwd: Route planning at X" and "route planning at x" are the same.
export const baseSubject = (s) => { let t = String(s || "").trim(); for (let k = 0; k < 5; k++) { const n = t.replace(/^\s*(re|aw|sv|vs|antw|antwort|r|rif|res|resp|odp|fw|fwd|wg|tr|rv|enc)\s*(\[\d+\])?\s*:\s*/i, ""); if (n === t) break; t = n; } return t.replace(/\s+/g, " ").replace(/[.!?\s]+$/, "").toLowerCase(); };
// Sent mail from a file (mailfile.mjs) as rows, or a CSV with date,to,subject (to may list several, ; or space separated).
const sentRows = (x) => (Array.isArray(x) ? x : parseCsv(x || "")).map((r) => ({ date: String(r.date || "").slice(0, 10), subject: r.subject || "", to: (Array.isArray(r.to) ? r.to : String(r.to || "").split(/[;\s]+/)).map((a) => String(a).trim().toLowerCase()).filter((a) => a.includes("@")) })).filter((r) => r.to.length);
const stepKey = (email, step) => `${String(email || "").toLowerCase()}|${String(step || "").trim().toLowerCase()}`;

/**
 * input: { tasks (cadence builder CSV text, or rows), prospects (CSV text or rows), suppression (text), done (lines
 * "email,step" or "email|step" for touches you already did), sent (your own sent mail, from an exported mailbox:
 * mailfile.mjs finish().sent, or CSV date,to,subject), today, maxOverdueDays = 5, emailCap = 40 }
 *
 * Sent mail is read two ways. An email touch whose subject you already sent to that address (Re:/Fwd: ignored, any
 * date) is done, and listed in sentMatched. Any other message you sent to the person on or after two days before a
 * due email touch holds that touch: you wrote to them some other way, so a person checks it is not a double touch.
 * retry (added 2026-11-12): calls that rang out, re-dated by the caller: rows { email, step, on (YYYY-MM-DD), tries,
 * last } or lines "email|step|YYYY-MM-DD|tries". A matching task is moved to `on` (it is "later" before then, due that
 * day, overdue after), keeps its plan date as `planned`, and carries `tries` (no-answer calls so far) and `last`.
 * moved (added 2026-11-12): call steps that ended after one or more no-answers, rows { email, step, on (the day of the
 * last mark) } (callMarks returns them).
 * Later steps follow a late call (added 2026-11-12, shiftLater = true): when a call step is retried, or ended late after
 * misses, the same person's later steps move back by the business days it slipped, so a third try at the day-3 call does
 * not land on the day-5 email's day. The task keeps its plan date as `planned` and says why in `moved_by`.
 * holidays: "us", "us-business", dates, or a day => boolean (holidays.mjs); retry and shifted dates skip them.
 * Returns { today, queue, held, dropped, later, stale, sentMatched, summary, brief }.
 */
export function runDaily(input) {
  const today = input.today || iso(Date.now());
  const rows = Array.isArray(input.tasks) ? input.tasks : parseCsv(input.tasks);
  const prospects = Array.isArray(input.prospects) ? input.prospects : parseCsv(input.prospects);
  const byEmail = new Map(prospects.filter((p) => p.email).map((p) => [p.email.toLowerCase(), p]));
  const suppressedBy = suppressionIndex(input.suppression);
  const done = new Set((Array.isArray(input.done) ? input.done.join("\n") : String(input.done || "")).split(/\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const [e, ...s] = l.split(/[|,]/); return stepKey(e, s.join(",")); }));
  const retry = new Map((Array.isArray(input.retry) ? input.retry : String(input.retry || "").split(/\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const [email, step, on, tries] = l.split("|"); return { email, step, on, tries }; }))
    .filter((r) => r && r.email && r.step != null && Number.isFinite(toDay(r.on))).map((r) => [stepKey(r.email, r.step), { on: String(r.on).slice(0, 10), tries: Number(r.tries) || 1, last: r.last || "" }]));
  const isOff = holidayChecker(input.holidays);
  const shifts = input.shiftLater === false ? new Map() : laterShifts(rows, retry, input.moved, isOff);
  const maxOverdue = input.maxOverdueDays ?? 5, emailCap = input.emailCap ?? 40;
  const queue = [], held = [], dropped = [], stale = [], sentMatched = [];
  let later = 0, alreadyDone = 0;

  // Sent mail: which (address, subject) pairs the plan has as email touches, so a sent step is not also read as
  // "some other message" against the steps after it.
  const sent = sentRows(input.sent);
  const planned = new Set(rows.filter((r) => /^email$/i.test(String(r.channel || "").trim()) && r.subject).map((r) => `${String(r.email || "").toLowerCase()}|${baseSubject(r.subject)}`));
  const sentTo = new Map();
  for (const m of sent) for (const a of m.to) { if (!sentTo.has(a)) sentTo.set(a, []); sentTo.get(a).push({ ...m, base: baseSubject(m.subject) }); }

  for (const r of rows) {
    const t = { date: r.date, channel: (r.channel || "").toLowerCase(), step: r.step, prospect: r.prospect, company: r.company, email: (r.email || "").toLowerCase(), phone: r.phone, call_window: r.call_window, subject: r.subject, body: r.body, voicemail: r.voicemail, issues: r.issues };
    const rt = retry.get(stepKey(t.email, t.step));
    if (rt) Object.assign(t, { planned: t.date, date: rt.on, tries: rt.tries, last: rt.last });
    else { const sh = shifts.get(stepKey(t.email, t.step)); if (sh) Object.assign(t, { planned: t.date, date: addBusinessDays(t.date, sh.days, isOff), moved_by: sh }); }
    const day = toDay(t.date);
    if (!Number.isFinite(day)) { held.push({ ...t, reason: "no readable date in the task list" }); continue; }
    if (done.has(stepKey(t.email, t.step))) { alreadyDone++; continue; }
    const mine = t.channel === "email" && t.email ? sentTo.get(t.email) || [] : [];
    const same = t.subject ? mine.find((m) => m.base === baseSubject(t.subject)) : null;
    if (same) { alreadyDone++; sentMatched.push({ ...t, sent_on: same.date, sent_subject: same.subject }); continue; }
    const p = byEmail.get(t.email);
    const status = (p?.status || "").toLowerCase();

    // Reasons to drop outright: nothing here is ever sent, but these touches must not be made by hand either.
    const sup = suppressedBy(t.email, t.phone);
    if (sup) { dropped.push({ ...t, reason: sup }); continue; }
    if (p && (truthy(p.do_not_contact) || truthy(p.unsubscribed))) { dropped.push({ ...t, reason: "marked do-not-contact in your prospect list" }); continue; }
    if (STOPPED[status]) { dropped.push({ ...t, reason: `${STOPPED[status]} (status ${status})` }); continue; }
    if (status === "bounced" && t.channel === "email") { dropped.push({ ...t, reason: "address bounced; email touches stopped" }); continue; }

    if (day > toDay(today)) { later++; continue; }
    if (day < toDay(today) - maxOverdue * DAY) { stale.push({ ...t, reason: `planned ${t.date}, more than ${maxOverdue} days ago; rebuild the plan rather than send stale copy` }); continue; }

    if (status === "paused") {
      if (!p.paused_until) { held.push({ ...t, reason: "paused until you answer their reply" }); continue; }
      if (p.paused_until > today) { held.push({ ...t, reason: `paused until ${p.paused_until}` }); continue; }
    }
    if (!p && !t.email) { held.push({ ...t, reason: "no email to check against your replies and suppression list; add one or check by hand" }); continue; }
    if (t.issues) { held.push({ ...t, reason: `fix before use: ${t.issues}` }); continue; }
    const other = mine.filter((m) => !planned.has(`${t.email}|${m.base}`) && toDay(m.date) >= day - 2 * DAY && toDay(m.date) <= toDay(today)).pop();
    if (other) { held.push({ ...t, reason: `you emailed them on ${other.date} ("${other.subject || "no subject"}"), not this step's subject; check it was not this touch before sending` }); continue; }
    queue.push({ ...t, overdue: day < toDay(today), inList: Boolean(p) });
  }

  // Deliverability guard: more than emailCap emails a day from one mailbox is deferred, oldest planned first.
  const order = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  queue.sort(order);
  let emails = 0;
  const final = [];
  for (const q of queue) {
    if (q.channel === "email" && ++emails > emailCap) held.push({ ...q, reason: `over today's cap of ${emailCap} emails; do it tomorrow` });
    else final.push(q);
  }
  const by = (ch) => final.filter((q) => q.channel === ch).length;
  const summary = { due: final.length, overdue: final.filter((q) => q.overdue).length, email: by("email"), call: by("call"), linkedin: by("linkedin"), letter: by("letter"), held: held.length, dropped: dropped.length, stale: stale.length, later, alreadyDone, alreadySent: sentMatched.length, sentRead: sent.length };
  return { today, queue: final, held, dropped, stale, later, sentMatched, summary, brief: brief(today, final, held, dropped, stale, summary) };
}

/** For each person, walk their steps in plan order; a retried call (or one ended late after misses) that slipped N
 * business days pushes every later step back N (the largest slip so far wins). Returns Map stepKey -> { days, step }. */
function laterShifts(rows, retry, moved, isOff) {
  const ended = new Map((Array.isArray(moved) ? moved : []).filter((m) => m && m.email && m.step != null && Number.isFinite(toDay(m.on))).map((m) => [stepKey(m.email, m.step), String(m.on).slice(0, 10)]));
  const out = new Map();
  if (!retry.size && !ended.size) return out;
  const people = new Map();
  rows.forEach((r, i) => { const e = String(r.email || "").toLowerCase(); if (!e || !Number.isFinite(toDay(r.date))) return; if (!people.has(e)) people.set(e, []); people.get(e).push({ r, i }); });
  const num = (s) => { const n = Number(s); return Number.isFinite(n) ? n : Infinity; };
  for (const [e, list] of people) {
    list.sort((a, b) => (a.r.date < b.r.date ? -1 : a.r.date > b.r.date ? 1 : num(a.r.step) - num(b.r.step) || a.i - b.i));
    let cur = null;
    for (const { r } of list) {
      const k = stepKey(e, r.step), anchor = retry.get(k)?.on || ended.get(k);
      if (anchor) { const days = businessDaysBetween(r.date, anchor, isOff); if (days > 0 && (!cur || days > cur.days)) cur = { days, step: String(r.step).trim() }; continue; }
      if (cur) out.set(k, cur);
    }
  }
  return out;
}

function brief(today, queue, held, dropped, stale, s) {
  const out = [`# Sales queue for ${today}`, "", `${s.due} touches due (${s.email} email, ${s.call} call, ${s.linkedin} LinkedIn, ${s.letter} letter)${s.overdue ? `, ${s.overdue} of them overdue` : ""}. ${s.dropped} dropped because the person stopped or is suppressed, ${s.held} held, ${s.stale} too old to send.${s.alreadySent ? ` ${s.alreadySent} email touch${s.alreadySent === 1 ? " is" : "es are"} already in your sent mail and not queued again.` : ""} Nothing has been sent.`, ""];
  for (const ch of ["call", "email", "linkedin", "letter"]) {
    const list = queue.filter((q) => q.channel === ch);
    if (!list.length) continue;
    out.push(`## ${{ call: "Calls", email: "Email", linkedin: "LinkedIn", letter: "Letters" }[ch]} (${list.length})`);
    for (const q of list) out.push(`- ${q.overdue ? "[overdue " + q.date + "] " : ""}${q.prospect || q.email}${q.company ? ", " + q.company : ""} (${q.step})${ch === "call" && q.call_window ? " " + q.call_window : ""}${q.tries ? ` (try ${q.tries + 1}: no answer ${q.tries === 1 ? "once" : q.tries + " times"}${q.last ? ", last " + q.last : ""})` : ""}${q.moved_by ? ` (moved from ${q.planned}: step ${q.moved_by.step}'s call ran ${q.moved_by.days} business day${q.moved_by.days === 1 ? "" : "s"} late)` : ""}`);
    out.push("");
  }
  const section = (title, list) => { if (list.length) { out.push(`## ${title} (${list.length})`); for (const x of list) out.push(`- ${x.prospect || x.email} (${x.step}, ${x.channel}): ${x.reason}`); out.push(""); } };
  section("Held", held);
  section("Dropped", dropped);
  section("Too old", stale);
  return out.join("\n");
}

/**
 * Touch marks (the self-host page's Done buttons, or a calls file for the CLI) read for runDaily: rows { email, step,
 * outcome (done|spoke|voicemail|no_answer; blank is done), at or date }. A step is done once it has any mark other than
 * "no answer", or maxTries of them; otherwise it is retried the business day after its last miss. Returns { done
 * (lines "email|step"), retry (rows for runDaily's retry input) }.
 */
export function callMarks(rows, maxTries = 3, { holidays } = {}) {
  const isOff = holidayChecker(holidays);
  const by = new Map();
  for (const r of Array.isArray(rows) ? rows : parseCsv(rows || "")) {
    const email = String(r.email || "").trim().toLowerCase(), step = String(r.step ?? "").trim();
    if (!email || !step) continue;
    const k = stepKey(email, step);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push({ email, step, outcome: String(r.outcome || "done").trim().toLowerCase().replace(/[\s-]+/g, "_"), date: String(r.at || r.date || "").slice(0, 10) });
  }
  const done = [], retry = [], moved = [];
  for (const list of by.values()) {
    const misses = list.filter((x) => x.outcome === "no_answer");
    const last = misses.map((x) => x.date).filter((d) => Number.isFinite(toDay(d))).sort().at(-1);
    if (misses.length < list.length || misses.length >= maxTries || !last) {
      done.push(`${list[0].email}|${list[0].step}`);
      // A step that ended after misses ended late: its last mark's day lets runDaily push the later steps back.
      const end = list.map((x) => x.date).filter((d) => Number.isFinite(toDay(d))).sort().at(-1);
      if (misses.length && end) moved.push({ email: list[0].email, step: list[0].step, on: end });
      continue;
    }
    retry.push({ email: list[0].email, step: list[0].step, on: addBusinessDays(last, 1, isOff), tries: misses.length, last });
  }
  return { done, retry, moved };
}

/** A calls file (CSV email,step,outcome,date; the CLI's --calls and the page's call box) read as rows for callMarks and
 * runPrep: emails lower-cased, outcomes as spoke|voicemail|no_answer|done (blank is done), rows without email or step
 * dropped. */
export function callLog(text) {
  return (Array.isArray(text) ? text : parseCsv(String(text || ""))).map((c) => ({ email: String(c.email || "").trim().toLowerCase(), step: String(c.step ?? "").trim(), outcome: String(c.outcome || "done").trim().toLowerCase().replace(/[\s-]+/g, "_"), date: String(c.date || c.at || "").slice(0, 10) })).filter((c) => c.email && c.step);
}

/** The calls file with one more call appended (a header is added to an empty file). A second no-answer for the same step
 * on the same day is a slip, not a try, and is not added, the same rule as the server's button. Returns the new text. */
export function addCall(text, { email, step, outcome, date }) {
  const row = callLog([{ email, step, outcome, date }])[0];
  if (!row || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !["spoke", "voicemail", "no_answer", "done"].includes(row.outcome)) throw new Error("addCall: email, step, a YYYY-MM-DD date and an outcome of spoke, voicemail, no_answer or done");
  const t = String(text || "").replace(/\s+$/, "");
  if (row.outcome === "no_answer" && callLog(t).some((c) => c.email === row.email && c.step.toLowerCase() === row.step.toLowerCase() && c.date === row.date && c.outcome === "no_answer")) return t ? t + "\n" : "";
  const cell = (v) => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  return `${t || "email,step,outcome,date"}\n${[row.email, row.step, row.outcome, row.date].map(cell).join(",")}\n`;
}

/** One SDR morning: read the replies, update the prospects and suppression, then build today's queue from what is left. */
export function runMorning(input) {
  const inbox = runInbox({ ...input, replies: input.replies ? input.replies : [] });
  const suppression = [input.suppression || "", ...inbox.suppression.map((s) => s.email)].join("\n");
  const daily = runDaily({ ...input, prospects: inbox.prospects, suppression, today: inbox.today });
  return { inbox, daily };
}

export const csvQueue = (d) => toCsv(d.queue, ["date", "overdue", "channel", "step", "prospect", "company", "email", "phone", "call_window", "subject", "body", "voicemail", "tries", "planned"]);
export const csvLeftOut = (d) => toCsv([...(d.sentMatched || []).map((x) => ({ ...x, outcome: "already sent", reason: `in your sent mail on ${x.sent_on} ("${x.sent_subject}")` })), ...d.dropped.map((x) => ({ ...x, outcome: "dropped" })), ...d.held.map((x) => ({ ...x, outcome: "held" })), ...d.stale.map((x) => ({ ...x, outcome: "too old" }))], ["outcome", "date", "channel", "step", "prospect", "company", "email", "reason"]);
