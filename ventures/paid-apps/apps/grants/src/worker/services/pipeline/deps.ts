// Cross-module calls used by the pipeline, in one place. Return values from other modules are
// normalized here (defensively, with zod) so the pipeline's own logic only sees known shapes.
import {
  ApplicationContent,
  DraftSection,
  GroundingReport,
  OpportunityRequirements,
} from "@shared/content";
import {
  FLAG_KINDS,
  FLAG_SEVERITIES,
  type FlagKind,
  type FlagSeverity,
  type SubmissionMethodHint,
} from "@shared/enums";
import { z } from "zod";
import type { AppContext } from "../../context";
import { assertCanDraft, recordUsage } from "../billing";
import { loadBudgetForGrounding } from "../budgets/refs";
import { ensureRequirements } from "../discovery";
import { draftApplication, PROMPT_VERSION, redraftSection } from "../drafting";
import type { DraftInput, DraftingFact, DraftResult, RedraftInput } from "../drafting/types";
import { verifyDraft } from "../grounding";
import { createGapFillInterview } from "../interview";
import { getFactsByIds, getFactsForDrafting } from "../knowledge";
import { scheduleDeadlineReminders, selectChannel, submitApplication } from "../submission";

export interface NormalizedFlag {
  severity: FlagSeverity;
  kind: FlagKind;
  sectionKey: string | null;
  claimId: string | null;
  message: string;
  suggestedQuestion: string | null;
}

const FlagLike = z.object({
  severity: z.enum(FLAG_SEVERITIES).catch("warning"),
  kind: z.enum(FLAG_KINDS).catch("other"),
  sectionKey: z.string().nullish(),
  claimId: z.string().nullish(),
  message: z.string().catch("Flagged by the grounding verifier"),
  suggestedQuestion: z.string().nullish(),
});

export function normalizeFlags(raw: unknown): NormalizedFlag[] {
  if (!Array.isArray(raw)) return [];
  const out: NormalizedFlag[] = [];
  for (const item of raw) {
    const parsed = FlagLike.safeParse(item);
    if (!parsed.success) continue;
    const f = parsed.data;
    out.push({
      severity: f.severity,
      kind: f.kind,
      sectionKey: f.sectionKey ?? null,
      claimId: f.claimId ?? null,
      message: f.message,
      suggestedQuestion: f.suggestedQuestion ?? null,
    });
  }
  return out;
}

/** A failed report used when the verifier output is unusable: never let an unverified draft pass. */
export function failedReport(model = "unknown"): GroundingReport {
  return {
    totalClaims: 0,
    factualClaims: 0,
    supported: 0,
    partiallySupported: 0,
    unsupported: 0,
    numericMismatches: 0,
    unconfirmedFactCitations: 0,
    gaps: 0,
    passed: false,
    verdicts: [],
    checkedAt: Date.now(),
    model,
  };
}

