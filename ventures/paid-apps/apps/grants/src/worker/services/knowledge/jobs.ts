// Queue job handlers for this module. Signatures are fixed by queues/handlers.ts.
// Both jobs are idempotent: re-running dedupes against the org's existing facts (all statuses, so a
// fact a human rejected is never re-proposed) and recomputes the source's factCount.
import { and, asc, eq, type SQL, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  applications,
  applicationVersions,
  documentChunks,
  documents,
  facts,
  interviews,
  interviewTurns,
  organization,
  projects,
} from "../../db/schema";
import { sha256Hex } from "../../lib/hash";
import { newId } from "../../lib/ids";
import { LlmRefusalError, type StructuredRequest } from "../../ports/llm";
import type { JobOf } from "../../queues/messages";
import {
  type AcceptedFact,
  acceptExtractedFacts,
  batchByChars,
  buildDocumentPrompt,
  buildInterviewPrompt,
  DOCUMENT_SYSTEM_PROMPT,
  DocumentExtraction,
  INTERVIEW_SYSTEM_PROMPT,
  InterviewExtraction,
  interviewerLabelsFromTranscript,
  PURPOSE_EXTRACT_DOCUMENT,
  PURPOSE_EXTRACT_INTERVIEW,
  type SourceChunk,
  type SourceTurn,
} from "./extract";
import {
  findSupersedeCandidate,
  loadSupersedeCandidates,
  type SupersedeCandidate,
} from "./supersede";
import { normalizeStatement, StatementIndex } from "./text";

type FactInsert = typeof facts.$inferInsert;

async function orgName(ctx: AppContext, orgId: string): Promise<string> {
  const row = await ctx.db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, orgId))
    .get();
  return row?.name ?? "The organization";
}

async function knownStatements(ctx: AppContext, orgId: string): Promise<StatementIndex> {
  const rows = await ctx.db
    .select({ statement: facts.statement, original: facts.originalStatement })
    .from(facts)
    .where(eq(facts.orgId, orgId))
    .all();
  const idx = new StatementIndex();
  for (const r of rows) {
    idx.add(r.statement);
    if (r.original) idx.add(r.original);
  }
  return idx;
}

/** One extraction call; a refusal or error skips this batch (recorded in stats) instead of the job. */
async function safeCall<T>(
  ctx: AppContext,
  stats: ExtractionStats,
  purpose: string,
  req: StructuredRequest<T>,
): Promise<T | null> {
  stats.calls++;
  try {
    return (await ctx.llm.generateStructured(req)).data;
  } catch (e) {
    if (e instanceof LlmRefusalError) stats.refusedCalls++;
    else stats.failedCalls++;
    ctx.logger.warn("facts.extract.batch_failed", { purpose, orgId: req.orgId, error: String(e) });
    return null;
  }
}

async function countFacts(ctx: AppContext, orgId: string, where: SQL): Promise<number> {
  const row = await ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(facts)
    .where(and(eq(facts.orgId, orgId), where))
    .get();
  return Number(row?.n ?? 0);
}

/** sha256(orgId|normalized statement|source chunk or turn id): unique per org (facts_org_dedupe_uq). */
function factDedupeHash(
  r: Pick<FactInsert, "orgId" | "statement" | "sourceChunkId" | "sourceTurnId">,
): Promise<string> {
  const source = r.sourceChunkId ?? r.sourceTurnId ?? "";
  return sha256Hex(`${r.orgId}|${normalizeStatement(r.statement)}|${source}`);
}

/**
 * Inserts proposed facts; returns how many were new. The in-memory StatementIndex dedupe is the
 * first pass; the unique dedupe hash + ON CONFLICT DO NOTHING makes a concurrent duplicate run
 * (queue redelivery, reprocess during an extraction) a no-op instead of a second copy.
 */
async function insertFacts(ctx: AppContext, rows: FactInsert[]): Promise<number> {
  let inserted = 0;
  // One statement per row keeps us under D1's bound-parameter limit; batch for one round trip.
  for (let i = 0; i < rows.length; i += 50) {
    const part = await Promise.all(
      rows.slice(i, i + 50).map(async (r) => ({ ...r, dedupeHash: await factDedupeHash(r) })),
    );
    const [first, ...rest] = part.map((r) =>
      ctx.db.insert(facts).values(r).onConflictDoNothing().returning({ id: facts.id }),
    );
    if (!first) continue;
    const results = await ctx.db.batch([first, ...rest]);
    for (const res of results) inserted += res.length;
  }
  return inserted;
}

