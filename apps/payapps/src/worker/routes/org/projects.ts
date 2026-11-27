// /api/orgs/:orgId/projects — projects, schedule of values and change orders.
import {
  approveChangeOrderSchema,
  bulkSovSchema,
  caFirstFurnishedSchema,
  caNoticeSendSchema,
  changeOrderEmailedSchema,
  changeOrderScheduleSchema,
  changeOrderSchema,
  changeOrderSentSchema,
  noticePdfSchema,
  openingSchema,
  procoreSsovSchema,
  projectSchema,
  sovLineSchema,
  updateProjectSchema,
  updateSovLineSchema,
} from "@shared/api/schemas";
import type {
  CaNoticeSendDto,
  ChangeOrderDto,
  ProjectDetailDto,
  SovLineDto,
} from "@shared/api/types";
import { ATTACHMENT_CATEGORIES, type AttachmentCategory } from "@shared/attachments";
import { changeOrderFileName } from "@shared/change-order-request";
import { changedKeys, type JobEventAction, type JobEventData } from "@shared/job-history";
import { Hono } from "hono";
import { badRequest, notFound } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import { changeOrderPdf } from "../../services/export/change-order-pdf";
import { noticePdf } from "../../services/export/waiver-pdf";
import {
  MAX_UPLOAD_REQUEST_BYTES,
  projectPrefix,
  purgeFiles,
} from "../../services/payapps/attachments";
import { loadBundle, projectDetailDto } from "../../services/payapps/bundle";
import {
  addChangeOrderAttachment,
  changeOrderPrefix,
  deleteChangeOrderAttachment,
  getChangeOrderAttachmentFile,
  listChangeOrderAttachments,
} from "../../services/payapps/change-order-attachments";
import {
  approveChangeOrder,
  createChangeOrder,
  deleteChangeOrder,
  recordChangeOrderEmailed,
  rejectChangeOrder,
  setChangeOrderSchedule,
  setChangeOrderSubmitted,
} from "../../services/payapps/change-orders";
import { loadChangeOrderRequest } from "../../services/payapps/documents";
import { jobHistoryCsv, listJobEvents, recordJobEvents } from "../../services/payapps/job-history";
import {
  addNoticeFile,
  deleteNoticeFile,
  getNoticeFile,
  listNoticeFiles,
} from "../../services/payapps/notice-files";
import {
  caProofDocument,
  deleteCaNoticeSend,
  noticeOverview,
  recordCaNoticeSend,
  renderProjectNotice,
  setCaFirstFurnished,
} from "../../services/payapps/notices";
import { buildChangeOrderPacket, packetResponse } from "../../services/payapps/packet";
import {
  addSovLines,
  createProject,
  deleteProject,
  deleteSovLine,
  listProjects,
  setOpening,
  setProcoreSsov,
  updateProject,
  updateSovLine,
} from "../../services/payapps/projects";
import { createSampleProject } from "../../services/payapps/sample";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();
const editor = requireRole("editor");

routes.get("/", async (c) => c.json({ items: await listProjects(c.var.ctx, c.var.tenant.orgId) }));

routes.post("/", editor, validate("json", projectSchema), async (c) => {
  const created = await createProject(c.var.ctx, c.var.tenant, c.req.valid("json"));
  const p = await detail(c, created.id);
  await log(c, p, [{ action: "job_created", data: { amountCents: p.originalContractSumCents } }]);
  return c.json(created, 201);
});

// The one-click sample job (one per company; returns the existing one with 200).
routes.post("/sample", editor, async (c) => {
  const { project, created } = await createSampleProject(c.var.ctx, c.var.tenant);
  return c.json(project, created ? 201 : 200);
});

const detail = async (c: { var: AppEnv["Variables"] }, projectId: string) =>
  projectDetailDto(await loadBundle(c.var.ctx, c.var.tenant.orgId, projectId));

routes.get("/:projectId", async (c) => c.json(await detail(c, c.req.param("projectId"))));

