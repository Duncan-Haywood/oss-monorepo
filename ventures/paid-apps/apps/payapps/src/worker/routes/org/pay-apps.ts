// /api/orgs/:orgId/projects/:projectId/pay-apps — pay applications, their entries and exports.
import {
  certifyPayAppSchema,
  closeShortSchema,
  createPayAppSchema,
  createWaiverSchema,
  gaAffidavitFilingSchema,
  gaAffidavitPdfSchema,
  gaContractorCopySchema,
  gaPaidAffidavitSchema,
  markPaidSchema,
  ownerPaidManySchema,
  ownerPaidSchema,
  payAppLinesSchema,
  recordPaymentSchema,
  retainageReleaseSchema,
  unrecordedPaymentSchema,
  updatePayAppSchema,
  updateWaiverSchema,
} from "@shared/api/schemas";
import type { PayAppDetailDto } from "@shared/api/types";
import { ATTACHMENT_CATEGORIES, type AttachmentCategory } from "@shared/attachments";
import { changedFields } from "@shared/pay-app-history";
import { Hono } from "hono";
import { badRequest, notFound } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import { applicationPdf } from "../../services/export/application-pdf";
import { continuationCsv, summaryCsv } from "../../services/export/csv";
import { exportFileName } from "../../services/export/model";
import { noticePdf, waiverPdf } from "../../services/export/waiver-pdf";
import {
  addAttachment,
  deleteAttachment,
  getAttachmentFile,
  listAttachments,
  MAX_UPLOAD_REQUEST_BYTES,
  payAppPrefix,
  purgeFiles,
} from "../../services/payapps/attachments";
import {
  loadBundle,
  payAppDetailDto,
  payAppDto,
  projectDetailDto,
} from "../../services/payapps/bundle";
import { loadApplicationDocument } from "../../services/payapps/documents";
import {
  clearGaAffidavitFiling,
  clearGaContractorCopy,
  clearGaPaidAffidavit,
  gaAffidavitOverview,
  renderGaAffidavit,
  setGaAffidavitFiling,
  setGaContractorCopy,
  setGaPaidAffidavit,
} from "../../services/payapps/ga-affidavit";
import {
  historyCsv,
  listPayAppEvents,
  type PayAppEventInput,
  recordPayAppEvent,
} from "../../services/payapps/history";
import { buildPayAppPacket, packetResponse } from "../../services/payapps/packet";
import {
  certifyPayApp,
  createPayApp,
  deletePayApp,
  markPayAppPaid,
  releaseRetainage,
  setPayAppLines,
  submitPayApp,
  updatePayApp,
} from "../../services/payapps/pay-apps";
import {
  closeShort,
  deletePayment,
  recordPayment,
  recordUnrecordedPayment,
  reopenShort,
  setOwnerPaid,
  setOwnerPaidMany,
} from "../../services/payapps/payments";
import {
  createWaiver,
  deleteWaiver,
  renderWaiver,
  setWaiverStatus,
  waiverOverview,
} from "../../services/payapps/waivers";
import {
  autoSendPayment,
  payAppQuickBooks,
  sendPayApp,
  sendPayment,
  sendShortCredit,
} from "../../services/quickbooks";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();
const editor = requireRole("editor");

type Vars = { var: AppEnv["Variables"]; req: { param: (k: string) => string | undefined } };
const ids = (c: Vars) => {
  const projectId = c.req.param("projectId");
  if (!projectId) throw notFound("Project");
  return { orgId: c.var.tenant.orgId, projectId, payAppId: c.req.param("payAppId") ?? "" };
};
const detail = async (c: Vars, payAppId: string) => {
  const { orgId, projectId } = ids(c);
  return payAppDetailDto(await loadBundle(c.var.ctx, orgId, projectId), payAppId);
};

/**
 * After a payment is recorded: send it to QuickBooks if the company asked for that (never throws),
 * log the send in the application's history, and return what happened for the page to show.
 */
