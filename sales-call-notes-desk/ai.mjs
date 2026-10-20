// Optional AI polish for the follow-up email, on the seller's own key (byok.mjs
// is a synced copy of platform/llm/byok.mjs; ai.test.mjs fails if they drift).
// With no key the built-in recap in calc.mjs is the product. A model email is
// never shown unchecked: it goes through checkEmail(), which rejects any dollar
// figure that is not in the notes, and on an error the built-in email is used.
import { complete, withFallback } from "./byok.mjs";
import { followUpEmail, checkEmail } from "./calc.mjs";

export const SYSTEM = [
  "You rewrite a salesperson's follow-up email after a call. The salesperson will read and send it themselves.",
  "Reply with the email body only: no subject line, no markdown, no preamble.",
  "Use only facts that appear in the call notes. Never add a price, discount, date, number, customer name or feature that is not in the notes.",
  "Keep it under 180 words, plain and warm, one person writing to one person. No hype, no urgency tricks, no guarantees.",
  "Recap what the contact said in their own terms, list what each side agreed to do with its date, and end with one clear next step.",
  "If the draft asks questions about gaps, keep at most two.",
].join("\n");

export function emailPrompt(notes, draft, meta = {}) {
  return [
    `Contact first name: ${String(meta.contact || "").split(/\s+/)[0] || "(not given)"}`,
    `Sign as: ${meta.you || "(not given)"}`,
    "Call notes:",
    String(notes).slice(0, 6000),
    "",
    "Built-in draft to improve (keep its facts and dates):",
    draft,
  ].join("\n");
}

// -> { body, subject, source: "model" | "fallback", error?, lint }
export async function draftEmail(config, notes, analysis, meta = {}, opts = {}) {
  const base = followUpEmail(analysis, meta);
  const r = await withFallback(config, () => base.body, async (c) => {
    const out = (await complete(c, { system: SYSTEM, prompt: emailPrompt(notes, base.body, meta), maxTokens: 600, fetch: opts.fetch })).text.trim();
    const lint = checkEmail(out, notes);
    if (lint.errors.length) throw new Error(`the model's email failed the checks: ${lint.errors[0]}`);
    return out;
  });
  return { subject: base.subject, body: r.value, source: r.source, error: r.error, lint: checkEmail(r.value, notes) };
}
