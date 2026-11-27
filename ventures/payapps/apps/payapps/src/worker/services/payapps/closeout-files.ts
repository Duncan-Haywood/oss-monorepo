// Files kept with a close-out document: the document itself as sent (warranty letter, O&M manual,
// as-built set, test report), photos (attic stock delivered, tags on installed equipment), and the
// GC's receipt or acceptance when it comes back. The same rules, bucket and storage limit as RFI
// files (./rfi-files.ts); rows in closeout_files, keys under
// orgs/{orgId}/projects/{projectId}/closeout/{itemId}/, so deleting the item or the job clears them.
// Every member reads; editors add and delete, like the checklist itself.
//
// Safety, as for the other files: the stored Content-Type comes from the extension allow-list, never
// the browser; downloads are served as attachments with nosniff (routes/org/closeout.ts); every
// lookup filters by org, job and item.
import {
  ATTACHMENT_TYPES,
  type AttachmentCategory,
  attachmentProblem,
  CLOSEOUT_CATEGORY_LABELS,
  cleanFileName,
  extensionOf,
  MAX_ATTACHMENTS_PER_CLOSEOUT_ITEM,
} from "@shared/attachments";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import { closeoutFiles, closeoutItems } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { storageLimitBytes } from "../../ports/file-store";
import { orgPlan } from "../billing";
import { type AttachmentDto, type AttachmentListDto, bucket, dto, usedBytes } from "./attachments";

export const closeoutPrefix = (orgId: string, projectId: string, itemId: string) =>
  `orgs/${orgId}/projects/${projectId}/closeout/${itemId}/`;

/** The kind as the binder's index prints it: the label before any "(...)" detail. */
export const closeoutFileKind = (c: AttachmentCategory) =>
  CLOSEOUT_CATEGORY_LABELS[c].split(" (")[0] ?? c;

/** The files that go in the close-out binder: all but the GC's own receipt or acceptance. */
export const inCloseoutBinder = (c: AttachmentCategory) => c !== "signed";

async function assertItem(ctx: AppContext, orgId: string, projectId: string, itemId: string) {
  const row = await ctx.db
    .select({ id: closeoutItems.id, title: closeoutItems.title })
    .from(closeoutItems)
    .where(
      and(
        eq(closeoutItems.id, itemId),
        eq(closeoutItems.orgId, orgId),
        eq(closeoutItems.projectId, projectId),
      ),
    )
    .get();
  if (!row) throw notFound("Close-out document");
  return row;
}

const rowsOf = (ctx: AppContext, orgId: string, projectId: string, itemId: string) =>
  ctx.db
    .select()
    .from(closeoutFiles)
    .where(
      and(
        eq(closeoutFiles.orgId, orgId),
        eq(closeoutFiles.projectId, projectId),
        eq(closeoutFiles.itemId, itemId),
      ),
    )
    .orderBy(desc(closeoutFiles.createdAt));

export async function listCloseoutFiles(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  itemId: string,
): Promise<AttachmentListDto> {
  await assertItem(ctx, orgId, projectId, itemId);
  const [rows, used, { plan }] = await Promise.all([
    rowsOf(ctx, orgId, projectId, itemId),
    usedBytes(ctx, orgId),
    orgPlan(ctx, orgId),
  ]);
  return {
    items: rows.map(dto),
    storage: { usedBytes: used, limitBytes: storageLimitBytes(ctx.env, plan) },
    enabled: Boolean(ctx.env.FILES),
  };
}

/** Every file row of one document, oldest first: its order in the binder. */
export function closeoutFileRows(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  itemId: string,
) {
  return ctx.db
    .select()
    .from(closeoutFiles)
    .where(
      and(
        eq(closeoutFiles.orgId, orgId),
        eq(closeoutFiles.projectId, projectId),
        eq(closeoutFiles.itemId, itemId),
      ),
    )
    .orderBy(asc(closeoutFiles.createdAt), asc(closeoutFiles.id))
    .all();
}

/** Files per close-out document on a job, for the checklist's "Files (n)" link. */
export async function closeoutFileCounts(
  ctx: AppContext,
  orgId: string,
  projectId: string,
): Promise<Map<string, number>> {
  const rows = await ctx.db
    .select({ itemId: closeoutFiles.itemId, n: sql<number>`count(*)` })
    .from(closeoutFiles)
    .where(and(eq(closeoutFiles.orgId, orgId), eq(closeoutFiles.projectId, projectId)))
    .groupBy(closeoutFiles.itemId)
    .all();
  return new Map(rows.map((r) => [r.itemId, Number(r.n)]));
}

export async function addCloseoutFile(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  itemId: string,
  input: { file: File; category: AttachmentCategory },
  userId: string,
): Promise<{ file: AttachmentDto; title: string }> {
  const files = bucket(ctx);
  const item = await assertItem(ctx, orgId, projectId, itemId);
  const [existing, used, { plan }] = await Promise.all([
    rowsOf(ctx, orgId, projectId, itemId),
    usedBytes(ctx, orgId),
    orgPlan(ctx, orgId),
  ]);
  const problem = attachmentProblem(
    { name: input.file.name, sizeBytes: input.file.size },
    existing.length,
    { usedBytes: used, limitBytes: storageLimitBytes(ctx.env, plan) },
    { max: MAX_ATTACHMENTS_PER_CLOSEOUT_ITEM, noun: "close-out document" },
  );
  if (problem) throw badRequest(problem);

  const fileName = cleanFileName(input.file.name);
  const contentType = ATTACHMENT_TYPES[extensionOf(fileName)] as string;
  const id = newId("att");
  const r2Key = `${closeoutPrefix(orgId, projectId, itemId)}${id}`;
  await files.put(r2Key, input.file.stream(), {
    httpMetadata: { contentType },
    customMetadata: { orgId, itemId },
  });
  try {
    const [row] = await ctx.db
      .insert(closeoutFiles)
      .values({
        id,
        orgId,
        projectId,
        itemId,
        r2Key,
        fileName,
        contentType,
        sizeBytes: input.file.size,
        category: input.category,
        createdBy: userId,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return { file: dto(row), title: item.title };
  } catch (e) {
    // The item was deleted mid-upload, or D1 failed: never leave an object no row owns.
    await files.delete(r2Key).catch(() => undefined);
    throw e;
  }
}

async function findRow(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  itemId: string,
  fileId: string | undefined,
) {
  const row = await ctx.db
    .select()
    .from(closeoutFiles)
    .where(
      and(
        eq(closeoutFiles.id, fileId ?? ""),
        eq(closeoutFiles.orgId, orgId),
        eq(closeoutFiles.projectId, projectId),
        eq(closeoutFiles.itemId, itemId),
      ),
    )
    .get();
  if (!row) throw notFound("Attachment");
  return row;
}

export async function getCloseoutFile(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  itemId: string,
  fileId: string | undefined,
) {
  const files = bucket(ctx);
  const row = await findRow(ctx, orgId, projectId, itemId, fileId);
  const object = await files.get(row.r2Key);
  if (!object) throw notFound("Attachment file");
  return { row: dto(row), body: object.body };
}

export async function deleteCloseoutFile(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  itemId: string,
  fileId: string | undefined,
) {
  const files = bucket(ctx);
  const item = await assertItem(ctx, orgId, projectId, itemId);
  const row = await findRow(ctx, orgId, projectId, itemId, fileId);
  await ctx.db
    .delete(closeoutFiles)
    .where(and(eq(closeoutFiles.id, row.id), eq(closeoutFiles.orgId, orgId)));
  await files.delete(row.r2Key);
  return { row, title: item.title };
}