const autoSend = async (c: Vars, paymentId: string) => {
  const { orgId, projectId, payAppId } = ids(c);
  const out = await autoSendPayment(
    c.var.ctx,
    orgId,
    projectId,
    payAppId,
    paymentId,
    c.var.tenant.userId,
  );
  const d = await detail(c, payAppId);
  if (out?.sent) {
    const pm = d.payments.find((p) => p.id === paymentId);
    await log(c, "quickbooks_payment_sent", d, {
      amountCents: pm?.amountCents,
      date: pm?.receivedOn,
    });
  }
  return { d, quickbooksAuto: out };
};

// Exports. Attachments, never rendered inline by the browser in our origin.
const download = (body: BodyInit, type: string, filename: string) =>
  new Response(body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });

/** Adds a row to the application's history after a change went through (best effort). */
const log = (
  c: Vars,
  action: PayAppEventInput["action"],
  d: PayAppDetailDto | null,
  data: PayAppEventInput["data"] = {},
) => {
  const { orgId, projectId, payAppId } = ids(c);
  return recordPayAppEvent(c.var.ctx, {
    orgId,
    projectId,
    payAppId: d?.id ?? payAppId,
    payAppNumber: d?.number,
    action,
    actorUserId: c.var.tenant.userId,
    data: d ? { status: d.status, ...data } : data,
  });
};

// History of every application on the job, newest first, deleted drafts included (any member).
routes.get("/history", async (c) => {
  const { orgId, projectId } = ids(c);
  return c.json({ items: await listPayAppEvents(c.var.ctx, orgId, projectId) });
});

// Pay-when-paid: one owner's payment date on several applications of the job at once (the GC says
// one owner payment covered more than one period). All or nothing; one history row per application
// whose date changed, naming the others. Answers with the job, as the job page shows it.
routes.put("/owner-paid", editor, validate("json", ownerPaidManySchema), async (c) => {
  const { orgId, projectId } = ids(c);
  const { payAppIds, ownerPaidOn } = c.req.valid("json");
  const changed = await setOwnerPaidMany(c.var.ctx, orgId, projectId, payAppIds, ownerPaidOn);
  for (const a of changed) {
    await recordPayAppEvent(c.var.ctx, {
      orgId,
      projectId,
      payAppId: a.id,
      payAppNumber: a.number,
      action: "owner_payment_recorded",
      actorUserId: c.var.tenant.userId,
      data: {
        status: a.status,
        date: ownerPaidOn,
        together: changed
          .filter((o) => o.id !== a.id)
          .map((o) => o.number)
          .sort((x, y) => x - y),
      },
    });
  }
  return c.json(projectDetailDto(await loadBundle(c.var.ctx, orgId, projectId)));
});

routes.get("/", async (c) => {
  const { orgId, projectId } = ids(c);
  const b = await loadBundle(c.var.ctx, orgId, projectId);
  return c.json({ items: b.payApps.map((a, i) => payAppDto(a, b.computed[i], b.payments)) });
});

routes.post("/", editor, validate("json", createPayAppSchema), async (c) => {
  const { orgId, projectId } = ids(c);
  const id = await createPayApp(c.var.ctx, orgId, projectId, c.req.valid("json"));
  const d = await detail(c, id);
  await log(c, "created", d, { date: d.periodTo });
  return c.json(d, 201);
});

routes.get("/:payAppId", async (c) => c.json(await detail(c, ids(c).payAppId)));

// One application's history, newest first (any member); also as CSV for a dispute file.
routes.get("/:payAppId/history", async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
  await detail(c, payAppId); // 404 for an application not on this job
  return c.json({ items: await listPayAppEvents(c.var.ctx, orgId, projectId, payAppId) });
});

routes.get("/:payAppId/history.csv", async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
  const d = await detail(c, payAppId);
  const events = await listPayAppEvents(c.var.ctx, orgId, projectId, payAppId);
  return download(
    historyCsv(events),
    "text/csv; charset=utf-8",
    `pay-application-${d.number}-history.csv`,
  );
});

