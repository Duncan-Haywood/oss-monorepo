// Deterministic FakeLlm handlers for the quality module ("quality.*"). They read the same prompt
// text the real model sees: facts from the context's <facts> block, the funder's prompt /
// guidance / published criteria from the wrapped blocks in <section>, and the draft from <claims>.
// Scores are word coverage of each criterion by the drafted text; suggestions emphasize uncited
// relevant facts or ask for missing evidence.
import type { FakeHandler } from "../../ports/fake-llm";
import type { LlmRequestBase } from "../../ports/llm";
import { parseFactsFromContext } from "../drafting/fake-llm";
import { contentWords } from "../grounding/fake-llm";
import type { RubricReviewOutput } from "./prompts";

const untrustedBlock = (text: string, label: string) =>
  new RegExp(
    `<untrusted_content label="${label}"[^>]*>\\n([\\s\\S]*?)\\n</untrusted_content>`,
  ).exec(text)?.[1] ?? "";

interface FakeClaim {
  id: string;
  factIds: string[];
  text: string;
}

export function parseClaimsFromPrompt(prompt: string): FakeClaim[] {
  const block = /<claims>\n([\s\S]*?)\n<\/claims>/.exec(prompt)?.[1] ?? "";
  const out: FakeClaim[] = [];
  for (const line of block.split("\n")) {
    const m = /^(\S+) \((?:factual|framing)\)(?: \[([^\]]*)\])?: (.*)$/.exec(line.trim());
    if (!m?.[1]) continue;
    out.push({
      id: m[1],
      factIds: (m[2] ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      text: m[3] ?? "",
    });
  }
  return out;
}

export function fakeCriteria(prompt: string): string[] {
  const published = untrustedBlock(prompt, "published_criteria")
    .split("\n")
    .map((l) => /^- (.*?)(?: \(\d+(?:\.\d+)? points\))?(?::.*)?$/.exec(l.trim())?.[1]?.trim() ?? "")
    .filter(Boolean);
  if (published.length) return published.slice(0, 6);
  const guidance = untrustedBlock(prompt, "funder_guidance")
    .split(/[.;\n]+/)
    .map((s) => s.replace(/^[-*\s]+/, "").trim())
    .filter((s) => s.length > 3);
  if (guidance.length) return guidance.slice(0, 4).map((s) => (s.length > 80 ? s.slice(0, 80) : s));
  return ["Responds to the funder's prompt"];
}

export function fakeRubricReview(req: LlmRequestBase): RubricReviewOutput {
  const facts = parseFactsFromContext(req.context);
  const claims = parseClaimsFromPrompt(req.prompt);
  const funderPrompt = untrustedBlock(req.prompt, "funder_prompt");
  const draftWords = new Set(contentWords(claims.map((c) => c.text).join(" ")));
  const cited = new Set(claims.flatMap((c) => c.factIds));
  const criteria = fakeCriteria(req.prompt);

  return {
    criteria: criteria.map((criterion, i) => {
      const words = [
        ...new Set(
          contentWords(
            criteria.length === 1 && funderPrompt ? `${criterion} ${funderPrompt}` : criterion,
          ),
        ),
      ];
      const covered = words.filter((w) => draftWords.has(w));
      const coverage = words.length ? covered.length / words.length : claims.length ? 1 : 0;
      const score = claims.length ? Math.min(5, Math.round(1 + coverage * 4)) : 0;
      const related = facts
        .filter((f) => !cited.has(f.id))
        .map((f) => ({
          f,
          overlap: contentWords(f.statement).filter((w) => words.includes(w)).length,
        }))
        .filter((x) => x.overlap > 0)
        .sort((a, b) => b.overlap - a.overlap || a.f.id.localeCompare(b.f.id));
      const suggestions: RubricReviewOutput["criteria"][number]["suggestions"] = [];
      if (i === 0 && criteria.length > 1) {
        suggestions.push({
          kind: "restructure",
          text: "Answer the funder's criteria in the order they are listed.",
          factIds: [],
        });
      }
      const best = related[0]?.f;
      if (best) {
        suggestions.push({
          kind: "emphasize",
          text: `Bring forward this fact for "${criterion}": ${best.statement}`,
          factIds: [best.id],
        });
      } else if (score < 4) {
        suggestions.push({
          kind: "missing_evidence",
          text: `What specific evidence can you share for "${criterion}"?`,
          factIds: [],
        });
      }
      if (claims.length >= 2 && score < 5) {
        suggestions.push({
          kind: "clarify",
          text: `State plainly how this section addresses "${criterion}".`,
          factIds: [],
        });
      }
      return {
        criterion,
        score,
        rationale: covered.length
          ? `The draft speaks to ${covered.length} of ${words.length} key terms of this criterion.`
          : "The draft does not yet speak to this criterion.",
        strengths: covered.length ? [`Mentions ${covered.slice(0, 3).join(", ")}`] : [],
        gaps: score < 4 ? [`Little specific evidence for "${criterion}"`] : [],
        suggestions,
      };
    }),
  };
}

export const fakeHandlers: Record<string, FakeHandler> = {
  "quality.rubric_review": fakeRubricReview,
};
