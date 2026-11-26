// Prompt builders for quality.rubric_review. Layout (docs/PROMPTS.md):
//   system  = stable reviewer rules + UNTRUSTED_CONTENT_POLICY
//   context = per-application material shared by every section call (opportunity listing, facts)
//   prompt  = one section: the funder's prompt / guidance / applicable criteria and the draft
// Funder text is wrapped as untrusted content; facts and drafted claims are sanitized.
import type { DraftSection, RequirementSection } from "@shared/content";
import type { OpportunityCriterion } from "@shared/quality";
import { QUALITY_SUGGESTION_KINDS } from "@shared/quality";
import { z } from "zod";
import type { DraftingFact, DraftingOpportunity } from "../drafting/types";
import { formatFactsForPrompt } from "../knowledge";
import { sanitizeUntrusted, UNTRUSTED_CONTENT_POLICY, wrapUntrusted } from "../safety";

export const QUALITY_PURPOSE = "quality.rubric_review";
export const QUALITY_PROMPT_VERSION = "quality-v1.2026-11-19";

/** Structured output of one section review (validated + finalized in validate.ts). */
export const RubricReviewOutput = z.object({
  criteria: z.array(
    z.object({
      criterion: z.string().describe("The funder's criterion, in the funder's words"),
      score: z.number().describe("Integer 0-5"),
      rationale: z.string().describe("One or two sentences explaining the score"),
      strengths: z.array(z.string()),
      gaps: z.array(z.string()),
      suggestions: z.array(
        z.object({
          kind: z.enum(QUALITY_SUGGESTION_KINDS),
          text: z.string(),
          factIds: z
            .array(z.string())
            .default([])
            .describe("ids from <facts> the suggestion relies on; empty for missing_evidence"),
        }),
      ),
    }),
  ),
});
export type RubricReviewOutput = z.infer<typeof RubricReviewOutput>;

export const QUALITY_SYSTEM_PROMPT = `You are an experienced grant reviewer. You score one section of a nonprofit's draft grant application against the funder's own scoring criteria, the way the funder's review panel would, and suggest concrete ways to raise the score.

Why accuracy matters: staff use your scores to decide what to fix before submitting, and your suggestions are turned into redraft instructions. A suggestion that relies on something the organization cannot back up would push an unsupported claim into the application, which can cost the organization the grant and can amount to grant fraud. So every suggestion works only with the organization's fact base, and missing evidence becomes a question for staff, never content.

<inputs>
- The context holds <opportunity> (the funder's listing) and <facts> (the organization's fact base, one per line: [id] (status, as of date) statement — source). Facts are the only evidence about the organization.
- The request gives <section>: the funder's prompt and guidance for this section, any published opportunity-level criteria in <criteria>, the length limit, then the draft as <claims> (one claim per line: claim id, kind, cited fact ids, text) and the drafter's <open_questions>.
</inputs>

<scoring>
- Criteria: one entry per distinct criterion the funder states for this section: from the guidance and published criteria first, otherwise the separate asks in the funder's prompt. Name each criterion in the funder's words. Use at most 6 criteria. If a published criterion applies, use its name exactly.
- Score each criterion as an integer from 0 to 5: 0 not addressed, 1 mentioned without support, 2 partly addressed or weakly supported, 3 adequately addressed, 4 strong and specific, 5 fully addressed with specific evidence in the order the funder asks.
- Score what the draft says, not what the organization might know. An open question counts as not addressed.
- rationale: one or two sentences explaining the score. strengths and gaps: short phrases tied to the criterion.
</scoring>

<suggestions>
Up to 4 per criterion, each one specific and actionable:
- "restructure": reorder or regroup existing content (e.g. answer the funder's questions in the order asked).
- "emphasize": bring forward a fact from <facts> that the draft underuses. factIds must list that fact's id. Only facts listed in <facts> exist; do not cite claim ids or invent ids.
- "clarify": make existing content more specific or direct, without adding information that is not in a cited fact.
- "missing_evidence": evidence the criterion needs that no fact provides. Write it as a question staff can answer (e.g. "How many participants completed the program in 2025?"), with empty factIds. Never suggest wording that assumes the answer.
A suggestion never introduces a number, date, name, partner or outcome that is not in a fact it cites.
</suggestions>

${UNTRUSTED_CONTENT_POLICY}`;

