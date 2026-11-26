// Deterministic guards on the reviewer's output (pure). The model may have read injected funder
// text, or simply guessed, so before a report is stored:
//   - scores are clamped to integers 0-5, lists trimmed and bounded, criteria deduplicated;
//   - suggestion factIds are filtered to facts that exist in the fact base given to the reviewer;
//     a suggestion whose every cited id was unknown is dropped (it was built on a fact that does
//     not exist), and "emphasize" needs at least one real fact;
//   - restructure / emphasize / clarify suggestions may not introduce numbers that are in neither
//     their cited facts, the section text nor the funder's criteria;
//   - "missing_evidence" suggestions carry no facts and become an interview question.
import type { OpportunityCriterion, QualitySuggestion } from "@shared/quality";
import type { RubricReviewOutput } from "./prompts";
import { clampScore, matchOpportunityCriterion, normalizeCriterionName } from "./scoring";

const MAX_CRITERIA = 6;
const MAX_SUGGESTIONS = 4;
const MAX_LIST = 6;

const oneLine = (s: string, max: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

const cleanList = (xs: readonly string[] | undefined, max = MAX_LIST) =>
  [...new Set((xs ?? []).map((x) => oneLine(String(x), 400)).filter(Boolean))].slice(0, max);

/** Numbers as written ("1,200", "45%", "2025", "3.5") normalized to digits ("1200", "45", ...). */
export function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) =>
    n.replace(/,(?=\d{3}\b)/g, "").replace(/[.,]+$/, ""),
  );
}

/** A missing-evidence suggestion phrased as a question for staff. */
export function toInterviewQuestion(text: string): string {
  const t = oneLine(text, 500);
  if (!t) return "";
  if (t.endsWith("?")) return t;
  return `Can you share details or evidence for this: ${t.replace(/[.!;:]+$/, "")}?`;
}

/** Suggestion ids are stable within a report: "{sectionKey}#c{n}.g{m}". */
export const suggestionId = (sectionKey: string, criterionIndex: number, suggestionIndex: number) =>
  `${sectionKey}#c${criterionIndex + 1}.g${suggestionIndex + 1}`;

export interface FinalizeOptions {
  sectionKey: string;
  /** Facts the reviewer was given: id -> statement (+ quote). Anything else does not exist. */
  facts: ReadonlyMap<string, string>;
  /** Section text + funder prompt / guidance / criteria: numbers here may be repeated. */
  sourceText: string;
  /** Published criteria that apply to this section. */
  published: readonly OpportunityCriterion[];
}

export interface FinalizedCriterion {
  criterion: string;
  score: number;
  rationale: string;
  strengths: string[];
  gaps: string[];
  suggestions: QualitySuggestion[];
  source: "section" | "opportunity";
  publishedKey: string | null;
  publishedWeight: number | null;
}

export interface FinalizeResult {
  criteria: FinalizedCriterion[];
  droppedFactIds: number;
  droppedSuggestions: number;
}

export function finalizeSectionReview(
  raw: RubricReviewOutput,
  opts: FinalizeOptions,
): FinalizeResult {
  let droppedFactIds = 0;
  let droppedSuggestions = 0;
  const seen = new Set<string>();
  const criteria: FinalizedCriterion[] = [];
  const sourceNumbers = new Set(numbersIn(opts.sourceText));

  for (const c of raw.criteria) {
    const name = oneLine(c.criterion ?? "", 200);
    const key = normalizeCriterionName(name);
    if (!key || seen.has(key)) {
      droppedSuggestions += c.suggestions?.length ?? 0;
      continue;
    }
    if (criteria.length >= MAX_CRITERIA) {
      droppedSuggestions += c.suggestions?.length ?? 0;
      continue;
    }
    seen.add(key);
    const ci = criteria.length;

    const suggestions: QualitySuggestion[] = [];
    for (const s of c.suggestions ?? []) {
      const text = oneLine(s.text ?? "", 600);
      if (!text || suggestions.length >= MAX_SUGGESTIONS) {
        droppedSuggestions++;
        continue;
      }
      const cited = [...new Set(s.factIds ?? [])];
      const factIds = cited.filter((id) => opts.facts.has(id));
      droppedFactIds += cited.length - factIds.length;

      if (s.kind === "missing_evidence") {
        const question = toInterviewQuestion(text);
        suggestions.push({
          id: suggestionId(opts.sectionKey, ci, suggestions.length),
          kind: "missing_evidence",
          text: question,
          factIds: [],
          question,
        });
        continue;
      }
      // Built only on facts that do not exist, or nothing real to emphasize: drop.
      if (
        (cited.length > 0 && factIds.length === 0) ||
        (s.kind === "emphasize" && !factIds.length)
      ) {
        droppedSuggestions++;
        continue;
      }
      const pool = new Set([
        ...sourceNumbers,
        ...factIds.flatMap((id) => numbersIn(opts.facts.get(id) ?? "")),
      ]);
      if (numbersIn(text).some((n) => !pool.has(n))) {
        droppedSuggestions++;
        continue;
      }
      suggestions.push({
        id: suggestionId(opts.sectionKey, ci, suggestions.length),
        kind: s.kind,
        text,
        factIds,
        question: null,
      });
    }

    const match = matchOpportunityCriterion(name, opts.published);
    criteria.push({
      criterion: name,
      score: clampScore(c.score),
      rationale: oneLine(c.rationale ?? "", 600),
      strengths: cleanList(c.strengths),
      gaps: cleanList(c.gaps),
      suggestions,
      source: match ? "opportunity" : "section",
      publishedKey: match ? normalizeCriterionName(match.name) : null,
      publishedWeight: match?.weight ?? null,
    });
  }
  return { criteria, droppedFactIds, droppedSuggestions };
}
