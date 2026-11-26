// Company updates: quick updates (a typed or dictated note stored as an `update_note` document and
// run through the normal convert → chunk → embed → extract pipeline), the check-in status behind
// the "What's new?" nudges, and the fact inputs for the update interview's staleness agenda.
// Every query filters by orgId.
import type { DocumentStatus, InputMode } from "@shared/enums";
import { checkInDue, daysSince, factStaleness } from "@shared/fact-staleness";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { AppContext } from "../../context";
import { documents, facts, interviews } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { createDocumentFromText, MAX_TEXT_CHARS } from "../ingestion";
import { type FactRow, listFacts, type SupersedeLinks, withSupersedeLinks } from "../knowledge";
import { type AgendaFact, buildUpdateAgenda, rankUpdateThemes, sinceLabel } from "./agenda";

export const MAX_UPDATE_CHARS = Math.min(20_000, MAX_TEXT_CHARS);

/** Facts the staleness checks look at: usable (confirmed / proposed), not restricted. */
export async function loadAgendaFacts(ctx: AppContext, orgId: string): Promise<AgendaFact[]> {
  return ctx.db
    .select({
      id: facts.id,
      category: facts.category,
      status: facts.status,
      asOf: facts.asOf,
      confirmedAt: facts.confirmedAt,
      lastConfirmedAt: facts.lastConfirmedAt,
      createdAt: facts.createdAt,
    })
    .from(facts)
    .where(
      and(
        eq(facts.orgId, orgId),
        inArray(facts.status, ["confirmed", "proposed"]),
        ne(facts.sensitivity, "restricted"),
        isNull(facts.supersededById),
      ),
    )
    .all();
}

/** The last company update: an update note, or a completed "What's new?" interview. */
export async function getLastUpdateAt(ctx: AppContext, orgId: string): Promise<Date | null> {
  const [note, iv] = await Promise.all([
    ctx.db
      .select({ at: documents.createdAt })
      .from(documents)
      .where(and(eq(documents.orgId, orgId), eq(documents.kind, "update_note")))
      .orderBy(desc(documents.createdAt))
      .get(),
    ctx.db
      .select({ at: interviews.completedAt })
      .from(interviews)
      .where(
        and(
          eq(interviews.orgId, orgId),
          eq(interviews.kind, "update"),
          eq(interviews.status, "completed"),
        ),
      )
      .orderBy(desc(interviews.completedAt))
      .get(),
  ]);
  const times = [note?.at, iv?.at].filter((d): d is Date => d instanceof Date);
  return times.length ? new Date(Math.max(...times.map((d) => d.getTime()))) : null;
}

/** Agenda for a new update interview (used by the interview engine). */
export async function loadUpdateAgenda(ctx: AppContext, orgId: string) {
  const [agendaFacts, lastUpdateAt] = await Promise.all([
    loadAgendaFacts(ctx, orgId),
    getLastUpdateAt(ctx, orgId),
  ]);
  return buildUpdateAgenda(agendaFacts, ctx.now(), lastUpdateAt);
}

export interface UpdateStatus {
  lastUpdateAt: string | null;
  daysSinceLastUpdate: number | null;
  /** The last update is older than 30 days (or there was none): show the "What's new?" nudge. */
  checkInDue: boolean;
  /** Facts showing the "may be outdated" indicator. */
  staleFactCount: number;
  staleTopics: { key: string; label: string; staleness: "dated" | "stale" }[];
}

export async function getUpdateStatus(ctx: AppContext, orgId: string): Promise<UpdateStatus> {
  const now = ctx.now();
  const [agendaFacts, lastUpdateAt] = await Promise.all([
    loadAgendaFacts(ctx, orgId),
    getLastUpdateAt(ctx, orgId),
  ]);
  const staleTopics = rankUpdateThemes(agendaFacts, now, sinceLabel(lastUpdateAt, now)).flatMap(
    (t) =>
      t.staleness === "fresh" ? [] : [{ key: t.key, label: t.label, staleness: t.staleness }],
  );
  return {
    lastUpdateAt: lastUpdateAt?.toISOString() ?? null,
    daysSinceLastUpdate: daysSince(lastUpdateAt, now),
    checkInDue: checkInDue(lastUpdateAt, now),
    staleFactCount: agendaFacts.filter((f) => factStaleness(f, now)).length,
    staleTopics,
  };
}

// ------------------------------------------------------------------------------ quick update

export interface QuickUpdateInput {
  text: string;
  inputMode: InputMode;
  userId: string;
  requestId?: string;
}

export interface QuickUpdateResult {
  documentId: string;
  title: string;
  status: DocumentStatus;
  error: string | null;
  /** True while the note is still being processed (queue mode): poll GET /updates/:documentId. */
  pending: boolean;
  /** The same text was already shared; its existing facts are returned. */
  duplicate: boolean;
  /** Facts extracted from the note (proposed ones await confirm / reject). */
  facts: (FactRow & SupersedeLinks)[];
}

const inlineJobs = (ctx: AppContext) =>
  ctx.env.APP_ENV === "test" || (ctx.env as { INLINE_JOBS?: string }).INLINE_JOBS === "true";

export function updateNoteTitle(now: Date): string {
  return `Update — ${now.toISOString().slice(0, 10)}`;
}

export async function createQuickUpdate(
  ctx: AppContext,
  orgId: string,
  input: QuickUpdateInput,
): Promise<QuickUpdateResult> {
  const text = input.text.replace(/\r\n?/g, "\n").trim();
  if (text.length < 3) throw badRequest("Tell us what changed (a sentence or two is enough)");
  if (text.length > MAX_UPDATE_CHARS) throw badRequest("This update is too long");
  const { documentId, duplicate } = await createDocumentFromText(ctx, orgId, {
    title: updateNoteTitle(ctx.now()),
    kind: "update_note",
    text,
    notes: input.inputMode === "voice" ? "Quick update (dictated)" : "Quick update",
    uploadedBy: input.userId,
    onDuplicate: "reuse",
    requestId: input.requestId,
  });
  return { ...(await getQuickUpdate(ctx, orgId, documentId)), duplicate };
}

/** A quick update's processing state and facts (404 unless it is this org's update note). */
export async function getQuickUpdate(
  ctx: AppContext,
  orgId: string,
  documentId: string,
): Promise<QuickUpdateResult> {
  const doc = await ctx.db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.orgId, orgId),
        eq(documents.kind, "update_note"),
      ),
    )
    .get();
  if (!doc) throw notFound("Update");
  // Extraction runs after processing marks the note ready and then rewrites factCount, which
  // moves updatedAt past processedAt. Inline (tests / INLINE_JOBS) it has already run.
  const extracted =
    doc.status === "failed" ||
    (doc.status === "ready" &&
      (inlineJobs(ctx) || doc.updatedAt.getTime() > (doc.processedAt?.getTime() ?? Infinity)));
  const rows = await listFacts(ctx, orgId, {
    sourceDocumentId: doc.id,
    status: ["proposed", "confirmed", "rejected"],
  });
  return {
    documentId: doc.id,
    title: doc.title,
    status: doc.status,
    error: doc.error,
    pending: !extracted,
    duplicate: false,
    facts: await withSupersedeLinks(ctx, orgId, rows),
  };
}
