// Document lifecycle: create (upload / paste / service-created text), list, detail, delete, reprocess.
// Every query is scoped by orgId; R2 keys live under orgs/{orgId}/documents/{id}/.
import type { DocumentKind, PastOutcome } from "@shared/enums";
import { POLICY_VERSION } from "@shared/legal";
import { and, asc, desc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { consentRecords, documentChunks, documents, facts, purgedFiles } from "../../db/schema";
import { AppError, badRequest, notFound } from "../../lib/errors";
import { sha256Hex } from "../../lib/hash";
import { newId } from "../../lib/ids";
import { enqueue } from "../../queues/enqueue";
import { audit } from "../privacy/audit";
import { cleanFilename, MAX_TEXT_CHARS } from "./files";

export type DocumentRow = typeof documents.$inferSelect;
export type ChunkRow = typeof documentChunks.$inferSelect;
export type FactRow = typeof facts.$inferSelect;

export const documentPrefix = (orgId: string, documentId: string) =>
  `orgs/${orgId}/documents/${documentId}/`;
export const originalKey = (orgId: string, documentId: string) =>
  `${documentPrefix(orgId, documentId)}original`;
export const textKey = (orgId: string, documentId: string) =>
  `${documentPrefix(orgId, documentId)}text.md`;

const byId = (orgId: string, documentId: string) =>
  and(eq(documents.id, documentId), eq(documents.orgId, orgId));

export interface ConsentInput {
  userId: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
}

export interface CreateDocumentInput {
  title: string;
  kind: DocumentKind;
  mimeType: string;
  bytes: ArrayBuffer | Uint8Array<ArrayBuffer>;
  filename: string;
  uploadedBy?: string | null;
  sourceUrl?: string | null;
  notes?: string | null;
  pastOutcome?: PastOutcome | null;
  pastFunder?: string | null;
  pastAmountCents?: number | null;
  pastYear?: number | null;
  /** Records a document_upload consent (after the duplicate check) and links it to the document. */
  consent?: ConsentInput;
  /** Link an existing consent record instead (e.g. website_crawl consent recorded by imports). */
  consentRecordId?: string | null;
  /** "reject" (default): 409 when identical content already exists in the org; "reuse": return it. */
  onDuplicate?: "reject" | "reuse";
  requestId?: string;
}

export interface CreateDocumentResult {
  document: DocumentRow;
  duplicate: boolean;
}

export async function createDocument(
  ctx: AppContext,
  orgId: string,
  input: CreateDocumentInput,
): Promise<CreateDocumentResult> {
  const sizeBytes = input.bytes.byteLength;
  if (sizeBytes === 0) throw badRequest("The file is empty");
  const sha256 = await sha256Hex(input.bytes);

  const existing = await ctx.db
    .select()
    .from(documents)
    .where(and(eq(documents.orgId, orgId), eq(documents.sha256, sha256)))
    .get();
  if (existing) {
    if (input.onDuplicate === "reuse") return { document: existing, duplicate: true };
    throw new AppError(
      409,
      "duplicate_document",
      `This file was already uploaded as "${existing.title}"`,
      { documentId: existing.id, title: existing.title },
    );
  }

  const id = newId("doc");
  const r2Key = originalKey(orgId, id);
  const filename = cleanFilename(input.filename);
  await ctx.env.FILES.put(r2Key, input.bytes, {
    httpMetadata: { contentType: input.mimeType },
    customMetadata: { orgId, mime: input.mimeType, filename, sha256 },
  });

  try {
    let consentRecordId = input.consentRecordId ?? null;
    if (input.consent) {
      consentRecordId = newId("cns");
      await ctx.db.insert(consentRecords).values({
        id: consentRecordId,
        orgId,
        userId: input.consent.userId,
        scope: "document_upload",
        policyVersion: POLICY_VERSION,
        granted: true,
        ipHash: input.consent.ipHash ?? null,
        userAgent: input.consent.userAgent?.slice(0, 300) ?? null,
      });
    }
    const isPast = input.kind === "past_application";
    await ctx.db.insert(documents).values({
      id,
      orgId,
      uploadedBy: input.uploadedBy ?? null,
      title: input.title.trim().slice(0, 300) || "Untitled document",
      kind: input.kind,
      mimeType: input.mimeType,
      sizeBytes,
      sha256,
      r2Key,
      sourceUrl: input.sourceUrl ?? null,
      status: "uploaded",
      pastOutcome: isPast ? (input.pastOutcome ?? null) : null,
      pastFunder: isPast ? (input.pastFunder ?? null) : null,
      pastAmountCents: isPast ? (input.pastAmountCents ?? null) : null,
      pastYear: isPast ? (input.pastYear ?? null) : null,
      notes: input.notes ?? null,
      consentRecordId,
    });
  } catch (e) {
    await ctx.env.FILES.delete(r2Key).catch(() => undefined);
    throw e;
  }

  await audit(ctx, {
    orgId,
    actorType: input.uploadedBy ? "user" : "system",
    actorId: input.uploadedBy ?? null,
    action: "document.uploaded",
    targetType: "document",
    targetId: id,
    metadata: {
      kind: input.kind,
      mimeType: input.mimeType,
      sizeBytes,
      source: input.sourceUrl ? "web" : "upload",
    },
    requestId: input.requestId,
  });

  await startProcessing(ctx, orgId, id);
  return { document: await mustGet(ctx, orgId, id), duplicate: false };
}

export interface CreateTextDocumentInput {
  title: string;
  kind: DocumentKind;
  text: string;
  sourceUrl?: string | null;
  uploadedBy?: string | null;
  notes?: string | null;
  consent?: ConsentInput;
  consentRecordId?: string | null;
  /** Default "reuse": re-importing identical text (re-crawl, same transcript) returns the existing doc. */
  onDuplicate?: "reject" | "reuse";
  requestId?: string;
}

/**
 * Create a document from text (pasted text, website pages, interview transcripts). Stored as
 * text/markdown and run through the same convert → chunk → embed → facts pipeline as uploads.
 */
export async function createDocumentFromText(
  ctx: AppContext,
  orgId: string,
  input: CreateTextDocumentInput,
): Promise<{ documentId: string; duplicate: boolean }> {
  const text = input.text.replace(/\r\n?/g, "\n");
  if (!text.trim()) throw badRequest("Text is empty");
  if (text.length > MAX_TEXT_CHARS) throw badRequest("Text is too long");
  const title = input.title.trim() || "Untitled document";
  const { document, duplicate } = await createDocument(ctx, orgId, {
    title,
    kind: input.kind,
    mimeType: "text/markdown",
    bytes: new TextEncoder().encode(text),
    filename: `${
      title
        .replace(/[^\w\- ]+/g, "")
        .trim()
        .slice(0, 80) || "document"
    }.md`,
    uploadedBy: input.uploadedBy ?? null,
    sourceUrl: input.sourceUrl ?? null,
    notes: input.notes ?? null,
    consent: input.consent,
    consentRecordId: input.consentRecordId ?? null,
    onDuplicate: input.onDuplicate ?? "reuse",
    requestId: input.requestId,
  });
  return { documentId: document.id, duplicate };
}

/** Queue (or, in tests / INLINE_JOBS, run) document.process. Never throws. */
async function startProcessing(ctx: AppContext, orgId: string, documentId: string) {
  try {
    await enqueue(ctx, { type: "document.process", orgId, documentId });
  } catch (e) {
    ctx.logger.error("document.enqueue_failed", {
      orgId,
      documentId,
      error: String(e).slice(0, 200),
    });
    await ctx.db
      .update(documents)
      .set({
        status: "failed",
        error: "Could not start processing. Try reprocessing the document.",
      })
      .where(byId(orgId, documentId));
  }
}

export type OriginalUnavailableReason = "retention_purged" | "missing";

/** 410: the original upload is gone (retention sweep, or missing from R2); the text is kept. */
export function originalUnavailable(reason: OriginalUnavailableReason) {
  return new AppError(
    410,
    "original_unavailable",
    reason === "retention_purged"
      ? "The original file was deleted under your organization's file retention policy. Its extracted text is still available."
      : "The original file is no longer in storage. Upload it again to restore it.",
    { reason },
  );
}

/** True when the privacy retention sweep purged this document's original (purged_files row). */
export async function isOriginalPurged(
  ctx: AppContext,
  orgId: string,
  doc: Pick<DocumentRow, "r2Key">,
): Promise<boolean> {
  const row = await ctx.db
    .select({ r2Key: purgedFiles.r2Key })
    .from(purgedFiles)
    .where(and(eq(purgedFiles.orgId, orgId), eq(purgedFiles.r2Key, doc.r2Key)))
    .get();
  return row !== undefined;
}

/** Why the original can't be read (purged / missing from R2), or null when it is available. */
export async function originalUnavailableReason(
  ctx: AppContext,
  orgId: string,
  doc: Pick<DocumentRow, "r2Key">,
): Promise<OriginalUnavailableReason | null> {
  if (await isOriginalPurged(ctx, orgId, doc)) return "retention_purged";
  return (await ctx.env.FILES.head(doc.r2Key)) ? null : "missing";
}

async function mustGet(ctx: AppContext, orgId: string, documentId: string) {
  const doc = await getDocument(ctx, orgId, documentId);
  if (!doc) throw notFound("Document");
  return doc;
}

export async function getDocument(
  ctx: AppContext,
  orgId: string,
  documentId: string,
): Promise<DocumentRow | null> {
  return (await ctx.db.select().from(documents).where(byId(orgId, documentId)).get()) ?? null;
}

export async function listDocuments(
  ctx: AppContext,
  orgId: string,
  opts: { kind?: DocumentKind } = {},
): Promise<DocumentRow[]> {
  return ctx.db
    .select()
    .from(documents)
    .where(
      opts.kind
        ? and(eq(documents.orgId, orgId), eq(documents.kind, opts.kind))
        : eq(documents.orgId, orgId),
    )
    .orderBy(desc(documents.createdAt), desc(documents.id))
    .limit(1000);
}

export async function getDocumentDetail(
  ctx: AppContext,
  orgId: string,
  documentId: string,
): Promise<DocumentRow & { chunks: ChunkRow[]; facts: FactRow[] }> {
  const doc = await mustGet(ctx, orgId, documentId);
  const [chunks, docFacts] = await Promise.all([
    ctx.db
      .select()
      .from(documentChunks)
      .where(and(eq(documentChunks.orgId, orgId), eq(documentChunks.documentId, documentId)))
      .orderBy(asc(documentChunks.ordinal)),
    ctx.db
      .select()
      .from(facts)
      .where(and(eq(facts.orgId, orgId), eq(facts.sourceDocumentId, documentId)))
      .orderBy(asc(facts.createdAt)),
  ]);
  return { ...doc, chunks, facts: docFacts };
}

/** Extracted markdown text of a processed document, or null if missing / not processed yet. */
export async function getDocumentText(
  ctx: AppContext,
  orgId: string,
  documentId: string,
): Promise<string | null> {
  const doc = await getDocument(ctx, orgId, documentId);
  if (!doc?.textR2Key) return null;
  const obj = await ctx.env.FILES.get(doc.textR2Key);
  return obj ? obj.text() : null;
}

export async function deleteVectors(ctx: AppContext, orgId: string, ids: string[]) {
  for (let i = 0; i < ids.length; i += 500) {
    await ctx.vectors.deleteByIds(orgId, ids.slice(i, i + 500));
  }
}

export interface Actor {
  userId: string | null;
  requestId?: string;
}

/** Deletes R2 objects, vectors, chunks and the document row (facts from it cascade). */
export async function deleteDocument(
  ctx: AppContext,
  orgId: string,
  documentId: string,
  actor: Actor,
): Promise<void> {
  const doc = await mustGet(ctx, orgId, documentId);
  const chunkIds = (
    await ctx.db
      .select({ id: documentChunks.id })
      .from(documentChunks)
      .where(and(eq(documentChunks.orgId, orgId), eq(documentChunks.documentId, documentId)))
  ).map((r) => r.id);

  try {
    await deleteVectors(ctx, orgId, chunkIds);
  } catch (e) {
    // Orphaned vectors carry no text (ids + documentId/kind only); retrieval joins on D1 rows.
    ctx.logger.warn("document.vectors_delete_failed", {
      orgId,
      documentId,
      error: String(e).slice(0, 200),
    });
  }

  const keys = new Set<string>([doc.r2Key]);
  if (doc.textR2Key) keys.add(doc.textR2Key);
  const prefix = documentPrefix(orgId, documentId);
  let cursor: string | undefined;
  do {
    const page = await ctx.env.FILES.list({ prefix, cursor });
    for (const o of page.objects) keys.add(o.key);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  // Only ever delete keys under this org's prefix.
  await ctx.env.FILES.delete([...keys].filter((k) => k.startsWith(`orgs/${orgId}/`)));

  await ctx.db
    .delete(documentChunks)
    .where(and(eq(documentChunks.orgId, orgId), eq(documentChunks.documentId, documentId)));
  await ctx.db
    .delete(facts)
    .where(and(eq(facts.orgId, orgId), eq(facts.sourceDocumentId, documentId)));
  await ctx.db.delete(documents).where(byId(orgId, documentId));

  await audit(ctx, {
    orgId,
    actorType: actor.userId ? "user" : "system",
    actorId: actor.userId,
    action: "document.deleted",
    targetType: "document",
    targetId: documentId,
    metadata: { kind: doc.kind, chunkCount: chunkIds.length },
    requestId: actor.requestId,
  });
}

/** Re-run convert → chunk → embed → facts for a document (replaces its chunks and vectors). */
export async function reprocessDocument(
  ctx: AppContext,
  orgId: string,
  documentId: string,
  actor: Actor,
): Promise<DocumentRow> {
  const doc = await mustGet(ctx, orgId, documentId);
  // A job that died mid-run leaves "processing" behind; allow a retry after a while.
  const stale = ctx.now().getTime() - doc.updatedAt.getTime() > 10 * 60_000;
  if (doc.status === "processing" && !stale) {
    throw new AppError(409, "document_processing", "This document is already being processed");
  }
  // Reprocessing reconverts the original; refuse (before touching the status) when it is gone.
  const unavailable = await originalUnavailableReason(ctx, orgId, doc);
  if (unavailable) throw originalUnavailable(unavailable);
  await ctx.db
    .update(documents)
    .set({ status: "uploaded", error: null })
    .where(byId(orgId, documentId));
  await audit(ctx, {
    orgId,
    actorType: actor.userId ? "user" : "system",
    actorId: actor.userId,
    action: "document.reprocessed",
    targetType: "document",
    targetId: documentId,
    requestId: actor.requestId,
  });
  await startProcessing(ctx, orgId, documentId);
  return mustGet(ctx, orgId, documentId);
}
