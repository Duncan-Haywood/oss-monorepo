// Grounded application writer: one LLM call per requirement section (max 2 in flight), each
// constrained to cite the org's fact ids; deterministic post-processing; then a reviewer summary
// built only from the drafted claims.
import { BUDGET_TOTALS_REF, budgetRef } from "@shared/budget";
import {
  type ApplicationContent,
  DraftSection,
  type OpportunityRequirements,
  RequirementSection,
} from "@shared/content";
import type { AppContext } from "../../context";
import { badRequest } from "../../lib/errors";
import { LlmOutputError, LlmRefusalError } from "../../ports/llm";
import { draftingDeps } from "./deps";
import { loadFeedbackNotes, loadProjectFocus } from "./org-context";
import {
  buildDraftingContext,
  buildSectionPrompt,
  buildSummaryPrompt,
  DraftSummarySchema,
  PROMPT_VERSION,
  REQUESTED_AMOUNT_REF,
  SECTION_SYSTEM_PROMPT,
  SUMMARY_SYSTEM_PROMPT,
} from "./prompts";
import { rankRelevantFacts } from "./relevance";
import { allClaims, countWordsInText, postProcessSection } from "./text";
import type { DraftInput, DraftingFact, DraftResult, RedraftInput } from "./types";

export const SECTION_CONCURRENCY = 2;

/** `budget:<lineId>` for every priced saved line, plus `budget:totals` (none without a budget). */
export function citableBudgetRefs(budget: DraftInput["budget"]): string[] {
  const priced = (budget?.lines ?? []).filter((l) => l.totalCents > 0);
  return priced.length ? [...priced.map((l) => budgetRef(l.id)), BUDGET_TOTALS_REF] : [];
}

/** Used when the opportunity's requirements are unknown (listing only, no RFP parsed). */
export const DEFAULT_SECTIONS: RequirementSection[] = [
  {
    key: "organization_background",
    title: "Organization Background",
    prompt: "Describe your organization, its mission, history and capacity to carry out this work.",
    guidance: "",
    wordLimit: 400,
  },
  {
    key: "statement_of_need",
    title: "Statement of Need",
    prompt: "Describe the need or problem this request addresses and the population you serve.",
    guidance: "",
    wordLimit: 500,
  },
  {
    key: "project_description",
    title: "Project Description",
    prompt: "Describe the program or project, its activities, timeline and who will carry it out.",
    guidance: "",
    wordLimit: 600,
  },
  {
    key: "outcomes_evaluation",
    title: "Outcomes and Evaluation",
    prompt: "What results do you expect, and how will you measure and report them?",
    guidance: "",
    wordLimit: 400,
  },
].map((s) => RequirementSection.parse(s));

interface Prepared {
  facts: DraftingFact[];
  allowedFactIds: Set<string>;
  /** Fact id -> statement + quote (contact details in a claim must come from its cited facts). */
  factTexts: Map<string, string>;
  context: string;
  projectFocus: { title: string; summary: string } | null;
  projectFactIds: string[];
}

/** Defense in depth: never draft from rejected/superseded/restricted facts even if passed in. */
export function usableFacts(facts: DraftingFact[]): DraftingFact[] {
  return facts.filter(
    (f) =>
      f.status !== "rejected" &&
      f.status !== "superseded" &&
      f.sensitivity !== "restricted" &&
      !!f.statement?.trim(),
  );
}

/** Deterministic order (category, confirmed first, id) so the cached context is stable. */
function orderFacts(facts: DraftingFact[]): DraftingFact[] {
  const rank = (s: string) => (s === "confirmed" ? 0 : 1);
  return [...facts].sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      rank(a.status) - rank(b.status) ||
      a.id.localeCompare(b.id),
  );
}

/** Fact list grouped by category (one formatted line per fact). */
export function buildFactsBlock(
  facts: DraftingFact[],
  format: (f: DraftingFact[]) => string,
): string {
  const groups = new Map<string, DraftingFact[]>();
  for (const f of orderFacts(facts)) {
    const g = groups.get(f.category) ?? [];
    g.push(f);
    groups.set(f.category, g);
  }
  return [...groups.entries()].map(([cat, fs]) => `## ${cat}\n${format(fs)}`).join("\n");
}

export function requirementSections(
  req: OpportunityRequirements | null | undefined,
): RequirementSection[] {
  const sections = req?.sections ?? [];
  return sections.length ? sections : DEFAULT_SECTIONS;
}