/** Links each new fact to an older fact it would update (a proposal; applied on confirmation). */
function linkSupersedes(rows: FactInsert[], candidates: readonly SupersedeCandidate[]) {
  if (candidates.length === 0) return rows;
  return rows.map((r) => {
    const c = findSupersedeCandidate(
      {
        category: r.category,
        statement: r.statement,
        asOf: r.asOf ?? null,
        projectId: r.projectId ?? null,
        unit: r.value?.unit ?? null,
      },
      candidates,
    );
    return c ? { ...r, supersedesFactId: c.id } : r;
  });
}

function baseRow(orgId: string, f: AcceptedFact, now: Date): FactInsert {
  return {
    id: newId("fct"),
    orgId,
    category: f.category,
    statement: f.statement,
    value: f.value,
    asOf: f.asOf,
    sourceQuote: f.sourceQuote,
    sensitivity: f.sensitivity,
    confidence: f.confidence,
    status: "proposed",
    sourceType: "document",
    createdAt: now,
    updatedAt: now,
  };
}

/** Confidence ceiling for facts from a document flagged for possible prompt injection. */
export const FLAGGED_SOURCE_MAX_CONFIDENCE = 0.3;

export const flaggedConfidence = (c: number) =>
  Math.round(Math.min(c * 0.5, FLAGGED_SOURCE_MAX_CONFIDENCE) * 100) / 100;

export interface ExtractionStats {
  calls: number;
  /** Batches the model declined (skipped, not retried). */
  refusedCalls: number;
  /** Batches that errored; the job throws at the end so the queue retries (dedupe makes it safe). */
  failedCalls: number;
  inserted: number;
  droppedUnverified: number;
  droppedDuplicate: number;
  droppedInvalid: number;
  /** Questions and interviewer lines, which are never facts. */
  droppedQuestion: number;
}

const emptyStats = (): ExtractionStats => ({
  calls: 0,
  refusedCalls: 0,
  failedCalls: 0,
  inserted: 0,
  droppedUnverified: 0,
  droppedDuplicate: 0,
  droppedInvalid: 0,
  droppedQuestion: 0,
});

/** Extract proposed facts from every chunk of a document (several chunks per LLM call). */
export async function extractDocumentFactsFor(
  ctx: AppContext,
  orgId: string,
  documentId: string,
): Promise<ExtractionStats> {
  const stats = emptyStats();
  const doc = await ctx.db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.orgId, orgId)))
    .get();
  if (!doc) {
    ctx.logger.warn("facts.extract_document.missing", { orgId, documentId });
    return stats;
  }
  // Transcripts uploaded through the interview module are extracted turn-by-turn by
  // extractInterviewFacts (better provenance); skip them here to avoid duplicate facts.
  if (doc.kind === "interview_transcript") {
    const linked = await ctx.db
      .select({ id: interviews.id })
      .from(interviews)
      .where(and(eq(interviews.orgId, orgId), eq(interviews.transcriptDocumentId, documentId)))
      .get();
    if (linked) return stats;
  }
  const chunks = await ctx.db
    .select()
    .from(documentChunks)
    .where(and(eq(documentChunks.documentId, documentId), eq(documentChunks.orgId, orgId)))
    .orderBy(asc(documentChunks.ordinal))
    .all();
  if (chunks.length > 0) {
    const name = await orgName(ctx, orgId);
    const known = await knownStatements(ctx, orgId);
    const olderFacts = await loadSupersedeCandidates(ctx, orgId);
    const sourceType = doc.kind === "website_page" ? "website" : "document";
    const defaultAsOf =
      doc.kind === "past_application" && doc.pastYear ? String(doc.pastYear) : null;
    // Ingestion flagged possible prompt injection: its facts stay proposed with low confidence and
    // need an individual human confirmation (bulkConfirmFacts skips them).
    const flagged = doc.safetyFlags?.injectionSuspected === true;
    // Transcripts: interviewers named in the header are speaker labels whose lines are never facts.
    const interviewerLabels =
      doc.kind === "interview_transcript"
        ? interviewerLabelsFromTranscript(
            chunks
              .slice(0, 3)
              .map((c) => c.text)
              .join("\n"),
          )
        : [];
    const batches = batchByChars(chunks, (c) => c.text.length);
    for (const batch of batches) {
      const sources: SourceChunk[] = batch.map((c, i) => ({
        ref: `C${i + 1}`,
        id: c.id,
        heading: c.heading,
        text: c.text,
      }));
      const data = await safeCall(ctx, stats, PURPOSE_EXTRACT_DOCUMENT, {
        purpose: PURPOSE_EXTRACT_DOCUMENT,
        orgId,
        system: DOCUMENT_SYSTEM_PROMPT,
        prompt: buildDocumentPrompt({
          orgName: name,
          title: doc.title,
          kind: doc.kind,
          sourceUrl: doc.sourceUrl,
          past:
            doc.kind === "past_application" || doc.pastYear
              ? { funder: doc.pastFunder, year: doc.pastYear, outcome: doc.pastOutcome }
              : null,
          writtenOn: doc.kind === "update_note" ? doc.createdAt.toISOString().slice(0, 10) : null,
          chunks: sources,
        }),
        schema: DocumentExtraction,
        effort: "medium",
        maxTokens: 12_000,
      });
      if (!data) continue;
      const res = acceptExtractedFacts(data.facts, sources, known, {
        defaultAsOf,
        context: [name, doc.title],
        interviewerLabels,
      });
      stats.droppedUnverified += res.droppedUnverified;
      stats.droppedDuplicate += res.droppedDuplicate;
      stats.droppedInvalid += res.droppedInvalid;
      stats.droppedQuestion += res.droppedQuestion;
      const now = ctx.now();
      const rows = res.accepted.map((f) => ({
        ...baseRow(orgId, f, now),
        ...(flagged ? { confidence: flaggedConfidence(f.confidence) } : {}),
        sourceType,
        sourceDocumentId: doc.id,
        sourceChunkId: f.sourceId,
      })) satisfies FactInsert[];
      const inserted = await insertFacts(ctx, linkSupersedes(rows, olderFacts));
      stats.inserted += inserted;
      stats.droppedDuplicate += rows.length - inserted;
    }
  }
  const factCount = await countFacts(ctx, orgId, eq(facts.sourceDocumentId, documentId));
  await ctx.db
    .update(documents)
    .set({ factCount })
    .where(and(eq(documents.id, documentId), eq(documents.orgId, orgId)));
  ctx.logger.info("facts.extract_document.done", { orgId, documentId, ...stats });
  if (stats.failedCalls > 0)
    throw new Error(`facts.extract_document: ${stats.failedCalls} LLM call(s) failed`);
  return stats;
}

