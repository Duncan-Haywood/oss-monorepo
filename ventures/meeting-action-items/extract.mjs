// Pull action items, decisions and open questions out of meeting notes or a
// transcript. Pure functions, no network: the same file runs in the page and in
// cli.mjs. It reads what was written and never invents an owner or a date.

const DAY = 86400000;
export const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const NOT_NAMES = new Set(("i we you they he she it this that there here who what which when where why how everyone everybody someone somebody anyone " +
  "nobody nothing the a an and but so then if also next please thanks thank ok okay yes no maybe action todo decision note notes agenda " +
  "item items meeting team ok sure right well just now today tomorrow tonight yesterday monday tuesday wednesday thursday friday saturday sunday " +
  MONTHS.join(" ")).split(" "));

const pad = (n) => String(n).padStart(2, "0");
export const iso = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
export function parseIso(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || "").trim());
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return iso(ms) === m[0] ? ms : null;
}
const dow = (ms) => new Date(ms).getUTCDay();

// The weekday after `ref` (never `ref` itself), so "by Friday" said on a Friday means next week.
function nextWeekday(ref, wd) { const diff = (wd - dow(ref) + 7) % 7; return ref + (diff || 7) * DAY; }
function mondayOf(ref) { return ref - ((dow(ref) + 6) % 7) * DAY; }

