// Sales Agent, milestone 3: the daily run. It reads the task list Sales Cadence Builder wrote, the prospect table (as
// the inbox agent left it) and your suppression list, and answers "what do I do today?": the touches that are due,
// minus anyone who stopped, paused, bounced or is suppressed. Same principle as the inbox agent: it may always drop
// or hold a touch on its own, and it never sends one. Every touch it leaves out is listed with the reason, so the
// run doubles as an audit trail.
import { parseCsv, runInbox, toCsv, iso, toDay, DAY } from "./engine.mjs";
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
 * Returns { today, queue, held, dropped, later, stale, sentMatched, summary, brief }.
 */
export function runDaily(input) {
  const today = input.today || iso(Date.now());
  const rows = Array.isArray(input.tasks) ? input.tasks : parseCsv(input.tasks);
  const prospects = Array.isArray(input.prospects) ? input.prospects : parseCsv(input.prospects);
  const byEmail = new Map(prospects.filter((p) => p.email).map((p) => [p.email.toLowerCase(), p]));
  const suppressedBy = suppressionIndex(input.suppression);
  const done = new Set(String(input.done || "").split(/\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const [e, ...s] = l.split(/[|,]/); return stepKey(e, s.join(",")); }));
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

function brief(today, queue, held, dropped, stale, s) {
  const out = [`# Sales queue for ${today}`, "", `${s.due} touches due (${s.email} email, ${s.call} call, ${s.linkedin} LinkedIn, ${s.letter} letter)${s.overdue ? `, ${s.overdue} of them overdue` : ""}. ${s.dropped} dropped because the person stopped or is suppressed, ${s.held} held, ${s.stale} too old to send.${s.alreadySent ? ` ${s.alreadySent} email touch${s.alreadySent === 1 ? " is" : "es are"} already in your sent mail and not queued again.` : ""} Nothing has been sent.`, ""];
  for (const ch of ["call", "email", "linkedin", "letter"]) {
    const list = queue.filter((q) => q.channel === ch);
    if (!list.length) continue;
    out.push(`## ${{ call: "Calls", email: "Email", linkedin: "LinkedIn", letter: "Letters" }[ch]} (${list.length})`);
    for (const q of list) out.push(`- ${q.overdue ? "[overdue " + q.date + "] " : ""}${q.prospect || q.email}${q.company ? ", " + q.company : ""} (${q.step})${ch === "call" && q.call_window ? " " + q.call_window : ""}`);
    out.push("");
  }
  const section = (title, list) => { if (list.length) { out.push(`## ${title} (${list.length})`); for (const x of list) out.push(`- ${x.prospect || x.email} (${x.step}, ${x.channel}): ${x.reason}`); out.push(""); } };
  section("Held", held);
  section("Dropped", dropped);
  section("Too old", stale);
  return out.join("\n");
}

/** One SDR morning: read the replies, update the prospects and suppression, then build today's queue from what is left. */
export function runMorning(input) {
  const inbox = runInbox({ ...input, replies: input.replies ? input.replies : [] });
  const suppression = [input.suppression || "", ...inbox.suppression.map((s) => s.email)].join("\n");
  const daily = runDaily({ ...input, prospects: inbox.prospects, suppression, today: inbox.today });
  return { inbox, daily };
}

export const csvQueue = (d) => toCsv(d.queue, ["date", "overdue", "channel", "step", "prospect", "company", "email", "phone", "call_window", "subject", "body", "voicemail"]);
export const csvLeftOut = (d) => toCsv([...(d.sentMatched || []).map((x) => ({ ...x, outcome: "already sent", reason: `in your sent mail on ${x.sent_on} ("${x.sent_subject}")` })), ...d.dropped.map((x) => ({ ...x, outcome: "dropped" })), ...d.held.map((x) => ({ ...x, outcome: "held" })), ...d.stale.map((x) => ({ ...x, outcome: "too old" }))], ["outcome", "date", "channel", "step", "prospect", "company", "email", "reason"]);