// Job history: the job's terms, schedule of values, opening balance and change orders (any member).
// The sample job writes none: nobody did those things.
type Event = { action: JobEventAction; subjectId?: string | null; data?: JobEventData };
const log = (
  c: { var: AppEnv["Variables"] },
  p: Pick<ProjectDetailDto, "id" | "isSample">,
  events: Event[],
) =>
  p.isSample
    ? Promise.resolve()
    : recordJobEvents(
        c.var.ctx,
        events.map((e) => ({
          ...e,
          orgId: c.var.tenant.orgId,
          projectId: p.id,
          actorUserId: c.var.tenant.userId,
        })),
      );
const coData = (co: ChangeOrderDto): JobEventData => ({
  changeOrderNumber: co.number,
  amountCents: co.totalCents,
});
const lineData = (l: Pick<SovLineDto, "itemNumber" | "description">): JobEventData => ({
  itemNumber: l.itemNumber,
  description: l.description,
});
const findCo = (p: ProjectDetailDto, coId: string) => p.changeOrders.find((co) => co.id === coId);

routes.get("/:projectId/history", async (c) => {
  const p = await detail(c, c.req.param("projectId")); // 404 for a job not in this company
  return c.json({ items: await listJobEvents(c.var.ctx, c.var.tenant.orgId, p.id) });
});

routes.get("/:projectId/history.csv", async (c) => {
  const p = await detail(c, c.req.param("projectId"));
  const events = await listJobEvents(c.var.ctx, c.var.tenant.orgId, p.id);
  return new Response(jobHistoryCsv(events), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="job-history.csv"',
      "Cache-Control": "no-store",
    },
  });
});

routes.patch("/:projectId", editor, validate("json", updateProjectSchema), async (c) => {
  const projectId = c.req.param("projectId");
  const patch = c.req.valid("json");
  const before = await detail(c, projectId);
  await updateProject(c.var.ctx, c.var.tenant.orgId, projectId, patch);
  const after = await detail(c, projectId);
  const fields = changedKeys(before, patch);
  if (fields.length) {
    const sum = fields.includes("originalContractSumCents")
      ? {
          beforeCents: before.originalContractSumCents,
          amountCents: after.originalContractSumCents,
        }
      : {};
    await log(c, after, [{ action: "job_details_changed", data: { fields, ...sum } }]);
  }
  return c.json(after);
});

// Where the job's lines sit under the GC's Procore SOV positions, saved from the SSOV filler and read
// by each pay application's Procore invoice sheet (editors save; anyone sees the sheet).
routes.put("/:projectId/procore-ssov", editor, validate("json", procoreSsovSchema), async (c) => {
  const projectId = c.req.param("projectId");
  await setProcoreSsov(c.var.ctx, c.var.tenant.orgId, projectId, c.req.valid("json"));
  const after = await detail(c, projectId);
  await log(c, after, [{ action: "job_details_changed", data: { fields: ["procoreSsov"] } }]);
  return c.json(after);
});

routes.delete("/:projectId/procore-ssov", editor, async (c) => {
  const projectId = c.req.param("projectId");
  const before = await detail(c, projectId);
  if (before.procoreSsov === null) return c.json(before);
  await setProcoreSsov(c.var.ctx, c.var.tenant.orgId, projectId, null);
  const after = await detail(c, projectId);
  await log(c, after, [{ action: "job_details_changed", data: { fields: ["procoreSsov"] } }]);
  return c.json(after);
});

routes.delete("/:projectId", requireRole("admin"), async (c) => {
  const orgId = c.var.tenant.orgId;
  const projectId = c.req.param("projectId");
  await deleteProject(c.var.ctx, orgId, projectId);
  await purgeFiles(c.var.ctx, projectPrefix(orgId, projectId));
  return c.json({ ok: true });
});

// Schedule of values.
routes.post("/:projectId/sov-lines", editor, validate("json", sovLineSchema), async (c) => {
  const projectId = c.req.param("projectId");
  const input = c.req.valid("json");
  const [id] = await addSovLines(c.var.ctx, c.var.tenant.orgId, projectId, [input]);
  const p = await detail(c, projectId);
  await log(c, p, [
    {
      action: "sov_lines_added",
      subjectId: id,
      data: { count: 1, amountCents: input.originalCents, ...lineData(input) },
    },
  ]);
  return c.json(p, 201);
});

