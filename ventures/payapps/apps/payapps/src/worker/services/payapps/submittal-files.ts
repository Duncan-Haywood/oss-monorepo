// Files attached to a submittal revision: the product data sheets, shop drawings, calculations and
// certificates sent to the reviewer, photos of a sample or mock-up, and the stamped copy that comes
// back. The same rules, bucket and storage limit as pay-application files (./attachments.ts,
// src/shared/attachments.ts); rows in submittal_files, keys under
// orgs/{orgId}/projects/{projectId}/submittals/{submittalId}/, so deleting the job clears them.
//
// The transmittal lists every file except the returned stamped copy as enclosed, and the packet
// (transmittal + those files) is one PDF to send the reviewer.
//
// Safety, as for pay-app files: the stored Content-Type comes from the extension allow-list, never
// the browser; downloads are served as attachments with nosniff (routes/org/submittals.ts); every
// lookup filters by org, job and submittal.
import {
  ATTACHMENT_TYPES,
  type AttachmentCategory,
  attachmentProblem,
  cleanFileName,
  extensionOf,
  MAX_ATTACHMENTS_PER_SUBMITTAL,
  SUBMITTAL_FILE_KIND,
} from "@shared/attachments";
import {
  defaultTransmittalRequest,
  submittalLabel,
  type TransmittalRequest,
} from "@shared/submittals";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import type { AppContext } from "../../context";
import { submittalFiles, submittals } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { orgPlan } from "../billing";
import { assemblePacket, type PacketResult } from "../export/pdf-merge/packet";
import { transmittalFileName, transmittalPdf } from "../export/submittal-transmittal-pdf";
import { type AttachmentDto, type AttachmentListDto, bucket, dto, usedBytes } from "./attachments";
import { loadSubmittalTransmittal } from "./submittals";

export const submittalPrefix = (orgId: string, projectId: string, submittalId: string) =>
  `orgs/${orgId}/projects/${projectId}/submittals/${submittalId}/`;

async function assertSubmittal(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  submittalId: string,
) {
  const row = await ctx.db
    .select({ id: submittals.id })
    .from(submittals)
    .where(
      and(
        eq(submittals.id, submittalId),
        eq(submittals.orgId, orgId),
        eq(submittals.projectId, projectId),
      ),
    )
    .get();
  if (!row) throw notFound("Submittal");
  return row;
}

const rowsOf = (ctx: AppContext, orgId: string, submittalId: string) =>
  ctx.db
    .select()
    .from(submittalFiles)
    .where(and(eq(submittalFiles.orgId, orgId), eq(submittalFiles.submittalId, submittalId)))
    .orderBy(desc(submittalFiles.createdAt));

export async function listSubmittalFiles(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  submittalId: string,
): Promise<AttachmentListDto> {
  await assertSubmittal(ctx, orgId, projectId, submittalId);
  const [rows, used, { plan }] = await Promise.all([
    rowsOf(ctx, orgId, submittalId),
    usedBytes(ctx, orgId),
    orgPlan(ctx, orgId),
  ]);
  return {
    items: rows.map(dto),
    storage: { usedBytes: used, limitBytes: plan.attachmentStorageBytes },
    enabled: Boolean(ctx.env.FILES),
  };
}

/** What goes to the reviewer: every file but the stamped copy they return, oldest first. */
export const enclosedSubmittalFiles = (
  ctx: AppContext,
  orgId: string,
  projectId: string,
  submittalId: string,
) =>
  ctx.db
    .select()
    .from(submittalFiles)
    .where(
      and(
        eq(submittalFiles.orgId, orgId),
        eq(submittalFiles.projectId, projectId),
        eq(submittalFiles.submittalId, submittalId),
        ne(submittalFiles.category, "signed"),
      ),
    )
    .orderBy(asc(submittalFiles.createdAt), asc(submittalFiles.id))
    .all();

