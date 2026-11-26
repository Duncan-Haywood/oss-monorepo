// Pure parts of report drafting: which facts a report may use, the application's promised goals,
// and the deterministic clean-up of the model's output (no citations outside the allowed facts, no
// "achieved" figure that its cited period facts don't contain). No I/O.
import {
  COMPARISON_SECTION_KEY,
  comparisonClaimId,
  type PromiseComparison,
  type ReportContent,
} from "@shared/api/awards";
import type { ApplicationContent, DraftSection } from "@shared/content";
import type { FactCategory } from "@shared/enums";
import { findNumberMismatches, type FactRow as GroundingFact } from "../grounding";
import type { ReportDraftOutput, ReportGoal, ReportSectionSpec } from "./prompts";
import { asOfInPeriod, asOfNotAfter, asOfRange, formatPeriod } from "./schedule";

/** Results a report may claim as achieved come only from these categories. */
export const RESULT_CATEGORIES: readonly FactCategory[] = ["outcome", "metric"];
const MAX_BACKGROUND = 80;
const MAX_GOALS = 12;

export interface ReportFactInput {
  id: string;
  category: FactCategory;
  asOf: string | null;
  projectId: string | null;
  sourceInterviewId: string | null;
}

/**
 * Splits drafting facts into:
 *  - period: outcome / metric facts whose "as of" falls in the period, or undated ones captured by
 *    this report's own check-in interview (it asked about this period);
 *  - background: other categories dated no later than the period end (capped, project facts first).
 * Outcome / metric facts from other periods (or undated) are left out entirely, so an older result
 * can never be reported as this period's.
 */
export function partitionReportFacts<F extends ReportFactInput>(
  facts: readonly F[],
  period: { start: string; end: string; checkinInterviewIds: readonly string[] },
): { period: F[]; background: F[] } {
  const checkins = new Set(period.checkinInterviewIds);
  const inPeriod: F[] = [];
  const background: F[] = [];
  for (const f of facts) {
    if (RESULT_CATEGORIES.includes(f.category)) {
      const dated = asOfInPeriod(f.asOf, period.start, period.end);
      const fromCheckin =
        !asOfRange(f.asOf) && !!f.sourceInterviewId && checkins.has(f.sourceInterviewId);
      if (dated || fromCheckin) inPeriod.push(f);
    } else if (asOfNotAfter(f.asOf, period.end)) {
      background.push(f);
    }
  }
  const rank = (f: F) => (f.projectId ? 0 : 1);
  const sortedBackground = background
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i)
    .slice(0, MAX_BACKGROUND)
    .map((x) => x.f);
  return { period: inPeriod, background: sortedBackground };
}

const GOAL_SECTION_RE =
  /goal|objective|outcome|result|impact|evaluat|measur|deliverable|metric|success|target/i;

/**
 * The promised goals: factual claims from the application's goal / outcome / evaluation sections
 * (by key or title); without such sections, factual claims stating a number or a "will".
 */
