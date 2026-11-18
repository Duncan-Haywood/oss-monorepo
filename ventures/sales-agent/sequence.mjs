// Sequence check for a cold outreach cadence (2026-11-03). Pure rules, no network, nothing sent.
// presend.mjs checks one email; this checks the whole run of touches: spacing, how many, whether
// every step still carries an opt-out and address, and whether follow-ups say anything new.
import { presend } from "./presend.mjs";

const BUMP = /^\s*(hi[^,\n]*,?\s*)?(just\s+)?(bump(ing)?|following up|checking in|circling back|touching base|any thoughts|did you see my (last|previous))/i;
const BUMP_ONLY = /^(just |wanted to )?(bump|follow(ing)? up|check(ing)? in|circl(e|ing) back|touch(ing)? base)/i;
const words = (s) => (String(s).toLowerCase().match(/[a-zÀ-ɏ']{4,}/g) || []);

/** Share of the later email's distinct words (4+ letters) that the earlier one did not use. */
export function newWordShare(prev, next) {
  const a = new Set(words(prev)), b = [...new Set(words(next))];
  if (!b.length) return 0;
  return b.filter((x) => !a.has(x)).length / b.length;
}

/**
 * @param {{subject?:string, body?:string, day?:number}[]} steps  day = days after the first touch (0 for the first)
 * @param {{country?:string, fromName?:string, maxTouches?:number}} [opts]
 * @returns {{ok:boolean, errors:{step:number,rule:string,text:string}[], warnings:{step:number,rule:string,text:string}[], steps:object[], touches:number, spanDays:number}}
 */
export function checkSequence(steps = [], opts = {}) {
  const errors = [], warnings = [];
  const e = (step, rule, text) => errors.push({ step, rule, text }), w = (step, rule, text) => warnings.push({ step, rule, text });
  const list = Array.isArray(steps) ? steps : [];
  const max = opts.maxTouches ?? 4;
  if (!list.length) e(0, "empty", "No emails in the sequence.");
  const per = list.map((s, i) => {
    const r = presend({ subject: s.subject, body: s.body, country: opts.country, fromName: opts.fromName, isReply: i > 0 });
    // Each step must stand on its own: the opt-out and address are required on every touch, not just the first.
    for (const x of r.errors) e(i + 1, x.rule, x.text);
    for (const x of r.warnings) if (i === 0 || !["consent", "regime", "generic-greeting", "identity"].includes(x.rule)) w(i + 1, x.rule, x.text);
    return r;
  });
  if (list.length > max) w(0, "touches", `${list.length} touches; more than ${max} reads as pestering and raises complaints. Stop at ${max} and let the contact go.`);
  let prevDay = list.length ? Number(list[0].day ?? 0) : 0;
  for (let i = 1; i < list.length; i++) {
    const day = Number(list[i].day);
    if (!Number.isFinite(day)) { w(i + 1, "timing", "No day given for this step, so spacing was not checked."); continue; }
    const gap = day - prevDay;
    if (gap <= 0) e(i + 1, "order", "This step is not after the one before it; days must increase.");
    else if (gap < 2) w(i + 1, "spacing", `Only ${gap} day${gap === 1 ? "" : "s"} after the last touch; allow at least 3 so it does not read as pressure.`);
    else if (gap > 21) w(i + 1, "spacing", `${gap} days after the last touch; the reader has forgotten you, so restate who you are.`);
    prevDay = day;
    const body = String(list[i].body || "");
    const fresh = newWordShare(list[i - 1].body, body);
    if (BUMP.test(body.trim()) && body.split(/\s+/).filter(Boolean).length < 40) w(i + 1, "bump-only", "A bare bump adds nothing. Give one new reason to reply: a fact, a result or a smaller ask.");
    else if (fresh < 0.3 && body.trim()) w(i + 1, "repeat", `Only ${Math.round(fresh * 100)}% of this email's words are new; it repeats the last one.`);
    if (String(list[i].subject || "").trim() && String(list[i].subject).trim() === String(list[i - 1].subject || "").trim() && !/^re:/i.test(list[i].subject)) w(i + 1, "same-subject", "Same subject as the step before; either thread it honestly or change it.");
  }
  const last = list.length ? Number(list[list.length - 1].day) : 0;
  return { ok: errors.length === 0, errors, warnings, steps: per, touches: list.length, spanDays: Number.isFinite(last) ? last : 0 };
}

/**
 * Parses pasted text into steps. Each step starts with a line "--- day N" (N optional; the first defaults to 0),
 * then an optional "Subject: ..." line, then the body.
 */
export function parseSequence(text = "") {
  const steps = [];
  let cur = null;
  for (const line of String(text).replace(/\r/g, "").split("\n")) {
    const m = /^\s*-{3,}\s*(?:day\s*(-?\d+(?:\.\d+)?))?\s*-*\s*$/i.exec(line);
    if (m) { cur = { day: m[1] === undefined ? (steps.length ? undefined : 0) : Number(m[1]), subject: "", body: [] }; steps.push(cur); continue; }
    if (!cur) { if (!line.trim()) continue; cur = { day: 0, subject: "", body: [] }; steps.push(cur); }
    const s = /^subject:\s*(.*)$/i.exec(line);
    if (s && !cur.subject && !cur.body.some((b) => b.trim())) cur.subject = s[1].trim(); else cur.body.push(line);
  }
  return steps.map((s) => ({ ...s, body: s.body.join("\n").trim() }));
}
