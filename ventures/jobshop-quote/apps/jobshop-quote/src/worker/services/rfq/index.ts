// RFQ intake: pasted email text + uploaded files -> stored RFQ; LLM extraction -> verified,
// estimator-editable parts. Every query is scoped by orgId; R2 keys start with orgs/{orgId}/.
import type { RfqDetailDto } from "@shared/api";
import {
  llmExtractionSchema,
  matchFinishingOps,
  matchMaterial,
  normalize,
  verifyExtraction,
} from "@shared/extraction";
import type { CadUnit } from "@shared/geometry";
import { countPdfPages, filePages, rfqUnitsForPages } from "@shared/pdf-pages";
import { uploadMimeType } from "@shared/upload-pages";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import { quotes, rfqCounts, rfqFiles, rfqParts, rfqs } from "../../db/schema";
import { AppError, badRequest, conflict, notFound } from "../../lib/errors";
import { sha256Hex } from "../../lib/hash";
import { newId } from "../../lib/ids";
import { isCadFile, isMeasuredCadFile } from "../../ports/geometry";
import { notifyAllowanceUsage } from "../allowance-notice";
import { claimRfqRead, orgPlan, usage } from "../billing";
import { getRateCardDto, loadRateCard } from "../ratecard";
import { RFQ_EXTRACT_SYSTEM, rfqExtractPrompt } from "./prompts";

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_FILES = 10;
/**
 * CAD files up to this size are measured inside the upload request; larger STEP and DXF files are
 * stored at once and measured on request (`measureFile`, one file per request). Parsing is CPU and
 * memory inside the request, and an RFQ upload may carry up to MAX_FILES files. Timed in workerd on
 * 15 real STEP files from 0.4 to 12.9 MB (2026-11-27, docs/GEOMETRY-LIMITS.md): 0.03 to 0.19 ms per
 * KB, so ten 1 MB files stay under 2 s of the Worker's 30 s CPU limit. A request that runs out of
 * CPU or memory fails whole, so a slow STEP must never be able to fail the upload.
 */
export const INLINE_GEOMETRY_MAX_BYTES = 1024 * 1024;
/**
 * The largest CAD file measured at all. Memory, not CPU, is the limit: a Worker isolate has 128 MB,
 * and measuring a STEP holds its text, the parsed instances and the sampled edges at once. On 12
 * real files every one up to 6 MB measured in at most 78 MB of V8 heap, while an 8 MB and a 12.9 MB
 * file needed 124 and 132 MB, which with the app's own heap and the file's bytes cannot fit
 * (docs/GEOMETRY-LIMITS.md). A file over this is stored and marked TOO_LARGE_TO_MEASURE at upload,
 * never offered "Measure" (a request killed for memory could not record that it failed, so the
 * button would fail on every click).
 */
export const MAX_MEASURE_BYTES = 6 * 1024 * 1024;
/** Characters of RFQ text sent to the model (drawings can be long; title blocks come first). */
export const MAX_SOURCE_CHARS = 60_000;

const DOC_MIMES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "image/png",
  "image/jpeg",
]);

export interface UploadedFile {
  name: string;
  type: string;
  bytes: ArrayBuffer;
}

export async function createRfq(
  ctx: AppContext,
  orgId: string,
  userId: string,
  input: { subject?: string | undefined; bodyText: string; files: UploadedFile[] },
) {
  if (!input.bodyText.trim() && input.files.length === 0) {
    throw badRequest("Paste the RFQ email or upload at least one file");
  }
  if (input.files.length > MAX_FILES) throw badRequest(`At most ${MAX_FILES} files per RFQ`);
  for (const f of input.files) {
    if (f.bytes.byteLength > MAX_FILE_BYTES) throw badRequest(`${f.name} is larger than 15 MB`);
    if (f.bytes.byteLength === 0) throw badRequest(`${f.name} is empty`);
    const mime = mimeOf(f);
    if (!DOC_MIMES.has(mime) && !isCadFile(f.name)) {
      throw badRequest(`${f.name}: upload PDF drawings, text, images or CAD files`);
    }
  }
  const rfqId = newId("rfq");
  await ctx.db.insert(rfqs).values({
    id: rfqId,
    orgId,
    subject: input.subject?.trim() || null,
    bodyText: input.bodyText,
    createdBy: userId,
  });
  for (const f of input.files) await addFile(ctx, orgId, rfqId, f);
  return getRfq(ctx, orgId, rfqId);
}