export const pipelineDeps = {
  async ensureRequirements(
    ctx: AppContext,
    opportunityId: string,
    orgId: string,
  ): Promise<OpportunityRequirements | null> {
    const raw: unknown = await ensureRequirements(ctx, opportunityId, { orgId });
    const parsed = OpportunityRequirements.safeParse(raw);
    return parsed.success ? parsed.data : null;
  },

  async factsForDrafting(
    ctx: AppContext,
    orgId: string,
    opts: { projectId?: string | null; includeProposed: boolean },
  ): Promise<DraftingFact[]> {
    const rows = await getFactsForDrafting(ctx, orgId, {
      projectId: opts.projectId ?? undefined,
      includeProposed: opts.includeProposed,
    });
    return rows as DraftingFact[];
  },

  async factsByIds(ctx: AppContext, orgId: string, ids: string[]): Promise<DraftingFact[]> {
    if (ids.length === 0) return [];
    const rows = await getFactsByIds(ctx, orgId, ids);
    return rows as DraftingFact[];
  },

  async draft(ctx: AppContext, input: DraftInput): Promise<DraftResult> {
    const budget =
      input.budget ?? (await loadBudgetForGrounding(ctx, input.orgId, input.applicationId));
    const r = await draftApplication(ctx, { ...input, budget });
    return { ...r, content: ApplicationContent.parse(r.content) };
  },

  /** Whether the funder's channel allows sending without a human (email to a known address). */
  channelSupportsAuto(opp: {
    submissionMethod: SubmissionMethodHint;
    submissionEmail: string | null;
    submissionUrl: string | null;
  }): boolean {
    return selectChannel(opp, { emailAllowed: true }).channel === "email";
  },

  /** Redraft one section; returns the full new content (other sections copied unchanged). */
  async redraftSection(
    ctx: AppContext,
    input: RedraftInput,
  ): Promise<{ content: ApplicationContent; model: string | null; promptVersion: string | null }> {
    const budget =
      input.budget ?? (await loadBudgetForGrounding(ctx, input.orgId, input.applicationId));
    const raw: unknown = await redraftSection(ctx, { ...input, budget });
    const previous = input.previous ?? { sections: [] };
    const asSection = DraftSection.safeParse(
      raw && typeof raw === "object" && "section" in raw
        ? (raw as { section: unknown }).section
        : raw,
    );
    const meta = (raw ?? {}) as { model?: unknown; promptVersion?: unknown };
    // redraftSection returns a bare DraftSection: record the configured model + drafting prompt version.
    const model = typeof meta.model === "string" ? meta.model : (ctx.env.LLM_MODEL ?? null);
    const promptVersion =
      typeof meta.promptVersion === "string" ? meta.promptVersion : PROMPT_VERSION;
    if (asSection.success && asSection.data.key === input.sectionKey) {
      const exists = previous.sections.some((s) => s.key === input.sectionKey);
      const sections = exists
        ? previous.sections.map((s) => (s.key === input.sectionKey ? asSection.data : s))
        : [...previous.sections, asSection.data];
      return { content: { sections }, model, promptVersion };
    }
    const asContent = ApplicationContent.safeParse(
      raw && typeof raw === "object" && "content" in raw
        ? (raw as { content: unknown }).content
        : raw,
    );
    if (asContent.success) return { content: asContent.data, model, promptVersion };
    throw new Error("drafting.redraftSection returned an unrecognized result");
  },

  async verify(
    ctx: AppContext,
    input: {
      orgId: string;
      applicationId: string;
      content: ApplicationContent;
      facts: DraftingFact[];
      requirements: OpportunityRequirements;
      autopilot: boolean;
      /** Lets the verifier check claims citing the `ask:requested_amount` pseudo-fact. */
      requestedAmountCents?: number | null;
    },
  ): Promise<{ report: GroundingReport; flags: NormalizedFlag[] }> {
    // `budget:<lineId>` citations are checked against the saved budget (absent = blocker).
    const budget = await loadBudgetForGrounding(ctx, input.orgId, input.applicationId);
    const raw: unknown = await verifyDraft(ctx, { ...input, budget });
    const r = (raw ?? {}) as { report?: unknown; flags?: unknown };
    const parsed = GroundingReport.safeParse(r.report);
    if (!parsed.success) {
      ctx.logger.warn("pipeline.verify.bad_report", { applicationId: input.applicationId });
    }
    return {
      report: parsed.success ? parsed.data : failedReport(),
      flags: normalizeFlags(r.flags),
    };
  },

  async createGapFillInterview(
    ctx: AppContext,
    input: { orgId: string; applicationId: string; questions: string[] },
  ): Promise<void> {
    await createGapFillInterview(ctx, input);
  },

  async submit(
    ctx: AppContext,
    input: {
      orgId: string;
      applicationId: string;
      versionId: string;
      submittedByType: "user" | "autopilot";
      submittedBy?: string;
      approvedBy?: string;
    },
  ): Promise<void> {
    await submitApplication(ctx, input);
  },

  async scheduleDeadlineReminders(
    ctx: AppContext,
    input: { orgId: string; applicationId: string },
  ): Promise<void> {
    await scheduleDeadlineReminders(ctx, input);
  },

  async assertCanDraft(ctx: AppContext, orgId: string): Promise<void> {
    await assertCanDraft(ctx, orgId);
  },

  async recordDraftUsage(
    ctx: AppContext,
    input: { orgId: string; subjectId: string; costMicros: number },
  ): Promise<void> {
    await recordUsage(ctx, { ...input, kind: "application_draft" });
  },
};
