// Loads everything the pay-app math needs for one project (always scoped by orgId) and computes it.
import type {
  ChangeOrderDto,
  LineQuantityDto,
  OpeningDto,
  PayAppDetailDto,
  PayAppDto,
  PaymentDto,
  ProjectDetailDto,
  ProjectDto,
  SovLineDto,
} from "@shared/api/types";
import { parsePlacement } from "@shared/gc-export/procore-placement";
import { type LienBillingApp, type LienDeadlineResult, lienDeadline } from "@shared/lien-deadline";
import {
  BLOCKING_WARNINGS,
  type ChangeOrderInput,
  type ComputedApplication,
  computeApplications,
  type PeriodInput,
  sovOriginalTotal,
} from "@shared/payapp-math";
import { expectedCents, paymentPosition, unrecordedPaidCents } from "@shared/payments";
import { isUnitPriced, quantityToDate } from "@shared/unit-price";
import { and, asc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  changeOrderItems,
  changeOrders,
  payAppLines,
  payAppPayments,
  payApps,
  projects,
  sovLines,
} from "../../db/schema";
import { notFound } from "../../lib/errors";

export type ProjectRow = typeof projects.$inferSelect;
export type PayAppRow = typeof payApps.$inferSelect;
export type SovLineRow = typeof sovLines.$inferSelect;
export type PaymentRow = typeof payAppPayments.$inferSelect;

export async function getProjectRow(ctx: AppContext, orgId: string, projectId: string) {
  const row = await ctx.db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)))
    .get();
  if (!row) throw notFound("Project");
  return row;
}

export interface ProjectBundle {
  project: ProjectRow;
  sov: SovLineRow[];
  changeOrders: (typeof changeOrders.$inferSelect & {
    items: (typeof changeOrderItems.$inferSelect)[];
  })[];
  payApps: PayAppRow[];
  lines: (typeof payAppLines.$inferSelect)[];
  /** Payments received, every application of the project, oldest first. */
  payments: PaymentRow[];
  computed: ComputedApplication[];
}

export async function loadBundle(
  ctx: AppContext,
  orgId: string,
  projectId: string,
): Promise<ProjectBundle> {
  const project = await getProjectRow(ctx, orgId, projectId);
  const [sov, cos, coItems, apps, lines, payments] = await Promise.all([
    ctx.db
      .select()
      .from(sovLines)
      .where(and(eq(sovLines.orgId, orgId), eq(sovLines.projectId, projectId)))
      .orderBy(asc(sovLines.sortOrder)),
    ctx.db
      .select()
      .from(changeOrders)
      .where(and(eq(changeOrders.orgId, orgId), eq(changeOrders.projectId, projectId)))
      .orderBy(asc(changeOrders.createdAt)),
    ctx.db
      .select({ item: changeOrderItems })
      .from(changeOrderItems)
      .innerJoin(changeOrders, eq(changeOrders.id, changeOrderItems.changeOrderId))
      .where(and(eq(changeOrderItems.orgId, orgId), eq(changeOrders.projectId, projectId))),
    ctx.db
      .select()
      .from(payApps)
      .where(and(eq(payApps.orgId, orgId), eq(payApps.projectId, projectId)))
      .orderBy(asc(payApps.number)),
    ctx.db
      .select({ line: payAppLines })
      .from(payAppLines)
      .innerJoin(payApps, eq(payApps.id, payAppLines.payAppId))
      .where(and(eq(payAppLines.orgId, orgId), eq(payApps.projectId, projectId))),
    ctx.db
      .select({ payment: payAppPayments })
      .from(payAppPayments)
      .innerJoin(payApps, eq(payApps.id, payAppPayments.payAppId))
      .where(and(eq(payAppPayments.orgId, orgId), eq(payApps.projectId, projectId)))
      .orderBy(asc(payAppPayments.receivedOn), asc(payAppPayments.createdAt)),
  ]);
  const items = coItems.map((r) => r.item);
  const changeOrdersWithItems = cos.map((co) => ({
    ...co,
    items: items.filter((i) => i.changeOrderId === co.id),
  }));
  const appLines = lines.map((r) => r.line);
  const computed = computeApplications(
    { originalContractSumCents: project.originalContractSumCents, opening: openingOf(project) },
    sov.map((l) => ({
      id: l.id,
      itemNumber: l.itemNumber,
      description: l.description,
      originalCents: l.originalCents,
      sortOrder: l.sortOrder,
      openingCompletedCents: l.openingCompletedCents,
      openingReleasedCents: l.openingReleasedCents,
      retainagePctBps: l.retainagePctBps,
    })),
    changeOrdersWithItems.map(toChangeOrderInput),
    apps.map((a) => toPeriodInput(a, appLines)),
  );
  return {
    project,
    sov,
    changeOrders: changeOrdersWithItems,
    payApps: apps,
    lines: appLines,
    payments: payments.map((r) => r.payment),
    computed,
  };
}