export function promisedGoals(content: ApplicationContent | null | undefined): ReportGoal[] {
  if (!content) return [];
  const pick = (filter: (s: DraftSection) => boolean, claimOk: (text: string) => boolean) => {
    const out: { text: string; sectionTitle: string; claimId: string }[] = [];
    for (const s of content.sections) {
      if (!filter(s)) continue;
      for (const p of s.paragraphs)
        for (const c of p.claims)
          if (c.kind === "factual" && claimOk(c.text))
            out.push({ text: c.text.trim(), sectionTitle: s.title, claimId: c.id });
    }
    return out;
  };
  let found = pick(
    (s) => GOAL_SECTION_RE.test(s.key) || GOAL_SECTION_RE.test(s.title),
    () => true,
  );
  if (found.length === 0)
    found = pick(
      () => true,
      (t) => /\d|\bwill\b/i.test(t),
    );
  const seen = new Set<string>();
  return found
    .filter((g) => {
      const k = g.text.toLowerCase().replace(/\s+/g, " ");
      if (!g.text || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, MAX_GOALS)
    .map((g, i) => ({ id: `g${i + 1}`, ...g }));
}

/** The question a report check-in asks for a goal with no in-period result. */
export function gapQuestionFor(goal: ReportGoal, period: { start: string; end: string }): string {
  return `Between ${formatPeriod(period.start, period.end).replace(" – ", " and ")}, what result did you achieve for this goal: "${goal.text}"? Please give the number and how it was measured.`;
}

export interface PostProcessInput {
  raw: ReportDraftOutput;
  sections: ReportSectionSpec[];
  goals: ReportGoal[];
  periodFacts: readonly GroundingFact[];
  backgroundFacts: readonly GroundingFact[];
  period: { start: string; end: string };
  /** For numeric checks on "achieved" (year spans count from this year). */
  asOfYear: number;
}

/**
 * Deterministic guard rails on the model's report:
 *  - sections in the requested order and keys, ids reassigned "r{n}.p{m}.c{k}";
 *  - citations outside the provided facts are dropped (the verifier then flags uncited claims);
 *  - one comparison per goal; "achieved" may cite only period results and must contain no number
 *    those facts lack, otherwise the goal becomes "unknown" with no achieved text;
 *  - every unknown goal becomes a gap in the outcomes section.
 */
export function postProcessReport(input: PostProcessInput): ReportContent {
  const periodIds = new Set(input.periodFacts.map((f) => f.id));
  const allowed = new Set([...periodIds, ...input.backgroundFacts.map((f) => f.id)]);
  const factsById = new Map([...input.periodFacts, ...input.backgroundFacts].map((f) => [f.id, f]));

  const sections: DraftSection[] = input.sections.map((spec, si) => {
    const n = si + 1;
    const raw =
      input.raw.sections.find((s) => s.key === spec.key) ??
      (input.raw.sections[si]?.key ? undefined : input.raw.sections[si]);
    if (!raw) {
      return {
        key: spec.key,
        title: spec.title,
        paragraphs: [],
        gaps: [
          {
            question: `What should the report say under "${spec.title}" for this period?`,
            why: "Nothing could be drafted for this section from your facts.",
          },
        ],
      };
    }
    const paragraphs = raw.paragraphs
      .map((p) => p.claims.filter((c) => c.text.trim()))
      .filter((claims) => claims.length > 0)
      .map((claims, pi) => ({
        id: `r${n}.p${pi + 1}`,
        claims: claims.map((c, ci) => ({
          id: `r${n}.p${pi + 1}.c${ci + 1}`,
          text: c.text.trim(),
          kind: c.kind,
          factIds:
            c.kind === "framing" ? [] : [...new Set(c.factIds)].filter((id) => allowed.has(id)),
        })),
      }));
    return { key: spec.key, title: spec.title, paragraphs, gaps: [...(raw.gaps ?? [])] };
  });

  const comparisons: PromiseComparison[] = input.goals.map((goal) => {
    const raw = input.raw.comparisons.find((c) => c.goalId === goal.id);
    const unknown: PromiseComparison = {
      goalId: goal.id,
      promised: goal.text,
      sourceClaimId: goal.claimId,
      achieved: null,
      status: "unknown",
      factIds: [],
    };
    if (!raw || raw.status === "unknown") return unknown;
    const achieved = raw.achieved?.trim() ?? "";
    const factIds = [...new Set(raw.factIds)].filter((id) => periodIds.has(id));
    if (!achieved || factIds.length === 0) return unknown;
    const cited = factIds.map((id) => factsById.get(id)).filter((f) => f !== undefined);
    const claim = { id: goal.id, text: achieved, kind: "factual" as const, factIds };
    if (findNumberMismatches(claim, cited, { asOfYear: input.asOfYear }).length > 0) return unknown;
    return { ...unknown, achieved, status: raw.status, factIds };
  });

  const outcomes = sections.find((s) => s.key === "outcomes") ?? sections[sections.length - 1];
  if (outcomes) {
    const known = new Set(outcomes.gaps.map((g) => g.question.toLowerCase()));
    for (const c of comparisons) {
      if (c.status !== "unknown") continue;
      const goal = input.goals.find((g) => g.id === c.goalId);
      if (!goal) continue;
      const question = gapQuestionFor(goal, input.period);
      if (known.has(question.toLowerCase())) continue;
      known.add(question.toLowerCase());
      outcomes.gaps.push({
        question,
        why: "No outcome or metric fact dated in this reporting period shows the result.",
      });
    }
  }
  return { sections, comparisons };
}

/** What the verifier checks: the sections plus each known comparison as a cited factual claim. */
export function verificationContent(content: ReportContent): ApplicationContent {
  const claims = content.comparisons
    .filter((c) => c.status !== "unknown" && c.achieved)
    .map((c) => ({
      id: comparisonClaimId(c.goalId),
      text: c.achieved ?? "",
      kind: "factual" as const,
      factIds: c.factIds,
    }));
  const extra: DraftSection[] = claims.length
    ? [
        {
          key: COMPARISON_SECTION_KEY,
          title: "Promised vs. achieved",
          paragraphs: [{ id: "cmp.p1", claims }],
          gaps: [],
        },
      ]
    : [];
  return { sections: [...content.sections, ...extra] };
}

/** Every fact id the report cites (claims and comparisons). */
export function reportCitedFactIds(content: ReportContent | null | undefined): string[] {
  if (!content) return [];
  const ids = new Set<string>();
  for (const s of content.sections)
    for (const p of s.paragraphs) for (const c of p.claims) for (const id of c.factIds) ids.add(id);
  for (const c of content.comparisons) for (const id of c.factIds) ids.add(id);
  return [...ids];
}

/** All open questions of a report, in section order. */
export function reportGaps(
  content: ReportContent | null | undefined,
): { sectionKey: string; question: string; why: string }[] {
  if (!content) return [];
  return content.sections.flatMap((s) =>
    (s.gaps ?? []).map((g) => ({ sectionKey: s.key, question: g.question, why: g.why })),
  );
}