// Find a due date in a sentence. Returns { ms, text } (text is the matched phrase) or null.
// `ref` is the meeting date in ms (UTC midnight).
export function findDue(sentence, ref) {
  const s = sentence;
  const tests = [
    [/\b(\d{4})-(\d{2})-(\d{2})\b/, (m) => parseIso(m[0])],
    [/\b(?:by|on|before|until|due)?\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/i, (m) => {
      const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : new Date(ref).getUTCFullYear();
      let ms = Date.UTC(y, +m[1] - 1, +m[2]);
      if (iso(ms) !== `${y}-${pad(+m[1])}-${pad(+m[2])}`) return null;
      if (!m[3] && ms < ref) ms = Date.UTC(y + 1, +m[1] - 1, +m[2]);
      return ms;
    }],
    [/\bthe (\d{1,2})(?:st|nd|rd|th)\b/i, (m) => {
      const d = new Date(ref); let ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), +m[1]);
      if (+m[1] < 1 || +m[1] > 31) return null;
      if (ms < ref) ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, +m[1]);
      return new Date(ms).getUTCDate() === +m[1] ? ms : null;
    }],
    [new RegExp(`\\b(${MONTHS.map((x) => x.slice(0, 3)).join("|")})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "i"), (m) => {
      const mo = MONTHS.findIndex((x) => x.startsWith(m[1].toLowerCase()));
      const y = m[3] ? +m[3] : new Date(ref).getUTCFullYear();
      let ms = Date.UTC(y, mo, +m[2]);
      if (new Date(ms).getUTCMonth() !== mo) return null;
      if (!m[3] && ms < ref) ms = Date.UTC(y + 1, mo, +m[2]);
      return ms;
    }],
    [/\bin (\d{1,2}|a|one|two|three|four|five) (day|week)s?\b/i, (m) => {
      const n = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5 }[m[1].toLowerCase()] || +m[1];
      return ref + n * (m[2].toLowerCase() === "week" ? 7 : 1) * DAY;
    }],
    [/\b(end of (?:the )?month|eom)\b/i, () => { const d = new Date(ref); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0); }],
    [/\b(?:by |before )?(?:the )?(end of next week|eonw)\b/i, () => mondayOf(ref) + 11 * DAY],
    [/\b(?:by |before )?(?:the )?(end of (?:the )?week|eow)\b/i, () => { const f = mondayOf(ref) + 4 * DAY; return f < ref ? ref : f; }],
    [/\bnext week\b/i, () => mondayOf(ref) + 11 * DAY],
    [/\bnext (sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i, (m) => {
      const wd = WEEKDAYS.indexOf(m[1].toLowerCase());
      return mondayOf(ref) + 7 * DAY + ((wd + 6) % 7) * DAY;
    }],
    [/\bthis (sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i, (m) => {
      const wd = WEEKDAYS.indexOf(m[1].toLowerCase());
      const ms = mondayOf(ref) + ((wd + 6) % 7) * DAY;
      return ms < ref ? ms + 7 * DAY : ms;
    }],
    [/\b(?:(?:eod|cob|end of (?:the )?day)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)|(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+(?:eod|cob|end of (?:the )?day))\b/i, (m) => nextWeekday(ref, WEEKDAYS.indexOf((m[1] || m[2]).toLowerCase()))],
    [/\b(tomorrow)\b/i, () => ref + DAY],
    [/\b(today|tonight|eod|cob|end of (?:the )?day|close of business)\b/i, () => ref],
    [/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|(?:mon|tue|tues|wed|thu|thur|thurs|fri)(?=\b))\b/i, (m) => {
      const w = m[1].toLowerCase();
      const wd = WEEKDAYS.findIndex((x) => x === w || x.startsWith(w));
      return wd < 0 ? null : nextWeekday(ref, wd);
    }],
  ];
  for (const [re, fn] of tests) {
    const m = re.exec(s);
    if (!m) continue;
    const ms = fn(m);
    if (ms != null) return { ms, text: m[0].trim() };
  }
  return null;
}

const SKIP_VERBS = /^(be|been|being|have|has|had|not|depend|probably be|likely be|take a while|need|help)\b/i;
const HEDGE = /\b(maybe|might|perhaps|possibly|i guess|if we have time|if time|we could|could try)\b/i;

function cleanTask(text, dueText, ownerText) {
  let t = text;
  if (dueText) t = t.replace(new RegExp("\\b(?:by|on|before|until|due|at)?\\s*" + dueText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i"), " ");
  if (ownerText) t = t.replace(ownerText, " ");
  t = t.replace(/^\s*(?:maybe|perhaps|probably)\s+/i, "").replace(/^\s*(?:to|will|'ll|should|needs? to|is going to|can|could|you|please)\s+/i, "")
       .replace(/\s+(?:by|on|before|until|due|for|at|in|to)\s*[.,;:!?]*\s*$/i, "")
       .replace(/\s{2,}/g, " ").replace(/^[\s,;:\-–—]+|[\s,;:\-–—.!?]+$/g, "");
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

function titleName(w) { return w[0].toUpperCase() + w.slice(1).toLowerCase(); }

// Resolve a name written in the notes to a listed attendee (first-name match), else keep it as written.
function resolveOwner(raw, attendees) {
  if (!raw) return null;
  const parts = raw.split(/\s*(?:,|\band\b|&|\/)\s*/i).map((x) => x.trim()).filter(Boolean);
  return parts.map((p) => {
    const hit = attendees.find((a) => a.toLowerCase() === p.toLowerCase() || a.split(/\s+/)[0].toLowerCase() === p.toLowerCase());
    return hit || p;
  }).join(" & ");
}

function stripLine(line) {
  return line
    .replace(/^\s*(?:[-*•–]|\d+[.)])\s*/, "")
    .replace(/^\[[ xX]?\]\s*/, "")
    .replace(/^\s*[\[(]?\d{1,2}:\d{2}(?::\d{2})?[\])]?\s*[-–]?\s*/, "")
    .trim();
}

function splitSpeaker(text) {
  const m = /^([A-Z][A-Za-z.'-]*(?: [A-Z][A-Za-z.'-]*)?)\s*:\s+(.*)$/.exec(text);
  if (!m) return { speaker: null, body: text };
  const key = m[1].toLowerCase();
  if (/^(action|action item|actions|todo|to-do|ai|task|follow[- ]?up|decision|decided|agreed|note|notes|q|question|open question|tbd|parking lot|owner|next steps?|agenda|attendees|present|date)$/.test(key)) return { speaker: null, body: text };
  return { speaker: m[1], body: m[2] };
}

const MARKER = /^(?:action(?: items?)?|todo|to-do|ai|task|follow[- ]?up|next steps?)\s*[:\-–]\s*(.*)$/i;
const DECISION = /^(?:decision|decided|agreed|resolved)\s*[:\-–]\s*(.*)$|\b(?:we (?:have )?(?:decided|agreed)(?: to| that|:)?|(?:it|that) was (?:decided|agreed)(?: to| that)?|let'?s go with|we'?ll go with|we are going with|approved(?: to)?)\s+(.+)/i;
const QUESTION = /^(?:q|question|open question|tbd|parking lot)\s*[:\-–]\s*(.*)$/i;

function sentences(body) {
  return body.split(/(?<=[.!?;])\s+(?=[A-Z@"'(])/).map((x) => x.trim()).filter(Boolean);
}

function candidate(sentence, speaker, attendees, explicit) {
  let m;
  // "@ana send the deck"
  if ((m = /^@([A-Za-z][\w.-]*)\s+(.+)$/.exec(sentence))) return { owner: resolveOwner(m[1], attendees), rest: m[2], via: "mention", ownerText: null };
  // "Owner: Ana" style trailing / leading tags are handled by caller; here: "Ana will / to / should ..."
  const named = new RegExp("(?:^|[,;]\\s*|\\band\\s+|\\bthen\\s+)((?:[A-Z][a-z]+)(?:\\s*(?:,|and|&)\\s*[A-Z][a-z]+)?)\\s+(will|to|should|needs to|need to|is going to|is gonna|agreed to|offered to|volunteered to|owns|has to|must|can you|could you)\\s+(.+)$").exec(sentence);
  if (named) {
    const who = named[1].split(/\s*(?:,|and|&)\s*/);
    const ok = who.every((w) => !NOT_NAMES.has(w.toLowerCase()));
    const verb = named[2];
    const toOk = verb !== "to" || explicit || who.every((w) => attendees.some((a) => a.split(/\s+/)[0].toLowerCase() === w.toLowerCase()));
    if (ok && toOk && !SKIP_VERBS.test(named[3])) {
      return { owner: resolveOwner(named[1], attendees), rest: named[3], via: /can you|could you/.test(verb) ? "request" : "named", ownerText: null };
    }
  }
  if ((m = /^([A-Z][a-z]+),?\s+(?:can|could|would) you\s+(.+?)\??$/.exec(sentence)) && !NOT_NAMES.has(m[1].toLowerCase()))
    return { owner: resolveOwner(m[1], attendees), rest: m[2], via: "request", ownerText: null };
  if ((m = /^(?:so,?\s+|ok(?:ay)?,?\s+)?(?:can|could|would) you\s+(.+?)(?:,\s*([A-Z][a-z]+)\??)?$/i.exec(sentence)) && m[2] && !NOT_NAMES.has(m[2].toLowerCase()))
    return { owner: resolveOwner(m[2], attendees), rest: m[1], via: "request", ownerText: null };
  if ((m = /^(?:(?:so|ok|okay|yes|sure|maybe|perhaps|probably)[,.]?\s+)*(?:i'll|i will|i can|i'm going to|i am going to|let me|i'll go ahead and|i can go ahead and|i'd be happy to|i can take|i'll take)\s+(.+)$/i.exec(sentence)) ||
      (m = /,\s*(?:i'll|i will|i can|let me)\s+(.+)$/i.exec(sentence))) {
    return { owner: speaker ? resolveOwner(speaker, attendees) : null, rest: m[1], via: "self", ownerText: null, noSpeaker: !speaker };
  }
  if ((m = /\b(?:we (?:need|have|ought|should|must)(?: to)?|someone (?:needs to|should|has to|will need to)|need to|someone to|let'?s)\s+(.+)$/i.exec(sentence)))
    return { owner: null, rest: m[1], via: "open", ownerText: null };
  return null;
}

export function extract(notes, { date = null, attendees = [] } = {}) {
  const text = String(notes || "");
  if (!text.trim()) return { ok: false, error: "Paste some meeting notes or a transcript first." };
  const ref = date ? parseIso(date) : null;
  if (date && ref == null) return { ok: false, error: "Meeting date must look like 2026-10-19." };
  const people = attendees.map((a) => a.trim()).filter(Boolean);
  const actions = [], decisions = [], questions = [];
  const seen = new Set();
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, idx) => {
    const line = stripLine(raw);
    if (!line) return;
    const { speaker, body } = splitSpeaker(line);
    let m;
    if ((m = QUESTION.exec(body))) { if (m[1]) questions.push({ text: m[1].replace(/\s+$/, ""), line: idx + 1 }); return; }
    const dec = DECISION.exec(body);
    const mark = MARKER.exec(body);
    if (dec && !mark) { const t = (dec[1] || dec[2] || "").trim().replace(/[.\s]+$/, ""); if (t) decisions.push({ text: t[0].toUpperCase() + t.slice(1), line: idx + 1 }); return; }
    const explicit = Boolean(mark || /^\s*[-*]?\s*\[[ xX]?\]/.test(raw));
    const targets = mark ? [mark[1]] : sentences(body);
    for (const sent of targets) {
      if (!sent) continue;
      if (!mark && /\?\s*$/.test(sent) && !/^(?:[A-Z][a-z]+,?\s+)?(?:can|could|would) you\b/i.test(sent) && !/,\s*[A-Z][a-z]+\?$/.test(sent)) {
        if (/\b(who|when|what|how|which|should we|do we|are we|can we|is there)\b/i.test(sent) && sent.length > 15) questions.push({ text: sent, line: idx + 1 });
        continue;
      }
      let c = candidate(sent, speaker, people, explicit);
      let ownerGuess = null;
      if (!c && explicit && !mark) {
        const lead = /^@?([A-Z][a-z]+)\s+([a-z].+)$/.exec(sent);
        if (lead && !NOT_NAMES.has(lead[1].toLowerCase())) c = { owner: resolveOwner(lead[1], people), rest: lead[2], via: "marker", ownerText: null };
      }
      if (!c && mark) {
        // "Ana to send the deck Friday", "Send the deck - Ana", "Send the deck (owner: Ana)"
        let rest = sent, owner = null;
        const tail = /(?:\(|-|–|—|,)?\s*(?:owner|assigned to|assignee|who)\s*[:=]\s*([A-Z][\w.&, ]*?)\)?\s*$/i.exec(rest) || /\s[-–—]\s*@?([A-Z][a-z]+(?:\s*(?:,|and|&)\s*[A-Z][a-z]+)?)\s*$/.exec(rest) || /\(([A-Z][a-z]+(?:\s*(?:,|and|&)\s*[A-Z][a-z]+)?)\)\s*$/.exec(rest);
        if (tail) { owner = tail[1].trim().replace(/[)\s]+$/, ""); rest = rest.slice(0, tail.index).trim(); }
        const lead = /^@?([A-Z][a-z]+(?:\s*(?:,|and|&)\s*[A-Z][a-z]+)?)\s*(?::|-|–)\s+(.+)$/.exec(rest);
        if (!owner && lead && !NOT_NAMES.has(lead[1].toLowerCase())) { owner = lead[1]; rest = lead[2]; }
        c = { owner: owner ? resolveOwner(owner, people) : (speaker ? resolveOwner(speaker, people) : null), rest, via: "marker", ownerText: null };
        ownerGuess = !owner && speaker ? "speaker" : null;
      }
      if (!c) continue;
      if (c.noSpeaker) c.owner = null;
      if (!c.rest || c.rest.split(/\s+/).length < 2 && !mark) continue;
      const due = ref != null ? findDue(sent, ref) : null;
      const dueRaw = !due ? ((/\b(by|before|due)\b[^.]*\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|eod|end of (?:the )?(?:week|month|day)|next week)\b/i.exec(sent) || [])[0] || null) : null;
      const task = cleanTask(c.rest, due && due.text, null) || cleanTask(c.rest, null, null);
      if (!task || task.length < 3) continue;
      let conf = { marker: "high", named: "high", self: "high", mention: "high", request: "medium", open: "low" }[c.via];
      if (HEDGE.test(sent)) conf = conf === "high" ? "medium" : "low";
      const prev = actions.findLast((a) => a.owner && c.owner && a.owner === c.owner && a.confidence === "medium");
      if (c.via === "self" && prev && /^(?:send|do|get|share|handle|take care of|look at|check|review|finish)\s+(?:it|them|that|this|those)\b/i.test(task)) {
        if (due) { prev.due = iso(due.ms); prev.dueText = due.text; }
        prev.confidence = "high";
        continue;
      }
      const key = `${(c.owner || "").toLowerCase()}|${task.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      actions.push({
        task, owner: c.owner || null, due: due ? iso(due.ms) : null, dueText: due ? due.text : dueRaw,
        confidence: conf, line: idx + 1, source: raw.trim(),
        note: c.noSpeaker ? "“I’ll” with no speaker named: add an owner." : ownerGuess ? "Owner taken from the speaker." : (due == null && dueRaw ? "Relative date not resolved: set the meeting date." : null),
      });
    }
  });
  return {
    ok: true, date: ref != null ? iso(ref) : null,
    actions, decisions, questions,
    counts: {
      actions: actions.length,
      unowned: actions.filter((a) => !a.owner).length,
      undated: actions.filter((a) => !a.due).length,
      decisions: decisions.length, questions: questions.length,
    },
  };
}