/** The opening application of a mid-job start, or null for a job billed here from #1. */
export function openingOf(p: ProjectRow): OpeningDto | null {
  if (p.openingAppNumber === null || p.openingPeriodTo === null) return null;
  return {
    appNumber: p.openingAppNumber,
    periodTo: p.openingPeriodTo,
    previousCertificatesCents: p.openingPreviousCertificatesCents ?? 0,
    retainageHeldCents: p.openingRetainageHeldCents,
  };
}

export function toChangeOrderInput(co: ProjectBundle["changeOrders"][number]): ChangeOrderInput {
  return {
    id: co.id,
    number: co.number,
    status: co.status,
    approvedOn: co.approvedOn,
    items: co.items.map((i) => ({ sovLineId: i.sovLineId, amountCents: i.amountCents })),
  };
}

function toPeriodInput(app: PayAppRow, lines: ProjectBundle["lines"]): PeriodInput {
  const entries: PeriodInput["lines"] = {};
  for (const l of lines) {
    if (l.payAppId !== app.id) continue;
    entries[l.sovLineId] = {
      workThisPeriodCents: l.workThisPeriodCents,
      storedMaterialsCents: l.storedMaterialsCents,
      retainageReleasedCents: l.retainageReleasedCents,
    };
  }
  return {
    id: app.id,
    number: app.number,
    periodTo: app.periodTo,
    retainagePctBps: app.retainagePctBps,
    storedRetainagePctBps: app.storedRetainagePctBps,
    lines: entries,
  };
}

/** Once any pay app left draft, history is fixed: original SOV and contract sum are locked. */
export const billingStarted = (b: Pick<ProjectBundle, "payApps">) =>
  b.payApps.some((a) => a.status !== "draft");

/**
 * Lines whose retainage rate can no longer change: a submitted (or later) application has computed
 * retainage on them, so a new rate would rewrite figures the GC already has. A line with nothing
 * completed or stored on any submitted application held no retainage there and stays open.
 */
export function retainageLockedLines(b: Pick<ProjectBundle, "payApps" | "computed">): Set<string> {
  const out = new Set<string>();
  b.payApps.forEach((app, i) => {
    if (app.status === "draft") return;
    for (const l of b.computed[i]?.lines ?? []) {
      if (l.completedAndStoredCents !== 0 || l.retainageCents !== 0) out.add(l.sovLineId);
    }
  });
  return out;
}

/** periodTo of the last pay app that left draft (change orders cannot be approved on/before it). */
export const lastLockedPeriodTo = (b: Pick<ProjectBundle, "payApps">): string | null =>
  b.payApps.filter((a) => a.status !== "draft").at(-1)?.periodTo ?? null;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function projectDto(p: ProjectRow): ProjectDto {
  return {
    id: p.id,
    name: p.name,
    number: p.number,
    location: p.location,
    gcName: p.gcName,
    gcAddress: p.gcAddress,
    gcBillingName: p.gcBillingName,
    gcBillingEmail: p.gcBillingEmail,
    gcPmName: p.gcPmName,
    gcPmEmail: p.gcPmEmail,
    ownerName: p.ownerName,
    architectName: p.architectName,
    contractDate: p.contractDate,
    originalContractSumCents: p.originalContractSumCents,
    retainagePctBps: p.retainagePctBps,
    storedRetainagePctBps: p.storedRetainagePctBps,
    payTermsDays: p.payTermsDays,
    payTermsBasis: p.payTermsBasis,
    payTermsOuterDays: p.payTermsOuterDays,
    notaryBlock: p.notaryBlock,
    billingDay: p.billingDay,
    gaNocFiled: p.gaNocFiled,
    gaNocContractor: p.gaNocContractor,
    lienState: p.lienState,
    lienResidential: p.lienResidential,
    lastFurnishedOn: p.lastFurnishedOn,
    workCompletedOn: p.workCompletedOn,
    noticeOfCompletionOn: p.noticeOfCompletionOn,
    procoreSsov: parsePlacement(p.procoreSsov),
    status: p.status,
    opening: openingOf(p),
    isSample: p.isSample,
    createdAt: p.createdAt.toISOString(),
  };
}

