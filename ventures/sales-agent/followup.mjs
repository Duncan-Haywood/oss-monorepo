// Sales Agent, milestone 7b: post-call follow-up. After a call you type your notes (one line per point); this writes
// the follow-up email for you to approve: a recap that quotes only your own notes, what you promised to send, what
// they promised, and the dated next step. It states nothing your notes and offer do not say, runs the inbox agent's
// draft checks (invented numbers, placeholders, opt-out line), and writes no draft for anyone who asked to stop,
// bounced or is on your suppression list. Sends nothing.
import { checkDraft, firstName, footer, findDate, iso, parseCsv } from "./engine.mjs";
import { runPrep } from "./prep.mjs";

const lines = (text) => String(text || "").split(/\n+/).map((l) => l.replace(/^\s*[-*•\d.)]+\s+/, "").trim()).filter(Boolean);
const OURS = /^(i|we)(\s+will|'ll|\s+shall|\s+to)\s+(send|share|email|put together|check|get back|book|draft|follow up|introduce)\b/i;
const OURS_LEAD = /^(i|we)(\s+will|'ll|\s+shall|\s+to)\s+/i;
const THEIRS = /^(they|she|he|[A-Z][a-z]+)\s+(will|'ll|is going to|to)\s+(send|share|check|loop in|introduce|confirm|ask|get)\b/;
const dateIn = (l, today) => findDate(l, today) || findDate(l.replace(/\b(call|meeting|demo|step)\s+(?=(mon|tues|wednes|thurs|fri|satur|sun)day)/i, "$& on "), today);
const NEXT = /\b(next (call|meeting|step)|demo|follow[- ]up (call|meeting)|call (on|again)|meet(ing)? (on|again))\b/i;

/** input: as runPrep, plus notes (this call, one point per line) and offer. */
export function runFollowUp(input) {
  const today = input.today || iso(Date.now());
  const offer = input.offer || {};
  const prep = runPrep({ ...input, notes: "", today });
  const pts = lines(input.notes);
  const ours = pts.filter((l) => OURS.test(l));
  const theirs = pts.filter((l) => THEIRS.test(l) && !OURS.test(l));
  const nextLine = pts.find((l) => NEXT.test(l) && dateIn(l, today));
  const next = nextLine ? { line: nextLine, ...dateIn(nextLine, today) } : null;
  const recap = pts.filter((l) => !ours.includes(l) && !theirs.includes(l) && l !== nextLine).slice(0, 5);
  const issues = [];
  if (!pts.length) issues.push("No call notes were given, so there is nothing to follow up on.");
  if (pts.length && !next) issues.push("No dated next step in the notes. Agree one on the call or in this email; the draft asks for it.");
  if (prep.stop) issues.push(`Do not send a cold follow-up: ${prep.stop}.`);
  let draft = null, lint = null;
  if (!prep.stop && pts.length) {
    const row = (Array.isArray(input.prospects) ? input.prospects : parseCsv(input.prospects)).find((x) => (x.email || "").toLowerCase() === prep.email);
    const name = firstName(row || {});
    const body = [`Hi ${name},`, "", "Thanks for the time today. What I took from it:", ...recap.map((r) => `- ${r}`)];
    if (ours.length) body.push("", "What I will do:", ...ours.map((r) => { const t = r.replace(OURS_LEAD, ""); return `- ${t[0].toUpperCase()}${t.slice(1)}`; }));
    if (theirs.length) body.push("", "What I understood is on your side:", ...theirs.map((r) => `- ${r}`));
    body.push("", next ? `Next step, as we left it: ${next.line}${offer.booking_link ? ` (calendar: ${offer.booking_link})` : ""}.` : offer.booking_link ? `Could we put the next call on the calendar? ${offer.booking_link}` : "Could you send two or three times that suit you for the next call?", "", "If I have got anything wrong, reply and I will correct it.");
    draft = { subject: `Following up on today${offer.product ? `: ${offer.product}` : ""}`, body: [...body, footer(offer)].join("\n"), fakeRe: true };
    lint = checkDraft(draft, `${input.notes}\n${JSON.stringify(offer)}`);
  }
  return { today, email: prep.email, stop: prep.stop, recap, ours, theirs, next, issues, draft, lint, approval: draft ? (lint.ok ? "needs_approval" : "fix_first") : "nothing_to_send" };
}
