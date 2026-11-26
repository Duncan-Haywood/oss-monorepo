// Queue job handlers for this module. Signatures are fixed by queues/handlers.ts.
//
// document.process: original (R2) → ctx.converter.toMarkdown → text.md (R2) → chunkMarkdown →
// document_chunks (replacing old ones) → embeddings (batches of ≤50) → ctx.vectors (namespace = orgId)
// → status ready → enqueue facts.extract_document. Failures mark the document failed with a
// user-facing message; nothing from the document's content is logged.
import { and, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../../context";
import { documentChunks, documents } from "../../db/schema";
import type { DocumentSafetyFlags } from "../../db/schema/knowledge";
import { newId } from "../../lib/ids";
import { enqueue } from "../../queues/enqueue";
import type { JobOf } from "../../queues/messages";
import {
  INJECTION_FLAG_THRESHOLD,
  INJECTION_HEURISTICS_VERSION,
  scanForInjection,
} from "../safety/injection-heuristics";
import { chunkMarkdown, DEFAULT_CHUNK_OPTIONS } from "./chunk";
import { type DocumentRow, deleteVectors, isOriginalPurged, textKey } from "./documents";
import { extensionForMime, MAX_TEXT_CHARS } from "./files";

export const EMBED_BATCH_SIZE = 50;
/** Rows per INSERT: D1 allows at most 100 bound parameters per statement (11 columns per chunk). */
const INSERT_BATCH = 8;

/** Errors whose message is safe and useful to show the user. */
export class IngestionError extends Error {
  override name = "IngestionError";
}

export async function processDocument(
  ctx: AppContext,
  job: JobOf<"document.process">,
): Promise<void> {
  const { orgId, documentId } = job;
  const where = and(eq(documents.id, documentId), eq(documents.orgId, orgId));
  const doc = await ctx.db.select().from(documents).where(where).get();
  if (!doc) {
    ctx.logger.warn("document.process.missing", { orgId, documentId });
    return;
  }
  // The retention sweep deleted the original (its text/chunks are kept): nothing to reconvert.
  if (await isOriginalPurged(ctx, orgId, doc)) {
    ctx.logger.warn("document.process.original_purged", { orgId, documentId });
    return;
  }
  await ctx.db.update(documents).set({ status: "processing", error: null }).where(where);
  const started = Date.now();

  let result: { chunkCount: number; textR2Key: string; safetyFlags: DocumentSafetyFlags | null };
  try {
    result = await convertChunkEmbed(ctx, doc);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    ctx.logger.error("document.process.failed", {
      orgId,
      documentId,
      mimeType: doc.mimeType,
      errorName: err.name,
      error: err.message.slice(0, 200),
    });
    await ctx.db
      .update(documents)
      .set({ status: "failed", error: userMessage(err) })
      .where(where);
    return;
  }

  await ctx.db
    .update(documents)
    .set({
      status: "ready",
      error: null,
      chunkCount: result.chunkCount,
      textR2Key: result.textR2Key,
      safetyFlags: result.safetyFlags,
      processedAt: ctx.now(),
    })
    .where(where);
  ctx.logger.info("document.processed", {
    orgId,
    documentId,
    chunkCount: result.chunkCount,
    ms: Date.now() - started,
  });
  if (result.safetyFlags) {
    // Score and kinds only: excerpts are document content and must not be logged.
    ctx.logger.warn("document.injection_suspected", {
      orgId,
      documentId,
      score: result.safetyFlags.injectionScore,
      kinds: [...new Set(result.safetyFlags.findings.map((f) => f.kind))],
    });
  }

  // Follow-up: fact extraction. A failure here must not mark the document failed.
  try {
    await enqueue(ctx, { type: "facts.extract_document", orgId, documentId });
  } catch (e) {
    ctx.logger.warn("document.facts_enqueue_failed", {
      orgId,
      documentId,
      error: String(e).slice(0, 200),
    });
  }
}

async function convertChunkEmbed(
  ctx: AppContext,
  doc: DocumentRow,
): Promise<{ chunkCount: number; textR2Key: string; safetyFlags: DocumentSafetyFlags | null }> {
  const { orgId, id: documentId } = doc;
  const obj = await ctx.env.FILES.get(doc.r2Key);
  if (!obj) throw new IngestionError("The original file is missing from storage.");
  const bytes = await obj.arrayBuffer();
  const name = obj.customMetadata?.filename ?? `${doc.title}.${extensionForMime(doc.mimeType)}`;

  const { markdown } = await ctx.converter.toMarkdown({ name, mimeType: doc.mimeType, bytes });
  let md = normalizeMarkdown(markdown);
  if (!md) {
    throw new IngestionError(
      "No readable text was found in this file. If it is a scan, try a clearer copy or paste the text instead.",
    );
  }
  if (md.length > MAX_TEXT_CHARS) {
    ctx.logger.warn("document.text_truncated", { orgId, documentId, chars: md.length });
    md = md.slice(0, MAX_TEXT_CHARS);
  }
  const isHtml = /^(?:text\/html|application\/xhtml\+xml)\b/i.test(doc.mimeType);
  const safetyFlags = documentSafetyFlags(
    md,
    isHtml ? new TextDecoder().decode(bytes.slice(0, 4_000_000)) : null,
    ctx.now(),
  );

  const textR2Key = textKey(orgId, documentId);
  await ctx.env.FILES.put(textR2Key, md, {
    httpMetadata: { contentType: "text/markdown; charset=utf-8" },
    customMetadata: { orgId, documentId },
  });

  const pieces = chunkMarkdown(md, DEFAULT_CHUNK_OPTIONS);

  // Replace chunks (and their vectors) from any previous run.
  const chunkScope = and(
    eq(documentChunks.orgId, orgId),
    eq(documentChunks.documentId, documentId),
  );
  const old = await ctx.db.select({ id: documentChunks.id }).from(documentChunks).where(chunkScope);
  if (old.length) {
    await deleteVectors(
      ctx,
      orgId,
      old.map((r) => r.id),
    );
    await ctx.db.delete(documentChunks).where(chunkScope);
  }

  const createdAt = ctx.now();
  const rows = pieces.map((p, ordinal) => ({
    id: newId("chk"),
    orgId,
    documentId,
    ordinal,
    heading: p.heading,
    text: p.text,
    tokenEstimate: p.tokenEstimate,
    charStart: p.charStart,
    charEnd: p.charEnd,
    createdAt,
  }));
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    await ctx.db.insert(documentChunks).values(rows.slice(i, i + INSERT_BATCH));
  }

  for (let i = 0; i < rows.length; i += EMBED_BATCH_SIZE) {
    const batch = rows.slice(i, i + EMBED_BATCH_SIZE);
    const vectors = await ctx.embedder.embed(batch.map((r) => embeddingInput(r.heading, r.text)));
    if (vectors.length !== batch.length) {
      throw new IngestionError("Embedding service returned an unexpected result. Try again.");
    }
    await ctx.vectors.upsert(
      orgId,
      batch.map((r, j) => ({
        id: r.id,
        values: vectors[j] ?? [],
        metadata: { documentId, kind: doc.kind },
      })),
    );
    await ctx.db
      .update(documentChunks)
      .set({ embeddedAt: ctx.now() })
      .where(
        and(
          eq(documentChunks.orgId, orgId),
          inArray(
            documentChunks.id,
            batch.map((r) => r.id),
          ),
        ),
      );
  }

  return { chunkCount: rows.length, textR2Key, safetyFlags };
}