const csvCell = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function actionsCsv(r) {
  const rows = [["Task", "Owner", "Due", "Confidence", "Source line"]];
  for (const a of r.actions) rows.push([a.task, a.owner || "", a.due || "", a.confidence, a.line]);
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export function actionsMarkdown(r, { title = "Meeting notes" } = {}) {
  const out = [`# ${title}${r.date ? ` (${r.date})` : ""}`, ""];
  if (r.decisions.length) { out.push("## Decisions", ...r.decisions.map((d) => `- ${d.text}`), ""); }
  out.push("## Action items");
  if (!r.actions.length) out.push("- None found.");
  for (const a of r.actions) out.push(`- [ ] ${a.task} — **${a.owner || "needs an owner"}**${a.due ? `, due ${a.due}` : a.dueText ? `, ${a.dueText}` : ""}`);
  if (r.questions.length) out.push("", "## Open questions", ...r.questions.map((q) => `- ${q.text}`));
  return out.join("\n") + "\n";
}

// A follow-up email grouped by owner, ready to paste. Unowned items are listed last, flagged.
export function followUpEmail(r, { title = "our meeting", sender = "" } = {}) {
  const by = new Map();
  for (const a of r.actions) { const k = a.owner || ""; if (!by.has(k)) by.set(k, []); by.get(k).push(a); }
  const out = [`Subject: Follow-up: ${title}${r.date ? ` (${r.date})` : ""}`, "", "Hi all,", "", `Thanks for ${title}. Here is what we agreed.`, ""];
  if (r.decisions.length) out.push("Decisions", ...r.decisions.map((d) => `  - ${d.text}`), "");
  if (r.actions.length) out.push("Who is doing what");
  for (const [owner, list] of by) {
    if (!owner) continue;
    out.push(`  ${owner}`, ...list.map((a) => `    - ${a.task}${a.due ? ` (by ${a.due})` : a.dueText ? ` (${a.dueText})` : ""}`));
  }
  if (by.has("")) out.push("  Still needs an owner", ...by.get("").map((a) => `    - ${a.task}${a.due ? ` (by ${a.due})` : ""}`));
  if (r.questions.length) out.push("", "Still open", ...r.questions.map((q) => `  - ${q.text}`));
  out.push("", "Reply if I missed or got anything wrong.", sender ? `\n${sender}` : "");
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

const icsEsc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
// All-day calendar entries for dated actions (one VTODO-free VEVENT each, importable anywhere).
export function actionsIcs(r, stamp = "20260101T000000Z") {
  const out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//meeting-action-items//EN", "CALSCALE:GREGORIAN"];
  r.actions.filter((a) => a.due).forEach((a, i) => {
    const d = a.due.replace(/-/g, "");
    const next = iso(parseIso(a.due) + DAY).replace(/-/g, "");
    out.push("BEGIN:VEVENT", `UID:action-${i + 1}-${d}@meeting-action-items`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${icsEsc(`${a.owner ? a.owner + ": " : ""}${a.task}`)}`, "END:VEVENT");
  });
  out.push("END:VCALENDAR");
  return out.join("\r\n") + "\r\n";
}

export const SAMPLE = `Weekly product sync, Monday
Attendees: Ana, Ben, Cleo, Dev

Ana: Pricing page is live but the annual toggle is broken on Safari.
Ben: I'll fix the Safari toggle by Wednesday.
Ana: We decided to keep the free tier through December.
Cleo: Can you send the churn numbers to finance, Dev?
Dev: Sure, I'll send them tomorrow.
ACTION: Ana to draft the launch email by Nov 3
We need to update the onboarding checklist before the webinar.
Cleo will book the venue for the offsite next Friday.
Q: Who owns the refund policy wording?
Ben: Maybe I'll look at the docs sidebar if there's time.
- [ ] Dev follow up with legal on the data processing addendum in 2 weeks`;