routes.post("/:projectId/sov-lines/bulk", editor, validate("json", bulkSovSchema), async (c) => {
  const projectId = c.req.param("projectId");
  const { lines } = c.req.valid("json");
  const ids = await addSovLines(c.var.ctx, c.var.tenant.orgId, projectId, lines);
  const p = await detail(c, projectId);
  const amountCents = lines.reduce((sum, l) => sum + l.originalCents, 0);
  const one = lines.length === 1 && lines[0] ? lineData(lines[0]) : {};
  await log(c, p, [
    {
      action: "sov_lines_added",
      subjectId: lines.length === 1 ? ids[0] : null,
      data: { count: lines.length, amountCents, ...one },
    },
  ]);
  return c.json(p, 201);
});

routes.patch(
  "/:projectId/sov-lines/:lineId",
  editor,
  validate("json", updateSovLineSchema),
  async (c) => {
    const projectId = c.req.param("projectId");
    const lineId = c.req.param("lineId");
    const { orgId } = c.var.tenant;
    const patch = c.req.valid("json");
    const before = (await detail(c, projectId)).sovLines.find((l) => l.id === lineId);
    await updateSovLine(c.var.ctx, orgId, projectId, lineId, patch);
    const p = await detail(c, projectId);
    const after = p.sovLines.find((l) => l.id === lineId);
    // Reordering alone is not recorded.
    const fields = before ? changedKeys(before, patch, ["sortOrder"]) : [];
    if (before && after && fields.length) {
      await log(c, p, [
        {
          action: "sov_line_changed",
          subjectId: lineId,
          data: {
            ...lineData(after),
            fields,
            ...(fields.includes("originalCents")
              ? { beforeCents: before.originalCents, amountCents: after.originalCents }
              : {}),
            ...(fields.includes("retainagePctBps")
              ? { beforeRateBps: before.retainagePctBps, rateBps: after.retainagePctBps }
              : {}),
          },
        },
      ]);
    }
    return c.json(p);
  },
);

routes.delete("/:projectId/sov-lines/:lineId", editor, async (c) => {
  const projectId = c.req.param("projectId");
  const lineId = c.req.param("lineId");
  const before = (await detail(c, projectId)).sovLines.find((l) => l.id === lineId);
  await deleteSovLine(c.var.ctx, c.var.tenant.orgId, projectId, lineId);
  const p = await detail(c, projectId);
  if (before) {
    await log(c, p, [
      {
        action: "sov_line_deleted",
        subjectId: lineId,
        data: { ...lineData(before), amountCents: before.originalCents },
      },
    ]);
  }
  return c.json(p);
});

// Mid-job start: the last application made before the job moved here.
routes.put("/:projectId/opening", editor, validate("json", openingSchema), async (c) => {
  const projectId = c.req.param("projectId");
  const input = c.req.valid("json");
  await setOpening(c.var.ctx, c.var.tenant.orgId, projectId, input);
  const p = await detail(c, projectId);
  await log(c, p, [
    {
      action: "opening_set",
      data: {
        appNumber: input.appNumber,
        date: input.periodTo,
        amountCents: input.previousCertificatesCents,
      },
    },
  ]);
  return c.json(p);
});

routes.delete("/:projectId/opening", editor, async (c) => {
  const projectId = c.req.param("projectId");
  const had = (await detail(c, projectId)).opening !== null;
  await setOpening(c.var.ctx, c.var.tenant.orgId, projectId, null);
  const p = await detail(c, projectId);
  if (had) await log(c, p, [{ action: "opening_cleared" }]);
  return c.json(p);
});

// Change orders.
routes.post("/:projectId/change-orders", editor, validate("json", changeOrderSchema), async (c) => {
  const projectId = c.req.param("projectId");
  const input = c.req.valid("json");
  const coId = await createChangeOrder(c.var.ctx, c.var.tenant.orgId, projectId, input);
  const p = await detail(c, projectId);
  const co = findCo(p, coId);
  if (co) {
    await log(c, p, [
      {
        action: "change_order_created",
        subjectId: coId,
        data: {
          ...coData(co),
          description: co.description,
          ...(co.submittedOn ? { date: co.submittedOn } : {}),
          ...(co.scheduleDays !== null ? { scheduleDays: co.scheduleDays } : {}),
        },
      },
    ]);
  }
  return c.json(p, 201);
});