/** Whether intake can store this file (the same rule as an upload in the app). */
export function isAcceptedFile(f: Pick<UploadedFile, "name" | "type">): boolean {
  return DOC_MIMES.has(mimeOf(f)) || isCadFile(f.name);
}

/**
 * An RFQ that arrived by email (services/inbound): stored without an AI read, so a stranger who
 * learns the address cannot spend the shop's allowance. Files are already filtered by the caller.
 */
export async function createEmailedRfq(
  ctx: AppContext,
  orgId: string,
  input: {
    subject: string | null;
    bodyText: string;
    fromAddress: string | null;
    messageId: string | null;
    threadReferences?: string | null;
    intakeNotes: string[];
    files: UploadedFile[];
  },
) {
  const rfqId = newId("rfq");
  await ctx.db.insert(rfqs).values({
    id: rfqId,
    orgId,
    source: "email",
    subject: input.subject?.trim().slice(0, 300) || null,
    bodyText: input.bodyText,
    fromAddress: input.fromAddress,
    messageId: input.messageId,
    threadReferences: input.threadReferences ?? null,
    intakeNotes: input.intakeNotes,
    createdBy: null,
  });
  for (const f of input.files.slice(0, MAX_FILES)) await addFile(ctx, orgId, rfqId, f);
  return rfqId;
}

const mimeOf = (f: Pick<UploadedFile, "name" | "type">) => uploadMimeType(f.name, f.type);

async function addFile(ctx: AppContext, orgId: string, rfqId: string, f: UploadedFile) {
  const id = newId("rfl");
  const mimeType = mimeOf(f);
  const r2Key = `orgs/${orgId}/rfqs/${rfqId}/${id}`;
  await ctx.env.FILES.put(r2Key, f.bytes, { httpMetadata: { contentType: mimeType } });
  let extractedText: string | null = null;
  let conversionError: string | null = null;
  let geometry = null;
  // Pages count toward the plan ("an RFQ counts once per 10 drawing pages"); never guessed.
  const pageCount =
    mimeType === "application/pdf" ? await countPdfPages(new Uint8Array(f.bytes)) : null;
  if (isCadFile(f.name)) {
    // Larger STEP/DXF files wait for "Measure" (geometryPending); the upload never parses them.
    if (isMeasuredCadFile(f.name) && f.bytes.byteLength > MAX_MEASURE_BYTES) {
      conversionError = TOO_LARGE_TO_MEASURE;
    } else if (f.bytes.byteLength <= INLINE_GEOMETRY_MAX_BYTES) {
      try {
        geometry = await ctx.geometry.extract({ name: f.name, bytes: f.bytes });
      } catch (e) {
        ctx.logger.warn("rfq.geometry_failed", {
          rfqId,
          fileId: id,
          error: String(e).slice(0, 200),
        });
      }
    }
  } else {
    try {
      extractedText = (await ctx.converter.toMarkdown({ name: f.name, mimeType, bytes: f.bytes }))
        .markdown;
    } catch (e) {
      conversionError = e instanceof Error ? e.message.slice(0, 300) : "Could not read this file";
    }
  }
  await ctx.db.insert(rfqFiles).values({
    id,
    orgId,
    rfqId,
    r2Key,
    fileName: f.name.slice(0, 200),
    mimeType,
    sizeBytes: f.bytes.byteLength,
    sha256: await sha256Hex(f.bytes),
    extractedText,
    pageCount,
    conversionError,
    geometry,
  });
}