/** Extract proposed facts from the respondent turns of an interview. */
export async function extractInterviewFactsFor(
  ctx: AppContext,
  orgId: string,
  interviewId: string,
): Promise<ExtractionStats> {
  const stats = emptyStats();
  const iv = await ctx.db
    .select()
    .from(interviews)
    .where(and(eq(interviews.id, interviewId), eq(interviews.orgId, orgId)))
    .get();
  if (!iv) {
    ctx.logger.warn("facts.extract_interview.missing", { orgId, interviewId });
    return stats;
  }
  const turns = await ctx.db
    .select()
    .from(interviewTurns)
    .where(and(eq(interviewTurns.interviewId, interviewId), eq(interviewTurns.orgId, orgId)))
    .orderBy(asc(interviewTurns.ordinal))
    .all();
  if (turns.some((t) => t.role === "respondent")) {
    const name = await orgName(ctx, orgId);
    const known = await knownStatements(ctx, orgId);
    const olderFacts = await loadSupersedeCandidates(ctx, orgId);
    const focus = iv.focusProjectId
      ? await ctx.db
          .select({ id: projects.id, title: projects.title })
          .from(projects)
          .where(and(eq(projects.id, iv.focusProjectId), eq(projects.orgId, orgId)))
          .get()
      : undefined;
    const all: SourceTurn[] = turns.map((t, i) => ({
      ref: `T${i + 1}`,
      id: t.id,
      role: t.role,
      content: t.content,
    }));
    // Group as (question, answer) exchanges so a batch never splits an answer from its question.
    const exchanges: SourceTurn[][] = [];
    for (const t of all) {
      const last = exchanges.at(-1);
      if (t.role === "interviewer" || !last || last.at(-1)?.role === "respondent")
        exchanges.push([t]);
      else last.push(t);
    }
    const batches = batchByChars(
      exchanges.filter((ex) => ex.some((t) => t.role === "respondent")),
      (ex) => ex.reduce((n, t) => n + t.content.length, 0),
      12_000,
      20,
    );
    for (const batch of batches) {
      const turnsInBatch = batch.flat();
      const data = await safeCall(ctx, stats, PURPOSE_EXTRACT_INTERVIEW, {
        purpose: PURPOSE_EXTRACT_INTERVIEW,
        orgId,
        system: INTERVIEW_SYSTEM_PROMPT,
        prompt: buildInterviewPrompt({
          orgName: name,
          title: iv.title,
          kind: iv.kind,
          focusProject: focus ? { title: focus.title } : null,
          turns: turnsInBatch,
        }),
        schema: InterviewExtraction,
        effort: "medium",
        maxTokens: 12_000,
      });
      if (!data) continue;
      // Only respondent turns are valid evidence.
      const sources = turnsInBatch
        .filter((t) => t.role === "respondent")
        .map((t) => ({ ref: t.ref, id: t.id, text: t.content }));
      const res = acceptExtractedFacts(data.facts, sources, known, {
        context: [name, iv.title, focus?.title],
      });
      stats.droppedUnverified += res.droppedUnverified;
      stats.droppedDuplicate += res.droppedDuplicate;
      stats.droppedInvalid += res.droppedInvalid;
      stats.droppedQuestion += res.droppedQuestion;
      const now = ctx.now();
      const rows = res.accepted.map((f) => ({
        ...baseRow(orgId, f, now),
        sourceType: "interview" as const,
        sourceInterviewId: iv.id,
        sourceTurnId: f.sourceId,
        sourceDocumentId: iv.transcriptDocumentId ?? null,
        projectId: focus && f.aboutFocusProject ? focus.id : null,
      })) satisfies FactInsert[];
      const inserted = await insertFacts(ctx, linkSupersedes(rows, olderFacts));
      stats.inserted += inserted;
      stats.droppedDuplicate += rows.length - inserted;
    }
  }
  const factCount = await countFacts(ctx, orgId, eq(facts.sourceInterviewId, interviewId));
  await ctx.db
    .update(interviews)
    .set({ factCount })
    .where(and(eq(interviews.id, interviewId), eq(interviews.orgId, orgId)));
  ctx.logger.info("facts.extract_interview.done", { orgId, interviewId, ...stats });
  if (stats.failedCalls > 0)
    throw new Error(`facts.extract_interview: ${stats.failedCalls} LLM call(s) failed`);
  return stats;
}

