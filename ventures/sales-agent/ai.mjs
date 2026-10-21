// Optional model on the user's own key (byok.mjs is a synced copy of platform/llm/byok.mjs; ai.test.mjs fails if
// they drift). Two jobs, both under the engine's rules:
//   1. triage: the model reads a reply and names a category. mergeTriage() keeps the rules' answer whenever the
//      model's would lead to more contact, so a model can turn "unclear" into "unsubscribe" but never turn an
//      unsubscribe, a no or an away message into a drafted reply.
//   2. drafts: the model rewrites a template draft; checkDraft() must pass or the template is kept.
// With no key, or on any error, the rules and templates are the product and the page says which ran.
import { complete, withFallback, isConfigured } from "./byok.mjs";
import { CATEGORIES, triage, checkDraft, runInbox } from "./engine.mjs";

export const TRIAGE_SYSTEM = [
  "You sort replies to a salesperson's outreach emails. Read the reply and answer with one JSON object only, no prose:",
  `{"category": one of ${Object.keys(CATEGORIES).map((k) => `"${k}"`).join(", ")}, "subtype": "price" | "competitor" | "authority" | "need" | null, "return_date": "YYYY-MM-DD" | null, "evidence": "the sentence that decided it, copied exactly"}`,
  "unsubscribe: any request to stop, be removed, not be emailed, or a complaint about consent. When in doubt between unsubscribe and anything else, choose unsubscribe.",
  "bounce: an automated delivery failure. out_of_office: an automatic away message. left_company: the person left, or says they are the wrong contact.",
  "not_now: interested later or bad timing, with or without a date. not_interested: a plain no. objection: a reason that could be answered (price, an existing tool, needs someone else's approval, does not see the need).",
  "question: asks something about the product before deciding. interested: wants to talk, see a demo, get details, or proposes a time. unclear: none of these, or you cannot tell.",
  "return_date: for out_of_office or not_now, the date they gave, resolved against today's date; otherwise null.",
].join("\n");

export const DRAFT_SYSTEM = [
  "You improve a salesperson's reply to a prospect. The salesperson reads, edits and sends it themselves.",
  "Reply with the email body only: no subject, no markdown, no preamble.",
  "Never add a number, price, date, customer name, result or feature that is not in the draft, the offer details or the prospect's reply. No guarantees, no urgency, no flattery.",
  "Keep it under 120 words, plain, one person writing to one person. Keep the signature block and the opt-out line exactly as they are.",
  "Keep any [bracketed placeholder] in place: the salesperson fills it in.",
].join("\n");

const parseJson = (text) => { const m = String(text).match(/\{[\s\S]*\}/); if (!m) throw new Error("the model did not return JSON"); return JSON.parse(m[0]); };

/** Combine the rules' triage with the model's. The model may only keep or lower how much contact follows. */
export function mergeTriage(rules, model, today) {
  if (!model || !CATEGORIES[model.category]) return { ...rules, source: "rules" };
  if (rules.category === "bounce" || rules.category === "unsubscribe") return { ...rules, source: "rules" };
  // Allowed: anything from "unclear"; a move to the same or less contact; or a move between two categories that both
  // end in a draft awaiting approval (question -> interested). Never from a no-contact category to a drafting one.
  const lower = CATEGORIES[model.category].rank <= CATEGORIES[rules.category].rank;
  const bothDraft = CATEGORIES[rules.category].outbound && CATEGORIES[model.category].outbound;
  if (rules.category !== "unclear" && !lower && !bothDraft) return { ...rules, source: "rules", modelSaid: model.category };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(model.return_date || "") && model.return_date >= today ? model.return_date : null;
  return {
    category: model.category,
    subtype: model.category === "objection" && ["price", "competitor", "authority", "need"].includes(model.subtype) ? model.subtype : model.category === "objection" ? "need" : null,
    confidence: "model", evidence: String(model.evidence || "").slice(0, 300), matched: "",
    date: model.category === "not_now" ? date || rules.date || null : model.category === "out_of_office" ? date : null,
    dateText: date, referral: rules.referral || null, why: `model: ${CATEGORIES[model.category].label.toLowerCase()}`, source: "model",
    ...(rules.category !== "unclear" ? { rulesSaid: rules.category } : {}),
  };
}

/** Ask the model to triage one reply. Throws on a bad answer; callers fall back to the rules. */
export async function modelTriage(config, reply, today, opts = {}) {
  const prompt = `Today is ${today}.\nSubject: ${reply.subject || ""}\nReply:\n${String(reply.body).slice(0, 4000)}`;
  const out = await complete(config, { system: TRIAGE_SYSTEM, prompt, maxTokens: 300, fetch: opts.fetch });
  const j = parseJson(out.text);
  if (!CATEGORIES[j.category]) throw new Error(`unknown category "${j.category}"`);
  return j;
}

/**
 * runInbox with a model: triage every reply with the model (merged under the rules), then polish each draft.
 * Returns the runInbox result plus { source: "model" | "rules", errors: [] }.
 */
export async function runInboxWithModel(config, input, opts = {}) {
  if (!isConfigured(config)) return { ...runInbox(input), source: "rules", errors: [] };
  const today = input.today;
  const errors = [], decided = new Map();
  const { parseReplies } = await import("./engine.mjs");
  const replies = Array.isArray(input.replies) ? input.replies : parseReplies(input.replies);
  for (const r of replies) {
    const rules = triage(r, today);
    if (rules.category === "bounce" || rules.category === "unsubscribe") { decided.set(r, { ...rules, source: "rules" }); continue; }
    try { decided.set(r, mergeTriage(rules, await modelTriage(config, r, today, opts), today)); }
    catch (e) { errors.push(`${r.from || "reply"}: ${e.message}`); decided.set(r, { ...rules, source: "rules" }); }
  }
  const result = runInbox({ ...input, replies }, { triageFn: (r) => decided.get(r), guessFn: opts.guessFn });
  const facts = Object.values(input.offer || {}).join(" \n ");
  for (const item of result.items) {
    if (!item.draft) continue;
    const r = await withFallback(config, () => item.draft.body, async (c) => {
      const text = (await complete(c, { system: DRAFT_SYSTEM, prompt: `Offer details: ${facts}\n\nTheir reply:\n${item.body}\n\nDraft to improve:\n${item.draft.body}`, maxTokens: 500, fetch: opts.fetch })).text.trim();
      const lint = checkDraft({ ...item.draft, body: text }, facts + "\n" + item.body + "\n" + item.draft.body);
      if (lint.errors.some((e) => !/placeholder/.test(e))) throw new Error(`the model's draft failed the checks: ${lint.errors[0]}`);
      return text;
    });
    item.draft = { ...item.draft, body: r.value, source: r.source };
    if (r.error) errors.push(`${item.from}: ${r.error}`);
    item.lint = checkDraft(item.draft, facts + "\n" + item.body);
  }
  result.summary.readyToApprove = result.items.filter((x) => x.lint?.ok).length;
  return { ...result, source: "model", errors };
}
