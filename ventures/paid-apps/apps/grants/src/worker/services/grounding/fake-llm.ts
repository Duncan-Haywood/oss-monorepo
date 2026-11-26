// Deterministic FakeLlm handlers for the grounding module's LLM purposes ("grounding.*").
// Must return data that satisfies the zod schema the real call uses.
//
// grounding.verify_claims: conservative stand-in for the entailment judge. A claim is "supported"
// iff every content word (letters/digits, length > 4, not a function word) appears in its cited
// facts' statements/quotes; otherwise "unsupported".
import type { FakeHandler } from "../../ports/fake-llm";
import type { LlmRequestBase } from "../../ports/llm";
import { CLAIMS_CLOSE, CLAIMS_OPEN, type JudgeClaim, type LlmVerdicts } from "./verify";

const FUNCTION_WORDS = new Set([
  "about",
  "above",
  "after",
  "again",
  "against",
  "along",
  "among",
  "because",
  "before",
  "being",
  "below",
  "between",
  "could",
  "during",
  "every",
  "further",
  "having",
  "other",
  "should",
  "their",
  "there",
  "these",
  "those",
  "through",
  "under",
  "until",
  "where",
  "which",
  "while",
  "would",
  "within",
  "without",
  "whose",
  // Approximate qualifiers and spans of years: the deterministic number check owns these
  // ("nearly half" vs 48%, "over a decade" vs "founded in 2012"), so the stand-in judge ignores them.
  "nearly",
  "almost",
  "approximately",
  "roughly",
  "least",
  "fewer",
  "years",
  "decade",
  "decades",
]);

export const contentWords = (text: string): string[] =>
  (
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/(\d),(?=\d{3}\b)/g, "$1") // "25,000" and "25000" are the same word
      .match(/[a-z0-9]+/g) ?? []
  ).filter((w) => w.length > 4 && !FUNCTION_WORDS.has(w));

export function fakeJudge(claims: JudgeClaim[]): LlmVerdicts {
  return {
    verdicts: claims.map((c) => {
      const factWords = new Set(
        c.citedFacts.flatMap((f) => contentWords(`${f.statement} ${f.sourceQuote}`)),
      );
      const missing = [...new Set(contentWords(c.text).filter((w) => !factWords.has(w)))];
      return missing.length
        ? {
            claimId: c.claimId,
            verdict: "unsupported" as const,
            reason: `Words not in cited facts: ${missing.slice(0, 8).join(", ")}`,
          }
        : {
            claimId: c.claimId,
            verdict: "supported" as const,
            reason: `Supported by ${c.citedFacts.map((f) => f.id).join(", ")}`,
          };
    }),
  };
}

export function parseJudgeClaims(req: LlmRequestBase): JudgeClaim[] {
  const start = req.prompt.indexOf(CLAIMS_OPEN);
  const end = req.prompt.lastIndexOf(CLAIMS_CLOSE);
  if (start < 0 || end < start) return [];
  const parsed = JSON.parse(req.prompt.slice(start + CLAIMS_OPEN.length, end)) as {
    claims?: JudgeClaim[];
  };
  return parsed.claims ?? [];
}

export const fakeHandlers: Record<string, FakeHandler> = {
  "grounding.verify_claims": (req) => fakeJudge(parseJudgeClaims(req)),
};
