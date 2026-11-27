// P&L by platform and month, and the Schedule C worksheet (JSON + CSV download).
import { csvCell, toCsv } from "@shared/csv";
import { Hono } from "hono";
import { z } from "zod";
import { badRequest } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { pnlReport, scheduleCWorksheet } from "../../services/books/service";
import type { AppEnv } from "../../types";
import { isoDate } from "./schemas";

const routes = new Hono<AppEnv>();

routes.get("/pnl", validate("query", z.object({ from: isoDate, to: isoDate })), async (c) => {
  const { from, to } = c.req.valid("query");
  if (from > to) throw badRequest("from must be on or before to");
  return c.json(await pnlReport(c.var.ctx, c.var.tenant.orgId, from, to));
});

const scQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  /** Cents per mile, e.g. 70 or 72.5 (the IRS standard mileage rate the seller looked up). */
  mileageRate: z.coerce.number().min(0).max(500).optional(),
});

routes.get("/schedule-c", validate("query", scQuery), async (c) => {
  const q = c.req.valid("query");
  return c.json(
    await scheduleCWorksheet(c.var.ctx, c.var.tenant.orgId, q.year, q.mileageRate ?? null),
  );
});

const dollars = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2));

routes.get("/schedule-c.csv", validate("query", scQuery), async (c) => {
  const q = c.req.valid("query");
  const ws = await scheduleCWorksheet(c.var.ctx, c.var.tenant.orgId, q.year, q.mileageRate ?? null);
  const rows: (string | number | null)[][] = [
    [`Schedule C worksheet ${ws.year}`],
    [ws.disclaimer],
    [],
    ["Part", "Line", "Description", "Amount (USD)", "Note"],
    ...ws.lines.map((l) => ["I/II", l.line, l.label, dollars(l.amountCents), l.note ?? ""]),
    ...ws.partIII.map((l) => ["III", l.line, l.label, dollars(l.amountCents), l.note ?? ""]),
    ...ws.otherExpenses.map((l) => ["V", l.line, l.label, dollars(l.amountCents), ""]),
    [
      "IV",
      "44a",
      "Business miles",
      ws.businessMiles.toFixed(1),
      q.mileageRate == null ? "" : `${q.mileageRate} cents/mile`,
    ],
    ...ws.warnings.map((w) => ["", "", "Warning", "", w]),
  ];
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=${csvCell(`schedule-c-worksheet-${ws.year}.csv`)}`,
    },
  });
});

export default routes;