// QuickBooks Online: what this application would become as an invoice, and sending it (editors).
routes.get("/:payAppId/quickbooks", async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
  return c.json(await payAppQuickBooks(c.var.ctx, orgId, projectId, payAppId));
});

routes.post("/:payAppId/quickbooks", editor, async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
  const out = await sendPayApp(c.var.ctx, orgId, projectId, payAppId, c.var.tenant.userId);
  await log(c, "quickbooks_invoice_sent", await detail(c, payAppId));
  return c.json(out);
});

// A payment received, as a QuickBooks payment against the invoice; or marked as entered there by
// hand (`?already=1`), which sends nothing.
routes.post("/:payAppId/payments/:paymentId/quickbooks", editor, async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
  const paymentId = c.req.param("paymentId");
  const already = c.req.query("already") === "1";
  const out = await sendPayment(
    c.var.ctx,
    orgId,
    projectId,
    payAppId,
    paymentId,
    c.var.tenant.userId,
    { alreadyInQuickBooks: already },
  );
  const d = await detail(c, payAppId);
  const pm = d.payments.find((p) => p.id === paymentId);
  await log(c, already ? "quickbooks_payment_marked" : "quickbooks_payment_sent", d, {
    amountCents: pm?.amountCents,
    date: pm?.receivedOn,
  });
  return c.json(out);
});

// The balance closed short, as a QuickBooks credit memo applied to the invoice; or marked as
// entered there by hand (`?already=1`), which sends nothing.
routes.post("/:payAppId/quickbooks/short-credit", editor, async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
  const already = c.req.query("already") === "1";
  const out = await sendShortCredit(c.var.ctx, orgId, projectId, payAppId, c.var.tenant.userId, {
    alreadyInQuickBooks: already,
  });
  await log(
    c,
    already ? "quickbooks_credit_marked" : "quickbooks_credit_sent",
    await detail(c, payAppId),
    {
      amountCents: out.shortCredit?.cents,
      reason: out.shortCredit?.reason,
    },
  );
  return c.json(out);
});

routes.patch("/:payAppId", editor, validate("json", updatePayAppSchema), async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
  const patch = c.req.valid("json");
  const before = await detail(c, payAppId);
  await updatePayApp(c.var.ctx, orgId, projectId, payAppId, patch);
  const d = await detail(c, payAppId);
  const fields = changedFields({ ...before }, patch);
  if (fields.length) await log(c, "details_changed", d, { fields });
  return c.json(d);
});

routes.put("/:payAppId/lines", editor, validate("json", payAppLinesSchema), async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
  await setPayAppLines(c.var.ctx, orgId, projectId, payAppId, c.req.valid("json"));
  const d = await detail(c, payAppId);
  await log(c, "entries_saved", d, { amountCents: d.currentPaymentDueCents });
  return c.json(d);
});

// Retainage release by percentage or amount: preview (default) or write it to the draft.
routes.post(
  "/:payAppId/retainage-release",
  editor,
  validate("json", retainageReleaseSchema),
  async (c) => {
    const { orgId, projectId, payAppId } = ids(c);
    const out = await releaseRetainage(c.var.ctx, orgId, projectId, payAppId, c.req.valid("json"));
    if (!out.applied) return c.json(out);
    const d = await detail(c, payAppId);
    await log(c, "retainage_released", d, { amountCents: out.plan.releaseCents });
    return c.json({ ...out, detail: d });
  },
);

routes.post("/:payAppId/submit", editor, async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
  await submitPayApp(c.var.ctx, orgId, projectId, payAppId);
  const d = await detail(c, payAppId);
  await log(c, "submitted", d, { amountCents: d.currentPaymentDueCents });
  return c.json(d);
});