export function payAppDto(
  app: PayAppRow,
  computed: ComputedApplication | undefined,
  payments: readonly PaymentRow[] = [],
): PayAppDto {
  const expected = expectedCents(
    app.certifiedAmountCents,
    computed?.summary.currentPaymentDueCents ?? 0,
  );
  const own = payments.filter((p) => p.payAppId === app.id);
  const pos = paymentPosition(app.status, expected, own, app.shortClosedCents);
  return {
    id: app.id,
    projectId: app.projectId,
    number: app.number,
    periodFrom: app.periodFrom,
    periodTo: app.periodTo,
    applicationDate: app.applicationDate,
    retainagePctBps: app.retainagePctBps,
    storedRetainagePctBps: app.storedRetainagePctBps,
    status: app.status,
    submittedAt: iso(app.submittedAt),
    certifiedAmountCents: app.certifiedAmountCents,
    certifiedAt: iso(app.certifiedAt),
    paidAt: iso(app.paidAt),
    notes: app.notes,
    currentPaymentDueCents: computed?.summary.currentPaymentDueCents ?? 0,
    totalEarnedLessRetainageCents: computed?.summary.totalEarnedLessRetainageCents ?? 0,
    expectedCents: expected,
    paidCents: pos.paidCents,
    remainingCents: pos.remainingCents,
    unrecordedCents: unrecordedPaidCents(app.status, expected, own, app.shortClosedCents),
    shortClose:
      app.status === "paid" && app.shortReason && app.shortClosedOn && pos.closedShortCents > 0
        ? {
            cents: pos.closedShortCents,
            reason: app.shortReason,
            note: app.shortNote,
            closedOn: app.shortClosedOn,
          }
        : null,
    ownerPaidOn: app.ownerPaidOn,
  };
}

/**
 * The money the GC actually paid on an application, for the unconditional waiver: the expected
 * amount (certified, else line 8) less any balance closed short. For an open application, the amount
 * expected (what a conditional waiver is for).
 */
export function paidAmountOf(app: PayAppRow, computed: ComputedApplication): number {
  const expected = expectedCents(app.certifiedAmountCents, computed.summary.currentPaymentDueCents);
  if (app.status !== "paid") return expected;
  return expected - Math.min(expected, Math.max(0, app.shortClosedCents ?? 0));
}

export const paymentDto = (p: PaymentRow): PaymentDto => ({
  id: p.id,
  amountCents: p.amountCents,
  receivedOn: p.receivedOn,
  reference: p.reference,
  createdAt: p.createdAt.toISOString(),
});

/** Payments recorded against one application. */
export const paymentsOf = (b: Pick<ProjectBundle, "payments">, payAppId: string) =>
  b.payments.filter((p) => p.payAppId === payAppId);

export function findPayApp(b: ProjectBundle, payAppId: string) {
  const index = b.payApps.findIndex((a) => a.id === payAppId);
  const app = b.payApps[index];
  const computed = b.computed[index];
  if (!app || !computed) throw notFound("Pay application");
  return { app, computed, index };
}

/**
 * Quantities on one application for every unit-price line: this period's and to date (this
 * application and every earlier one, plus a mid-job opening balance read back at the unit price).
 */
export function lineQuantities(
  b: Pick<ProjectBundle, "sov" | "payApps" | "lines">,
  payAppId: string,
): Record<string, LineQuantityDto> {
  const index = b.payApps.findIndex((a) => a.id === payAppId);
  if (index < 0) return {};
  const upTo = new Set(b.payApps.slice(0, index + 1).map((a) => a.id));
  const out: Record<string, LineQuantityDto> = {};
  for (const l of b.sov) {
    if (!isUnitPriced(l) || l.unit === null || l.unitPriceMicros === null) continue;
    const entries = b.lines.filter((e) => e.sovLineId === l.id && upTo.has(e.payAppId));
    const toDate = quantityToDate(l, entries);
    if (!toDate) continue;
    const own = entries.find((e) => e.payAppId === payAppId);
    out[l.id] = {
      unit: l.unit,
      unitPriceMicros: l.unitPriceMicros,
      contractQuantityMilli: l.quantityMilli,
      thisPeriodMilli: own?.quantityThisPeriodMilli ?? null,
      toDateMilli: toDate.quantityMilli,
      exact: toDate.exact,
    };
  }
  return out;
}

