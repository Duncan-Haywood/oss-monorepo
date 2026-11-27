// The one-click sample job (src/shared/sample-job.ts). Built through the same services a real job
// uses, so every rule (locked SOV, approval dating, payment checks) applies to it too. One per
// company; it does not count toward the plan's active jobs, and its PDFs say "SAMPLE DATA".
// No history rows are written: those record what a person did, and nobody did these.
import { type SampleEntry, sampleJobPlan } from "@shared/sample-job";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { projects } from "../../db/schema";
import { newId } from "../../lib/ids";
import type { Tenant } from "../../types";
import { findPayApp, getProjectRow, loadBundle, projectDto } from "./bundle";
import { approveChangeOrder, createChangeOrder } from "./change-orders";
import { certifyPayApp, createPayApp, setPayAppLines, submitPayApp } from "./pay-apps";
import { recordPayment } from "./payments";
import { addSovLines, updateSovLine } from "./projects";

export async function findSampleProject(ctx: AppContext, orgId: string) {
  return ctx.db
    .select()
    .from(projects)
    .where(and(eq(projects.orgId, orgId), eq(projects.isSample, true)))
    .get();
}

/** Adds the sample job (or returns the one already there). `created` says which. */
export async function createSampleProject(ctx: AppContext, tenant: Tenant) {
  const { orgId, userId } = tenant;
  const existing = await findSampleProject(ctx, orgId);
  if (existing) return { project: projectDto(existing), created: false };

  const plan = sampleJobPlan(ctx.now());
  const id = newId("prj");
  await ctx.db
    .insert(projects)
    .values({ id, orgId, createdBy: userId, isSample: true, ...plan.project });
  try {
    await seed(ctx, orgId, userId, id, plan);
  } catch (err) {
    // Never leave half a sample behind: the job and everything under it go (ON DELETE CASCADE).
    await ctx.db.delete(projects).where(and(eq(projects.id, id), eq(projects.orgId, orgId)));
    ctx.logger.error("sample.seed_failed", { error: String(err) });
    throw err;
  }
  return { project: projectDto(await getProjectRow(ctx, orgId, id)), created: true };
}

async function seed(
  ctx: AppContext,
  orgId: string,
  userId: string,
  projectId: string,
  plan: ReturnType<typeof sampleJobPlan>,
) {
  const lineIds = await addSovLines(
    ctx,
    orgId,
    projectId,
    plan.sov.map(({ itemNumber, description, originalCents }) => ({
      itemNumber,
      description,
      originalCents,
    })),
  );
  for (const [i, l] of plan.sov.entries()) {
    const lineId = lineIds[i];
    if (l.retainagePctBps !== undefined && lineId) {
      await updateSovLine(ctx, orgId, projectId, lineId, { retainagePctBps: l.retainagePctBps });
    }
  }

  let coLineId: string | undefined;
  const lineFor = (e: SampleEntry) => (e.line === "co1" ? coLineId : lineIds[e.line]);

  for (const [n, app] of plan.payApps.entries()) {
    // The change orders come in during the second month, after application #1 is submitted.
    if (n === 1) coLineId = await changeOrders(ctx, orgId, projectId, plan, lineIds);

    const payAppId = await createPayApp(ctx, orgId, projectId, {
      periodFrom: app.periodFrom,
      periodTo: app.periodTo,
      applicationDate: app.applicationDate,
    });
    if (app.entries.length) {
      await setPayAppLines(ctx, orgId, projectId, payAppId, {
        lines: app.entries.map((e) => ({
          sovLineId: lineFor(e) ?? "",
          workThisPeriodCents: e.workCents,
          storedMaterialsCents: 0,
          retainageReleasedCents: 0,
        })),
      });
    }
    if (app.outcome === "draft") continue;
    await submitPayApp(ctx, orgId, projectId, payAppId);
    if (app.outcome === "submitted") continue;
    await certifyPayApp(ctx, orgId, projectId, payAppId, undefined);
    const { app: row } = findPayApp(await loadBundle(ctx, orgId, projectId), payAppId);
    const certified = row.certifiedAmountCents ?? 0;
    const amountCents = app.outcome === "paid" ? certified : certified - plan.shortByCents;
    await recordPayment(
      ctx,
      orgId,
      projectId,
      payAppId,
      { amountCents, receivedOn: app.paidOn ?? app.applicationDate, reference: app.reference },
      userId,
    );
  }
}

/** CO-1 approved (adds a line), CO-2 still pending. Returns CO-1's new line. */
async function changeOrders(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  plan: ReturnType<typeof sampleJobPlan>,
  lineIds: string[],
) {
  const a = plan.approvedChangeOrder;
  await createChangeOrder(ctx, orgId, projectId, {
    number: a.number,
    description: a.description,
    submittedOn: a.submittedOn,
    scheduleDays: a.scheduleDays,
    items: [{ newLine: a.newLine, amountCents: a.amountCents }],
  });
  const p = plan.pendingChangeOrder;
  await createChangeOrder(ctx, orgId, projectId, {
    number: p.number,
    description: p.description,
    submittedOn: p.submittedOn,
    scheduleDays: p.scheduleDays,
    items: [{ sovLineId: lineIds[p.line] ?? "", amountCents: p.amountCents }],
  });
  const b = await loadBundle(ctx, orgId, projectId);
  const co1 = b.changeOrders.find((co) => co.number === a.number);
  if (!co1) throw new Error("sample: CO-1 missing");
  await approveChangeOrder(ctx, orgId, projectId, co1.id, a.approvedOn);
  return b.sov.find((l) => l.changeOrderId === co1.id)?.id;
}