routes.post("/:payAppId/certify", editor, validate("json", certifyPayAppSchema), async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
  await certifyPayApp(
    c.var.ctx,
    orgId,
    projectId,
    payAppId,
    c.req.valid("json").certifiedAmountCents,
  );
  const d = await detail(c, payAppId);
  await log(c, "certified", d, { amountCents: d.certifiedAmountCents ?? undefined });
  return c.json(d);
});

// Mark paid in full. With the date received (and a check number), the balance is recorded as a
// payment, so the history shows a payment that made it paid; without, the old status-only mark.
routes.post("/:payAppId/mark-paid", editor, async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
  const raw = await c.req.json().catch(() => ({}));
  const parsed = markPaidSchema.safeParse(raw ?? {});
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid request");
  const recorded = await markPayAppPaid(
    c.var.ctx,
    orgId,
    projectId,
    payAppId,
    c.var.tenant.userId,
    parsed.data,
  );
  const d = await detail(c, payAppId);
  if (recorded) {
    await log(c, "payment_recorded", d, {
      amountCents: recorded.amountCents,
      date: recorded.receivedOn,
      reference: recorded.reference,
    });
    const sent = await autoSend(c, recorded.paymentId);
    return c.json({ ...sent.d, quickbooksAuto: sent.quickbooksAuto });
  }
  await log(c, "marked_paid", d, { amountCents: d.expectedCents });
  return c.json(d);
});

// An application marked paid with no payment behind it: record the money as one payment now.
routes.post(
  "/:payAppId/payments/unrecorded",
  editor,
  validate("json", unrecordedPaymentSchema),
  async (c) => {
    const { orgId, projectId, payAppId } = ids(c);
    const input = c.req.valid("json");
    const { amountCents: amount, paymentId } = await recordUnrecordedPayment(
      c.var.ctx,
      orgId,
      projectId,
      payAppId,
      input,
      c.var.tenant.userId,
    );
    const d = await detail(c, payAppId);
    await log(c, "payment_recorded", d, {
      amountCents: amount,
      date: input.receivedOn,
      reference: input.reference?.trim() || null,
      // Already paid before this: the history must not say this payment made it paid.
      status: undefined,
    });
    const sent = await autoSend(c, paymentId);
    return c.json({ ...sent.d, quickbooksAuto: sent.quickbooksAuto }, 201);
  },
);

// Payments received against an application. Reaching the expected amount marks it paid; deleting a
// payment from a paid application reopens it.
routes.post("/:payAppId/payments", editor, validate("json", recordPaymentSchema), async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
  const input = c.req.valid("json");
  const paymentId = await recordPayment(
    c.var.ctx,
    orgId,
    projectId,
    payAppId,
    input,
    c.var.tenant.userId,
  );
  const d = await detail(c, payAppId);
  await log(c, "payment_recorded", d, {
    amountCents: input.amountCents,
    date: input.receivedOn,
    reference: input.reference?.trim() || null,
  });
  const sent = await autoSend(c, paymentId);
  return c.json({ ...sent.d, quickbooksAuto: sent.quickbooksAuto }, 201);
});

routes.delete("/:payAppId/payments/:paymentId", editor, async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
  const paymentId = c.req.param("paymentId");
  const pm = (await detail(c, payAppId)).payments.find((p) => p.id === paymentId);
  await deletePayment(c.var.ctx, orgId, projectId, payAppId, paymentId, {
    confirmQuickBooks: c.req.query("confirmQuickBooks") === "1",
  });
  const d = await detail(c, payAppId);
  await log(c, "payment_deleted", d, {
    amountCents: pm?.amountCents,
    date: pm?.receivedOn,
    reference: pm?.reference ?? null,
  });
  return c.json(d);
});

// Paid short: close the unpaid balance as a backcharge, disputed or written off (the application
// turns paid and the balance leaves the aging), or reopen it.
routes.post("/:payAppId/close-short", editor, validate("json", closeShortSchema), async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
  const input = c.req.valid("json");
  await closeShort(c.var.ctx, orgId, projectId, payAppId, input);
  const d = await detail(c, payAppId);
  await log(c, "closed_short", d, {
    amountCents: d.shortClose?.cents,
    date: input.closedOn,
    reason: input.reason,
    note: input.note?.trim() || null,
  });
  return c.json(d);
});