export async function addFiles(
  ctx: AppContext,
  orgId: string,
  rfqId: string,
  files: UploadedFile[],
) {
  await getRfqRow(ctx, orgId, rfqId);
  const existing = await ctx.db
    .select({ id: rfqFiles.id })
    .from(rfqFiles)
    .where(and(eq(rfqFiles.orgId, orgId), eq(rfqFiles.rfqId, rfqId)))
    .all();
  if (existing.length + files.length > MAX_FILES)
    throw badRequest(`At most ${MAX_FILES} files per RFQ`);
  for (const f of files) {
    if (f.bytes.byteLength > MAX_FILE_BYTES) throw badRequest(`${f.name} is larger than 15 MB`);
    if (!DOC_MIMES.has(mimeOf(f)) && !isCadFile(f.name)) {
      throw badRequest(`${f.name}: upload PDF drawings, text, images or CAD files`);
    }
  }
  for (const f of files) await addFile(ctx, orgId, rfqId, f);
  return getRfq(ctx, orgId, rfqId);
}

async function getRfqRow(ctx: AppContext, orgId: string, rfqId: string) {
  const row = await ctx.db
    .select()
    .from(rfqs)
    .where(and(eq(rfqs.id, rfqId), eq(rfqs.orgId, orgId)))
    .get();
  if (!row) throw notFound("RFQ");
  return row;
}

export async function listRfqs(ctx: AppContext, orgId: string, status?: string) {
  const rows = await ctx.db
    .select()
    .from(rfqs)
    .where(
      status
        ? and(eq(rfqs.orgId, orgId), eq(rfqs.status, status as typeof rfqs.$inferSelect.status))
        : eq(rfqs.orgId, orgId),
    )
    .orderBy(desc(rfqs.createdAt))
    .limit(200)
    .all();
  return rows.map(rfqDto);
}

