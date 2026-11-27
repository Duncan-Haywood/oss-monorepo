// /api/orgs/:orgId/projects/:projectId/daily-reports: the job's daily reports (field logs,
// services/payapps/daily-reports.ts, docs/DAILY-REPORTS.md). Every member reads them and downloads
// the PDF and CSV; editors (who run the job's paperwork) add, change and delete. Free on every plan:
// rows of text and an on-request PDF, like the RFI and submittal logs. Photos and files per report
// (services/payapps/daily-report-files.ts) count against the plan's one storage limit. Each change
// also writes the job history (@shared/job-history `dailyReportEvents`), after it succeeds and never
// for the sample job, as the other job routes do.
import {
  dailyReportRangeQuerySchema,
  dailyReportSchema,
  updateDailyReportSchema,
} from "@shared/api/schemas";
import type { DailyReportDto } from "@shared/api/types";
import { ATTACHMENT_CATEGORIES, type AttachmentCategory } from "@shared/attachments";
import { dailyReportEvents, type JobEventAction, type JobEventData } from "@shared/job-history";
import { Hono } from "hono";
import { badRequest } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  dailyReportFileName,
  dailyReportLogCsv,
  dailyReportLogFileName,
  dailyReportPdf,
} from "../../services/export/daily-report-export";
import { MAX_UPLOAD_REQUEST_BYTES, purgeFiles } from "../../services/payapps/attachments";
import { getProjectRow } from "../../services/payapps/bundle";
import {
  addDailyReportFile,
  dailyReportPrefix,
  deleteDailyReportFile,
  getDailyReportFile,
  listDailyReportFiles,
} from "../../services/payapps/daily-report-files";
import {
  createDailyReport,
  dailyReportLog,
  deleteDailyReport,
  getDailyReport,
  loadDailyReportDocument,
  loadDailyReportLog,
  updateDailyReport,
} from "../../services/payapps/daily-reports";
import { recordJobEvents } from "../../services/payapps/job-history";
import { buildDailyReportPacket, packetResponse } from "../../services/payapps/packet";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();
const editor = requireRole("editor");
const projectId = (c: { req: { param: (k: "projectId") => string | undefined } }) =>
  c.req.param("projectId") ?? "";

const pdfResponse = (bytes: Uint8Array, name: string) =>
  new Response(bytes.slice().buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });

routes.get("/", async (c) => c.json(await dailyReportLog(c.var.ctx, c.var.tenant, projectId(c))));

// Literal segments registered before "/:reportId/..." so they are never read as a report id.
routes.get("/log.csv", async (c) => {
  const { ctx, tenant } = c.var;
  const { project, contractorName, reports } = await loadDailyReportLog(
    ctx,
    tenant.orgId,
    projectId(c),
  );
  return new Response(dailyReportLogCsv(reports, contractorName), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${dailyReportLogFileName(project)}"`,
      "Cache-Control": "no-store",
    },
  });
});

/** Every report from `from` to `to` in one PDF (a week's for the GC, a month's with the pay app). */
routes.get("/range.pdf", validate("query", dailyReportRangeQuerySchema), async (c) => {
  const { from, to } = c.req.valid("query");
  const doc = await loadDailyReportDocument(c.var.ctx, c.var.tenant.orgId, projectId(c), {
    from,
    to,
  });
  return pdfResponse(dailyReportPdf(doc), dailyReportFileName(doc));
});

/** Job history rows for a report or one of its files; the sample job writes none. */
async function logEvents(
  c: { var: AppEnv["Variables"] },
  jobId: string,
  subjectId: string,
  events: { action: JobEventAction; data: JobEventData }[],
) {
  if (events.length === 0) return;
  const { ctx, tenant } = c.var;
  const project = await getProjectRow(ctx, tenant.orgId, jobId);
  if (project.isSample) return;
  await recordJobEvents(
    ctx,
    events.map((e) => ({
      ...e,
      subjectId,
      orgId: tenant.orgId,
      projectId: jobId,
      actorUserId: tenant.userId,
    })),
  );
}

const logReport = (
  c: { var: AppEnv["Variables"] },
  jobId: string,
  before: DailyReportDto | null,
  after: DailyReportDto | null,
) => logEvents(c, jobId, (after ?? before)?.id ?? "", dailyReportEvents(before, after));

