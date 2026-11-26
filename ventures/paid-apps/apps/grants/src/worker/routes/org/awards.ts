// OWNER: awards — /api/orgs/:orgId/awards: awards, their report schedule, report drafting (grounded
// in facts dated in the period), submission and DOCX export. Viewer+ reads; editor+ writes.
// Not mounted yet: the integration pass adds `org.route("/awards", awardRoutes)` to app.ts.
import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  addReport,
  CreateAwardInput,
  CreateReportInput,
  createAward,
  deleteReport,
  draftReport,
  getAwardDetail,
  getReportDetail,
  listAwards,
  loadReportExportInput,
  SubmitReportInput,
  submitReport,
  UpdateAwardInput,
  UpdateReportInput,
  updateAward,
  updateReport,
} from "../../services/awards";
import { renderExport } from "../../services/export";
import { audit } from "../../services/privacy/audit";
import type { AppEnv } from "../../types";

const ExportQuery = z.object({ format: z.enum(["docx"]).default("docx") });

const routes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const items = await listAwards(c.var.ctx, c.var.tenant.orgId);
    return c.json({ items });
  })
  .post("/", requireRole("editor"), validate("json", CreateAwardInput), async (c) => {
    const { orgId, userId } = c.var.tenant;
    const award = await createAward(c.var.ctx, orgId, c.req.valid("json"), {
      userId,
      requestId: c.var.requestId,
    });
    return c.json(await getAwardDetail(c.var.ctx, orgId, award.id), 201);
  })
  .get("/:id", async (c) => {
    return c.json(await getAwardDetail(c.var.ctx, c.var.tenant.orgId, c.req.param("id")));
  })
  .patch("/:id", requireRole("editor"), validate("json", UpdateAwardInput), async (c) => {
    const { orgId, userId } = c.var.tenant;
    const id = c.req.param("id");
    await updateAward(c.var.ctx, orgId, id, c.req.valid("json"), {
      userId,
      requestId: c.var.requestId,
    });
    return c.json(await getAwardDetail(c.var.ctx, orgId, id));
  })
  .post("/:id/reports", requireRole("editor"), validate("json", CreateReportInput), async (c) => {
    const { orgId, userId } = c.var.tenant;
    const row = await addReport(c.var.ctx, orgId, c.req.param("id"), c.req.valid("json"), {
      userId,
      requestId: c.var.requestId,
    });
    return c.json(await getReportDetail(c.var.ctx, orgId, row.awardId, row.id), 201);
  })
  .get("/:id/reports/:reportId", async (c) => {
    const { orgId } = c.var.tenant;
    return c.json(
      await getReportDetail(c.var.ctx, orgId, c.req.param("id"), c.req.param("reportId")),
    );
  })
  .patch(
    "/:id/reports/:reportId",
    requireRole("editor"),
    validate("json", UpdateReportInput),
    async (c) => {
      const { orgId, userId } = c.var.tenant;
      const awardId = c.req.param("id");
      const reportId = c.req.param("reportId");
      await updateReport(c.var.ctx, {
        orgId,
        awardId,
        reportId,
        patch: c.req.valid("json"),
        userId,
        requestId: c.var.requestId,
      });
      return c.json(await getReportDetail(c.var.ctx, orgId, awardId, reportId));
    },
  )
  .delete("/:id/reports/:reportId", requireRole("editor"), async (c) => {
    const { orgId, userId } = c.var.tenant;
    await deleteReport(c.var.ctx, orgId, c.req.param("id"), c.req.param("reportId"), {
      userId,
      requestId: c.var.requestId,
    });
    return c.body(null, 204);
  })
  .post("/:id/reports/:reportId/draft", requireRole("editor"), async (c) => {
    const { orgId, userId } = c.var.tenant;
    const awardId = c.req.param("id");
    const reportId = c.req.param("reportId");
    await draftReport(c.var.ctx, { orgId, awardId, reportId, userId, requestId: c.var.requestId });
    return c.json(await getReportDetail(c.var.ctx, orgId, awardId, reportId));
  })
  .post(
    "/:id/reports/:reportId/submit",
    requireRole("editor"),
    validate("json", SubmitReportInput),
    async (c) => {
      const { orgId, userId } = c.var.tenant;
      const awardId = c.req.param("id");
      const reportId = c.req.param("reportId");
      await submitReport(c.var.ctx, {
        orgId,
        awardId,
        reportId,
        externalRef: c.req.valid("json").externalRef,
        userId,
        requestId: c.var.requestId,
      });
      return c.json(await getReportDetail(c.var.ctx, orgId, awardId, reportId));
    },
  )
  .get("/:id/reports/:reportId/export", validate("query", ExportQuery), async (c) => {
    const { orgId, userId } = c.var.tenant;
    const awardId = c.req.param("id");
    const reportId = c.req.param("reportId");
    const input = await loadReportExportInput(c.var.ctx, orgId, awardId, reportId);
    const out = renderExport(input, c.req.valid("query").format, { citations: false });
    await audit(c.var.ctx, {
      orgId,
      actorType: "user",
      actorId: userId,
      action: "award_report.exported",
      targetType: "award_report",
      targetId: reportId,
      metadata: { awardId, format: "docx", versionNumber: input.version.versionNumber },
      requestId: c.var.requestId,
    });
    return c.body(out.body as Uint8Array<ArrayBuffer>, 200, {
      "Content-Type": out.contentType,
      "Content-Disposition": `attachment; filename="${out.filename}"`,
      "Cache-Control": "private, no-store",
    });
  });

export default routes;