/**
 * Prompt-injection scan of the extracted text (and the raw HTML, for hidden text). Returns the
 * warning to store on the document, or null when the score is below the threshold.
 */
export function documentSafetyFlags(
  text: string,
  html: string | null,
  now: Date,
): DocumentSafetyFlags | null {
  const scan = scanForInjection(text, { html });
  if (scan.score < INJECTION_FLAG_THRESHOLD) return null;
  return {
    injectionSuspected: true,
    injectionScore: scan.score,
    findings: scan.findings.slice(0, 10),
    version: INJECTION_HEURISTICS_VERSION,
    scannedAt: now.toISOString(),
  };
}

/** Normalize converter output: LF line endings, no NULs / trailing spaces, at most 2 blank lines. */
export function normalizeMarkdown(md: string): string {
  return md
    .replace(/\r\n?/g, "\n")
    .replaceAll("\u0000", "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

/** Text sent to the embedder: continuation chunks get their heading breadcrumb as context. */
export function embeddingInput(heading: string | null, text: string): string {
  return heading && !text.trimStart().startsWith("#") ? `${heading}\n\n${text}` : text;
}

/** Converter messages about the file itself (not the service): safe and actionable. */
const FILE_PROBLEM = /^(Could not extract text from this file|Legacy \.doc files)/;
const TEMPORARY_FAILURE_MESSAGE =
  "We couldn't process this file right now. Try reprocessing in a few minutes.";

/**
 * Only IngestionError (and converter messages about the file) are shown verbatim; infra errors
 * (Vectorize, Workers AI, R2, D1 text) are logged by the caller and replaced by a generic message.
 */
function userMessage(err: Error): string {
  const msg = err.message.trim();
  if (!msg || !(err instanceof IngestionError || FILE_PROBLEM.test(msg))) {
    return TEMPORARY_FAILURE_MESSAGE;
  }
  return msg.length > 500 ? `${msg.slice(0, 497)}...` : msg;
}