routes.delete("/:payAppId/close-short", editor, async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
  await reopenShort(c.var.ctx, orgId, projectId, payAppId, {
    confirmQuickBooks: c.req.query("confirmQuickBooks") === "1",
  });
  const d = await detail(c, payAppId);
  await log(c, "reopened_short", d);
  return c.json(d);
});

// Pay-when-paid: the day the owner paid the GC for this application (null clears it). The job's pay
// terms then count from it.
routes.put("/:payAppId/owner-paid", editor, validate("json", ownerPaidSchema), async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
  const { ownerPaidOn } = c.req.valid("json");
  const before = await detail(c, payAppId);
  await setOwnerPaid(c.var.ctx, orgId, projectId, payAppId, ownerPaidOn);
  const d = await detail(c, payAppId);
  if (before.ownerPaidOn !== d.ownerPaidOn) {
    await log(
      c,
      ownerPaidOn === null ? "owner_payment_cleared" : "owner_payment_recorded",
      d,
      ownerPaidOn === null ? { date: before.ownerPaidOn ?? undefined } : { date: ownerPaidOn },
    );
  }
  return c.json(d);
});

routes.delete("/:payAppId", editor, async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
  const before = await detail(c, payAppId);
  await deletePayApp(c.var.ctx, orgId, projectId, payAppId);
  // Logged with the number read before the delete: the history outlives the draft.
  await log(c, "deleted", before, { amountCents: before.currentPaymentDueCents });
  await purgeFiles(c.var.ctx, payAppPrefix(orgId, projectId, payAppId));
  return c.json({ ok: true });
});

routes.get("/:payAppId/application.pdf", async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
  const data = await loadApplicationDocument(c.var.ctx, orgId, projectId, payAppId);
  const bytes = applicationPdf(data);
  return download(bytes.slice().buffer, "application/pdf", exportFileName(data, "pdf"));
});

// The application plus its backup files in one PDF to send the GC (any member). `files` names the
// attachments to include, in order (comma-separated ids); without it, every file but the signed
// application, backup first, then photos, then the rest.
routes.get("/:payAppId/packet.pdf", async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
  const raw = c.req.query("files");
  const chosen =
    raw === undefined
      ? null
      : raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
  if (chosen && chosen.length > 40) throw badRequest("Choose at most 40 files");
  const packet = await buildPayAppPacket(c.var.ctx, orgId, projectId, payAppId, chosen);
  return packetResponse(packet);
});

routes.get("/:payAppId/continuation.csv", async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
  const data = await loadApplicationDocument(c.var.ctx, orgId, projectId, payAppId);
  return download(
    continuationCsv(data),
    "text/csv; charset=utf-8",
    exportFileName(data, "csv", "-continuation"),
  );
});

routes.get("/:payAppId/summary.csv", async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
  const data = await loadApplicationDocument(c.var.ctx, orgId, projectId, payAppId);
  return download(
    summaryCsv(data),
    "text/csv; charset=utf-8",
    exportFileName(data, "csv", "-summary"),
  );
});

// Lien waivers for this pay application (Crew and up to create or change; readable on any plan).
routes.get("/:payAppId/waivers", async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
  const state = c.req.query("state") || undefined;
  return c.json(await waiverOverview(c.var.ctx, orgId, projectId, payAppId, state));
});

routes.post("/:payAppId/waivers", editor, validate("json", createWaiverSchema), async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
  const input = c.req.valid("json");
  const userId = c.var.tenant.userId;
  const w = await createWaiver(c.var.ctx, orgId, projectId, payAppId, input, userId);
  await log(c, "waiver_created", null, { waiverKind: w.kind, amountCents: w.amountCents });
  return c.json(w, 201);
});