const clip = (s: string | null | undefined, max: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

const tagged = (tag: string, body: string) => `<${tag}>\n${body}\n</${tag}>`;

/** Deterministic fact order (category, confirmed first, id) so the cached context is stable. */
function orderFacts(facts: readonly DraftingFact[]): DraftingFact[] {
  const rank = (s: string) => (s === "confirmed" ? 0 : 1);
  return [...facts].sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      rank(a.status) - rank(b.status) ||
      a.id.localeCompare(b.id),
  );
}

/** Per-application context, identical for every section call (cached). */
export function buildQualityContext(args: {
  opportunity: DraftingOpportunity;
  facts: readonly DraftingFact[];
}): string {
  const o = args.opportunity;
  const listing = [
    `Funder: ${clip(o.funderName, 200)}`,
    `Opportunity: ${clip(o.title, 300)}`,
    o.summary ? `Summary: ${clip(o.summary, 2000)}` : "",
    o.description ? `Description: ${clip(o.description, 6000)}` : "",
    o.eligibilityText ? `Eligibility: ${clip(o.eligibilityText, 1500)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const facts = sanitizeUntrusted(formatFactsForPrompt(orderFacts(args.facts)));
  return [
    tagged("opportunity", wrapUntrusted("funder_listing", listing)),
    tagged("facts", facts.trim() || "(no facts available)"),
  ].join("\n\n");
}

function formatClaims(section: DraftSection): string {
  const lines: string[] = [];
  for (const p of section.paragraphs) {
    for (const c of p.claims) {
      const cite = c.factIds.length ? ` [${c.factIds.join(", ")}]` : "";
      lines.push(`${c.id} (${c.kind})${cite}: ${sanitizeUntrusted(clip(c.text, 1500))}`);
    }
  }
  return lines.join("\n") || "(no drafted text)";
}

export function formatCriteria(criteria: readonly OpportunityCriterion[]): string {
  return criteria
    .map((c) => {
      const pts = c.weight ? ` (${c.weight} points)` : "";
      return `- ${clip(c.name, 200)}${pts}${c.description ? `: ${clip(c.description, 600)}` : ""}`;
    })
    .join("\n");
}

export function buildQualitySectionPrompt(args: {
  sectionIndex: number;
  requirement: RequirementSection;
  section: DraftSection;
  criteria: readonly OpportunityCriterion[];
}): string {
  const r = args.requirement;
  const out: string[] = [];
  out.push(
    `<section index="${args.sectionIndex}" key="${r.key.replace(/"/g, "'")}" kind="${r.kind}">`,
  );
  out.push(`Title: ${sanitizeUntrusted(clip(r.title, 300))}`);
  out.push(
    r.prompt.trim()
      ? tagged("funder_prompt", wrapUntrusted("funder_prompt", r.prompt))
      : "Funder prompt: none published. Score against what funders usually ask under this title.",
  );
  if (r.guidance.trim()) {
    out.push(tagged("funder_guidance", wrapUntrusted("funder_guidance", r.guidance)));
  }
  if (args.criteria.length) {
    out.push(
      tagged("criteria", wrapUntrusted("published_criteria", formatCriteria(args.criteria))),
    );
  }
  out.push(r.wordLimit ? `Length limit: ${r.wordLimit} words.` : "Length limit: none published.");
  out.push("</section>");
  out.push(tagged("claims", formatClaims(args.section)));
  if (args.section.gaps.length) {
    out.push(
      tagged(
        "open_questions",
        args.section.gaps.map((g) => `- ${sanitizeUntrusted(clip(g.question, 400))}`).join("\n"),
      ),
    );
  }
  out.push("Score this section against the funder's criteria now.");
  return out.join("\n");
}
