// /api/orgs/:orgId/schedule: the schedule across the company's active jobs
// (services/payapps/crew-lookahead.ts), read-only for every member, and the company's holidays the
// workday math leaves out (services/payapps/holidays.ts): every member reads them, editors add and
// delete. Each job's activities and their edits stay under /projects/:projectId/schedule. Free on
// every plan.
import { addHolidaysSchema } from "@shared/api/schemas";
import { Hono } from "hono";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  crewLookaheadFileName,
  crewLookaheadPdf,
} from "../../services/export/crew-lookahead-export";
import { getCrewLookahead, loadCrewLookaheadDocument } from "../../services/payapps/crew-lookahead";
import { addHolidays, deleteHoliday, listHolidays } from "../../services/payapps/holidays";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();
/** `?weeks=` 1 to 6; anything else is two (this week and next). */
const weeksOf = (v: string | undefined) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 6 ? n : 2;
};

routes.get("/crews", async (c) =>
  c.json(await getCrewLookahead(c.var.ctx, c.var.tenant.orgId, weeksOf(c.req.query("weeks")))),
);

routes.get("/crews.pdf", async (c) => {
  const weeks = weeksOf(c.req.query("weeks"));
  const doc = await loadCrewLookaheadDocument(c.var.ctx, c.var.tenant.orgId, weeks);
  return new Response(crewLookaheadPdf(doc).slice().buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${crewLookaheadFileName(doc.lookahead.lookahead.weeks)}"`,
      "Cache-Control": "no-store",
    },
  });
});

routes.get("/holidays", async (c) => c.json(await listHolidays(c.var.ctx, c.var.tenant.orgId)));

routes.post("/holidays", requireRole("editor"), validate("json", addHolidaysSchema), async (c) =>
  c.json(await addHolidays(c.var.ctx, c.var.tenant.orgId, c.req.valid("json")), 201),
);

routes.delete("/holidays/:holidayId", requireRole("editor"), async (c) => {
  await deleteHoliday(c.var.ctx, c.var.tenant.orgId, c.req.param("holidayId"));
  return c.json({ ok: true });
});

export default routes;