routes.post("/", editor, validate("json", dailyReportSchema), async (c) => {
  const created = await createDailyReport(
    c.var.ctx,
    c.var.tenant,
    projectId(c),
    c.req.valid("json"),
  );
  await logReport(c, projectId(c), null, created);
  return c.json(created, 201);
});

routes.patch("/:reportId", editor, validate("json", updateDailyReportSchema), async (c) => {
  const { ctx, tenant } = c.var;
  const reportId = c.req.param("reportId");
  const before = await getDailyReport(ctx, tenant.orgId, projectId(c), reportId);
  const after = await updateDailyReport(ctx, tenant, projectId(c), reportId, c.req.valid("json"));
  await logReport(c, projectId(c), before, after);
  return c.json(after);
});

routes.delete("/:reportId", editor, async (c) => {
  const { ctx, tenant } = c.var;
  const reportId = c.req.param("reportId");
  const before = await getDailyReport(ctx, tenant.orgId, projectId(c), reportId);
  await deleteDailyReport(ctx, tenant.orgId, projectId(c), reportId);
  // Its file rows cascaded with it; clear the stored objects too.
  await purgeFiles(ctx, dailyReportPrefix(tenant.orgId, projectId(c), reportId));
  await logReport(c, projectId(c), before, null);
  return c.json({ ok: true });
});

routes.get("/:reportId/report.pdf", async (c) => {
  const doc = await loadDailyReportDocument(c.var.ctx, c.var.tenant.orgId, projectId(c), {
    reportId: c.req.param("reportId"),
  });
  return pdfResponse(dailyReportPdf(doc), dailyReportFileName(doc));
});

// The report PDF, an index, then its photos and files (not a signed copy of the report).
routes.get("/:reportId/packet.pdf", async (c) =>
  packetResponse(
    await buildDailyReportPacket(
      c.var.ctx,
      c.var.tenant.orgId,
      projectId(c),
      c.req.param("reportId"),
    ),
  ),
);

routes.get("/:reportId/attachments", async (c) =>
  c.json(
    await listDailyReportFiles(
      c.var.ctx,
      c.var.tenant.orgId,
      projectId(c),
      c.req.param("reportId"),
    ),
  ),
);

routes.post("/:reportId/attachments", editor, async (c) => {
  const reportId = c.req.param("reportId");
  // Refuse an oversized body before buffering it.
  const length = Number(c.req.header("Content-Length") ?? "0");
  if (length > MAX_UPLOAD_REQUEST_BYTES) throw badRequest("The file is larger than 15 MB");
  if (!(c.req.header("Content-Type") ?? "").startsWith("multipart/form-data")) {
    throw badRequest("Send the file as multipart/form-data in a field named file");
  }
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Send the file in a field named file");
  const raw = String(form.get("category") ?? "photo");
  if (!(ATTACHMENT_CATEGORIES as readonly string[]).includes(raw)) {
    throw badRequest(`category must be one of ${ATTACHMENT_CATEGORIES.join(", ")}`);
  }
  const added = await addDailyReportFile(
    c.var.ctx,
    c.var.tenant.orgId,
    projectId(c),
    reportId,
    { file, category: raw as AttachmentCategory },
    c.var.tenant.userId,
  );
  await logEvents(c, projectId(c), reportId, [
    {
      action: "daily_report_file_added",
      data: { reportDate: added.reportDate, fileName: added.file.fileName },
    },
  ]);
  return c.json(added.file, 201);
});

routes.get("/:reportId/attachments/:fileId", async (c) => {
  const { row, body } = await getDailyReportFile(
    c.var.ctx,
    c.var.tenant.orgId,
    projectId(c),
    c.req.param("reportId"),
    c.req.param("fileId"),
  );
  return new Response(body, {
    headers: {
      "Content-Type": row.contentType,
      "Content-Length": String(row.sizeBytes),
      // RFC 6266: an ASCII fallback plus the exact UTF-8 name.
      "Content-Disposition": `attachment; filename="${row.fileName.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

routes.delete("/:reportId/attachments/:fileId", editor, async (c) => {
  const reportId = c.req.param("reportId");
  const { row, reportDate } = await deleteDailyReportFile(
    c.var.ctx,
    c.var.tenant.orgId,
    projectId(c),
    reportId,
    c.req.param("fileId"),
  );
  await logEvents(c, projectId(c), reportId, [
    { action: "daily_report_file_deleted", data: { reportDate, fileName: row.fileName } },
  ]);
  return c.json({ ok: true });
});

export default routes;