async function prepare(ctx: AppContext, input: DraftInput): Promise<Prepared> {
  const facts = usableFacts(input.facts);
  const allowedFactIds = new Set(facts.map((f) => f.id));
  if (input.requestedAmountCents) allowedFactIds.add(REQUESTED_AMOUNT_REF);
  for (const id of citableBudgetRefs(input.budget)) allowedFactIds.add(id);
  const o = input.opportunity;
  const styleQuery = `${o.title} ${o.summary ?? ""}`.slice(0, 500);
  const [orgProfile, styleExamples, feedbackNotes, projectFocus] = await Promise.all([
    draftingDeps.orgProfile(ctx, input.orgId),
    draftingDeps.styleExamples(ctx, input.orgId, styleQuery),
    loadFeedbackNotes(ctx, input.orgId).catch((e) => {
      ctx.logger.warn("drafting.feedback_unavailable", { error: String(e) });
      return { doMore: [], avoid: [] };
    }),
    loadProjectFocus(ctx, input.orgId, input.projectId),
  ]);
  const context = buildDraftingContext({
    orgProfile,
    factsBlock: buildFactsBlock(facts, draftingDeps.formatFacts),
    opportunity: o,
    styleExamples,
    feedback: feedbackNotes,
  });
  const projectFactIds = input.projectId
    ? facts.filter((f) => f.projectId === input.projectId).map((f) => f.id)
    : [];
  const factTexts = new Map(
    facts.map((f) => [f.id, `${f.statement}\n${f.sourceQuote ?? ""}`] as const),
  );
  return { facts, allowedFactIds, factTexts, context, projectFocus, projectFactIds };
}

const gapOnly = (r: RequirementSection, question: string, why: string): DraftSection => ({
  key: r.key,
  title: r.title,
  paragraphs: [],
  gaps: [{ question, why }],
});

/** Non-narrative sections are drafted only when facts support them; otherwise a gap. */
export function unsupportedSectionGap(
  r: RequirementSection,
  facts: DraftingFact[],
  projectId?: string | null,
  /** A saved budget with at least one priced line is a source for budget sections. */
  hasBudget = false,
): DraftSection | null {
  if (r.kind === "narrative") return null;
  if (r.kind === "attachment") {
    return r.required
      ? gapOnly(
          r,
          `Can you upload "${r.title}"${r.prompt ? ` (${r.prompt.trim()})` : ""}?`,
          "The funder requires this attachment; it cannot be written from the fact base.",
        )
      : { key: r.key, title: r.title, paragraphs: [], gaps: [] };
  }
  if (r.kind === "budget") {
    const hasFinancial = facts.some((f) => f.category === "financial");
    return hasFinancial || hasBudget
      ? null
      : gapOnly(
          r,
          "What is the budget for this request (line items and amounts), and what other funding is committed?",
          `No financial facts are on file to answer "${r.title}".`,
        );
  }
  const relevant = rankRelevantFacts(`${r.title} ${r.prompt} ${r.guidance}`, facts, { projectId });
  return relevant.length
    ? null
    : gapOnly(
        r,
        `What should we answer for "${r.title}"${r.prompt.trim() ? `: ${r.prompt.trim()}` : ""}?`,
        "No facts on file address this form field.",
      );
}

interface SectionOutcome {
  section: DraftSection;
  model: string | null;
}