export function payAppDetailDto(b: ProjectBundle, payAppId: string): PayAppDetailDto {
  const { app, computed } = findPayApp(b, payAppId);
  const entries: PayAppDetailDto["entries"] = {};
  for (const l of b.lines) {
    if (l.payAppId !== app.id) continue;
    entries[l.sovLineId] = {
      workThisPeriodCents: l.workThisPeriodCents,
      storedMaterialsCents: l.storedMaterialsCents,
      retainageReleasedCents: l.retainageReleasedCents,
      quantityThisPeriodMilli: l.quantityThisPeriodMilli,
    };
  }
  return {
    ...payAppDto(app, computed, b.payments),
    quantities: lineQuantities(b, payAppId),
    computed,
    blockers: computed.warnings.filter((w) => BLOCKING_WARNINGS.has(w.code)),
    entries,
    editable: app.status === "draft",
    payments: paymentsOf(b, app.id).map(paymentDto),
  };
}

export function projectDetailDto(b: ProjectBundle): ProjectDetailDto {
  const approvedAdjustments = new Map<string, number>();
  for (const co of b.changeOrders) {
    if (co.status !== "approved") continue;
    for (const i of co.items) {
      approvedAdjustments.set(
        i.sovLineId,
        (approvedAdjustments.get(i.sovLineId) ?? 0) + i.amountCents,
      );
    }
  }
  const locked = retainageLockedLines(b);
  const sovLinesDto: SovLineDto[] = b.sov.map((l) => ({
    id: l.id,
    itemNumber: l.itemNumber,
    description: l.description,
    originalCents: l.originalCents,
    currentCents: l.originalCents + (approvedAdjustments.get(l.id) ?? 0),
    sortOrder: l.sortOrder,
    changeOrderId: l.changeOrderId,
    openingCompletedCents: l.openingCompletedCents,
    openingReleasedCents: l.openingReleasedCents,
    retainagePctBps: l.retainagePctBps,
    retainageLocked: locked.has(l.id),
    unit: l.unit,
    unitPriceMicros: l.unitPriceMicros,
    quantityMilli: l.quantityMilli,
  }));
  const changeOrdersDto: ChangeOrderDto[] = b.changeOrders.map((co) => ({
    id: co.id,
    number: co.number,
    description: co.description,
    status: co.status,
    approvedOn: co.approvedOn,
    submittedOn: co.submittedOn,
    scheduleDays: co.scheduleDays,
    lastEmailedOn: co.lastEmailedOn,
    createdOn: co.createdAt.toISOString().slice(0, 10),
    totalCents: co.items.reduce((s, i) => s + i.amountCents, 0),
    items: co.items.map((i) => ({ id: i.id, sovLineId: i.sovLineId, amountCents: i.amountCents })),
  }));
  return {
    ...projectDto(b.project),
    sovLines: sovLinesDto,
    changeOrders: changeOrdersDto,
    payApps: b.payApps.map((a, i) => payAppDto(a, b.computed[i], b.payments)),
    billingStarted: billingStarted(b),
    sovTotalCents: sovOriginalTotal(b.sov.map((l) => ({ ...l, originalCents: l.originalCents }))),
    lienDeadline: projectLienDeadline(b),
  };
}

/** What the job's billing says about the last day of work, for the lien deadline's estimate. */
export function lienBillingApps(b: Pick<ProjectBundle, "payApps" | "computed">): LienBillingApp[] {
  return b.payApps.map((a, i) => ({
    number: a.number,
    status: a.status,
    periodFrom: a.periodFrom,
    periodTo: a.periodTo,
    workThisPeriodCents: (b.computed[i]?.lines ?? []).reduce((s, l) => s + l.thisPeriodCents, 0),
  }));
}

/** The job's lien deadline from its saved state and dates, else its billing (src/shared/lien-deadline.ts). */
export function projectLienDeadline(
  b: Pick<ProjectBundle, "project" | "payApps" | "computed">,
): LienDeadlineResult {
  const p = b.project;
  return lienDeadline({
    state: p.lienState,
    residential: p.lienResidential,
    lastFurnishedOn: p.lastFurnishedOn,
    completedOn: p.workCompletedOn,
    noticeOfCompletionOn: p.noticeOfCompletionOn,
    apps: lienBillingApps(b),
  });
}
