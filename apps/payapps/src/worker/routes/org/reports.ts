// /api/orgs/:orgId/reports — read-only reports across the org's jobs (any member).
import { Hono } from "hono";
import { cashReportCsv, orgCashReport } from "../../services/payapps/cash";
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

export default routes;