async function draftOneSection(
  ctx: AppContext,
  input: DraftInput,
  prep: Prepared,
  r: RequirementSection,
  sectionIndex: number,
  extra: { instructions?: string; previousSection?: DraftSection | null } = {},
): Promise<SectionOutcome> {
  const skip = unsupportedSectionGap(
    r,
    prep.facts,
    input.projectId,
    citableBudgetRefs(input.budget).length > 0,
  );
  if (skip) return { section: skip, model: null };

  const prompt = buildSectionPrompt({
    sectionIndex,
    requirement: r,
    projectFocus: prep.projectFocus,
    projectFactIds: prep.projectFactIds,
    requestedAmountCents: input.requestedAmountCents,
    budget: input.budget,
    reviewerNotes: input.reviewerNotes,
    instructions: extra.instructions,
    previousSection: extra.previousSection,
  });

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, usage } = await ctx.llm.generateStructured({
        purpose: "drafting.section",
        orgId: input.orgId,
        applicationId: input.applicationId,
        system: SECTION_SYSTEM_PROMPT,
        context: prep.context,
        prompt,
        effort: "high",
        schema: DraftSection,
      });
      const { section, droppedFactIds, trimmedClaims, droppedContactClaims } = postProcessSection(
        data,
        {
          sectionIndex,
          requirement: r,
          allowedFactIds: prep.allowedFactIds,
          factTexts: prep.factTexts,
        },
      );
      if (droppedFactIds.length || trimmedClaims || droppedContactClaims) {
        ctx.logger.info("drafting.section.postprocessed", {
          applicationId: input.applicationId,
          sectionKey: r.key,
          droppedFactIds: droppedFactIds.length,
          trimmedClaims,
          droppedContactClaims,
        });
      }
      return { section, model: usage.model };
    } catch (e) {
      lastError = e;
      if (e instanceof LlmRefusalError) break;
      if (!(e instanceof LlmOutputError)) throw e; // transient/infra errors: let the workflow retry
    }
  }
  ctx.logger.warn("drafting.section.failed", {
    applicationId: input.applicationId,
    sectionKey: r.key,
    error: lastError instanceof Error ? lastError.name : String(lastError),
  });
  return {
    section: gapOnly(
      r,
      `Please write or outline "${r.title}" — the automatic drafter could not produce it.`,
      "The model declined or returned unusable output for this section.",
    ),
    model: null,
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>) {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Deterministic fallback summary (no claims, or the summary call failed). */
export function fallbackSummary(content: ApplicationContent): {
  executiveSummary: string;
  keyPoints: string[];
} {
  const claims = allClaims(content).map((c) => c.claim.text);
  const gaps = content.sections.reduce((n, s) => n + s.gaps.length, 0);
  let words = 0;
  const picked: string[] = [];
  for (const t of claims) {
    if (words >= 150) break;
    picked.push(t);
    words += countWordsInText(t);
  }
  const keyPoints = [
    `${content.sections.length} section(s) drafted with ${claims.length} claim(s).`,
    gaps ? `${gaps} open question(s) need answers before submission.` : "No open questions.",
  ];
  return {
    executiveSummary: picked.join(" ") || "No section could be drafted from the current fact base.",
    keyPoints,
  };
}

async function summarize(
  ctx: AppContext,
  input: DraftInput,
  content: ApplicationContent,
): Promise<{ executiveSummary: string; keyPoints: string[] }> {
  if (allClaims(content).length === 0) return fallbackSummary(content);
  try {
    const { data } = await ctx.llm.generateStructured({
      purpose: "drafting.summary",
      orgId: input.orgId,
      applicationId: input.applicationId,
      system: SUMMARY_SYSTEM_PROMPT,
      prompt: buildSummaryPrompt({
        content,
        opportunityTitle: input.opportunity.title,
        funderName: input.opportunity.funderName,
        requestedAmountCents: input.requestedAmountCents,
      }),
      effort: "medium",
      maxTokens: 4000,
      schema: DraftSummarySchema,
    });
    const keyPoints = data.keyPoints
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 6);
    return { executiveSummary: data.executiveSummary.trim(), keyPoints };
  } catch (e) {
    if (!(e instanceof LlmOutputError || e instanceof LlmRefusalError)) throw e;
    ctx.logger.warn("drafting.summary.failed", { applicationId: input.applicationId });
    return fallbackSummary(content);
  }
}

export async function draftApplication(ctx: AppContext, input: DraftInput): Promise<DraftResult> {
  const prep = await prepare(ctx, input);
  const reqs = requirementSections(input.requirements);
  const outcomes = await mapLimit(reqs, SECTION_CONCURRENCY, (r, i) =>
    draftOneSection(ctx, input, prep, r, i + 1, {
      previousSection: input.previous?.sections.find((s) => s.key === r.key) ?? null,
    }),
  );
  const content: ApplicationContent = { sections: outcomes.map((o) => o.section) };
  const { executiveSummary, keyPoints } = await summarize(ctx, input, content);
  const model = outcomes.find((o) => o.model)?.model ?? ctx.env.LLM_MODEL ?? "unknown";
  return { content, executiveSummary, keyPoints, model, promptVersion: PROMPT_VERSION };
}

/** Re-draft one section (e.g. after reviewer feedback); other sections are untouched. */
export async function redraftSection(ctx: AppContext, input: RedraftInput): Promise<DraftSection> {
  const reqs = requirementSections(input.requirements);
  let idx = reqs.findIndex((r) => r.key === input.sectionKey);
  const previousSection = input.previous?.sections.find((s) => s.key === input.sectionKey) ?? null;
  let requirement = reqs[idx];
  if (!requirement) {
    const prevIdx = input.previous?.sections.findIndex((s) => s.key === input.sectionKey) ?? -1;
    if (!previousSection || prevIdx < 0) {
      throw badRequest(`Unknown section "${input.sectionKey}" for this application`);
    }
    idx = prevIdx;
    requirement = RequirementSection.parse({
      key: previousSection.key,
      title: previousSection.title,
    });
  }
  const prep = await prepare(ctx, input);
  const { section } = await draftOneSection(ctx, input, prep, requirement, idx + 1, {
    instructions: input.instructions,
    previousSection,
  });
  return section;
}
