// Files kept with an RFI: the marked-up sheet or detail the question is about, photos of the
// condition, and the response that comes back (a sketch, an ASI, the RFI returned answered). The
// same rules, bucket and storage limit as change-order files (./change-order-attachments.ts); rows
// in rfi_files, keys under orgs/{orgId}/projects/{projectId}/rfis/{rfiId}/, so deleting the RFI or
// the job clears them. Every member reads; editors add and delete, like the RFI log itself.
//
// Safety, as for the other files: the stored Content-Type comes from the extension allow-list, never
// the browser; downloads are served as attachments with nosniff (routes/org/rfis.ts); every lookup
// filters by org, job and RFI.
import {
  ATTACHMENT_TYPES,
  type AttachmentCategory,
  attachmentProblem,
  cleanFileName,
  extensionOf,
  MAX_ATTACHMENTS_PER_RFI,
  RFI_CATEGORY_LABELS,
} from "@shared/attachments";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import { rfiFiles, rfis } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { orgPlan } from "../billing";
import { type AttachmentDto, type AttachmentListDto, bucket, dto, usedBytes } from "./attachments";

export const rfiPrefix = (orgId: string, projectId: string, rfiId: string) =>
  `orgs/${orgId}/projects/${projectId}/rfis/${rfiId}/`;

/** The kind as the RFI PDF and its packet index print it: the label before any "(...)" detail. */
export const rfiFileKind = (c: AttachmentCategory) => RFI_CATEGORY_LABELS[c].split(" (")[0] ?? c;

/** The files that go to the GC with the RFI: everything but the response, which is theirs. */
export const sentWithRfi = (c: AttachmentCategory) => c !== "signed";

async function assertRfi(ctx: AppContext, orgId: string, projectId: string, rfiId: string) {
  const row = await ctx.db
    .select({ id: rfis.id, number: rfis.number })
    .from(rfis)
    .where(and(eq(rfis.id, rfiId), eq(rfis.orgId, orgId), eq(rfis.projectId, projectId)))
    .get();
  if (!row) throw notFound("RFI");
  return row;
}

const rowsOf = (ctx: AppContext, orgId: string, projectId: string, rfiId: string) =>
  ctx.db
    .select()
    .from(rfiFiles)
    .where(
      and(eq(rfiFiles.orgId, orgId), eq(rfiFiles.projectId, projectId), eq(rfiFiles.rfiId, rfiId)),
    )
    .orderBy(desc(rfiFiles.createdAt));

export async function listRfiFiles(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  rfiId: string,
): Promise<AttachmentListDto> {
  await assertRfi(ctx, orgId, projectId, rfiId);
  const [rows, used, { plan }] = await Promise.all([
    rowsOf(ctx, orgId, projectId, rfiId),
    usedBytes(ctx, orgId),
    orgPlan(ctx, orgId),
  ]);
  return {
    items: rows.map(dto),
    storage: { usedBytes: used, limitBytes: plan.attachmentStorageBytes },
    enabled: Boolean(ctx.env.FILES),
  };
}

/** Every file row of one RFI, oldest first: the PDF's "Attached" list and the packet's order. */
export function rfiFileRows(ctx: AppContext, orgId: string, projectId: string, rfiId: string) {
  return ctx.db
    .select()
    .from(rfiFiles)
    .where(
      and(eq(rfiFiles.orgId, orgId), eq(rfiFiles.projectId, projectId), eq(rfiFiles.rfiId, rfiId)),
    )
    .orderBy(asc(rfiFiles.createdAt), asc(rfiFiles.id))
    .all();
}

/** Files per RFI on a job, for the log's "Files (n)" link. */
export async function rfiFileCounts(
  ctx: AppContext,
  orgId: string,
  projectId: string,
): Promise<Map<string, number>> {
  const rows = await ctx.db
    .select({ rfiId: rfiFiles.rfiId, n: sql<number>`count(*)` })
    .from(rfiFiles)
    .where(and(eq(rfiFiles.orgId, orgId), eq(rfiFiles.projectId, projectId)))
    .groupBy(rfiFiles.rfiId)
    .all();
  return new Map(rows.map((r) => [r.rfiId, Number(r.n)]));
}

export async function addRfiFile(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  rfiId: string,
  input: { file: File; category: AttachmentCategory },
  userId: string,
): Promise<{ file: AttachmentDto; rfiNumber: number }> {
  const files = bucket(ctx);
  const rfi = await assertRfi(ctx, orgId, projectId, rfiId);
  const [existing, used, { plan }] = await Promise.all([
    rowsOf(ctx, orgId, projectId, rfiId),
    usedBytes(ctx, orgId),
    orgPlan(ctx, orgId),
  ]);
  const problem = attachmentProblem(
    { name: input.file.name, sizeBytes: input.file.size },
    existing.length,
    { usedBytes: used, limitBytes: plan.attachmentStorageBytes },
    { max: MAX_ATTACHMENTS_PER_RFI, noun: "RFI" },
  );
  if (problem) throw badRequest(problem);

  const fileName = cleanFileName(input.file.name);
  const contentType = ATTACHMENT_TYPES[extensionOf(fileName)] as string;
  const id = newId("att");
  const r2Key = `${rfiPrefix(orgId, projectId, rfiId)}${id}`;
  await files.put(r2Key, input.file.stream(), {
    httpMetadata: { contentType },
    customMetadata: { orgId, rfiId },
  });
  try {
    const [row] = await ctx.db
      .insert(rfiFiles)
      .values({
        id,
        orgId,
        projectId,
        rfiId,
        r2Key,
        fileName,
        contentType,
        sizeBytes: input.file.size,
        category: input.category,
        createdBy: userId,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return { file: dto(row), rfiNumber: rfi.number };
  } catch (e) {
    // The RFI was deleted mid-upload, or D1 failed: never leave an object no row owns.
    await files.delete(r2Key).catch(() => undefined);
    throw e;
  }
}

async function findRow(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  rfiId: string,
  fileId: string | undefined,
) {
  const row = await ctx.db
    .select()
    .from(rfiFiles)
    .where(
      and(
        eq(rfiFiles.id, fileId ?? ""),
        eq(rfiFiles.orgId, orgId),
        eq(rfiFiles.projectId, projectId),
        eq(rfiFiles.rfiId, rfiId),
      ),
    )
    .get();
  if (!row) throw notFound("Attachment");
  return row;
}

export async function getRfiFile(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  rfiId: string,
  fileId: string | undefined,
) {
  const files = bucket(ctx);
  const row = await findRow(ctx, orgId, projectId, rfiId, fileId);
  const object = await files.get(row.r2Key);
  if (!object) throw notFound("Attachment file");
  return { row: dto(row), body: object.body };
}

export async function deleteRfiFile(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  rfiId: string,
  fileId: string | undefined,
) {
  const files = bucket(ctx);
  const rfi = await assertRfi(ctx, orgId, projectId, rfiId);
  const row = await findRow(ctx, orgId, projectId, rfiId, fileId);
  await ctx.db.delete(rfiFiles).where(and(eq(rfiFiles.id, row.id), eq(rfiFiles.orgId, orgId)));
  await files.delete(row.r2Key);
  return { row, rfiNumber: rfi.number };
}
