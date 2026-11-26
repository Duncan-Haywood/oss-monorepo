// Cross-module calls used by the interview module, kept in one place so signature drift between
// parallel modules only needs fixing here.
import type { DocumentKind } from "@shared/enums";
import type { AppContext } from "../../context";
import { createDocumentFromText } from "../ingestion";
import { formatFactsForPrompt, getCoverage, getFactsForDrafting } from "../knowledge";
import { loadUpdateAgenda, updateInterviewTitle } from "../updates";

export interface CoverageTopic {
  topic: string;
  label?: string;
  question?: string;
  factCount: number;
  status: "missing" | "thin" | "good";
}

export async function loadCoverage(ctx: AppContext, orgId: string): Promise<CoverageTopic[]> {
  try {
    return await getCoverage(ctx, orgId);
  } catch (e) {
    ctx.logger.warn("interview.coverage_failed", { error: String(e) });
    return [];
  }
}

/** Compact known-facts summary for the interviewer prompt (never includes restricted facts). */
export async function loadKnownFacts(
  ctx: AppContext,
  orgId: string,
  projectId: string | null,
): Promise<string> {
  try {
    const facts = await getFactsForDrafting(ctx, orgId, {
      includeProposed: true,
      ...(projectId ? { projectId } : {}),
    });
    return formatFactsForPrompt(facts.slice(0, 150)).slice(0, 12_000);
  } catch (e) {
    ctx.logger.warn("interview.facts_failed", { error: String(e) });
    return "";
  }
}

/** "What's new?" check-in agenda, driven by fact staleness (services/updates). */
export async function loadUpdateAgendaItems(ctx: AppContext, orgId: string) {
  return {
    agendaItems: await loadUpdateAgenda(ctx, orgId),
    title: updateInterviewTitle(ctx.now()),
  };
}

export async function storeTranscriptDocument(
  ctx: AppContext,
  input: { orgId: string; userId: string; title: string; text: string },
): Promise<{ id: string; duplicate: boolean }> {
  const kind: DocumentKind = "interview_transcript";
  const { documentId, duplicate } = await createDocumentFromText(ctx, input.orgId, {
    title: input.title,
    kind,
    text: input.text,
    uploadedBy: input.userId,
    onDuplicate: "reuse",
  });
  return { id: documentId, duplicate };
}