routes.post(
  "/:projectId/change-orders/:coId/approve",
  editor,
  validate("json", approveChangeOrderSchema),
  async (c) => {
    const projectId = c.req.param("projectId");
    const coId = c.req.param("coId");
    const { approvedOn } = c.req.valid("json");
    await approveChangeOrder(c.var.ctx, c.var.tenant.orgId, projectId, coId, approvedOn);
    const p = await detail(c, projectId);
    const co = findCo(p, coId);
    if (co) {
      await log(c, p, [
        {
          action: "change_order_approved",
          subjectId: coId,
          data: { ...coData(co), date: approvedOn },
        },
      ]);
    }
    return c.json(p);
  },
);

routes.put(
  "/:projectId/change-orders/:coId/sent",
  editor,
  validate("json", changeOrderSentSchema),
  async (c) => {
    const projectId = c.req.param("projectId");
    const coId = c.req.param("coId");
    const { submittedOn } = c.req.valid("json");
    const before = findCo(await detail(c, projectId), coId);
    await setChangeOrderSubmitted(c.var.ctx, c.var.tenant.orgId, projectId, coId, submittedOn);
    const p = await detail(c, projectId);
    const co = findCo(p, coId);
    if (co && before?.submittedOn !== co.submittedOn) {
      await log(c, p, [
        {
          action: "change_order_sent_changed",
          subjectId: coId,
          data: { ...coData(co), date: co.submittedOn },
        },
      ]);
    }
    return c.json(p);
  },
);

// An email draft about a pending change order was copied or opened ("last chased" on its row and a
// row in its history). Editors only, like the other change order actions; PayApps sends nothing, so
// this records the contractor's own step, never that the GC received anything.
routes.post(
  "/:projectId/change-orders/:coId/emailed",
  editor,
  validate("json", changeOrderEmailedSchema),
  async (c) => {
    const projectId = c.req.param("projectId");
    const coId = c.req.param("coId");
    const { kind } = c.req.valid("json");
    const date = await recordChangeOrderEmailed(c.var.ctx, c.var.tenant.orgId, projectId, coId);
    const p = await detail(c, projectId);
    const co = findCo(p, coId);
    // No repeat row for the same draft kind on the same day: "Copy" then "Open in my email" is one
    // chase, and a dispute file listing it twice reads as two emails that were never sent.
    const latest = co
      ? (await listJobEvents(c.var.ctx, c.var.tenant.orgId, projectId, coId)).find(
          (e) => e.action === "change_order_emailed",
        )
      : undefined;
    const repeat = latest?.data.date === date && latest?.data.emailKind === kind;
    if (co && !repeat) {
      await log(c, p, [
        {
          action: "change_order_emailed",
          subjectId: coId,
          data: { ...coData(co), date, emailKind: kind },
        },
      ]);
    }
    return c.json(p);
  },
);

// Preliminary notices of right to lien for the job (Crew and up to print; nothing is saved).
routes.get("/:projectId/notices", async (c) =>
  c.json(
    await noticeOverview(
      c.var.ctx,
      c.var.tenant.orgId,
      c.req.param("projectId"),
      c.req.query("state") || undefined,
    ),
  ),
);

