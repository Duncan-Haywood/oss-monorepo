// Optional AI polish for a review reply, on the owner's own key (byok.mjs is a
// synced copy of platform/llm/byok.mjs; ai.test.mjs fails if they drift). With
// no key the deterministic composer in calc.mjs is the product. A model reply
// is never shown unchecked: it goes through checkReply(), and if that finds an
// error the template reply is used and the page says so.
import { complete, withFallback } from "./byok.mjs";
import { composeReply, checkReply, readProfile, analyze, BUSINESS_TYPES } from "./calc.mjs";

export const SYSTEM = [
  "You write the public reply a small-business owner posts under a customer review.",
  "Reply with the reply text only: no quotes, no preamble, no markdown.",
  "Rules: 40 to 110 words. Thank the reviewer. Name one specific thing they mentioned.",
  "For a complaint: apologise for the experience without admitting legal fault, do not argue, do not explain away, and invite them to contact the owner offline using the contact line given.",
  "Never offer a refund, discount or free item. Never ask the reviewer to change or remove the review.",
  "Never accuse the reviewer of lying or of not being a customer.",
  "Use the reviewer's first name only. Do not invent facts about the business or the visit.",
  "If the business is a health practice, never confirm that the reviewer was a patient or mention their care.",
  "If the review mentions legal action, injury, harassment or theft, write two short sentences that take it offline and say nothing about what happened.",
].join("\n");

export function replyPrompt(review, profileIn) {
  const profile = readProfile(profileIn);
  const a = analyze(review, profile.type);
  return [
    `Business: ${profile.business || "(not given)"} (${BUSINESS_TYPES[profile.type].label})`,
    `Owner name to sign: ${profile.owner || "(not given)"}`,
    `Contact line to use for complaints: ${profile.contact || "(none; ask them to contact the business directly)"}`,
    `Tone: ${profile.tone}`,
    `Stars: ${a.ratingGuessed ? "unknown" : a.rating}`,
    `Reviewer first name: ${review.reviewer ? review.reviewer.split(" ")[0] : "(not given)"}`,
    `Review: ${String(review.body).slice(0, 2000)}`,
  ].join("\n");
}

// -> { reply, source: "model" | "fallback", error?, lint }
export async function draftReply(config, review, profileIn = {}, opts = {}) {
  const profile = readProfile(profileIn);
  const base = () => composeReply(review, profile).text;
  const r = await withFallback(config, base, async (c) => {
    const out = (await complete(c, { system: SYSTEM, prompt: replyPrompt(review, profile), maxTokens: 500, fetch: opts.fetch })).text.trim();
    const lint = checkReply(out, review, profile);
    if (lint.errors.length) throw new Error(`the model's reply failed the checks: ${lint.errors[0]}`);
    return out;
  });
  return { reply: r.value, source: r.source, error: r.error, lint: checkReply(r.value, review, profile) };
}