export async function addSubmittalFile(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  submittalId: string,
  input: { file: File; category: AttachmentCategory },
  userId: string,
): Promise<AttachmentDto> {
  const files = bucket(ctx);
  await assertSubmittal(ctx, orgId, projectId, submittalId);
  const [existing, used, { plan }] = await Promise.all([
    rowsOf(ctx, orgId, submittalId),
    usedBytes(ctx, orgId),
    orgPlan(ctx, orgId),
  ]);
  const problem = attachmentProblem(
    { name: input.file.name, sizeBytes: input.file.size },
    existing.length,
    { usedBytes: used, limitBytes: plan.attachmentStorageBytes },
    { max: MAX_ATTACHMENTS_PER_SUBMITTAL, noun: "submittal" },
  );
  if (problem) throw badRequest(problem);

  const fileName = cleanFileName(input.file.name);
  const contentType = ATTACHMENT_TYPES[extensionOf(fileName)] as string;
  const id = newId("att");
  const r2Key = `${submittalPrefix(orgId, projectId, submittalId)}${id}`;
  await files.put(r2Key, input.file.stream(), {
    httpMetadata: { contentType },
    customMetadata: { orgId, submittalId },
  });
  try {
    const [row] = await ctx.db
      .insert(submittalFiles)
      .values({
        id,
        orgId,
        projectId,
        submittalId,
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
    // The submittal was deleted mid-upload, or D1 failed: never leave an object no row owns.
    await files.delete(r2Key).catch(() => undefined);
    throw e;
  }
}

async function findRow(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  submittalId: string,
  fileId: string | undefined,
) {
  const row = await ctx.db
    .select()
    .from(submittalFiles)
    .where(
      and(
        eq(submittalFiles.id, fileId ?? ""),
        eq(submittalFiles.orgId, orgId),
        eq(submittalFiles.projectId, projectId),
        eq(submittalFiles.submittalId, submittalId),
      ),
    )
    .get();
  if (!row) throw notFound("Attachment");
  return row;
}

export async function getSubmittalFile(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  submittalId: string,
  fileId: string | undefined,
) {
  const files = bucket(ctx);
  const row = await findRow(ctx, orgId, projectId, submittalId, fileId);
  const object = await files.get(row.r2Key);
  if (!object) throw notFound("Attachment file");
  return { row: dto(row), body: object.body };
}

export async function deleteSubmittalFile(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  submittalId: string,
  fileId: string | undefined,
) {
  const files = bucket(ctx);
  const row = await findRow(ctx, orgId, projectId, submittalId, fileId);
  await ctx.db
    .delete(submittalFiles)
    .where(and(eq(submittalFiles.id, row.id), eq(submittalFiles.orgId, orgId)));
  await files.delete(row.r2Key);
  return row;
}

/**
 * The transmittal, then an index, then the enclosed files (PDFs page for page, JPEG/PNG photos one
 * to a page), as one PDF to send the reviewer. The stamped copy they return is left out.
 */
export async function buildSubmittalPacket(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  submittalId: string,
  opts: { today: string; requested?: TransmittalRequest | undefined },
): Promise<PacketResult & { fileName: string }> {
  // Loads the transmittal (404 when the submittal is not on this job of this company) first.
  const doc = await loadSubmittalTransmittal(ctx, orgId, projectId, submittalId);
  const rows = await enclosedSubmittalFiles(ctx, orgId, projectId, submittalId);
  const files = rows.length ? bucket(ctx) : null;
  const { project, submittal: s } = doc;
  const label = `Submittal ${submittalLabel(s)}`;
  const result = await assemblePacket({
    lead: transmittalPdf(doc, {
      today: opts.today,
      requested: opts.requested ?? defaultTransmittalRequest(s.type),
    }),
    files: rows.map((r) => ({
      id: r.id,
      name: r.fileName,
      kind: SUBMITTAL_FILE_KIND[r.category],
      contentType: r.contentType,
      sizeBytes: r.sizeBytes,
      load: async () => {
        const object = await files?.get(r.r2Key);
        return object ? new Uint8Array(await object.arrayBuffer()) : null;
      },
    })),
    label,
    title: `${project.name} - ${label} with enclosures`,
    leadName: "the transmittal",
    heading: `Enclosures for submittal ${submittalLabel(s)}`,
    details: [
      `Job: ${project.name}${project.number ? ` (${project.number})` : ""}`,
      `From: ${doc.contractor.name}   To: ${project.gcName}`,
      `Submittal: ${s.specSection ? `${s.specSection} ` : ""}${s.title}`,
    ],
  });
  return { ...result, fileName: transmittalFileName(doc).replace(/\.pdf$/, "-with-files.pdf") };
}
