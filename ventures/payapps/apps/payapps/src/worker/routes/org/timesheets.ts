// /api/orgs/:orgId/timesheets: crew timesheets (services/payapps/timesheets.ts, docs/TIMESHEETS.md).
// Every member reads the crew list and the weeks and downloads the CSVs; editors keep the crew list,
// enter hours and post a week to the jobs' costs. Hours are on every plan; posting them to job costs
// needs job costing (Crew and up), as every other cost does. Pay rates are wages: admins and editors
// set them, and viewers read them, as viewers read the job-cost pages.
import {
  crewMemberSchema,
  postTimesheetWeekSchema,
  timesheetSettingsSchema,
  updateCrewMemberSchema,
  workerWeekSchema,
} from "@shared/api/schemas";
import { Hono } from "hono";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import { assertJobCosting } from "../../services/billing";
import {
  timesheetDetailCsv,
  timesheetFileName,
  timesheetPayrollCsv,
} from "../../services/export/timesheet-export";
import {
  addMember,
  deleteMember,
  getCrew,
  getWeek,
  postWeek,
  putWorkerWeek,
  setSettings,
  updateMember,
} from "../../services/payapps/timesheets";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();
const editor = requireRole("editor");

const csv = (body: string, name: string) =>
  new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });

routes.get("/crew", async (c) => c.json(await getCrew(c.var.ctx, c.var.tenant.orgId)));

routes.post("/crew", editor, validate("json", crewMemberSchema), async (c) =>
  c.json(await addMember(c.var.ctx, c.var.tenant.orgId, c.req.valid("json")), 201),
);

routes.patch("/crew/:workerId", editor, validate("json", updateCrewMemberSchema), async (c) =>
  c.json(
    await updateMember(c.var.ctx, c.var.tenant.orgId, c.req.param("workerId"), c.req.valid("json")),
  ),
);

routes.delete("/crew/:workerId", editor, async (c) =>
  c.json(await deleteMember(c.var.ctx, c.var.tenant.orgId, c.req.param("workerId"))),
);

routes.put("/settings", editor, validate("json", timesheetSettingsSchema), async (c) =>
  c.json(await setSettings(c.var.ctx, c.var.tenant.orgId, c.req.valid("json"))),
);

routes.get("/weeks/:weekStart", async (c) =>
  c.json(await getWeek(c.var.ctx, c.var.tenant.orgId, c.req.param("weekStart"))),
);

routes.get("/weeks/:weekStart/payroll.csv", async (c) => {
  const w = await getWeek(c.var.ctx, c.var.tenant.orgId, c.req.param("weekStart"));
  return csv(timesheetPayrollCsv(w), timesheetFileName(w, "payroll"));
});

routes.get("/weeks/:weekStart/time.csv", async (c) => {
  const w = await getWeek(c.var.ctx, c.var.tenant.orgId, c.req.param("weekStart"));
  return csv(timesheetDetailCsv(w), timesheetFileName(w, "time"));
});

routes.put(
  "/weeks/:weekStart/workers/:workerId",
  editor,
  validate("json", workerWeekSchema),
  async (c) =>
    c.json(
      await putWorkerWeek(
        c.var.ctx,
        c.var.tenant,
        c.req.param("weekStart"),
        c.req.param("workerId"),
        c.req.valid("json"),
      ),
    ),
);

routes.post(
  "/weeks/:weekStart/post",
  editor,
  validate("json", postTimesheetWeekSchema),
  async (c) => {
    await assertJobCosting(c.var.ctx, c.var.tenant.orgId);
    return c.json(
      await postWeek(
        c.var.ctx,
        c.var.tenant,
        c.req.param("weekStart"),
        c.req.valid("json").burdenBps,
      ),
    );
  },
);

export default routes;