routes.patch(
  "/:payAppId/waivers/:waiverId",
  editor,
  validate("json", updateWaiverSchema),
  async (c) => {
    const { orgId, payAppId } = ids(c);
    const id = c.req.param("waiverId");
    const w = await setWaiverStatus(c.var.ctx, orgId, payAppId, id, c.req.valid("json").status);
    await log(c, "waiver_status_changed", null, {
      waiverKind: w.kind,
      waiverStatus: w.status,
      amountCents: w.amountCents,
    });
    return c.json(w);
  },
);

routes.delete("/:payAppId/waivers/:waiverId", editor, async (c) => {
  const { orgId, payAppId } = ids(c);
  const w = await deleteWaiver(c.var.ctx, orgId, payAppId, c.req.param("waiverId"));
  await log(c, "waiver_deleted", null, { waiverKind: w.kind, amountCents: w.amountCents });
  return c.json({ ok: true });
});

routes.get("/:payAppId/waivers/:waiverId/waiver.pdf", async (c) => {
  const { orgId, payAppId } = ids(c);
  const { row, document, sample } = await renderWaiver(
    c.var.ctx,
    orgId,
    payAppId,
    c.req.param("waiverId"),
  );
  const bytes = waiverPdf(document, { sample });
  return download(
    bytes.slice().buffer,
    "application/pdf",
    `lien-waiver-${row.state}-${row.kind}-${row.id}.pdf`,
  );
});

// The affidavit of nonpayment for a sent Georgia waiver (O.C.G.A. § 44-14-366(g)(2), 90 days) or
// Mississippi waiver (Miss. Code Ann. § 85-7-433(3), 60 days): the form filled from the waiver, its
// days, and the PDF (Crew and up to print; nothing saved). The path says "ga" for both: Georgia's
// came first, and renaming it would break links already in use.
routes.get("/:payAppId/waivers/:waiverId/ga-affidavit", async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
  return c.json(
    await gaAffidavitOverview(c.var.ctx, orgId, projectId, payAppId, c.req.param("waiverId")),
  );
});

routes.post(
  "/:payAppId/waivers/:waiverId/ga-affidavit.pdf",
  validate("json", gaAffidavitPdfSchema),
  async (c) => {
    const { orgId, payAppId } = ids(c);
    const waiverId = c.req.param("waiverId");
    const { document, sample, state } = await renderGaAffidavit(
      c.var.ctx,
      orgId,
      payAppId,
      waiverId,
      c.req.valid("json").fields,
    );
    return download(
      noticePdf(document, { sample }).slice().buffer,
      "application/pdf",
      `affidavit-of-nonpayment-${state}-${waiverId}.pdf`,
    );
  },
);

// The affidavit recorded as filed, and its copy to the owner (editors, Crew and up). Recording it
// stops the 90-day (Mississippi: 60-day) reminder and starts the 7-day (2-day) one for the copy.
routes.put(
  "/:payAppId/waivers/:waiverId/ga-affidavit/filing",
  editor,
  validate("json", gaAffidavitFilingSchema),
  async (c) => {
    const { orgId, payAppId } = ids(c);
    const input = c.req.valid("json");
    const r = await setGaAffidavitFiling(
      c.var.ctx,
      orgId,
      payAppId,
      c.req.param("waiverId"),
      input,
    );
    const data = {
      waiverKind: r.waiver.kind,
      amountCents: r.waiver.amountCents,
      state: r.waiver.state,
    };
    if (r.filedChanged) {
      await log(c, "ga_affidavit_filed", null, {
        ...data,
        date: input.filedOn,
        county: input.county,
      });
    }
    if (r.copyAdded && input.copySentOn) {
      await log(c, "ga_affidavit_copy_sent", null, { ...data, date: input.copySentOn });
    }
    return c.json(r.waiver);
  },
);