function rfqDto(r: typeof rfqs.$inferSelect) {
  return {
    id: r.id,
    status: r.status,
    subject: r.subject,
    customerCompany: r.customerCompany,
    customerContact: r.customerContact,
    customerEmail: r.customerEmail,
    bodyText: r.bodyText,
    missingInfo: r.missingInfo,
    extractionWarnings: r.extractionWarnings,
    source: r.source,
    fromAddress: r.fromAddress,
    intakeNotes: r.intakeNotes,
    extractedAt: r.extractedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

function partDto(p: typeof rfqParts.$inferSelect) {
  const { orgId: _o, rfqId: _r, createdAt: _c, updatedAt: _u, ...rest } = p;
  return rest;
}

export async function getRfq(ctx: AppContext, orgId: string, rfqId: string): Promise<RfqDetailDto> {
  const row = await getRfqRow(ctx, orgId, rfqId);
  const [files, parts, qs, counted] = await Promise.all([
    ctx.db
      .select()
      .from(rfqFiles)
      .where(and(eq(rfqFiles.orgId, orgId), eq(rfqFiles.rfqId, rfqId)))
      .orderBy(asc(rfqFiles.createdAt))
      .all(),
    ctx.db
      .select()
      .from(rfqParts)
      .where(and(eq(rfqParts.orgId, orgId), eq(rfqParts.rfqId, rfqId)))
      .orderBy(asc(rfqParts.position), asc(rfqParts.createdAt))
      .all(),
    ctx.db
      .select({ id: quotes.id })
      .from(quotes)
      .where(and(eq(quotes.orgId, orgId), eq(quotes.rfqId, rfqId)))
      .all(),
    ctx.db
      .select({ n: sql<number>`coalesce(sum(${rfqCounts.units}), 0)` })
      .from(rfqCounts)
      .where(and(eq(rfqCounts.orgId, orgId), eq(rfqCounts.rfqId, rfqId)))
      .get(),
  ]);
  const pages = files.reduce((n, f) => n + filePages({ ...f, isCad: isCadFile(f.fileName) }), 0);
  return {
    ...rfqDto(row),
    files: files.map((f) => ({
      id: f.id,
      fileName: f.fileName,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      hasText: !!f.extractedText?.trim(),
      pageCount: f.pageCount,
      conversionError: f.conversionError,
      geometry: f.geometry ?? null,
      geometryPending: geometryPending(f),
      createdAt: f.createdAt.toISOString(),
    })),
    allowance: { pages, units: rfqUnitsForPages(pages), counted: Number(counted?.n ?? 0) },
    parts: parts.map(partDto),
    quoteIds: qs.map((q) => q.id),
  };
}

/** The text the model reads and the verifier checks quotes against. */
export function rfqSourceText(
  rfq: { subject: string | null; bodyText: string },
  files: { fileName: string; extractedText: string | null }[],
): string {
  const parts: string[] = [];
  if (rfq.subject) parts.push(`Subject: ${rfq.subject}`);
  if (rfq.bodyText.trim()) parts.push(rfq.bodyText.trim());
  for (const f of files) {
    if (f.extractedText?.trim()) {
      parts.push(`--- Attachment: ${f.fileName} ---\n${f.extractedText.trim()}`);
    }
  }
  return parts.join("\n\n").slice(0, MAX_SOURCE_CHARS);
}

/**
 * Run the LLM extractor, verify every value against the RFQ text, and replace the unconfirmed
 * extracted parts. Confirmed parts and parts the estimator added by hand are kept.
 */
export async function extractRfq(ctx: AppContext, orgId: string, rfqId: string) {
  const rfq = await getRfqRow(ctx, orgId, rfqId);
  const files = await ctx.db
    .select()
    .from(rfqFiles)
    .where(and(eq(rfqFiles.orgId, orgId), eq(rfqFiles.rfqId, rfqId)))
    .all();
  const source = rfqSourceText(rfq, files);
  if (!source.trim()) {
    throw new AppError(422, "no_text", "This RFQ has no readable text to extract from");
  }
  // The first AI read counts against the plan's monthly RFQ allowance; a failed read gives it back.
  const count = await claimRfqRead(ctx, orgId, rfqId);
  const { data } = await ctx.llm
    .generateStructured({
      purpose: "rfq.extract",
      orgId,
      system: RFQ_EXTRACT_SYSTEM,
      context: source,
      prompt: rfqExtractPrompt(),
      schema: llmExtractionSchema,
      effort: "medium",
      maxTokens: 8000,
    })
    .catch(async (e: unknown) => {
      await count.release();
      throw e;
    });
  const verified = verifyExtraction(data, source);
  // Suggestions only from active rate-card rows; the estimator confirms each choice.
  const card = await getRateCardDto(ctx, orgId);
  const activeMaterials = card.materials.filter((m) => m.active);
  const activeFinishing = card.finishingOps.filter((f) => f.active);
  const geometryFiles = files.filter((f) => f.geometry);

  // Unconfirmed extracted parts are replaced; confirmed and hand-entered parts are kept.
  const existing = await ctx.db
    .select({
      id: rfqParts.id,
      position: rfqParts.position,
      origin: rfqParts.origin,
      confirmed: rfqParts.confirmed,
    })
    .from(rfqParts)
    .where(and(eq(rfqParts.orgId, orgId), eq(rfqParts.rfqId, rfqId)))
    .all();
  const stale = existing.filter((p) => p.origin === "llm" && !p.confirmed);
  const staleIds = new Set(stale.map((s) => s.id));
  let position =
    Math.max(-1, ...existing.filter((k) => !staleIds.has(k.id)).map((k) => k.position)) + 1;

  const stmts = [];
  if (staleIds.size > 0) {
    stmts.push(
      ctx.db.delete(rfqParts).where(
        and(
          eq(rfqParts.orgId, orgId),
          inArray(rfqParts.id, [...staleIds]),
          // A part confirmed while the model was running is kept.
          eq(rfqParts.origin, "llm"),
          eq(rfqParts.confirmed, false),
        ),
      ),
    );
  }
  for (const p of verified.parts) {
    const geometryFile = geometryFileFor(p.partNumber, geometryFiles, verified.parts.length);
    stmts.push(
      ctx.db.insert(rfqParts).values({
        id: newId("prt"),
        orgId,
        rfqId,
        position: position++,
        partNumber: p.partNumber,
        revision: p.revision,
        description: p.description,
        materialText: p.materialText,
        materialId: matchMaterial(p.materialText, activeMaterials),
        quantities: p.quantities,
        tolerances: p.tolerances,
        finishText: p.finishText,
        finishingOpIds: matchFinishingOps(p.finishText, activeFinishing),
        dueDate: p.dueDate,
        sources: p.sources,
        origin: "llm",
        confirmed: false,
        geometryFileId: geometryFile?.id ?? null,
      }),
    );
  }
  stmts.push(
    ctx.db
      .update(rfqs)
      .set({
        status: rfq.status === "new" ? "extracted" : rfq.status,
        customerCompany: rfq.customerCompany ?? verified.customer.company,
        customerContact: rfq.customerContact ?? verified.customer.contactName,
        customerEmail: rfq.customerEmail ?? verified.customer.email,
        missingInfo: verified.missingInfo,
        extractionWarnings: verified.warnings,
        extractedAt: ctx.now(),
      })
      .where(and(eq(rfqs.id, rfqId), eq(rfqs.orgId, orgId))),
  );
  const [first, ...rest] = stmts;
  if (first) await ctx.db.batch([first, ...rest]);
  ctx.logger.info("rfq.extracted", {
    orgId,
    rfqId,
    parts: verified.parts.length,
    warnings: verified.warnings.length,
  });
  // A read that used allowance may cross 80% or 100% of the month's: tell the shop's admins once.
  if (count.units > 0) {
    const [{ plan }, used] = await Promise.all([orgPlan(ctx, orgId), usage(ctx, orgId)]);
    await notifyAllowanceUsage(ctx, orgId, plan, used.rfqsThisMonth, ctx.now());
  }
  return getRfq(ctx, orgId, rfqId);
}

export async function updateRfq(
  ctx: AppContext,
  orgId: string,
  rfqId: string,
  patch: Partial<
    Pick<
      typeof rfqs.$inferInsert,
      "subject" | "customerCompany" | "customerContact" | "customerEmail" | "status"
    >
  >,
) {
  await getRfqRow(ctx, orgId, rfqId);
  if (Object.keys(patch).length > 0) {
    await ctx.db
      .update(rfqs)
      .set(patch)
      .where(and(eq(rfqs.id, rfqId), eq(rfqs.orgId, orgId)));
  }
  return getRfq(ctx, orgId, rfqId);
}

type PartPatch = Partial<
  Omit<typeof rfqParts.$inferInsert, "id" | "orgId" | "rfqId" | "sources" | "origin">
>;

async function assertRateRefs(ctx: AppContext, orgId: string, patch: PartPatch) {
  if (patch.materialId === undefined && patch.finishingOpIds === undefined) return;
  const card = await loadRateCard(ctx, orgId);
  if (patch.materialId && !card.materials.some((m) => m.id === patch.materialId)) {
    throw badRequest("Material is not on your rate card");
  }
  for (const id of patch.finishingOpIds ?? []) {
    if (!card.finishingOps.some((f) => f.id === id)) {
      throw badRequest("Finishing operation is not on your rate card");
    }
  }
}

export async function addPart(ctx: AppContext, orgId: string, rfqId: string, patch: PartPatch) {
  await getRfqRow(ctx, orgId, rfqId);
  await assertRateRefs(ctx, orgId, patch);
  const existing = await ctx.db
    .select({ position: rfqParts.position })
    .from(rfqParts)
    .where(and(eq(rfqParts.orgId, orgId), eq(rfqParts.rfqId, rfqId)))
    .all();
  const id = newId("prt");
  await ctx.db.insert(rfqParts).values({
    ...patch,
    id,
    orgId,
    rfqId,
    position: Math.max(-1, ...existing.map((e) => e.position)) + 1,
    origin: "user",
  });
  return getRfq(ctx, orgId, rfqId);
}

export async function updatePart(
  ctx: AppContext,
  orgId: string,
  rfqId: string,
  partId: string,
  patch: PartPatch,
) {
  await assertRateRefs(ctx, orgId, patch);
  if (Object.keys(patch).length === 0) return getRfq(ctx, orgId, rfqId);
  const res = await ctx.db
    .update(rfqParts)
    .set(patch)
    .where(and(eq(rfqParts.id, partId), eq(rfqParts.rfqId, rfqId), eq(rfqParts.orgId, orgId)))
    .returning({ id: rfqParts.id });
  if (res.length === 0) throw notFound("Part");
  return getRfq(ctx, orgId, rfqId);
}

export async function deletePart(ctx: AppContext, orgId: string, rfqId: string, partId: string) {
  const res = await ctx.db
    .delete(rfqParts)
    .where(and(eq(rfqParts.id, partId), eq(rfqParts.rfqId, rfqId), eq(rfqParts.orgId, orgId)))
    .returning({ id: rfqParts.id });
  if (res.length === 0) throw notFound("Part");
  return getRfq(ctx, orgId, rfqId);
}

/**
 * The measured CAD file a part's geometry comes from: the first whose name contains the part
 * number, else the only measured file when the RFQ has a single part. Null when neither holds.
 */
export function geometryFileFor<F extends { fileName: string }>(
  partNumber: string | null,
  geometryFiles: readonly F[],
  partCount: number,
): F | null {
  const named = partNumber
    ? geometryFiles.find((f) => normalize(f.fileName).includes(normalize(partNumber)))
    : undefined;
  return (
    named ?? (partCount === 1 && geometryFiles.length === 1 ? (geometryFiles[0] ?? null) : null)
  );
}

/** A STEP/DXF file left unmeasured at upload because of its size, and not yet tried since. */
export function geometryPending(f: {
  fileName: string;
  sizeBytes: number;
  geometry: unknown;
  conversionError: string | null;
}): boolean {
  return (
    isMeasuredCadFile(f.fileName) &&
    f.sizeBytes > INLINE_GEOMETRY_MAX_BYTES &&
    f.sizeBytes <= MAX_MEASURE_BYTES &&
    !f.geometry &&
    !f.conversionError
  );
}

/** Stored at upload on a CAD file over MAX_MEASURE_BYTES; the file itself is kept for download. */
export const TOO_LARGE_TO_MEASURE =
  "Over 6 MB, too large to measure here; enter the blank size and operations by hand, or send the part on its own, without the assembly or PMI, which is usually smaller";

/** Stored on a file whose measuring was tried and gave nothing (so "Measure" is not offered again). */
export const MEASURE_FAILED =
  "Could not measure this CAD file; enter the blank size and operations by hand";

/**
 * Measure one CAD file that was too large to measure at upload, in a request of its own: if it runs
 * out of CPU, only this request fails and the file stays pending. On success, parts of the RFQ with
 * no geometry yet are linked to it by the same rule as extraction, so a quote made afterwards gets
 * the CAD suggestions (a quote that already exists is not changed).
 */
export async function measureFile(ctx: AppContext, orgId: string, rfqId: string, fileId: string) {
  const f = await ctx.db
    .select()
    .from(rfqFiles)
    .where(and(eq(rfqFiles.id, fileId), eq(rfqFiles.rfqId, rfqId), eq(rfqFiles.orgId, orgId)))
    .get();
  if (!f) throw notFound("File");
  if (!geometryPending(f)) throw conflict("This file is already measured or cannot be measured");
  if (!f.r2Key.startsWith(`orgs/${orgId}/`)) throw conflict("File key outside the tenant prefix");
  const obj = await ctx.env.FILES.get(f.r2Key);
  if (!obj) throw notFound("File");
  let geometry = null;
  try {
    geometry = await ctx.geometry.extract({ name: f.fileName, bytes: await obj.arrayBuffer() });
  } catch (e) {
    ctx.logger.warn("rfq.geometry_failed", { rfqId, fileId, error: String(e).slice(0, 200) });
  }
  await ctx.db
    .update(rfqFiles)
    .set(geometry ? { geometry } : { conversionError: MEASURE_FAILED })
    .where(and(eq(rfqFiles.id, fileId), eq(rfqFiles.orgId, orgId)));
  if (geometry) {
    const [files, parts] = await Promise.all([
      ctx.db
        .select({ id: rfqFiles.id, fileName: rfqFiles.fileName, geometry: rfqFiles.geometry })
        .from(rfqFiles)
        .where(and(eq(rfqFiles.orgId, orgId), eq(rfqFiles.rfqId, rfqId)))
        .orderBy(asc(rfqFiles.createdAt))
        .all(),
      ctx.db
        .select({
          id: rfqParts.id,
          partNumber: rfqParts.partNumber,
          geometryFileId: rfqParts.geometryFileId,
        })
        .from(rfqParts)
        .where(and(eq(rfqParts.orgId, orgId), eq(rfqParts.rfqId, rfqId)))
        .all(),
    ]);
    const measured = files.filter((x) => x.geometry);
    const link = parts.filter(
      (p) =>
        !p.geometryFileId && geometryFileFor(p.partNumber, measured, parts.length)?.id === fileId,
    );
    if (link.length > 0) {
      await ctx.db
        .update(rfqParts)
        .set({ geometryFileId: fileId })
        .where(
          and(
            eq(rfqParts.orgId, orgId),
            inArray(
              rfqParts.id,
              link.map((p) => p.id),
            ),
            isNull(rfqParts.geometryFileId),
          ),
        );
    }
  }
  return getRfq(ctx, orgId, rfqId);
}

/**
 * The estimator says which unit a CAD file that states none (an STL, a DXF without $INSUNITS) was
 * drawn in: the file is measured again in that unit and stored with the units marked as chosen, so
 * quotes made afterwards get its blank and roughing suggestions (a quote that already exists is not
 * changed). Choosing again replaces the earlier choice.
 */
export async function setFileUnits(
  ctx: AppContext,
  orgId: string,
  rfqId: string,
  fileId: string,
  units: CadUnit,
) {
  const f = await ctx.db
    .select()
    .from(rfqFiles)
    .where(and(eq(rfqFiles.id, fileId), eq(rfqFiles.rfqId, rfqId), eq(rfqFiles.orgId, orgId)))
    .get();
  if (!f) throw notFound("File");
  if (!f.geometry?.units) throw conflict("This file states its own units, or is not measured");
  if (!f.r2Key.startsWith(`orgs/${orgId}/`)) throw conflict("File key outside the tenant prefix");
  const obj = await ctx.env.FILES.get(f.r2Key);
  if (!obj) throw notFound("File");
  let geometry = null;
  try {
    geometry = await ctx.geometry.extract({
      name: f.fileName,
      bytes: await obj.arrayBuffer(),
      units,
    });
  } catch (e) {
    ctx.logger.warn("rfq.geometry_units_failed", { rfqId, fileId, error: String(e).slice(0, 200) });
  }
  if (!geometry) throw conflict("Could not measure this file again; enter the blank size by hand");
  await ctx.db
    .update(rfqFiles)
    .set({ geometry })
    .where(and(eq(rfqFiles.id, fileId), eq(rfqFiles.orgId, orgId)));
  return getRfq(ctx, orgId, rfqId);
}

export async function getFile(ctx: AppContext, orgId: string, rfqId: string, fileId: string) {
  const f = await ctx.db
    .select()
    .from(rfqFiles)
    .where(and(eq(rfqFiles.id, fileId), eq(rfqFiles.rfqId, rfqId), eq(rfqFiles.orgId, orgId)))
    .get();
  if (!f) throw notFound("File");
  if (!f.r2Key.startsWith(`orgs/${orgId}/`)) throw conflict("File key outside the tenant prefix");
  const obj = await ctx.env.FILES.get(f.r2Key);
  if (!obj) throw notFound("File");
  return { file: f, body: obj.body };
}
