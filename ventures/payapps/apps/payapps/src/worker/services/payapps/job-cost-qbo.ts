// Job costs from QuickBooks Online (docs/QUICKBOOKS.md, "Job costs from QuickBooks"). A job is
// linked to the QuickBooks customer or job (sub-customer) its bills, checks and card charges are
// tagged to, or, for a company that tracks jobs by class instead of by customer, to that class; PayApps then lists those expense lines and imports the ones a person picks as costs,
// each on a schedule-of-values line and a category they chose. Read only toward QuickBooks: nothing
// is written there. Amounts, dates and vendors are always re-read from QuickBooks at import time,
// never taken from the browser. Every query filters by org.
//
// Purchase orders tagged to the customer are read the same way and imported as commitments (cost
// still to come). A bill or check made from one in QuickBooks keeps that link
// (`job_cost_entries.qbo_po_source`) and is put against the commitment, so the order's open amount
// shrinks as it is billed instead of counting twice.

import {
  costReaderFor,
  type ExpenseLine,
  type ExpenseQuery,
  type JobCostReader,
  type PurchaseOrderLine,
} from "@qbo-sync";
import type {
  jobCostQboImportSchema,
  jobCostQboLinkSchema,
  jobCostQboWindowSchema,
} from "@shared/api/schemas";
import type {
  JobCostQboClassDto,
  JobCostQboCustomerDto,
  JobCostQboLineDto,
  JobCostQboLinesDto,
  JobCostQboLinkDto,
  JobCostQboPoLineDto,
  JobCostQboPoLinesDto,
  JobCostQuickBooksDto,
} from "@shared/api/types";
import { MAX_COMMITMENTS_PER_JOB, MAX_COST_ENTRIES_PER_JOB } from "@shared/job-cost";
import {
  commitmentForPo,
  commitmentKindFor,
  daysBetween,
  MAX_QBO_COST_WINDOW_DAYS,
  qboCostSource,
  qboPoSource,
  qboTxnLabel,
  suggestCostCategory,
} from "@shared/job-cost-qbo";
import { and, count, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { z } from "zod";
import type { AppContext } from "../../context";
import {
  jobCostCommitments,
  jobCostEntries,
  jobCostQboLinks,
  qboConnections,
} from "../../db/schema";
import { AppError, badRequest, conflict } from "../../lib/errors";
import { newId } from "../../lib/ids";
import type { Tenant } from "../../types";
import { orgPlan } from "../billing";
import { connectedBooks, rethrowQbo } from "../quickbooks";
import { getProjectRow, loadBundle } from "./bundle";
import { runBatches } from "./job-cost";

type Window = z.infer<typeof jobCostQboWindowSchema>;

async function linkRow(ctx: AppContext, orgId: string, projectId: string) {
  return ctx.db
    .select()
    .from(jobCostQboLinks)
    .where(and(eq(jobCostQboLinks.orgId, orgId), eq(jobCostQboLinks.projectId, projectId)))
    .get();
}

type LinkRow = typeof jobCostQboLinks.$inferSelect;

const linkDto = (l: LinkRow): JobCostQboLinkDto => ({
  by: l.matchBy,
  id: l.refId,
  name: l.refName,
});

/** The customers and classes a read of this link asks QuickBooks for. */
const queryKeys = (l: LinkRow): Pick<ExpenseQuery, "customerIds" | "classIds"> =>
  l.matchBy === "class"
    ? { customerIds: [], classIds: [l.refId] }
    : { customerIds: [l.refId], classIds: [] };

/** Whether this job can read costs from QuickBooks, and the customer or class it is linked to. */
export async function jobCostQuickBooks(
  ctx: AppContext,
  orgId: string,
  projectId: string,
): Promise<JobCostQuickBooksDto> {
  const [project, { plan }, conn, link] = await Promise.all([
    getProjectRow(ctx, orgId, projectId),
    orgPlan(ctx, orgId),
    ctx.db.select().from(qboConnections).where(eq(qboConnections.orgId, orgId)).get(),
    linkRow(ctx, orgId, projectId),
  ]);
  const reason = !ctx.qbo
    ? "QuickBooks Online is not available on this server yet."
    : !plan.quickbooks || !plan.jobCosting
      ? `Costs from QuickBooks are included in the Crew plan and up; you are on ${plan.name}.`
      : !conn
        ? "Connect QuickBooks first (an admin can do it on the QuickBooks page)."
        : project.isSample
          ? "The sample job is never linked to QuickBooks."
          : null;
  return {
    available: reason === null,
    reason,
    link: conn && link && link.realmId === conn.realmId ? linkDto(link) : null,
  };
}

async function readerFor(ctx: AppContext, orgId: string) {
  const { conn, books } = await connectedBooks(ctx, orgId);
  return { realmId: conn.realmId, reader: costReaderFor(books) };
}

async function assertCanLink(ctx: AppContext, orgId: string, projectId: string) {
  const [project, { plan }] = await Promise.all([
    getProjectRow(ctx, orgId, projectId),
    orgPlan(ctx, orgId),
  ]);
  if (project.isSample) throw conflict("The sample job is never linked to QuickBooks.");
  if (!plan.jobCosting) {
    throw new AppError(
      402,
      "payment_required",
      `Job costing is included in the Crew plan and up; you are on ${plan.name}. Upgrade on the Billing page.`,
    );
  }
  return project;
}

/** The connected company's active customers and jobs, read live, for the link picker. */
export async function listCostCustomers(
  ctx: AppContext,
  orgId: string,
): Promise<JobCostQboCustomerDto[]> {
  const { reader } = await readerFor(ctx, orgId);
  try {
    return (await reader.listCustomers()).map((c) => ({ id: c.id, name: c.fullyQualifiedName }));
  } catch (e) {
    rethrowQbo(e, "the customer list");
  }
}

/**
 * The connected company's active classes, read live, for a company that tracks jobs by class.
 * `jobClassId` is the class this job's invoices carry (QuickBooks page, "Class and location"), the
 * likely pick.
 */
export async function listCostClasses(
  ctx: AppContext,
  orgId: string,
  projectId: string,
): Promise<{ classes: JobCostQboClassDto[]; jobClassId: string | null }> {
  const project = await getProjectRow(ctx, orgId, projectId);
  const { books } = await connectedBooks(ctx, orgId);
  try {
    const classes = (await books.listClasses())
      .map((c) => ({ id: c.id, name: c.fullName }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const jobClassId =
      project.qboClassId && classes.some((c) => c.id === project.qboClassId)
        ? project.qboClassId
        : null;
    return { classes, jobClassId };
  } catch (e) {
    rethrowQbo(e, "the class list");
  }
}

async function saveLink(
  ctx: AppContext,
  tenant: Tenant,
  projectId: string,
  values: { realmId: string; matchBy: "customer" | "class"; refId: string; refName: string },
) {
  const row = { ...values, updatedBy: tenant.userId };
  await ctx.db
    .insert(jobCostQboLinks)
    .values({ projectId, orgId: tenant.orgId, ...row })
    .onConflictDoUpdate({
      target: jobCostQboLinks.projectId,
      // The key is the project id, already checked to be this org's job.
      set: { ...row, updatedAt: ctx.now() },
    });
}

export async function setCostLink(
  ctx: AppContext,
  tenant: Tenant,
  projectId: string,
  input: z.infer<typeof jobCostQboLinkSchema>,
): Promise<JobCostQuickBooksDto> {
  const { orgId } = tenant;
  await assertCanLink(ctx, orgId, projectId);
  if ("classId" in input) {
    const { conn, books } = await connectedBooks(ctx, orgId);
    let cls: Awaited<ReturnType<typeof books.getClass>>;
    try {
      cls = await books.getClass(input.classId);
    } catch (e) {
      rethrowQbo(e, "the class");
    }
    if (!cls) throw badRequest("That class is not active in the connected QuickBooks company.");
    await saveLink(ctx, tenant, projectId, {
      realmId: conn.realmId,
      matchBy: "class",
      refId: cls.id,
      refName: cls.fullName,
    });
    return jobCostQuickBooks(ctx, orgId, projectId);
  }
  if (input.customerId === null) {
    await ctx.db
      .delete(jobCostQboLinks)
      .where(and(eq(jobCostQboLinks.orgId, orgId), eq(jobCostQboLinks.projectId, projectId)));
    return jobCostQuickBooks(ctx, orgId, projectId);
  }
  const { realmId, reader } = await readerFor(ctx, orgId);
  let customers: Awaited<ReturnType<JobCostReader["listCustomers"]>>;
  try {
    customers = await reader.listCustomers();
  } catch (e) {
    rethrowQbo(e, "the customer list");
  }
  const customer = customers.find((c) => c.id === input.customerId);
  if (!customer) {
    throw badRequest("That customer or job is not active in the connected QuickBooks company.");
  }
  await saveLink(ctx, tenant, projectId, {
    realmId,
    matchBy: "customer",
    refId: customer.id,
    refName: customer.fullyQualifiedName,
  });
  return jobCostQuickBooks(ctx, orgId, projectId);
}

function checkWindow(w: Window) {
  if (w.from > w.to) throw badRequest("The start date is after the end date.");
  if (daysBetween(w.from, w.to) > MAX_QBO_COST_WINDOW_DAYS) {
    throw badRequest("Read at most two years at a time; narrow the dates.");
  }
}

/** The link in the connected company, or a 409 saying what to do. */
async function currentLink(ctx: AppContext, orgId: string, projectId: string, realmId: string) {
  const link = await linkRow(ctx, orgId, projectId);
  if (!link || link.realmId !== realmId) {
    throw conflict(
      "Choose the QuickBooks customer, job or class this job's costs are tagged to first.",
    );
  }
  return link;
}

/** D1 caps bound parameters per statement; read imported sources in chunks. */
const IN_CHUNK = 90;

async function importedBySource(ctx: AppContext, orgId: string, sources: string[]) {
  const found = new Map<string, { id: string; projectId: string; amountCents: number }>();
  for (let i = 0; i < sources.length; i += IN_CHUNK) {
    const rows = await ctx.db
      .select({
        id: jobCostEntries.id,
        projectId: jobCostEntries.projectId,
        amountCents: jobCostEntries.amountCents,
        qboSource: jobCostEntries.qboSource,
      })
      .from(jobCostEntries)
      .where(
        and(
          eq(jobCostEntries.orgId, orgId),
          inArray(jobCostEntries.qboSource, sources.slice(i, i + IN_CHUNK)),
        ),
      );
    for (const r of rows) if (r.qboSource) found.set(r.qboSource, r);
  }
  return found;
}

async function readLines(ctx: AppContext, orgId: string, projectId: string, w: Window) {
  checkWindow(w);
  await assertCanLink(ctx, orgId, projectId);
  const { realmId, reader } = await readerFor(ctx, orgId);
  const link = await currentLink(ctx, orgId, projectId, realmId);
  try {
    const r = await reader.listExpenseLines({
      fromDate: w.from,
      toDate: w.to,
      ...queryKeys(link),
    });
    return { realmId, link, ...r };
  } catch (e) {
    rethrowQbo(e, "the expense list");
  }
}

const sourceOf = (realmId: string, l: ExpenseLine) =>
  qboCostSource(realmId, l.txnType, l.txnId, l.lineId);

/** The QuickBooks expense lines tagged to the job's customer or class in the window, marked when imported. */
export async function qboCostLines(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  w: Window,
): Promise<JobCostQboLinesDto> {
  const { realmId, link, lines, truncated } = await readLines(ctx, orgId, projectId, w);
  const imported = await importedBySource(
    ctx,
    orgId,
    lines.map((l) => sourceOf(realmId, l)),
  );
  return {
    from: w.from,
    to: w.to,
    link: linkDto(link),
    truncated,
    lines: lines.map((l): JobCostQboLineDto => {
      const source = sourceOf(realmId, l);
      const done = imported.get(source);
      return {
        source,
        txnType: l.txnType,
        label: qboTxnLabel(l.txnType, l.paymentType ?? null, l.amountCents),
        txnDate: l.txnDate,
        docNumber: l.docNumber ?? null,
        vendor: l.vendorName ?? null,
        account: l.itemName ?? l.accountName ?? null,
        description: l.description ?? null,
        amountCents: l.amountCents,
        fromPurchaseOrder: l.purchaseOrder !== undefined,
        suggestedCategory: suggestCostCategory(l.accountName, l.itemName),
        imported: done
          ? {
              entryId: done.id,
              projectId: done.projectId,
              thisJob: done.projectId === projectId,
              amountCents: done.amountCents,
            }
          : null,
      };
    }),
  };
}

const clip = (v: string | undefined, n: number) => (v ? v.slice(0, n) : null);

/**
 * Import the chosen lines as costs. Each is read again from QuickBooks; a line no longer there (or
 * outside the window) refuses the whole import so nothing half-lands. A line already imported is
 * skipped, never doubled: the unique (org, source) index holds even under two imports at once.
 */
export async function importQboCosts(
  ctx: AppContext,
  tenant: Tenant,
  projectId: string,
  input: z.infer<typeof jobCostQboImportSchema>,
): Promise<{ added: number; skipped: number; linked: number }> {
  const { orgId, userId } = tenant;
  const seen = new Set<string>();
  for (const l of input.lines) {
    if (seen.has(l.source)) throw badRequest("A QuickBooks line is listed twice");
    seen.add(l.source);
  }
  const { realmId, lines } = await readLines(ctx, orgId, projectId, input);
  const bySource = new Map(lines.map((l) => [sourceOf(realmId, l), l]));
  const missing = input.lines.filter((l) => !bySource.has(l.source)).length;
  if (missing > 0) {
    throw conflict(
      `${missing} of the chosen lines ${missing === 1 ? "is" : "are"} no longer in QuickBooks as listed (changed, deleted or retagged). Read the list again.`,
    );
  }
  const b = await loadBundle(ctx, orgId, projectId);
  const sovIds = new Set(b.sov.map((l) => l.id));
  for (const l of input.lines) {
    if (l.sovLineId && !sovIds.has(l.sovLineId)) {
      throw badRequest("That schedule-of-values line is not on this job");
    }
  }
  const already = await importedBySource(
    ctx,
    orgId,
    input.lines.map((l) => l.source),
  );
  const fresh = input.lines.filter((l) => !already.has(l.source));
  const existing = await ctx.db
    .select({ n: count() })
    .from(jobCostEntries)
    .where(and(eq(jobCostEntries.orgId, orgId), eq(jobCostEntries.projectId, projectId)))
    .get();
  if ((existing?.n ?? 0) + fresh.length > MAX_COST_ENTRIES_PER_JOB) {
    throw badRequest(
      `A job keeps up to ${MAX_COST_ENTRIES_PER_JOB.toLocaleString("en-US")} cost lines; import a narrower date range or combine older costs into monthly totals.`,
    );
  }
  const rows = fresh.map((pick) => {
    const q = bySource.get(pick.source) as ExpenseLine;
    const label = qboTxnLabel(q.txnType, q.paymentType ?? null, q.amountCents);
    return {
      id: newId("jce"),
      orgId,
      projectId,
      sovLineId: pick.sovLineId,
      incurredOn: q.txnDate,
      category: pick.category,
      amountCents: q.amountCents,
      vendor: clip(q.vendorName, 200),
      description: clip(q.description ?? q.itemName ?? q.accountName, 300),
      reference: clip(q.docNumber ? `${label} ${q.docNumber}` : label, 100),
      qboSource: pick.source,
      qboPoSource: q.purchaseOrder ? qboPoSource(realmId, q.purchaseOrder) : null,
      createdBy: userId,
    };
  });
  await runBatches(
    ctx,
    rows.map((r) => ctx.db.insert(jobCostEntries).values(r).onConflictDoNothing()),
  );
  // A concurrent import of the same line loses its insert to the unique index: count what landed.
  let added = 0;
  const ids = rows.map((r) => r.id);
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const got = await ctx.db
      .select({ n: count() })
      .from(jobCostEntries)
      .where(
        and(
          eq(jobCostEntries.orgId, orgId),
          inArray(jobCostEntries.id, ids.slice(i, i + IN_CHUNK)),
        ),
      )
      .get();
    added += got?.n ?? 0;
  }
  const linked = await putCostsOnPurchaseOrders(ctx, orgId, projectId, { entryIds: ids });
  return { added, skipped: input.lines.length - added, linked };
}

/**
 * Put costs made from a QuickBooks purchase order against the commitment imported from that
 * order, on this job. Only the costs or commitments just imported are considered, and only costs
 * on no commitment yet, so a cost a person moved off a commitment stays where they put it.
 */
async function putCostsOnPurchaseOrders(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  only: { entryIds?: string[]; commitmentIds?: string[] },
): Promise<number> {
  const [commitments, entries] = await Promise.all([
    ctx.db
      .select({ id: jobCostCommitments.id, qboSource: jobCostCommitments.qboSource })
      .from(jobCostCommitments)
      .where(
        and(
          eq(jobCostCommitments.orgId, orgId),
          eq(jobCostCommitments.projectId, projectId),
          isNotNull(jobCostCommitments.qboSource),
        ),
      ),
    ctx.db
      .select({ id: jobCostEntries.id, qboPoSource: jobCostEntries.qboPoSource })
      .from(jobCostEntries)
      .where(
        and(
          eq(jobCostEntries.orgId, orgId),
          eq(jobCostEntries.projectId, projectId),
          isNotNull(jobCostEntries.qboPoSource),
          isNull(jobCostEntries.commitmentId),
        ),
      ),
  ]);
  const entryIds = only.entryIds ? new Set(only.entryIds) : null;
  const fresh = only.commitmentIds ? new Set(only.commitmentIds) : null;
  const updates = [];
  for (const e of entries) {
    if (entryIds && !entryIds.has(e.id)) continue;
    const commitmentId = commitmentForPo(e.qboPoSource ?? "", commitments);
    if (!commitmentId || (fresh && !fresh.has(commitmentId))) continue;
    updates.push(
      ctx.db
        .update(jobCostEntries)
        .set({ commitmentId, updatedAt: ctx.now() })
        .where(
          and(
            eq(jobCostEntries.orgId, orgId),
            eq(jobCostEntries.id, e.id),
            isNull(jobCostEntries.commitmentId),
          ),
        ),
    );
  }
  await runBatches(ctx, updates);
  return updates.length;
}

// ---- Purchase orders, imported as commitments ----

const poSourceOf = (realmId: string, l: PurchaseOrderLine) =>
  qboCostSource(realmId, "PurchaseOrder", l.txnId, l.lineId);

async function readPoLines(ctx: AppContext, orgId: string, projectId: string, w: Window) {
  checkWindow(w);
  await assertCanLink(ctx, orgId, projectId);
  const { realmId, reader } = await readerFor(ctx, orgId);
  const link = await currentLink(ctx, orgId, projectId, realmId);
  try {
    const r = await reader.listPurchaseOrderLines({
      fromDate: w.from,
      toDate: w.to,
      ...queryKeys(link),
    });
    return { realmId, link, ...r };
  } catch (e) {
    rethrowQbo(e, "the purchase order list");
  }
}

async function importedPoBySource(ctx: AppContext, orgId: string, sources: string[]) {
  const found = new Map<string, { id: string; projectId: string; amountCents: number }>();
  for (let i = 0; i < sources.length; i += IN_CHUNK) {
    const rows = await ctx.db
      .select({
        id: jobCostCommitments.id,
        projectId: jobCostCommitments.projectId,
        amountCents: jobCostCommitments.amountCents,
        qboSource: jobCostCommitments.qboSource,
      })
      .from(jobCostCommitments)
      .where(
        and(
          eq(jobCostCommitments.orgId, orgId),
          inArray(jobCostCommitments.qboSource, sources.slice(i, i + IN_CHUNK)),
        ),
      );
    for (const r of rows) if (r.qboSource) found.set(r.qboSource, r);
  }
  return found;
}

/** The QuickBooks purchase-order lines tagged to the job's customer, marked when imported. */
export async function qboPurchaseOrderLines(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  w: Window,
): Promise<JobCostQboPoLinesDto> {
  const { realmId, link, lines, truncated } = await readPoLines(ctx, orgId, projectId, w);
  const imported = await importedPoBySource(
    ctx,
    orgId,
    lines.map((l) => poSourceOf(realmId, l)),
  );
  return {
    from: w.from,
    to: w.to,
    link: linkDto(link),
    truncated,
    lines: lines.map((l): JobCostQboPoLineDto => {
      const source = poSourceOf(realmId, l);
      const done = imported.get(source);
      return {
        source,
        txnDate: l.txnDate,
        docNumber: l.docNumber ?? null,
        vendor: l.vendorName ?? null,
        account: l.itemName ?? l.accountName ?? null,
        description: l.description ?? null,
        amountCents: l.amountCents,
        status: l.status,
        manuallyClosed: l.manuallyClosed,
        suggestedCategory: suggestCostCategory(l.accountName, l.itemName),
        imported: done
          ? {
              commitmentId: done.id,
              projectId: done.projectId,
              thisJob: done.projectId === projectId,
              amountCents: done.amountCents,
            }
          : null,
      };
    }),
  };
}

/**
 * Import the chosen purchase-order lines as commitments, re-read from QuickBooks, never twice
 * (unique (org, source) index). Costs already imported from bills made from those orders are then
 * put against them.
 */
export async function importQboPurchaseOrders(
  ctx: AppContext,
  tenant: Tenant,
  projectId: string,
  input: z.infer<typeof jobCostQboImportSchema>,
): Promise<{ added: number; skipped: number; linked: number }> {
  const { orgId, userId } = tenant;
  const seen = new Set<string>();
  for (const l of input.lines) {
    if (seen.has(l.source)) throw badRequest("A QuickBooks line is listed twice");
    seen.add(l.source);
  }
  const { realmId, lines } = await readPoLines(ctx, orgId, projectId, input);
  const bySource = new Map(lines.map((l) => [poSourceOf(realmId, l), l]));
  const missing = input.lines.filter((l) => !bySource.has(l.source)).length;
  if (missing > 0) {
    throw conflict(
      `${missing} of the chosen purchase-order lines ${missing === 1 ? "is" : "are"} no longer in QuickBooks as listed (changed, deleted or retagged). Read the list again.`,
    );
  }
  const b = await loadBundle(ctx, orgId, projectId);
  const sovIds = new Set(b.sov.map((l) => l.id));
  for (const l of input.lines) {
    if (l.sovLineId && !sovIds.has(l.sovLineId)) {
      throw badRequest("That schedule-of-values line is not on this job");
    }
  }
  const already = await importedPoBySource(
    ctx,
    orgId,
    input.lines.map((l) => l.source),
  );
  const fresh = input.lines.filter((l) => !already.has(l.source));
  const existing = await ctx.db
    .select({ n: count() })
    .from(jobCostCommitments)
    .where(and(eq(jobCostCommitments.orgId, orgId), eq(jobCostCommitments.projectId, projectId)))
    .get();
  if ((existing?.n ?? 0) + fresh.length > MAX_COMMITMENTS_PER_JOB) {
    throw badRequest(
      `A job keeps up to ${MAX_COMMITMENTS_PER_JOB.toLocaleString("en-US")} purchase orders and subcontracts.`,
    );
  }
  const rows = fresh.map((pick) => {
    const q = bySource.get(pick.source) as PurchaseOrderLine;
    return {
      id: newId("jcc"),
      orgId,
      projectId,
      sovLineId: pick.sovLineId,
      kind: commitmentKindFor(pick.category),
      category: pick.category,
      vendor: clip(q.vendorName, 200) ?? "Vendor not named in QuickBooks",
      reference: clip(q.docNumber ? `PO ${q.docNumber}` : "PO", 100),
      description: clip(q.description ?? q.itemName ?? q.accountName, 300),
      committedOn: q.txnDate,
      amountCents: q.amountCents,
      qboSource: pick.source,
      createdBy: userId,
    };
  });
  await runBatches(
    ctx,
    rows.map((r) => ctx.db.insert(jobCostCommitments).values(r).onConflictDoNothing()),
  );
  const ids = rows.map((r) => r.id);
  const landed: string[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const got = await ctx.db
      .select({ id: jobCostCommitments.id })
      .from(jobCostCommitments)
      .where(
        and(
          eq(jobCostCommitments.orgId, orgId),
          inArray(jobCostCommitments.id, ids.slice(i, i + IN_CHUNK)),
        ),
      );
    landed.push(...got.map((g) => g.id));
  }
  const linked =
    landed.length > 0
      ? await putCostsOnPurchaseOrders(ctx, orgId, projectId, { commitmentIds: landed })
      : 0;
  return { added: landed.length, skipped: input.lines.length - landed.length, linked };
}
