// Files kept with one of the company's insurance certificates (services/insurance.ts): the
// certificate PDF the agent sends (usually an ACORD 25), the endorsements a subcontract asks for with
// it, the policy pages. Every plan, like the certificates themselves; the same type rules, bucket and
// storage limit as the other files (./payapps/attachments.ts); rows in insurance_certificate_files,
// keys under orgs/{orgId}/insurance/{certificateId}/. A file can be copied onto a pay application as
// backup, since many GCs want the current certificate with each application.
//
// Safety, as for the other files: the stored Content-Type comes from the extension allow-list, never
// the browser; downloads are served as attachments with nosniff (routes/org/insurance.ts); every
// lookup filters by org and certificate.
import {
  ATTACHMENT_TYPES,
  type AttachmentCategory,
  attachmentProblem,
  cleanFileName,
  extensionOf,
  MAX_ATTACHMENTS_PER_CERTIFICATE,
} from "@shared/attachments";
import { and, desc, eq } from "drizzle-orm";
import type { AppContext } from "../context";
import { insuranceCertificateFiles, insuranceCertificates } from "../db/schema";
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

export const certificatePrefix = (orgId: string, certificateId: string) =>
  `orgs/${orgId}/insurance/${certificateId}/`;

async function assertCertificate(ctx: AppContext, orgId: string, certificateId: string) {
  const row = await ctx.db
    .select({ id: insuranceCertificates.id })
    .from(insuranceCertificates)
    .where(and(eq(insuranceCertificates.id, certificateId), eq(insuranceCertificates.orgId, orgId)))
    .get();
  if (!row) throw notFound("Insurance certificate");
}

const rowsOf = (ctx: AppContext, orgId: string, certificateId: string) =>
  ctx.db
    .select()
    .from(insuranceCertificateFiles)
    .where(
      and(
        eq(insuranceCertificateFiles.orgId, orgId),
        eq(insuranceCertificateFiles.certificateId, certificateId),
      ),
    )
    .orderBy(desc(insuranceCertificateFiles.createdAt));

export async function listCertificateFiles(
  ctx: AppContext,
  orgId: string,
  certificateId: string,
): Promise<AttachmentListDto> {
  await assertCertificate(ctx, orgId, certificateId);
  const [rows, used, { plan }] = await Promise.all([
    rowsOf(ctx, orgId, certificateId),
    usedBytes(ctx, orgId),
    orgPlan(ctx, orgId),
  ]);
  return {
    items: rows.map(dto),
    storage: { usedBytes: used, limitBytes: plan.attachmentStorageBytes },
    enabled: Boolean(ctx.env.FILES),
  };
}

/** Each certificate's files, for the list's "Files (2)" links and the pay application's offer. */
export async function certificateFilesByCertificate(
  ctx: AppContext,
  orgId: string,
): Promise<Map<string, AttachmentDto[]>> {
  const rows = await ctx.db
    .select()
    .from(insuranceCertificateFiles)
    .where(eq(insuranceCertificateFiles.orgId, orgId))
    .orderBy(desc(insuranceCertificateFiles.createdAt))
    .all();
  const out = new Map<string, AttachmentDto[]>();
  for (const r of rows) out.set(r.certificateId, [...(out.get(r.certificateId) ?? []), dto(r)]);
  return out;
}

export async function addCertificateFile(
  ctx: AppContext,
  orgId: string,
  certificateId: string,
  input: { file: File; category: AttachmentCategory },
  userId: string,
): Promise<AttachmentDto> {
  const files = bucket(ctx);
  await assertCertificate(ctx, orgId, certificateId);
  const [existing, used, { plan }] = await Promise.all([
    rowsOf(ctx, orgId, certificateId),
    usedBytes(ctx, orgId),
    orgPlan(ctx, orgId),
  ]);
  const problem = attachmentProblem(
    { name: input.file.name, sizeBytes: input.file.size },
    existing.length,
    { usedBytes: used, limitBytes: plan.attachmentStorageBytes },
    { max: MAX_ATTACHMENTS_PER_CERTIFICATE, noun: "certificate" },
  );
  if (problem) throw badRequest(problem);

  const fileName = cleanFileName(input.file.name);
  const contentType = ATTACHMENT_TYPES[extensionOf(fileName)] as string;
  const id = newId("att");
  const r2Key = `${certificatePrefix(orgId, certificateId)}${id}`;
  await files.put(r2Key, input.file.stream(), {
    httpMetadata: { contentType },
    customMetadata: { orgId, certificateId },
  });
  try {
    const [row] = await ctx.db
      .insert(insuranceCertificateFiles)
      .values({
        id,
        orgId,
        certificateId,
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
    // The certificate was deleted mid-upload, or D1 failed: never leave an object no row owns.
    await files.delete(r2Key).catch(() => undefined);
    throw e;
  }
}

async function findRow(
  ctx: AppContext,
  orgId: string,
  certificateId: string,
  fileId: string | undefined,
) {
  const row = await ctx.db
    .select()
    .from(insuranceCertificateFiles)
    .where(
      and(
        eq(insuranceCertificateFiles.id, fileId ?? ""),
        eq(insuranceCertificateFiles.orgId, orgId),
        eq(insuranceCertificateFiles.certificateId, certificateId),
      ),
    )
    .get();
  if (!row) throw notFound("Attachment");
  return row;
}

export async function getCertificateFile(
  ctx: AppContext,
  orgId: string,
  certificateId: string,
  fileId: string | undefined,
) {
  const files = bucket(ctx);
  const row = await findRow(ctx, orgId, certificateId, fileId);
  const object = await files.get(row.r2Key);
  if (!object) throw notFound("Attachment file");
  return { row: dto(row), body: object.body };
}

export async function deleteCertificateFile(
  ctx: AppContext,
  orgId: string,
  certificateId: string,
  fileId: string | undefined,
) {
  const files = bucket(ctx);
  const row = await findRow(ctx, orgId, certificateId, fileId);
  await ctx.db
    .delete(insuranceCertificateFiles)
    .where(
      and(eq(insuranceCertificateFiles.id, row.id), eq(insuranceCertificateFiles.orgId, orgId)),
    );
  await files.delete(row.r2Key);
  return row;
}

/** The objects of a deleted certificate (its rows cascade in D1). */
export const purgeCertificateFiles = (ctx: AppContext, orgId: string, certificateId: string) =>
  purgeFiles(ctx, certificatePrefix(orgId, certificateId));

/**
 * Copies one certificate file onto a pay application as backup (a copy, so deleting either one
 * later leaves the other). It counts against the storage limit again, like any upload, and the pay
 * application's own file limit applies.
 */
export async function copyCertificateFileToPayApp(
  ctx: AppContext,
  orgId: string,
  target: { projectId: string; payAppId: string },
  source: { certificateId: string; fileId: string },
  userId: string,
): Promise<AttachmentDto> {
  const files = bucket(ctx);
  const row = await findRow(ctx, orgId, source.certificateId, source.fileId);
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