routes.post("/:projectId/notices/notice.pdf", validate("json", noticePdfSchema), async (c) => {
  const { document, sample, state } = await renderProjectNotice(
    c.var.ctx,
    c.var.tenant.orgId,
    c.req.param("projectId"),
    c.req.valid("json"),
  );
  return new Response(noticePdf(document, { sample }).slice().buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="preliminary-notice-${state}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
});

// California preliminary notices given: the first-furnished date, each notice recorded as given,
// and its § 8118 proof of notice declaration (Crew and up; editors record, anyone prints).
routes.put(
  "/:projectId/notices/ca/first-furnished",
  editor,
  validate("json", caFirstFurnishedSchema),
  async (c) => {
    const projectId = c.req.param("projectId");
    const r = await setCaFirstFurnished(
      c.var.ctx,
      c.var.tenant.orgId,
      projectId,
      c.req.valid("json").firstFurnishedOn,
    );
    if (r.changed) {
      await log(c, { id: projectId, isSample: r.isSample }, [
        { action: "ca_first_furnished_set", data: { date: r.firstFurnishedOn } },
      ]);
    }
    return c.json({ firstFurnishedOn: r.firstFurnishedOn });
  },
);

const noticeData = (s: {
  recipient: CaNoticeSendDto["recipient"];
  method: CaNoticeSendDto["method"];
  givenOn: string;
  tracking: string | null;
}): JobEventData => ({
  recipient: s.recipient,
  method: s.method,
  date: s.givenOn,
  tracking: s.tracking,
});

routes.post(
  "/:projectId/notices/ca/sends",
  editor,
  validate("json", caNoticeSendSchema),
  async (c) => {
    const projectId = c.req.param("projectId");
    const { send, isSample } = await recordCaNoticeSend(
      c.var.ctx,
      c.var.tenant.orgId,
      projectId,
      c.var.tenant.userId,
      c.req.valid("json"),
    );
    await log(c, { id: projectId, isSample }, [
      { action: "ca_notice_recorded", subjectId: send.id, data: noticeData(send) },
    ]);
    return c.json(send, 201);
  },
);

routes.delete("/:projectId/notices/ca/sends/:sendId", editor, async (c) => {
  const projectId = c.req.param("projectId");
  const { send, isSample } = await deleteCaNoticeSend(
    c.var.ctx,
    c.var.tenant.orgId,
    projectId,
    c.req.param("sendId"),
  );
  await log(c, { id: projectId, isSample }, [
    { action: "ca_notice_deleted", subjectId: send.id, data: noticeData(send) },
  ]);
  return c.json({ ok: true });
});

// Files kept with a notice record: § 8118(b)'s mailing receipt or proof of delivery, the signed
// declaration (Crew and up to add or remove; any member lists and downloads).
const noticeIds = (c: {
  req: { param: (k: string) => string | undefined };
  var: AppEnv["Variables"];
}) => ({
  orgId: c.var.tenant.orgId,
  projectId: c.req.param("projectId") ?? "",
  sendId: c.req.param("sendId") ?? "",
});

routes.get("/:projectId/notices/ca/sends/:sendId/attachments", async (c) => {
  const { orgId, projectId, sendId } = noticeIds(c);
  return c.json(await listNoticeFiles(c.var.ctx, orgId, projectId, sendId));
});

routes.post("/:projectId/notices/ca/sends/:sendId/attachments", editor, async (c) => {
  const { orgId, projectId, sendId } = noticeIds(c);
  // Refuse an oversized body before buffering it.
  const length = Number(c.req.header("Content-Length") ?? "0");
  if (length > MAX_UPLOAD_REQUEST_BYTES) throw badRequest("The file is larger than 15 MB");
  if (!(c.req.header("Content-Type") ?? "").startsWith("multipart/form-data")) {
    throw badRequest("Send the file as multipart/form-data in a field named file");
  }
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Send the file in a field named file");
  const raw = String(form.get("category") ?? "backup");
  if (!(ATTACHMENT_CATEGORIES as readonly string[]).includes(raw)) {
    throw badRequest(`category must be one of ${ATTACHMENT_CATEGORIES.join(", ")}`);
  }
  const added = await addNoticeFile(
    c.var.ctx,
    orgId,
    projectId,
    sendId,
    { file, category: raw as AttachmentCategory },
    c.var.tenant.userId,
  );
  const p = await detail(c, projectId);
  await log(c, p, [
    {
      action: "ca_notice_file_added",
      subjectId: sendId,
      data: { recipient: added.recipient, fileName: added.file.fileName },
    },
  ]);
  return c.json(added.file, 201);
});

routes.get("/:projectId/notices/ca/sends/:sendId/attachments/:attachmentId", async (c) => {
  const { orgId, projectId, sendId } = noticeIds(c);
  const id = c.req.param("attachmentId");
  const { row, body } = await getNoticeFile(c.var.ctx, orgId, projectId, sendId, id);
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

routes.delete(
  "/:projectId/notices/ca/sends/:sendId/attachments/:attachmentId",
  editor,
  async (c) => {
    const { orgId, projectId, sendId } = noticeIds(c);
    const { row, recipient } = await deleteNoticeFile(
      c.var.ctx,
      orgId,
      projectId,
      sendId,
      c.req.param("attachmentId"),
    );
    const p = await detail(c, projectId);
    await log(c, p, [
      {
        action: "ca_notice_file_deleted",
        subjectId: sendId,
        data: { recipient, fileName: row.fileName },
      },
    ]);
    return c.json({ ok: true });
  },
);

routes.get("/:projectId/notices/ca/sends/:sendId/proof.pdf", async (c) => {
  const declarant = (c.req.query("declarant") ?? "").slice(0, 200);
  const { document, sample, recipient } = await caProofDocument(
    c.var.ctx,
    c.var.tenant.orgId,
    c.req.param("projectId"),
    c.req.param("sendId"),
    declarant,
  );
  return new Response(noticePdf(document, { sample }).slice().buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="proof-of-notice-${recipient}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
});

// The change order request to send the GC, as a PDF download (viewers too: it reads only).
routes.get("/:projectId/change-orders/:coId/request.pdf", async (c) => {
  const data = await loadChangeOrderRequest(
    c.var.ctx,
    c.var.tenant.orgId,
    c.req.param("projectId"),
    c.req.param("coId"),
  );
  return new Response(changeOrderPdf(data).slice().buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${changeOrderFileName(data)}"`,
      "Cache-Control": "no-store",
    },
  });
});

// The request plus its backup files (not the signed copy) in one PDF to send the GC (viewers too).
routes.get("/:projectId/change-orders/:coId/packet.pdf", async (c) => {
  const packet = await buildChangeOrderPacket(
    c.var.ctx,
    c.var.tenant.orgId,
    c.req.param("projectId"),
    c.req.param("coId"),
  );
  return packetResponse(packet);
});

routes.put(
  "/:projectId/change-orders/:coId/schedule",
  editor,
  validate("json", changeOrderScheduleSchema),
  async (c) => {
    const projectId = c.req.param("projectId");
    const coId = c.req.param("coId");
    const { scheduleDays } = c.req.valid("json");
    const before = findCo(await detail(c, projectId), coId);
    await setChangeOrderSchedule(c.var.ctx, c.var.tenant.orgId, projectId, coId, scheduleDays);
    const p = await detail(c, projectId);
    const co = findCo(p, coId);
    if (co && before?.scheduleDays !== co.scheduleDays) {
      await log(c, p, [
        {
          action: "change_order_time_changed",
          subjectId: coId,
          data: { ...coData(co), scheduleDays: co.scheduleDays },
        },
      ]);
    }
    return c.json(p);
  },
);

routes.post("/:projectId/change-orders/:coId/reject", editor, async (c) => {
  const projectId = c.req.param("projectId");
  const coId = c.req.param("coId");
  await rejectChangeOrder(c.var.ctx, c.var.tenant.orgId, projectId, coId);
  const p = await detail(c, projectId);
  const co = findCo(p, coId);
  if (co) await log(c, p, [{ action: "change_order_rejected", subjectId: coId, data: coData(co) }]);
  return c.json(p);
});

routes.delete("/:projectId/change-orders/:coId", editor, async (c) => {
  const projectId = c.req.param("projectId");
  const coId = c.req.param("coId");
  const before = findCo(await detail(c, projectId), coId);
  await deleteChangeOrder(c.var.ctx, c.var.tenant.orgId, projectId, coId);
  // Its file rows cascaded with it; clear the stored objects too.
  await purgeFiles(c.var.ctx, changeOrderPrefix(c.var.tenant.orgId, projectId, coId));
  const p = await detail(c, projectId);
  if (before) {
    await log(c, p, [
      {
        action: "change_order_deleted",
        subjectId: coId,
        data: { ...coData(before), description: before.description },
      },
    ]);
  }
  return c.json(p);
});

// Files on a change order (its pricing backup, photos, the signed copy): readable by every member,
// added or deleted by editors, on any status (the signed copy arrives after approval).
const coIds = (c: { req: { param: (k: string) => string }; var: AppEnv["Variables"] }) => ({
  orgId: c.var.tenant.orgId,
  projectId: c.req.param("projectId"),
  coId: c.req.param("coId"),
});

// One change order's own history (entered, sent, contract time, approved or rejected, files), newest
// first: the job history's rows for that change order. Any member; 404 for a change order that is not
// on this job (a deleted one's rows stay in the job history).
const coHistory = async (c: Parameters<typeof coIds>[0]) => {
  const { orgId, projectId, coId } = coIds(c);
  const p = await detail(c, projectId);
  const co = findCo(p, coId);
  if (!co) throw notFound("Change order");
  const items = await listJobEvents(c.var.ctx, orgId, p.id, coId);
  return { co, items: items.filter((e) => e.action.startsWith("change_order_")) };
};

routes.get("/:projectId/change-orders/:coId/history", async (c) => {
  return c.json({ items: (await coHistory(c)).items });
});

// The same rows as a CSV, for a change order dispute file (oldest first, like the job's CSV).
routes.get("/:projectId/change-orders/:coId/history.csv", async (c) => {
  const { co, items } = await coHistory(c);
  const name = co.number.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 40) || "change-order";
  return new Response(jobHistoryCsv(items), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="change-order-${name}-history.csv"`,
      "Cache-Control": "no-store",
    },
  });
});

routes.get("/:projectId/change-orders/:coId/attachments", async (c) => {
  const { orgId, projectId, coId } = coIds(c);
  return c.json(await listChangeOrderAttachments(c.var.ctx, orgId, projectId, coId));
});

routes.post("/:projectId/change-orders/:coId/attachments", editor, async (c) => {
  const { orgId, projectId, coId } = coIds(c);
  // Refuse an oversized body before buffering it.
  const length = Number(c.req.header("Content-Length") ?? "0");
  if (length > MAX_UPLOAD_REQUEST_BYTES) throw badRequest("The file is larger than 15 MB");
  if (!(c.req.header("Content-Type") ?? "").startsWith("multipart/form-data")) {
    throw badRequest("Send the file as multipart/form-data in a field named file");
  }
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Send the file in a field named file");
  const raw = String(form.get("category") ?? "backup");
  if (!(ATTACHMENT_CATEGORIES as readonly string[]).includes(raw)) {
    throw badRequest(`category must be one of ${ATTACHMENT_CATEGORIES.join(", ")}`);
  }
  const added = await addChangeOrderAttachment(
    c.var.ctx,
    orgId,
    projectId,
    coId,
    { file, category: raw as AttachmentCategory },
    c.var.tenant.userId,
  );
  const p = await detail(c, projectId);
  const co = findCo(p, coId);
  if (co) {
    await log(c, p, [
      {
        action: "change_order_file_added",
        subjectId: coId,
        data: { changeOrderNumber: co.number, fileName: added.fileName },
      },
    ]);
  }
  return c.json(added, 201);
});

routes.get("/:projectId/change-orders/:coId/attachments/:attachmentId", async (c) => {
  const { orgId, projectId, coId } = coIds(c);
  const id = c.req.param("attachmentId");
  const { row, body } = await getChangeOrderAttachmentFile(c.var.ctx, orgId, projectId, coId, id);
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

routes.delete("/:projectId/change-orders/:coId/attachments/:attachmentId", editor, async (c) => {
  const { orgId, projectId, coId } = coIds(c);
  const row = await deleteChangeOrderAttachment(
    c.var.ctx,
    orgId,
    projectId,
    coId,
    c.req.param("attachmentId"),
  );
  const p = await detail(c, projectId);
  const co = findCo(p, coId);
  if (co) {
    await log(c, p, [
      {
        action: "change_order_file_deleted",
        subjectId: coId,
        data: { changeOrderNumber: co.number, fileName: row.fileName },
      },
    ]);
  }
  return c.json({ ok: true });
});

export default routes;
