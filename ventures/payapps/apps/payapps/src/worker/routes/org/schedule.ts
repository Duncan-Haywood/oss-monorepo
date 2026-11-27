// /api/orgs/:orgId/projects/:projectId/schedule: the job's schedule (services/payapps/schedule.ts).
// Every member reads it and downloads the lookahead PDF, the CSV and the delay log; editors (who run the job's
// paperwork) add, change, move and delete. Free on every plan: it is rows of dates and an
// on-request PDF.
import {
  delayLogQuerySchema,
  importScheduleSchema,
  scheduleActivitySchema,
  shiftScheduleSchema,
  updateScheduleActivitySchema,
} from "@shared/api/schemas";
import { Hono } from "hono";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import { delayLogFileName, delayLogPdf } from "../../services/export/delay-log-export";
import { lookaheadPdf, scheduleCsv, scheduleFileName } from "../../services/export/schedule-export";
import {
  createActivity,
  deleteActivity,
  getSchedule,
  importActivities,
  loadScheduleDocument,
  shiftActivity,
  updateActivity,
} from "../../services/payapps/schedule";
import { getDelayLog, loadDelayLogDocument } from "../../services/payapps/schedule-delays";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();
const editor = requireRole("editor");
const projectId = (c: { req: { param: (k: "projectId") => string | undefined } }) =>
  c.req.param("projectId") ?? "";
/** `?weeks=` 1 to 6; anything else is the usual three. */
const weeksOf = (v: string | undefined) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 6 ? n : 3;
};

routes.get("/", async (c) =>
  c.json(
    await getSchedule(c.var.ctx, c.var.tenant.orgId, projectId(c), weeksOf(c.req.query("weeks"))),
  ),
);

// Registered before "/:activityId" so the literal segments are never read as an activity id.
routes.get("/schedule.csv", async (c) => {
  const doc = await loadScheduleDocument(c.var.ctx, c.var.tenant.orgId, projectId(c));
  return new Response(scheduleCsv(doc), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${scheduleFileName("schedule", doc.project, "csv")}"`,
      "Cache-Control": "no-store",
    },
  });
});

routes.get("/lookahead.pdf", async (c) => {
  const doc = await loadScheduleDocument(
    c.var.ctx,
    c.var.tenant.orgId,
    projectId(c),
    weeksOf(c.req.query("weeks")),
  );
  return new Response(lookaheadPdf(doc).slice().buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${scheduleFileName("lookahead", doc.project, "pdf")}"`,
      "Cache-Control": "no-store",
    },
  });
});

// The daily reports' lost hours by the activity they held up (services/payapps/schedule-delays.ts).
routes.get("/delays", validate("query", delayLogQuerySchema), async (c) =>
  c.json(await getDelayLog(c.var.ctx, c.var.tenant, projectId(c), c.req.valid("query"))),
);

routes.get("/delays.pdf", validate("query", delayLogQuerySchema), async (c) => {
  const doc = await loadDelayLogDocument(
    c.var.ctx,
    c.var.tenant.orgId,
    projectId(c),
    c.req.valid("query"),
  );
  return new Response(delayLogPdf(doc).slice().buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${delayLogFileName(doc)}"`,
      "Cache-Control": "no-store",
    },
  });
});

routes.post("/", editor, validate("json", scheduleActivitySchema), async (c) =>
  c.json(
    await createActivity(c.var.ctx, c.var.tenant.orgId, projectId(c), c.req.valid("json")),
    201,
  ),
);

// The GC's P6 schedule, read in the browser; only the kept activities arrive here.
routes.post("/import", editor, validate("json", importScheduleSchema), async (c) =>
  c.json(
    await importActivities(c.var.ctx, c.var.tenant.orgId, projectId(c), c.req.valid("json")),
    201,
  ),
);

routes.post("/:activityId/shift", editor, validate("json", shiftScheduleSchema), async (c) =>
  c.json(
    await shiftActivity(
      c.var.ctx,
      c.var.tenant.orgId,
      projectId(c),
      c.req.param("activityId"),
      c.req.valid("json").workdays,
    ),
  ),
);

routes.patch("/:activityId", editor, validate("json", updateScheduleActivitySchema), async (c) =>
  c.json(
    await updateActivity(
      c.var.ctx,
      c.var.tenant.orgId,
      projectId(c),
      c.req.param("activityId"),
      c.req.valid("json"),
    ),
  ),
);

routes.delete("/:activityId", editor, async (c) => {
  await deleteActivity(c.var.ctx, c.var.tenant.orgId, projectId(c), c.req.param("activityId"));
  return c.json({ ok: true });
});

export default routes;
