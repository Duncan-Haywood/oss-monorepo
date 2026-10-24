// Sales Agent, milestone 3: the daily run. It reads the task list Sales Cadence Builder wrote, the prospect table (as
// the inbox agent left it) and your suppression list, and answers "what do I do today?": the touches that are due,
// minus anyone who stopped, paused, bounced or is suppressed. Same principle as the inbox agent: it may always drop
// or hold a touch on its own, and it never sends one. Every touch it leaves out is listed with the reason, so the
// run doubles as an audit trail.
import { parseCsv, runInbox, toCsv, iso, toDay, DAY } from "./engine.mjs";

// Statuses the inbox agent sets that end the cadence for good (or, for closed_lost, until its 180-day pause).
const STOPPED = { unsubscribed: "asked to stop", closed_lost: "said no", left: "left the company", replied: "replied; a person takes it from here" };
const digits = (s) => String(s || "").replace(/\D/g, "");
const truthy = (v) => /^(1|y|yes|true|x)$/i.test(String(v || "").trim());
const stepKey = (email, step) => `${String(email || "").toLowerCase()}|${String(step || "").trim().toLowerCase()}`;

function suppressionIndex(text) {
  const emails = new Set(), domains = new Set(), phones = new Set();
  for (const raw of String(text || "").split(/[\n,;]+/)) {
    const s = raw.trim().toLowerCase();
    if (!s) continue;
    if (s.startsWith("@")) domains.add(s.slice(1));
    else if (s.includes("@")) emails.add(s);
    else if (digits(s).length >= 7) phones.add(digits(s).slice(-10));
  }
  return (email, phone) => {
    const e = String(email || "").toLowerCase();
    if (e && emails.has(e)) return "on your suppression list";
    if (e && domains.has(e.split("@")[1])) return `domain @${e.split("@")[1]} is on your suppression list`;
    if (phone && digits(phone).length >= 7 && phones.has(digits(phone).slice(-10))) return "phone number is on your suppression list";
    return null;
  };
}

/**
 * input: { tasks (cadence builder CSV text, or rows), prospects (CSV text or rows), suppression (text), done (lines
 * "email,step" or "email|step" for touches you already did), today, maxOverdueDays = 5, emailCap = 40 }
 * Returns { today, queue, held, dropped, later, stale, summary, brief }.
 */
export function runDaily(input) {
  const today = input.today || iso(Date.now());
  const rows = Array.isArray(input.tasks) ? input.tasks : parseCsv(input.tasks);
  const prospects = Array.isArray(input.prospects) ? input.prospects : parseCsv(input.prospects);
  const byEmail = new Map(prospects.filter((p) => p.email).map((p) => [p.email.toLowerCase(), p]));
  const suppressedBy = suppressionIndex(input.suppression);
  const done = new Set(String(input.done || "").split(/\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const [e, ...s] = l.split(/[|,]/); return stepKey(e, s.join(",")); }));
  const maxOverdue = input.maxOverdueDays ?? 5, emailCap = input.emailCap ?? 40;
  const queue = [], held = [], dropped = [], stale = [];
  let later = 0, alreadyDone = 0;

  for (const r of rows) {
    const t = { date: r.date, channel: (r.channel || "").toLowerCase(), step: r.step, prospect: r.prospect, company: r.company, email: (r.email || "").toLowerCase(), phone: r.phone, call_window: r.call_window, subject: r.subject, body: r.body, voicemail: r.voicemail, issues: r.issues };
    const day = toDay(t.date);
    if (!Number.isFinite(day)) { held.push({ ...t, reason: "no readable date in the task list" }); continue; }
    if (done.has(stepKey(t.email, t.step))) { alreadyDone++; continue; }
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
  const summary = { due: final.length, overdue: final.filter((q) => q.overdue).length, email: by("email"), call: by("call"), linkedin: by("linkedin"), letter: by("letter"), held: held.length, dropped: dropped.length, stale: stale.length, later, alreadyDone };
  return { today, queue: final, held, dropped, stale, later, summary, brief: brief(today, final, held, dropped, stale, summary) };
}

function brief(today, queue, held, dropped, stale, s) {
  const out = [`# Sales queue for ${today}`, "", `${s.due} touches due (${s.email} email, ${s.call} call, ${s.linkedin} LinkedIn, ${s.letter} letter)${s.overdue ? `, ${s.overdue} of them overdue` : ""}. ${s.dropped} dropped because the person stopped or is suppressed, ${s.held} held, ${s.stale} too old to send. Nothing has been sent.`, ""];
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
export const csvLeftOut = (d) => toCsv([...d.dropped.map((x) => ({ ...x, outcome: "dropped" })), ...d.held.map((x) => ({ ...x, outcome: "held" })), ...d.stale.map((x) => ({ ...x, outcome: "too old" }))], ["outcome", "date", "channel", "step", "prospect", "company", "email", "reason"]);
