// ISO 9001 document control (clause 7.5): the master list of controlled documents and each one's
// release history. Rows are tenant-scoped (every query filters by orgId) and every write is audited.
// Reading works on every plan, as the ISO 9001 checklist does; recording needs the quality plan
// (assertQualityPlan). The checks are pure, in @shared/document-control.
import {
  checkDocuments,
  type DocKind,
  type DocOrigin,
  type DocumentFields,
  docReviewState,
  documentIssues,
  documentReviewDates,
  documentsNeedingReview,
  MAX_DOCUMENTS_PER_ORG,
  nextRevision,
  reviewDueFrom,
  validateDocumentFields,
  validateRelease,
} from "@shared/document-control";
import { and, asc, count, desc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { controlledDocument, controlledDocumentEvent, user } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { audit } from "../audit";
import { assertQualityPlan } from "../billing";
import { isMember } from "../orgs";

export type DocumentRow = typeof controlledDocument.$inferSelect;
export type DocumentEventRow = typeof controlledDocumentEvent.$inferSelect;

export interface DocumentInput {
  docNumber: string;
  title: string;
  kind: DocKind;
  origin?: DocOrigin;
  revision?: string;
  issuer?: string;
  location?: string;
  ownerUserId?: string | null;
  reviewMonths?: number | null;
  notes?: string;
}

const today = (ctx: AppContext) => ctx.now().toISOString().slice(0, 10);

export async function listDocuments(ctx: AppContext, orgId: string): Promise<DocumentRow[]> {
  return ctx.db
    .select()
    .from(controlledDocument)
    .where(eq(controlledDocument.orgId, orgId))
    .orderBy(asc(controlledDocument.docNumber))
    .all();
}

export async function documentList(ctx: AppContext, orgId: string) {
  const rows = await listDocuments(ctx, orgId);
  const on = today(ctx);
  return {
    today: on,
    items: rows.map((r) => ({
      ...r,
      review: docReviewState(r, on),
      suggestedNextRevision: nextRevision(r.releasedRevision ?? r.revision),
      issues: documentIssues(r, on),
    })),
    check: checkDocuments(rows, on),
    needingReview: documentsNeedingReview(rows, on),
  };
}

/** Review dates for the calendar file and link: counts per date, no titles. */
export async function documentReviewDatesFor(ctx: AppContext, orgId: string) {
  return documentReviewDates(await listDocuments(ctx, orgId));
}

export async function getDocument(ctx: AppContext, orgId: string, id: string) {
  const row = await ctx.db
    .select()
    .from(controlledDocument)
    .where(and(eq(controlledDocument.id, id), eq(controlledDocument.orgId, orgId)))
    .get();
  if (!row) throw notFound("Document");
  return row;
}

export async function documentHistory(ctx: AppContext, orgId: string, id: string) {
  await getDocument(ctx, orgId, id);
  return ctx.db
    .select()
    .from(controlledDocumentEvent)
    .where(
      and(eq(controlledDocumentEvent.orgId, orgId), eq(controlledDocumentEvent.documentId, id)),
    )
    .orderBy(desc(controlledDocumentEvent.on), desc(controlledDocumentEvent.createdAt))
    .all();
}

async function assertMember(
  ctx: AppContext,
  orgId: string,
  userId: string | null | undefined,
  what: string,
) {
  if (userId && !(await isMember(ctx, orgId, userId)))
    throw badRequest(`${what} must be a member of this organization.`);
}

async function assertNumberFree(
  ctx: AppContext,
  orgId: string,
  docNumber: string,
  except?: string,
) {
  const clash = await ctx.db
    .select({ id: controlledDocument.id })
    .from(controlledDocument)
    .where(and(eq(controlledDocument.orgId, orgId), eq(controlledDocument.docNumber, docNumber)))
    .get();
  if (clash && clash.id !== except)
    throw conflict(`Another document already has the number ${docNumber}.`);
}

function checkFields(d: DocumentFields) {
  const errors = validateDocumentFields(d);
  if (errors.length) throw badRequest(errors.join(" "), { errors });
}

const fieldsOf = (r: DocumentInput | DocumentRow): DocumentFields => ({
  docNumber: r.docNumber,
  title: r.title,
  kind: r.kind,
  origin: r.origin ?? "internal",
  revision: r.revision ?? "",
  issuer: r.issuer ?? "",
  location: r.location ?? "",
  reviewMonths: r.reviewMonths ?? null,
});

const record = (ctx: AppContext, orgId: string, actorUserId: string, action: string, id: string) =>
  audit(ctx, {
    orgId,
    actorUserId,
    action: `document.${action}`,
    targetType: "controlled_document",
    targetId: id,
  });

export async function createDocument(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  input: DocumentInput,
) {
  await assertQualityPlan(ctx, orgId);
  checkFields(fieldsOf(input));
  await assertMember(ctx, orgId, input.ownerUserId, "The owner");
  const existing = await ctx.db
    .select({ n: count() })
    .from(controlledDocument)
    .where(eq(controlledDocument.orgId, orgId))
    .get();
  if ((existing?.n ?? 0) >= MAX_DOCUMENTS_PER_ORG)
    throw conflict(`A master list holds at most ${MAX_DOCUMENTS_PER_ORG} documents.`);
  await assertNumberFree(ctx, orgId, input.docNumber);
  const id = newId("doc");
  await ctx.db.insert(controlledDocument).values({
    id,
    orgId,
    docNumber: input.docNumber,
    title: input.title,
    kind: input.kind,
    origin: input.origin ?? "internal",
    revision: input.revision ?? "",
    status: "draft",
    issuer: input.issuer ?? "",
    location: input.location ?? "",
    ownerUserId: input.ownerUserId ?? null,
    reviewMonths: input.reviewMonths ?? null,
    notes: input.notes ?? "",
  });
  await record(ctx, orgId, actorUserId, "create", id);
  return getDocument(ctx, orgId, id);
}

/**
 * Edits the register fields. The revision changes here only while the document is a draft: a
 * released revision changes by starting the next one (reviseDocument). A new review interval moves
 * the review date from the release or review in force.
 */
export async function updateDocument(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
  patch: Partial<DocumentInput>,
) {
  await assertQualityPlan(ctx, orgId);
  const row = await getDocument(ctx, orgId, id);
  if (row.status === "obsolete")
    throw conflict("An obsolete document is kept as it was withdrawn.");
  if (patch.revision !== undefined && patch.revision !== row.revision && row.status !== "draft")
    throw conflict(
      "A released revision is not edited in place. Start the next revision, then release it.",
    );
  const merged = { ...row, ...patch };
  checkFields(fieldsOf(merged));
  await assertMember(ctx, orgId, patch.ownerUserId, "The owner");
  if (patch.docNumber !== undefined) await assertNumberFree(ctx, orgId, patch.docNumber, id);
  const set: Partial<DocumentRow> = { ...patch };
  if (patch.reviewMonths !== undefined && patch.reviewMonths !== row.reviewMonths) {
    const last = await lastEvent(ctx, orgId, id, ["released", "reviewed"]);
    set.reviewDue = last ? reviewDueFrom(last.on, patch.reviewMonths) : null;
  }
  await ctx.db
    .update(controlledDocument)
    .set(set)
    .where(and(eq(controlledDocument.id, id), eq(controlledDocument.orgId, orgId)));
  await record(ctx, orgId, actorUserId, "update", id);
  return getDocument(ctx, orgId, id);
}

async function lastEvent(
  ctx: AppContext,
  orgId: string,
  id: string,
  kinds: ("released" | "reviewed" | "obsoleted")[],
) {
  const events = await documentHistory(ctx, orgId, id);
  return events.find((e) => kinds.includes(e.kind)) ?? null;
}

async function nameOf(ctx: AppContext, userId: string) {
  const u = await ctx.db.select({ name: user.name }).from(user).where(eq(user.id, userId)).get();
  return u?.name ?? "";
}

export interface ReleaseInput {
  /** Defaults to the actor: whoever approves the revision. Must be a member. */
  approvedBy?: string;
  approvedOn: string;
  effectiveOn?: string | null;
  changeSummary?: string;
}

/** Releases the draft revision: it becomes the one in force, and the history gets a row. */
export async function releaseDocument(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
  input: ReleaseInput,
) {
  await assertQualityPlan(ctx, orgId);
  const row = await getDocument(ctx, orgId, id);
  if (row.status !== "draft")
    throw conflict(
      row.status === "released"
        ? `Revision ${row.revision} is already released. Start the next revision to change it.`
        : "An obsolete document cannot be released again. Add it as a new document if it comes back.",
    );
  const effectiveOn = input.effectiveOn ?? null;
  const errors = validateRelease(
    { revision: row.revision, approvedOn: input.approvedOn, effectiveOn },
    today(ctx),
  );
  if (errors.length) throw badRequest(errors.join(" "), { errors });
  const approver = input.approvedBy ?? actorUserId;
  await assertMember(ctx, orgId, approver, "The approver");
  const history = await documentHistory(ctx, orgId, id);
  if (history.some((e) => e.kind === "released" && e.revision === row.revision))
    throw conflict(
      `Revision ${row.revision} was released before. Give the new revision its own letter or number.`,
    );
  if (!input.changeSummary?.trim() && row.releasedRevision !== null)
    throw badRequest("Say what changed in this revision.");
  await ctx.db.insert(controlledDocumentEvent).values({
    id: newId("dev"),
    orgId,
    documentId: id,
    kind: "released",
    revision: row.revision,
    summary: input.changeSummary?.trim() || "First release.",
    byUserId: approver,
    byName: await nameOf(ctx, approver),
    on: input.approvedOn,
    effectiveOn: effectiveOn ?? input.approvedOn,
  });
  await ctx.db
    .update(controlledDocument)
    .set({
      status: "released",
      releasedRevision: row.revision,
      approvedBy: approver,
      approvedOn: input.approvedOn,
      effectiveOn: effectiveOn ?? input.approvedOn,
      reviewDue: reviewDueFrom(input.approvedOn, row.reviewMonths),
    })
    .where(and(eq(controlledDocument.id, id), eq(controlledDocument.orgId, orgId)));
  await record(ctx, orgId, actorUserId, "release", id);
  return getDocument(ctx, orgId, id);
}

/** Starts the next revision as a draft; the released one stays in force until it is released. */
export async function reviseDocument(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
  input: { revision?: string },
) {
  await assertQualityPlan(ctx, orgId);
  const row = await getDocument(ctx, orgId, id);
  if (row.status !== "released")
    throw conflict(
      row.status === "draft"
        ? "This document is already a draft; edit it and release it."
        : "An obsolete document cannot be revised.",
    );
  const revision = input.revision?.trim() || nextRevision(row.revision);
  if (!revision)
    throw badRequest(
      `Say what the revision after ${row.revision} is called (no letter or number to count from).`,
    );
  if (revision === row.revision) throw badRequest("The next revision needs a different name.");
  checkFields({ ...fieldsOf(row), revision });
  await ctx.db
    .update(controlledDocument)
    .set({ status: "draft", revision })
    .where(and(eq(controlledDocument.id, id), eq(controlledDocument.orgId, orgId)));
  await record(ctx, orgId, actorUserId, "revise", id);
  return getDocument(ctx, orgId, id);
}

/** Records a periodic review that found no change needed: the review date moves on. */
export async function reviewDocument(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
  input: { reviewedOn: string; notes?: string },
) {
  await assertQualityPlan(ctx, orgId);
  const row = await getDocument(ctx, orgId, id);
  if (row.releasedRevision === null || row.status === "obsolete")
    throw conflict("Only a document with a released revision in force can be reviewed.");
  const errors = validateRelease(
    { revision: row.releasedRevision, approvedOn: input.reviewedOn, effectiveOn: null },
    today(ctx),
  ).map((e) => e.replace("approval date", "review date"));
  if (errors.length) throw badRequest(errors.join(" "), { errors });
  await ctx.db.insert(controlledDocumentEvent).values({
    id: newId("dev"),
    orgId,
    documentId: id,
    kind: "reviewed",
    revision: row.releasedRevision,
    summary: input.notes?.trim() || "Reviewed, no change needed.",
    byUserId: actorUserId,
    byName: await nameOf(ctx, actorUserId),
    on: input.reviewedOn,
  });
  await ctx.db
    .update(controlledDocument)
    .set({ reviewDue: reviewDueFrom(input.reviewedOn, row.reviewMonths) })
    .where(and(eq(controlledDocument.id, id), eq(controlledDocument.orgId, orgId)));
  await record(ctx, orgId, actorUserId, "review", id);
  return getDocument(ctx, orgId, id);
}

/** Withdraws a document from use. It stays on the list, with its history, marked obsolete. */
export async function obsoleteDocument(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
  input: { on: string; reason: string },
) {
  await assertQualityPlan(ctx, orgId);
  const row = await getDocument(ctx, orgId, id);
  if (row.status === "obsolete") throw conflict("This document is already obsolete.");
  if (row.releasedRevision === null)
    throw conflict("A document never released can be deleted instead of withdrawn.");
  if (!input.reason.trim())
    throw badRequest("Say why the document is withdrawn (superseded by, no longer used).");
  const errors = validateRelease(
    { revision: row.releasedRevision, approvedOn: input.on, effectiveOn: null },
    today(ctx),
  ).map((e) => e.replace("approval date", "withdrawal date"));
  if (errors.length) throw badRequest(errors.join(" "), { errors });
  await ctx.db.insert(controlledDocumentEvent).values({
    id: newId("dev"),
    orgId,
    documentId: id,
    kind: "obsoleted",
    revision: row.releasedRevision,
    summary: input.reason.trim(),
    byUserId: actorUserId,
    byName: await nameOf(ctx, actorUserId),
    on: input.on,
  });
  // A draft of the next revision is abandoned with the document: the revision shown is the last released.
  await ctx.db
    .update(controlledDocument)
    .set({ status: "obsolete", revision: row.releasedRevision, reviewDue: null })
    .where(and(eq(controlledDocument.id, id), eq(controlledDocument.orgId, orgId)));
  await record(ctx, orgId, actorUserId, "obsolete", id);
  return getDocument(ctx, orgId, id);
}

/**
 * Deletes a document that was never released (a mistake, a draft abandoned). A document with a
 * release in its history is withdrawn instead, so the record of what was in use survives.
 */
export async function deleteDocument(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  id: string,
) {
  await assertQualityPlan(ctx, orgId);
  const row = await getDocument(ctx, orgId, id);
  if (row.releasedRevision !== null)
    throw conflict(
      "A document that was released is kept for the record. Mark it obsolete instead of deleting it.",
    );
  await ctx.db
    .delete(controlledDocument)
    .where(and(eq(controlledDocument.id, id), eq(controlledDocument.orgId, orgId)));
  await record(ctx, orgId, actorUserId, "delete", id);
}