export async function extractDocumentFacts(
  ctx: AppContext,
  job: JobOf<"facts.extract_document">,
): Promise<void> {
  await extractDocumentFactsFor(ctx, job.orgId, job.documentId);
}

export async function extractInterviewFacts(
  ctx: AppContext,
  job: JobOf<"facts.extract_interview">,
): Promise<void> {
  await extractInterviewFactsFor(ctx, job.orgId, job.interviewId);
  await resumeGapFilledApplication(ctx, job.orgId, job.interviewId);
}

/**
 * A completed gap-fill interview's answers are now facts: let the pipeline redraft its application.
 * Idempotent: resumeAfterInfo ignores applications no longer in needs_info, and a version drafted
 * after the interview completed means this interview was already used. Never fails the job.
 */
async function resumeGapFilledApplication(ctx: AppContext, orgId: string, interviewId: string) {
  const iv = await ctx.db
    .select({
      kind: interviews.kind,
      status: interviews.status,
      completedAt: interviews.completedAt,
      applicationId: interviews.focusApplicationId,
    })
    .from(interviews)
    .where(and(eq(interviews.id, interviewId), eq(interviews.orgId, orgId)))
    .get();
  if (iv?.kind !== "gap_fill" || iv.status !== "completed" || !iv.applicationId) return;
  const applicationId = iv.applicationId;
  try {
    const current = await ctx.db
      .select({ status: applications.status, versionAt: applicationVersions.createdAt })
      .from(applications)
      .leftJoin(
        applicationVersions,
        and(
          eq(applicationVersions.id, applications.currentVersionId),
          eq(applicationVersions.orgId, orgId),
        ),
      )
      .where(and(eq(applications.id, applicationId), eq(applications.orgId, orgId)))
      .get();
    if (current?.status !== "needs_info") return;
    if (current.versionAt && iv.completedAt && current.versionAt > iv.completedAt) return;
    // Dynamic import: pipeline imports knowledge.
    const { resumeAfterInfo } = await import("../pipeline");
    await resumeAfterInfo(ctx, { orgId, applicationId });
  } catch (e) {
    ctx.logger.warn("facts.extract_interview.resume_failed", {
      orgId,
      interviewId,
      applicationId,
      error: String(e).slice(0, 200),
    });
  }
}
