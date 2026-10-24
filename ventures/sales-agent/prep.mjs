// Sales Agent, milestone 7a: call prep. Before a call with one person it reads only what you give it (the prospects
// table the inbox agent keeps, the thread of their replies, notes from earlier calls, and optionally the CRM row) and
// writes a one-page brief: who they are, where the relationship stands, what they said in their own words, which of
// the nine discovery fields you still know nothing about (each with the question to ask), and a short agenda. Like the
// rest of the agent it reads nothing else, guesses nothing and sends nothing. If the person asked to stop, bounced or
// is on your suppression list the brief says so first and recommends no outreach, because a call someone agreed to is
// theirs to schedule, not the agent's to chase.
import { parseCsv, parseReplies, triage, CATEGORIES, iso } from "./engine.mjs";
import { normalizeRow } from "./research.mjs";

// The nine fields and their questions mirror sales-call-notes-desk (kept inline so this venture builds on its own).
export const FIELDS = [
  { id: "need", label: "Pain / need", ask: "What is not working today, and what does it cost you when it goes wrong?", re: /\b(problem|pain|struggl\w*|frustrat\w*|manual(ly)?|spreadsheets?|takes? (us )?(hours|days)|wasting|error[- ]prone|can'?t keep up|held together|keeps? breaking|breaks|too slow|re-?keying|by hand|wastes? hours)\b/i },
  { id: "metrics", label: "Quantified impact", ask: "How would you measure success: hours, dollars, error rate, volume?", re: /\b(\d[\d,.]*|one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty|fifty|hundred)\s?(%|percent|hours?|hrs|days?|stops|routes|orders|invoices|trucks|reps|users|people|employees)\b|\$\s?\d/i },
  { id: "budget", label: "Budget", ask: "Is there a budget set aside for this, or how do you usually fund something like it?", re: /\b(budget|approved spend|allocated|per (month|year|seat)|price range|no funds|money is tight|funds)\b/i },
  { id: "authority", label: "Decision maker", ask: "Who else signs off on this, and can we include them in the next call?", re: /\b(sign(s|ed)? off|final say|decision.?maker|my (boss|manager|cfo|ceo)|approval|approves?|decision (rests|is with)|rests with|run (it|this) past|sign-?off|the board)\b/i },
  { id: "timeline", label: "Timeline", ask: "Is there a date this needs to be live by, and what happens if it slips?", re: /\b(deadline|by (the end of )?(q[1-4]|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*|next (quarter|month)|go[- ]live|\bin q[1-4]|\bby q[1-4]|before (the )?(season|launch|audit))\b/i },
  { id: "process", label: "Decision process", ask: "What steps come between a yes from you and a signed order (security review, legal, procurement)?", re: /\b(procurement|legal review|security review|purchase order|contract|vendor (form|onboarding)|purchasing|security team)\b/i },
  { id: "criteria", label: "Decision criteria", ask: "What must a solution do for you to pick it, and what would rule one out?", re: /\b(must (have|do|work|support|integrate)|has to (support|integrate)|need(s)? to (integrate|work|support)|deal[- ]?breaker|requirement\w*)\b/i },
  { id: "competition", label: "Alternatives", ask: "What are you using today, and who else are you looking at?", re: /\b(currently using|we use|looking at|also (talking|speaking) to|compared? (with|to)|competitor|alternative|switch(ing)? from|evaluating|against|move off|moving off)\b/i },
  { id: "nextstep", label: "Dated next step", ask: "Can we put the next call on the calendar before we hang up?", re: /\b(next (call|meeting|step)|follow[- ]up (call|on)|demo on|schedule[d]? for|meet again|booked for|agreed to meet)\b/i },
];

const sentences = (text) => String(text || "").replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z"'(])/).map((s) => s.trim()).filter(Boolean);

/**
 * input: { email, prospects (CSV text or rows), replies (pasted thread, text), notes (earlier call notes, text),
 * crm (export CSV text or rows, optional), suppression (text), today, offer }.
 * Returns { today, email, found, status, stop (string or ""), history, known, facts, unknown, agenda, brief }.
 */
export function runPrep(input) {
  const today = input.today || iso(Date.now());
  const email = String(input.email || "").trim().toLowerCase();
  const table = Array.isArray(input.prospects) ? input.prospects : parseCsv(input.prospects);
  const p = table.find((x) => (x.email || "").toLowerCase() === email) || null;
  const crmRows = (Array.isArray(input.crm) ? input.crm : parseCsv(input.crm)).map(normalizeRow);
  const crm = crmRows.find((r) => r.email === email) || null;
  const sup = String(input.suppression || "").split(/[\n,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const onList = sup.includes(email) || sup.includes("@" + email.split("@")[1]);

  // Their side of the thread only: what they wrote, in order, each one read by the same rules the inbox agent uses.
  const theirs = parseReplies(input.replies).filter((r) => r.from === email);
  const history = theirs.map((r) => { const t = triage(r, today); return { date: r.date, subject: r.subject, category: t.category, label: CATEGORIES[t.category]?.label || t.category, quote: sentences(r.body).slice(0, 2).join(" ").slice(0, 240) }; });

  const status = (p?.status || "").toLowerCase();
  let stop = "";
  if (onList) stop = "on your suppression list";
  else if (["unsubscribed", "bounced"].includes(status)) stop = `marked ${status}`;
  else if (history.some((h) => h.category === "unsubscribe")) stop = "their own reply asked you to stop";
  else if (history.some((h) => h.category === "bounce")) stop = "a delivery failure came back for this address";

  // Evidence per field: the sentence, from their replies or your notes, that mentions it. Their words rank first.
  const sources = [...theirs.map((r) => ({ from: "their reply", text: r.body })), { from: "your call notes", text: input.notes }];
  const known = [], unknown = [];
  for (const f of FIELDS) {
    let hit = null;
    for (const s of sources) { const m = sentences(s.text).find((x) => f.re.test(x)); if (m) { hit = { field: f.label, evidence: m.slice(0, 240), source: s.from }; break; } }
    if (hit) known.push(hit); else unknown.push({ field: f.label, ask: f.ask });
  }

  const name = [p?.first_name || crm?.first_name, crm?.last_name].filter(Boolean).join(" ") || p?.first_name || email;
  const facts = [];
  const add = (k, v, src) => { if (v) facts.push({ fact: `${k}: ${v}`, source: src }); };
  add("company", p?.company || crm?.company, p?.company ? "prospects table" : "CRM export");
  add("title", crm?.title, "CRM export"); add("industry", crm?.industry, "CRM export"); add("employees", crm?.employees, "CRM export");
  add("country", crm?.country, "CRM export"); add("lifecycle stage", crm?.lifecycle, "CRM export"); add("last contacted", crm?.last_contacted, "CRM export");
  add("status in the inbox agent", p?.status, "prospects table"); add("paused until", p?.paused_until, "prospects table");

  const agenda = stop ? [] : [
    "Confirm the time you have and what they want out of it.",
    ...(history.length ? [`Pick up where they left off: ${history.at(-1).label.toLowerCase()}${history.at(-1).quote ? ` ("${history.at(-1).quote.slice(0, 100)}")` : ""}.`] : ["Open with why you are talking (they have not written to you yet in this thread)."]),
    ...unknown.slice(0, 4).map((u) => `Ask: ${u.ask}`),
    "End with a dated next step and write it down before the call ends.",
  ];

  return { today, email, found: Boolean(p || crm || theirs.length), status: p?.status || "", stop, history, known, facts, unknown, agenda, brief: brief({ today, email, name, p, stop, history, known, facts, unknown, agenda }) };
}

function brief(d) {
  const o = [`# Call prep: ${d.name}${d.p?.company ? ", " + d.p.company : ""} (${d.today})`, ""];
  if (d.stop) o.push(`**Do not chase this person: ${d.stop}.** If they booked this call themselves, take it; otherwise send nothing and do not add them to a cadence.`, "");
  if (!d.facts.length && !d.history.length) o.push(`Nothing is on file for ${d.email}: not in the prospects table, no replies from them in the thread you gave, no CRM row. Add what you have before the call.`, "");
  if (d.facts.length) { o.push("## On file"); for (const f of d.facts) o.push(`- ${f.fact} (${f.source})`); o.push(""); }
  if (d.history.length) { o.push("## What they wrote, oldest first"); for (const h of d.history) o.push(`- ${h.date || "undated"}${h.subject ? ` "${h.subject}"` : ""}: read as ${h.label.toLowerCase()}. "${h.quote}"`); o.push(""); }
  if (d.known.length) { o.push("## Already known (their words, or your notes)"); for (const k of d.known) o.push(`- ${k.field}: "${k.evidence}" (${k.source})`); o.push(""); }
  if (d.unknown.length) { o.push("## Still unknown: ask"); for (const u of d.unknown) o.push(`- ${u.field}: ${u.ask}`); o.push(""); }
  if (d.agenda.length) { o.push("## Agenda"); d.agenda.forEach((a, i) => o.push(`${i + 1}. ${a}`)); o.push(""); }
  o.push("Pattern rules found the lines above; a field marked known may be a false match, so read the quote. Nothing was sent.");
  return o.join("\n");
}
