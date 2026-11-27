// Files kept with one of the company's documents (services/company-documents.ts): the license card,
// the surety's bonding letter PDF, the EMR letter, a signed W-9 when the contractor chooses to keep it
// here. Every plan, like the documents themselves; the same type rules, bucket and storage limit as
// the other files (./payapps/attachments.ts); rows in company_document_files, keys under
// orgs/{orgId}/documents/{documentId}/. A file can be copied onto a pay application as backup, since
// many GCs want the license or W-9 with the first application.
//
// Safety, as for the other files: the stored Content-Type comes from the extension allow-list, never
// the browser; downloads are served as attachments with nosniff (routes/org/company-documents.ts);
// every lookup filters by org and document. A W-9's file needs W9_FILE_CONSENT_FIELD=yes
// (src/shared/company-documents.ts), since the signed form shows the taxpayer identification number.
import {
  ATTACHMENT_TYPES,
  type AttachmentCategory,
  attachmentProblem,
  cleanFileName,
  extensionOf,
  MAX_ATTACHMENTS_PER_COMPANY_DOCUMENT,
} from "@shared/attachments";
import { documentFileProblem } from "@shared/company-documents";
import { and, desc, eq } from "drizzle-orm";
import type { AppContext } from "../context";
import { companyDocumentFiles, companyDocuments } from "../db/schema";
import { badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { orgPlan } from "./billing";
import {
  type AttachmentDto,
  type AttachmentListDto,
  addAttachment,
  bucket,
  dto,
  purgeFiles,
  usedBytes,
} from "./payapps/attachments";

export const documentPrefix = (orgId: string, documentId: string) =>
  `orgs/${orgId}/documents/${documentId}/`;

async function getDocument(ctx: AppContext, orgId: string, documentId: string) {
  const row = await ctx.db
    .select({ id: companyDocuments.id, kind: companyDocuments.kind })
    .from(companyDocuments)
    .where(and(eq(companyDocuments.id, documentId), eq(companyDocuments.orgId, orgId)))
    .get();
  if (!row) throw notFound("Company document");
  return row;
}

const rowsOf = (ctx: AppContext, orgId: string, documentId: string) =>
  ctx.db
    .select()
    .from(companyDocumentFiles)
    .where(
      and(eq(companyDocumentFiles.orgId, orgId), eq(companyDocumentFiles.documentId, documentId)),
    )
    .orderBy(desc(companyDocumentFiles.createdAt));

export async function listDocumentFiles(
  ctx: AppContext,
  orgId: string,
  documentId: string,
): Promise<AttachmentListDto> {
  await getDocument(ctx, orgId, documentId);
  const [rows, used, { plan }] = await Promise.all([
    rowsOf(ctx, orgId, documentId),
    usedBytes(ctx, orgId),
    orgPlan(ctx, orgId),
  ]);
  return {
    items: rows.map(dto),
    storage: { usedBytes: used, limitBytes: plan.attachmentStorageBytes },
    enabled: Boolean(ctx.env.FILES),
  };
}

/** Each document's files, for the list's "Files (2)" links and the pay application's offer. */
export async function documentFilesByDocument(
  ctx: AppContext,
  orgId: string,
): Promise<Map<string, AttachmentDto[]>> {
  const rows = await ctx.db
    .select()
    .from(companyDocumentFiles)
    .where(eq(companyDocumentFiles.orgId, orgId))
    .orderBy(desc(companyDocumentFiles.createdAt))
    .all();
  const out = new Map<string, AttachmentDto[]>();
  for (const r of rows) out.set(r.documentId, [...(out.get(r.documentId) ?? []), dto(r)]);
  return out;
}

export async function addDocumentFile(
  ctx: AppContext,
  orgId: string,
  documentId: string,
  input: { file: File; category: AttachmentCategory; consent: string | null },
  userId: string,
): Promise<AttachmentDto> {
  const files = bucket(ctx);
  const doc = await getDocument(ctx, orgId, documentId);
  const refused = documentFileProblem(doc.kind, input.consent);
  if (refused) throw badRequest(refused);
  const [existing, used, { plan }] = await Promise.all([
    rowsOf(ctx, orgId, documentId),
    usedBytes(ctx, orgId),
    orgPlan(ctx, orgId),
  ]);
  const problem = attachmentProblem(
    { name: input.file.name, sizeBytes: input.file.size },
    existing.length,
    { usedBytes: used, limitBytes: plan.attachmentStorageBytes },
    { max: MAX_ATTACHMENTS_PER_COMPANY_DOCUMENT, noun: "document" },
  );
  if (problem) throw badRequest(problem);

  const fileName = cleanFileName(input.file.name);
  const contentType = ATTACHMENT_TYPES[extensionOf(fileName)] as string;
  const id = newId("att");
  const r2Key = `${documentPrefix(orgId, documentId)}${id}`;
  await files.put(r2Key, input.file.stream(), {
    httpMetadata: { contentType },
    customMetadata: { orgId, documentId },
  });
  try {
    const [row] = await ctx.db
      .insert(companyDocumentFiles)
      .values({
        id,
        orgId,
        documentId,
        r2Key,
        fileName,
        contentType,
        sizeBytes: input.file.size,
        category: input.category,
        createdBy: userId,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return dto(row);
  } catch (e) {
    // The document was deleted mid-upload, or D1 failed: never leave an object no row owns.
    await files.delete(r2Key).catch(() => undefined);
    throw e;
  }
}

async function findRow(
  ctx: AppContext,
  orgId: string,
  documentId: string,
  fileId: string | undefined,
) {
  const row = await ctx.db
    .select()
    .from(companyDocumentFiles)
    .where(
      and(
        eq(companyDocumentFiles.id, fileId ?? ""),
        eq(companyDocumentFiles.orgId, orgId),
        eq(companyDocumentFiles.documentId, documentId),
      ),
    )
    .get();
  if (!row) throw notFound("Attachment");
  return row;
}

export async function getDocumentFile(
  ctx: AppContext,
  orgId: string,
  documentId: string,
  fileId: string | undefined,
) {
  const files = bucket(ctx);
  const row = await findRow(ctx, orgId, documentId, fileId);
  const object = await files.get(row.r2Key);
  if (!object) throw notFound("Attachment file");
  return { row: dto(row), body: object.body };
}

export async function deleteDocumentFile(
  ctx: AppContext,
  orgId: string,
  documentId: string,
  fileId: string | undefined,
) {
  const files = bucket(ctx);
  const row = await findRow(ctx, orgId, documentId, fileId);
  await ctx.db
    .delete(companyDocumentFiles)
    .where(and(eq(companyDocumentFiles.id, row.id), eq(companyDocumentFiles.orgId, orgId)));
  await files.delete(row.r2Key);
  return row;
}

/** The objects of a deleted document (its rows cascade in D1). */
export const purgeDocumentFiles = (ctx: AppContext, orgId: string, documentId: string) =>
  purgeFiles(ctx, documentPrefix(orgId, documentId));

/**
 * Copies one document file onto a pay application as backup (a copy, so deleting either one later
 * leaves the other). It counts against the storage limit again, like any upload, and the pay
 * application's own file limit applies.
 */
export async function copyDocumentFileToPayApp(
  ctx: AppContext,
  orgId: string,
  target: { projectId: string; payAppId: string },
  source: { documentId: string; fileId: string },
  userId: string,
): Promise<AttachmentDto> {
  const files = bucket(ctx);
  const row = await findRow(ctx, orgId, source.documentId, source.fileId);
  const object = await files.get(row.r2Key);
  if (!object) throw notFound("Attachment file");
  const file = new File([await object.arrayBuffer()], row.fileName, { type: row.contentType });
  return addAttachment(
    ctx,
    orgId,
    target.projectId,
    target.payAppId,
    { file, category: "backup" },
    userId,
  );
}