routes.delete("/:payAppId/waivers/:waiverId/ga-affidavit/filing", editor, async (c) => {
  const { orgId, payAppId } = ids(c);
  const w = await clearGaAffidavitFiling(c.var.ctx, orgId, payAppId, c.req.param("waiverId"));
  await log(c, "ga_affidavit_cleared", null, {
    waiverKind: w.kind,
    amountCents: w.amountCents,
    state: w.state,
  });
  return c.json(w);
});

routes.put(
  "/:payAppId/waivers/:waiverId/ga-affidavit/contractor-copy",
  editor,
  validate("json", gaContractorCopySchema),
  async (c) => {
    const { orgId, payAppId } = ids(c);
    const input = c.req.valid("json");
    const r = await setGaContractorCopy(c.var.ctx, orgId, payAppId, c.req.param("waiverId"), input);
    if (r.changed) {
      await log(c, "ga_affidavit_contractor_copy", null, {
        waiverKind: r.waiver.kind,
        amountCents: r.waiver.amountCents,
        ...(input.copy === "owed" && input.sentOn ? { date: input.sentOn } : {}),
      });
    }
    return c.json(r.waiver);
  },
);

routes.delete("/:payAppId/waivers/:waiverId/ga-affidavit/contractor-copy", editor, async (c) => {
  const { orgId, payAppId } = ids(c);
  return c.json(await clearGaContractorCopy(c.var.ctx, orgId, payAppId, c.req.param("waiverId")));
});

routes.put(
  "/:payAppId/waivers/:waiverId/ga-affidavit/paid-affidavit",
  editor,
  validate("json", gaPaidAffidavitSchema),
  async (c) => {
    const { orgId, payAppId } = ids(c);
    const input = c.req.valid("json");
    const r = await setGaPaidAffidavit(c.var.ctx, orgId, payAppId, c.req.param("waiverId"), input);
    const data = {
      waiverKind: r.waiver.kind,
      amountCents: r.waiver.amountCents,
      state: r.waiver.state,
    };
    if (r.signedChanged) {
      await log(c, "ga_paid_affidavit_signed", null, { ...data, date: input.signedOn });
    }
    if (r.recordedAdded && input.recordedOn) {
      await log(c, "ga_paid_affidavit_recorded", null, { ...data, date: input.recordedOn });
    }
    return c.json(r.waiver);
  },
);

routes.delete("/:payAppId/waivers/:waiverId/ga-affidavit/paid-affidavit", editor, async (c) => {
  const { orgId, payAppId } = ids(c);
  const w = await clearGaPaidAffidavit(c.var.ctx, orgId, payAppId, c.req.param("waiverId"));
  await log(c, "ga_paid_affidavit_cleared", null, {
    waiverKind: w.kind,
    amountCents: w.amountCents,
    state: w.state,
  });
  return c.json(w);
});

// Files attached to this pay application: readable by every member, added or deleted by editors.
routes.get("/:payAppId/attachments", async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
  return c.json(await listAttachments(c.var.ctx, orgId, projectId, payAppId));
});

routes.post("/:payAppId/attachments", editor, async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
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
  const category = raw as AttachmentCategory;
  const userId = c.var.tenant.userId;
  const added = await addAttachment(
    c.var.ctx,
    orgId,
    projectId,
    payAppId,
    { file, category },
    userId,
  );
  await log(c, "attachment_added", null, { fileName: added.fileName });
  return c.json(added, 201);
});

routes.get("/:payAppId/attachments/:attachmentId", async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
  const id = c.req.param("attachmentId");
  const { row, body } = await getAttachmentFile(c.var.ctx, orgId, projectId, payAppId, id);
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

routes.delete("/:payAppId/attachments/:attachmentId", editor, async (c) => {
  const { orgId, projectId, payAppId } = ids(c);
  const row = await deleteAttachment(
    c.var.ctx,
    orgId,
    projectId,
    payAppId,
    c.req.param("attachmentId"),
  );
  await log(c, "attachment_deleted", null, { fileName: row.fileName });
  return c.json({ ok: true });
});

export default routes;
