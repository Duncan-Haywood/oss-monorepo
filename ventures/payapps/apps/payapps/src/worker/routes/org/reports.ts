// /api/orgs/:orgId/reports — read-only reports across the org's jobs (any member).
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { organization } from "../../db/schema";
import { notFound } from "../../lib/errors";
import { wipPdf, wipPdfFileName } from "../../services/export/wip-pdf";
import { cashReportCsv, orgCashReport } from "../../services/payapps/cash";
import { wipCsv, wipReport } from "../../services/payapps/job-cost";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();

routes.get("/cash", async (c) => c.json(await orgCashReport(c.var.ctx, c.var.tenant.orgId)));

routes.get("/cash.csv", async (c) => {
  const report = await orgCashReport(c.var.ctx, c.var.tenant.orgId);
  return new Response(cashReportCsv(report), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cash-and-retainage-${report.asOf}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});

// Work in progress: every active job's cost-to-cost figures (services/payapps/job-cost.ts).
routes.get("/wip", async (c) => c.json(await wipReport(c.var.ctx, c.var.tenant.orgId)));

routes.get("/wip.csv", async (c) => {
  const report = await wipReport(c.var.ctx, c.var.tenant.orgId);
  return new Response(wipCsv(report), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="wip-schedule-${report.asOf}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});

// The same schedule as a PDF to send a surety, a bank or the CPA (services/export/wip-pdf.ts).
routes.get("/wip.pdf", async (c) => {
  const orgId = c.var.tenant.orgId;
  const [report, org] = await Promise.all([
    wipReport(c.var.ctx, orgId),
    c.var.ctx.db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, orgId))
      .get(),
  ]);
  if (!org) throw notFound("Organization");
  return new Response(wipPdf({ report, contractor: { name: org.name } }).slice().buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${wipPdfFileName(report)}"`,
      "Cache-Control": "no-store",
    },
  });
});

export default routes;
