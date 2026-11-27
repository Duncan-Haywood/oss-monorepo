// Files kept with a daily report: photos of the day's work and conditions, the delivery tickets
// and inspection reports from that day, and a signed copy when a GC asks for one. The same rules,
// bucket and storage limit as RFI files (./rfi-files.ts); rows in daily_report_files, keys under
// orgs/{orgId}/projects/{projectId}/daily-reports/{reportId}/, so deleting the report or the job
// clears them. Every member reads; editors add and delete, like the reports themselves.
//
// Safety, as for the other files: the stored Content-Type comes from the extension allow-list, never
// the browser; downloads are served as attachments with nosniff (routes/org/daily-reports.ts); every
// lookup filters by org, job and report.
import {
  ATTACHMENT_TYPES,
  type AttachmentCategory,
  attachmentProblem,
  cleanFileName,
  DAILY_REPORT_CATEGORY_LABELS,
  extensionOf,
  MAX_ATTACHMENTS_PER_DAILY_REPORT,
} from "@shared/attachments";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import { dailyReportFiles, dailyReports } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { orgPlan } from "../billing";
import { type AttachmentDto, type AttachmentListDto, bucket, dto, usedBytes } from "./attachments";

export const dailyReportPrefix = (orgId: string, projectId: string, reportId: string) =>
  `orgs/${orgId}/projects/${projectId}/daily-reports/${reportId}/`;

/** The kind as the packet index prints it: the label before any "(...)" detail. */
export const dailyReportFileKind = (c: AttachmentCategory) =>
  DAILY_REPORT_CATEGORY_LABELS[c].split(" (")[0] ?? c;

/** The files that go behind the report in its packet: all but a signed copy of the report itself. */
export const inDailyReportPacket = (c: AttachmentCategory) => c !== "signed";

async function assertReport(ctx: AppContext, orgId: string, projectId: string, reportId: string) {
  const row = await ctx.db
    .select({ id: dailyReports.id, reportDate: dailyReports.reportDate })
    .from(dailyReports)
    .where(
      and(
        eq(dailyReports.id, reportId),
        eq(dailyReports.orgId, orgId),
        eq(dailyReports.projectId, projectId),
      ),
    )
    .get();
  if (!row) throw notFound("Daily report");
  return row;
}

const rowsOf = (ctx: AppContext, orgId: string, projectId: string, reportId: string) =>
  ctx.db
    .select()
    .from(dailyReportFiles)
    .where(
      and(
        eq(dailyReportFiles.orgId, orgId),
        eq(dailyReportFiles.projectId, projectId),
        eq(dailyReportFiles.reportId, reportId),
      ),
    )
    .orderBy(desc(dailyReportFiles.createdAt));

export async function listDailyReportFiles(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  reportId: string,
): Promise<AttachmentListDto> {
  await assertReport(ctx, orgId, projectId, reportId);
  const [rows, used, { plan }] = await Promise.all([
    rowsOf(ctx, orgId, projectId, reportId),
    usedBytes(ctx, orgId),
    orgPlan(ctx, orgId),
  ]);
  return {
    items: rows.map(dto),
    storage: { usedBytes: used, limitBytes: plan.attachmentStorageBytes },
    enabled: Boolean(ctx.env.FILES),
  };
}

/** Every file row of one report, oldest first: the packet's order. */
export function dailyReportFileRows(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  reportId: string,
) {
  return ctx.db
    .select()
    .from(dailyReportFiles)
    .where(
      and(
        eq(dailyReportFiles.orgId, orgId),
        eq(dailyReportFiles.projectId, projectId),
        eq(dailyReportFiles.reportId, reportId),
      ),
    )
    .orderBy(asc(dailyReportFiles.createdAt), asc(dailyReportFiles.id))
    .all();
}

/** Files per daily report on a job, for the log's "Files (n)" link. */
export async function dailyReportFileCounts(
  ctx: AppContext,
  orgId: string,
  projectId: string,
): Promise<Map<string, number>> {
  const rows = await ctx.db
    .select({ reportId: dailyReportFiles.reportId, n: sql<number>`count(*)` })
    .from(dailyReportFiles)
    .where(and(eq(dailyReportFiles.orgId, orgId), eq(dailyReportFiles.projectId, projectId)))
    .groupBy(dailyReportFiles.reportId)
    .all();
  return new Map(rows.map((r) => [r.reportId, Number(r.n)]));
}

export async function addDailyReportFile(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  reportId: string,
  input: { file: File; category: AttachmentCategory },
  userId: string,
): Promise<{ file: AttachmentDto; reportDate: string }> {
  const files = bucket(ctx);
  const report = await assertReport(ctx, orgId, projectId, reportId);
  const [existing, used, { plan }] = await Promise.all([
    rowsOf(ctx, orgId, projectId, reportId),
    usedBytes(ctx, orgId),
    orgPlan(ctx, orgId),
  ]);
  const problem = attachmentProblem(
    { name: input.file.name, sizeBytes: input.file.size },
    existing.length,
    { usedBytes: used, limitBytes: plan.attachmentStorageBytes },
    { max: MAX_ATTACHMENTS_PER_DAILY_REPORT, noun: "daily report" },
  );
  if (problem) throw badRequest(problem);

  const fileName = cleanFileName(input.file.name);
  const contentType = ATTACHMENT_TYPES[extensionOf(fileName)] as string;
  const id = newId("att");
  const r2Key = `${dailyReportPrefix(orgId, projectId, reportId)}${id}`;
  await files.put(r2Key, input.file.stream(), {
    httpMetadata: { contentType },
    customMetadata: { orgId, reportId },
  });
  try {
    const [row] = await ctx.db
      .insert(dailyReportFiles)
      .values({
        id,
        orgId,
        projectId,
        reportId,
        r2Key,
        fileName,
        contentType,
        sizeBytes: input.file.size,
        category: input.category,
        createdBy: userId,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return { file: dto(row), reportDate: report.reportDate };
  } catch (e) {
    // The report was deleted mid-upload, or D1 failed: never leave an object no row owns.
    await files.delete(r2Key).catch(() => undefined);
    throw e;
  }
}

async function findRow(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  reportId: string,
  fileId: string | undefined,
) {
  const row = await ctx.db
    .select()
    .from(dailyReportFiles)
    .where(
      and(
        eq(dailyReportFiles.id, fileId ?? ""),
        eq(dailyReportFiles.orgId, orgId),
        eq(dailyReportFiles.projectId, projectId),
        eq(dailyReportFiles.reportId, reportId),
      ),
    )
    .get();
  if (!row) throw notFound("Attachment");
  return row;
}

export async function getDailyReportFile(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  reportId: string,
  fileId: string | undefined,
) {
  const files = bucket(ctx);
  const row = await findRow(ctx, orgId, projectId, reportId, fileId);
  const object = await files.get(row.r2Key);
  if (!object) throw notFound("Attachment file");
  return { row: dto(row), body: object.body };
}

export async function deleteDailyReportFile(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  reportId: string,
  fileId: string | undefined,
) {
  const files = bucket(ctx);
  const report = await assertReport(ctx, orgId, projectId, reportId);
  const row = await findRow(ctx, orgId, projectId, reportId, fileId);
  await ctx.db
    .delete(dailyReportFiles)
    .where(and(eq(dailyReportFiles.id, row.id), eq(dailyReportFiles.orgId, orgId)));
  await files.delete(row.r2Key);
  return { row, reportDate: report.reportDate };
}
