// Draft the words of a proposal (summary, problem, goals, scope, assumptions)
// from a short brief. The numbers are never drafted: prices, dates and clauses
// stay with the person. Works with no key (a keyword-matched starter), and
// with the user's own key from any provider via byok.mjs, which is a synced
// copy of platform/llm/byok.mjs (ai.test.mjs fails if they drift).
import { complete, withFallback } from "./byok.mjs";
import { TEMPLATES } from "./templates.mjs";

export const SYSTEM = [
  "You write the wording of a services proposal for a freelancer or small agency.",
  "Reply with one JSON object and nothing else, with these keys:",
  '"summary" (one paragraph, what will be done, for whom, the outcome),',
  '"problem" (one or two sentences in the client\'s terms),',
  '"goals" (array of 2 to 4 short strings),',
  '"deliverables" (array of 2 to 5 objects with "name", "included" (array of strings) and "excluded" (array of strings)),',
  '"assumptions" (array of 2 to 5 short strings).',
  "Rules: do not state prices, dates, durations, guarantees, client results or legal terms.",
  "Do not invent facts about the client; use [square brackets] where a detail is missing.",
  "Always list at least one thing excluded per deliverable, so scope is clear.",
].join("\n");

export function briefPrompt(brief) {
  const b = brief || {};
  const line = (k, v) => (String(v || "").trim() ? `${k}: ${String(v).trim().slice(0, 1500)}\n` : "");
  return line("Work offered", b.work) + line("Client", b.client) + line("Client's situation", b.situation) +
    line("Anything to leave out", b.leaveOut) + line("Tone", b.tone || "plain, confident, specific");
}

const lines = (v) => (Array.isArray(v) ? v : String(v || "").split("\n")).map((s) => String(s).trim()).filter(Boolean);
const text = (v, max = 1200) => String(v || "").replace(/\s+/g, " ").trim().slice(0, max);

// Pull the first JSON object out of a reply, tolerating code fences and chatter.
export function parseDraft(reply) {
  const s = String(reply || "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("the model did not return a draft");
  let o;
  try { o = JSON.parse(s.slice(start, end + 1)); } catch { throw new Error("the model's draft was not valid JSON"); }
  const deliverables = (Array.isArray(o.deliverables) ? o.deliverables : []).slice(0, 5).map((d) => ({
    name: text(d && d.name, 120),
    included: lines(d && d.included).slice(0, 8).join("\n"),
    excluded: lines(d && d.excluded).slice(0, 8).join("\n"),
  })).filter((d) => d.name);
  const draft = {
    summary: text(o.summary), problem: text(o.problem, 600),
    goals: lines(o.goals).slice(0, 5).join("\n"), assumptions: lines(o.assumptions).slice(0, 6).join("\n"),
    deliverables,
  };
  if (!draft.summary && !deliverables.length) throw new Error("the model's draft was empty");
  return draft;
}

const KEYWORDS = {
  "web-design": ["website", "web site", "web design", "landing page", "wordpress", "shopify", "ecommerce"],
  consulting: ["consult", "advis", "strategy", "audit", "assessment", "workshop"],
  "marketing-retainer": ["marketing", "seo", "content", "newsletter", "social", "ads", "retainer"],
  "photo-shoot": ["photo", "shoot", "headshot", "video", "film"],
};

export function pickTemplate(brief) {
  const hay = `${brief.work || ""} ${brief.situation || ""}`.toLowerCase();
  let best = null, score = 0;
  for (const [id, words] of Object.entries(KEYWORDS)) {
    const n = words.filter((w) => hay.includes(w)).length;
    if (n > score) { best = id; score = n; }
  }
  return best ? TEMPLATES.find((t) => t.id === best) : null;
}

// No key: a starter built from the brief's own words plus the nearest trade
// template's scope and assumptions, with placeholders left for the person.
export function starterDraft(brief) {
  const t = pickTemplate(brief || {});
  const work = text(brief.work, 300) || "[the work]";
  const client = text(brief.client, 120) || "[client]";
  const base = t ? t.p : { goals: "", assumptions: "", deliverables: [{ name: "[Deliverable]", included: "[What is included]", excluded: "[What is not included]" }] };
  return {
    summary: `${work.replace(/\.$/, "")} for ${client}.`,
    problem: text(brief.situation, 600) || "[What is not working today, in the client's terms.]",
    goals: base.goals || "[Outcome one]\n[Outcome two]",
    assumptions: base.assumptions || "[What you need from the client, and by when]",
    deliverables: base.deliverables.map((d) => ({ name: d.name, included: d.included, excluded: d.excluded })),
  };
}

// -> { draft, source: "model" | "fallback", error? }
export async function draftProposal(config, brief, opts = {}) {
  if (!text(brief && brief.work)) throw new Error("Say what work you are offering first.");
  const r = await withFallback(config, () => starterDraft(brief),
    (c) => complete(c, { system: SYSTEM, prompt: briefPrompt(brief), maxTokens: 1800, fetch: opts.fetch }).then((x) => parseDraft(x.text)));
  return { draft: r.value, source: r.source, error: r.error };
}
