// Files kept with a T&M ticket: photos of the extra work, the material backup priced on it
// (delivery tickets, receipts, supplier invoices) and a scan of the ticket when the GC signed a paper
// copy. The same rules, bucket and storage limit as daily report files (./daily-report-files.ts);
// rows in tm_ticket_files, keys under orgs/{orgId}/projects/{projectId}/tm-tickets/{ticketId}/, so
// deleting the ticket or the job clears them. Every member reads; editors add and delete, like the
// tickets themselves. A file never changes what the GC signed or what a change order bills, so files
// stay open on signed and billed tickets: a photo found later is still evidence.
//
// Safety, as for the other files: the stored Content-Type comes from the extension allow-list, never
// the browser; downloads are served as attachments with nosniff (routes/org/tm-tickets.ts); every
// lookup filters by org, job and ticket.
import {
  ATTACHMENT_TYPES,
  type AttachmentCategory,
  attachmentProblem,
  cleanFileName,
  extensionOf,
  MAX_ATTACHMENTS_PER_TM_TICKET,
  TM_TICKET_CATEGORY_LABELS,
} from "@shared/attachments";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import { tmTicketFiles, tmTickets } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { storageLimitBytes } from "../../ports/file-store";
import { orgPlan } from "../billing";
import { type AttachmentDto, type AttachmentListDto, bucket, dto, usedBytes } from "./attachments";

export const tmTicketPrefix = (orgId: string, projectId: string, ticketId: string) =>
  `orgs/${orgId}/projects/${projectId}/tm-tickets/${ticketId}/`;

/** The kind as the packet index prints it: the label before any "(...)" detail. */
export const tmTicketFileKind = (c: AttachmentCategory) =>
  TM_TICKET_CATEGORY_LABELS[c].split(" (")[0] ?? c;

async function assertTicket(ctx: AppContext, orgId: string, projectId: string, ticketId: string) {
  const row = await ctx.db
    .select({ id: tmTickets.id, number: tmTickets.number })
    .from(tmTickets)
    .where(
      and(
        eq(tmTickets.id, ticketId),
        eq(tmTickets.orgId, orgId),
        eq(tmTickets.projectId, projectId),
      ),
    )
    .get();
  if (!row) throw notFound("T&M ticket");
  return row;
}

const rowsOf = (ctx: AppContext, orgId: string, projectId: string, ticketId: string) =>
  ctx.db
    .select()
    .from(tmTicketFiles)
    .where(
      and(
        eq(tmTicketFiles.orgId, orgId),
        eq(tmTicketFiles.projectId, projectId),
        eq(tmTicketFiles.ticketId, ticketId),
      ),
    )
    .orderBy(desc(tmTicketFiles.createdAt));

export async function listTmTicketFiles(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  ticketId: string,
): Promise<AttachmentListDto> {
  await assertTicket(ctx, orgId, projectId, ticketId);
  const [rows, used, { plan }] = await Promise.all([
    rowsOf(ctx, orgId, projectId, ticketId),
    usedBytes(ctx, orgId),
    orgPlan(ctx, orgId),
  ]);
  return {
    items: rows.map(dto),
    storage: { usedBytes: used, limitBytes: storageLimitBytes(ctx.env, plan) },
    enabled: Boolean(ctx.env.FILES),
  };
}

/** Every file row of one ticket, oldest first: the packet's order. */
export function tmTicketFileRows(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  ticketId: string,
) {
  return ctx.db
    .select()
    .from(tmTicketFiles)
    .where(
      and(
        eq(tmTicketFiles.orgId, orgId),
        eq(tmTicketFiles.projectId, projectId),
        eq(tmTicketFiles.ticketId, ticketId),
      ),
    )
    .orderBy(asc(tmTicketFiles.createdAt), asc(tmTicketFiles.id))
    .all();
}

/** Files per T&M ticket on a job, for the log's "Photos (n)" link. */
export async function tmTicketFileCounts(
  ctx: AppContext,
  orgId: string,
  projectId: string,
): Promise<Map<string, number>> {
  const rows = await ctx.db
    .select({ ticketId: tmTicketFiles.ticketId, n: sql<number>`count(*)` })
    .from(tmTicketFiles)
    .where(and(eq(tmTicketFiles.orgId, orgId), eq(tmTicketFiles.projectId, projectId)))
    .groupBy(tmTicketFiles.ticketId)
    .all();
  return new Map(rows.map((r) => [r.ticketId, Number(r.n)]));
}

export async function addTmTicketFile(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  ticketId: string,
  input: { file: File; category: AttachmentCategory },
  userId: string,
): Promise<{ file: AttachmentDto; ticketNumber: number }> {
  const files = bucket(ctx);
  const ticket = await assertTicket(ctx, orgId, projectId, ticketId);
  const [existing, used, { plan }] = await Promise.all([
    rowsOf(ctx, orgId, projectId, ticketId),
    usedBytes(ctx, orgId),
    orgPlan(ctx, orgId),
  ]);
  const problem = attachmentProblem(
    { name: input.file.name, sizeBytes: input.file.size },
    existing.length,
    { usedBytes: used, limitBytes: storageLimitBytes(ctx.env, plan) },
    { max: MAX_ATTACHMENTS_PER_TM_TICKET, noun: "T&M ticket" },
  );
  if (problem) throw badRequest(problem);

  const fileName = cleanFileName(input.file.name);
  const contentType = ATTACHMENT_TYPES[extensionOf(fileName)] as string;
  const id = newId("att");
  const r2Key = `${tmTicketPrefix(orgId, projectId, ticketId)}${id}`;
  await files.put(r2Key, input.file.stream(), {
    httpMetadata: { contentType },
    customMetadata: { orgId, ticketId },
  });
  try {
    const [row] = await ctx.db
      .insert(tmTicketFiles)
      .values({
        id,
        orgId,
        projectId,
        ticketId,
        r2Key,
        fileName,
        contentType,
        sizeBytes: input.file.size,
        category: input.category,
        createdBy: userId,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return { file: dto(row), ticketNumber: ticket.number };
  } catch (e) {
    // The ticket was deleted mid-upload, or D1 failed: never leave an object no row owns.
    await files.delete(r2Key).catch(() => undefined);
    throw e;
  }
}

async function findRow(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  ticketId: string,
  fileId: string | undefined,
) {
  const row = await ctx.db
    .select()
    .from(tmTicketFiles)
    .where(
      and(
        eq(tmTicketFiles.id, fileId ?? ""),
        eq(tmTicketFiles.orgId, orgId),
        eq(tmTicketFiles.projectId, projectId),
        eq(tmTicketFiles.ticketId, ticketId),
      ),
    )
    .get();
  if (!row) throw notFound("Attachment");
  return row;
}

export async function getTmTicketFile(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  ticketId: string,
  fileId: string | undefined,
) {
  const files = bucket(ctx);
  const row = await findRow(ctx, orgId, projectId, ticketId, fileId);
  const object = await files.get(row.r2Key);
  if (!object) throw notFound("Attachment file");
  return { row: dto(row), body: object.body };
}

export async function deleteTmTicketFile(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  ticketId: string,
  fileId: string | undefined,
) {
  const files = bucket(ctx);
  const ticket = await assertTicket(ctx, orgId, projectId, ticketId);
  const row = await findRow(ctx, orgId, projectId, ticketId, fileId);
  await ctx.db
    .delete(tmTicketFiles)
    .where(and(eq(tmTicketFiles.id, row.id), eq(tmTicketFiles.orgId, orgId)));
  await files.delete(row.r2Key);
  return { row, ticketNumber: ticket.number };
}
