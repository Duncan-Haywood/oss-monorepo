// Lower-tier lien waivers on a pay application: the waivers the contractor is collecting from its
// own suppliers and sub-subcontractors to hand its GC. Every query filters by org_id, the job and
// the pay app. Reading is open to every member on every plan (a downgrade keeps the record);
// changing the list is part of lien waivers (Crew and up). Rules in @shared/lower-tier-waivers.
import type {
  LowerTierWaiverFieldsBody,
  LowerTierWaiverInputBody,
  LowerTierWaiverUpdateBody,
} from "@shared/api/schemas";
import type { LowerTierWaiverDto, LowerTierWaiversDto } from "@shared/api/types";
import {
  type CompanyLowerTierInput,
  type LowerTierFacts,
  type LowerTierPayAppToChase,
  type LowerTierSummary,
  lowerTierDateProblem,
  lowerTierDaysWaiting,
  lowerTierEmailFor,
  lowerTierPartyEmails,
  lowerTierPartyKey,
  lowerTierStatus,
  lowerTierToChase,
  MAX_LOWER_TIER_EMAIL_ROWS,
  MAX_LOWER_TIER_PER_PAY_APP,
  summarizeLowerTier,
} from "@shared/lower-tier-waivers";
import { and, asc, desc, eq, isNotNull, isNull, lt } from "drizzle-orm";
import type { AppContext } from "../../context";
import { lowerTierWaivers, payAppAttachments, payApps, projects } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { assertLienWaivers, orgPlan } from "../billing";
import { getProjectRow } from "./bundle";

type Row = typeof lowerTierWaivers.$inferSelect;

const today = (ctx: AppContext) => ctx.now().toISOString().slice(0, 10);
const blank = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

type Filed = LowerTierWaiverDto["files"][number];

function toDto(r: Row, day: string, files: Filed[] = []): LowerTierWaiverDto {
  return {
    id: r.id,
    payAppId: r.payAppId,
    party: r.party,
    partyKind: r.partyKind,
    partyEmail: r.partyEmail,
    kind: r.kind,
    throughDate: r.throughDate,
    amountCents: r.amountCents,
    requestedOn: r.requestedOn,
    receivedOn: r.receivedOn,
    note: r.note,
    status: lowerTierStatus(r),
    daysWaiting: lowerTierDaysWaiting(r, day),
    files,
  };
}

/** The signed waivers filed on rows (pay-application attachments), per row id, oldest first. */
async function filesByRow(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId?: string,
): Promise<Map<string, Filed[]>> {
  const rows = await ctx.db
    .select({
      id: payAppAttachments.id,
      waiverId: payAppAttachments.lowerTierWaiverId,
      fileName: payAppAttachments.fileName,
      contentType: payAppAttachments.contentType,
      sizeBytes: payAppAttachments.sizeBytes,
    })
    .from(payAppAttachments)
    .where(
      and(
        eq(payAppAttachments.orgId, orgId),
        eq(payAppAttachments.projectId, projectId),
        isNotNull(payAppAttachments.lowerTierWaiverId),
        ...(payAppId ? [eq(payAppAttachments.payAppId, payAppId)] : []),
      ),
    )
    .orderBy(asc(payAppAttachments.createdAt), asc(payAppAttachments.id))
    .all();
  const out = new Map<string, Filed[]>();
  for (const { waiverId, ...f } of rows) {
    if (waiverId) out.set(waiverId, [...(out.get(waiverId) ?? []), f]);
  }
  return out;
}

/**
 * Checks a file can be filed as a row's signed waiver: the row is on this company's job and this pay
 * application, and the plan has lien waivers (filing it is changing the lower-tier list).
 */
export async function lowerTierWaiverOnPayApp(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  id: string,
): Promise<Row> {
  await assertLienWaivers(ctx, orgId);
  const row = await getRow(ctx, orgId, projectId, id);
  if (row.payAppId !== payAppId) throw notFound("Lower-tier waiver");
  return row;
}

/** A file filed on a row means the signed waiver is in: received today unless already dated. */
export async function markLowerTierReceived(ctx: AppContext, orgId: string, id: string) {
  const day = today(ctx);
  const row = await ctx.db
    .select({ receivedOn: lowerTierWaivers.receivedOn })
    .from(lowerTierWaivers)
    .where(and(eq(lowerTierWaivers.id, id), eq(lowerTierWaivers.orgId, orgId)))
    .get();
  if (!row || row.receivedOn) return;
  await ctx.db
    .update(lowerTierWaivers)
    .set({ receivedOn: day })
    .where(and(eq(lowerTierWaivers.id, id), eq(lowerTierWaivers.orgId, orgId)));
}

async function getPayAppRow(ctx: AppContext, orgId: string, projectId: string, payAppId: string) {
  const row = await ctx.db
    .select({ id: payApps.id, number: payApps.number })
    .from(payApps)
    .where(
      and(eq(payApps.id, payAppId), eq(payApps.orgId, orgId), eq(payApps.projectId, projectId)),
    )
    .get();
  if (!row) throw notFound("Pay application");
  return row;
}

async function rowsOf(ctx: AppContext, orgId: string, projectId: string, payAppId?: string) {
  return ctx.db
    .select()
    .from(lowerTierWaivers)
    .where(
      and(
        eq(lowerTierWaivers.orgId, orgId),
        eq(lowerTierWaivers.projectId, projectId),
        ...(payAppId ? [eq(lowerTierWaivers.payAppId, payAppId)] : []),
      ),
    )
    .orderBy(asc(lowerTierWaivers.createdAt), asc(lowerTierWaivers.id))
    .all();
}

/** The parties on the latest earlier application that has a list, for this one's suggestions. */
async function previousParties(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  number: number,
): Promise<LowerTierWaiversDto["previous"]> {
  const apps = await ctx.db
    .select({ id: payApps.id, number: payApps.number })
    .from(payApps)
    .where(
      and(eq(payApps.orgId, orgId), eq(payApps.projectId, projectId), lt(payApps.number, number)),
    )
    .all();
  if (apps.length === 0) return [];
  const numberOf = new Map(apps.map((a) => [a.id, a.number]));
  const earlier = (await rowsOf(ctx, orgId, projectId)).filter((r) => numberOf.has(r.payAppId));
  if (earlier.length === 0) return [];
  // The latest application with a list: its rows are who the contractor asked last time.
  const latest = earlier.reduce((a, b) =>
    (numberOf.get(a.payAppId) ?? 0) >= (numberOf.get(b.payAppId) ?? 0) ? a : b,
  ).payAppId;
  const seen = new Set<string>();
  const out: LowerTierWaiversDto["previous"] = [];
  for (const r of earlier) {
    const key = lowerTierPartyKey(r.party);
    if (r.payAppId !== latest || seen.has(key)) continue;
    seen.add(key);
    out.push({ party: r.party, partyKind: r.partyKind });
  }
  return out;
}

/**
 * The company's address book for lower-tier parties: the address last saved for each party on any
 * job (newest row first, bounded), keyed by lowerTierPartyKey.
 */
async function companyPartyEmails(ctx: AppContext, orgId: string): Promise<Record<string, string>> {
  const rows = await ctx.db
    .select({ party: lowerTierWaivers.party, partyEmail: lowerTierWaivers.partyEmail })
    .from(lowerTierWaivers)
    .where(and(eq(lowerTierWaivers.orgId, orgId), isNotNull(lowerTierWaivers.partyEmail)))
    .orderBy(desc(lowerTierWaivers.updatedAt), desc(lowerTierWaivers.createdAt))
    .limit(MAX_LOWER_TIER_EMAIL_ROWS)
    .all();
  return lowerTierPartyEmails(rows);
}

export async function listLowerTierWaivers(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string | undefined,
): Promise<LowerTierWaiversDto> {
  await getProjectRow(ctx, orgId, projectId);
  const app = payAppId ? await getPayAppRow(ctx, orgId, projectId, payAppId) : null;
  const [rows, { plan }, files, partyEmails] = await Promise.all([
    rowsOf(ctx, orgId, projectId, payAppId),
    orgPlan(ctx, orgId),
    filesByRow(ctx, orgId, projectId, payAppId),
    companyPartyEmails(ctx, orgId),
  ]);
  const day = today(ctx);
  const byApp = new Map<string, Row[]>();
  for (const r of rows) byApp.set(r.payAppId, [...(byApp.get(r.payAppId) ?? []), r]);
  const summaries: Record<string, LowerTierSummary> = {};
  for (const [id, list] of byApp) summaries[id] = summarizeLowerTier(list);
  if (app && !summaries[app.id]) summaries[app.id] = summarizeLowerTier([]);
  return {
    items: rows.map((r) => toDto(r, day, files.get(r.id))),
    summaries,
    previous: app ? await previousParties(ctx, orgId, projectId, app.number) : [],
    partyEmails,
    canEdit: plan.lienWaivers,
    today: day,
  };
}

function values(input: LowerTierWaiverFieldsBody) {
  return {
    party: input.party.trim(),
    partyKind: input.partyKind ?? null,
    partyEmail: input.partyEmail ?? null,
    kind: input.kind,
    throughDate: input.throughDate ?? null,
    amountCents: input.amountCents ?? null,
    requestedOn: input.requestedOn ?? null,
    receivedOn: input.receivedOn ?? null,
    note: blank(input.note),
  };
}

function check(ctx: AppContext, facts: LowerTierFacts, label?: string) {
  const problem = lowerTierDateProblem(facts, today(ctx));
  if (problem) throw badRequest(label ? `${label}: ${problem}` : problem);
}

export async function createLowerTierWaivers(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  items: LowerTierWaiverFieldsBody[],
  userId: string | null,
): Promise<LowerTierWaiverDto[]> {
  await assertLienWaivers(ctx, orgId);
  await getProjectRow(ctx, orgId, projectId);
  await getPayAppRow(ctx, orgId, projectId, payAppId);
  const existing = await rowsOf(ctx, orgId, projectId, payAppId);
  if (existing.length + items.length > MAX_LOWER_TIER_PER_PAY_APP) {
    throw badRequest(
      `A pay application tracks up to ${MAX_LOWER_TIER_PER_PAY_APP} lower-tier waivers`,
    );
  }
  // A row added without an address (the field left out, not cleared) takes the one saved for the
  // party on any of the company's jobs, so the request draft opens addressed.
  const partyEmails = items.some((i) => i.partyEmail === undefined)
    ? await companyPartyEmails(ctx, orgId)
    : {};
  const start = ctx.now().getTime();
  const rows = items.map((input, i) => {
    const v = values(input);
    if (input.partyEmail === undefined) v.partyEmail = lowerTierEmailFor(v, partyEmails);
    check(ctx, v, items.length > 1 ? `Row ${i + 1} (${v.party})` : undefined);
    // One millisecond apart, so the list keeps the order the rows were entered in.
    const createdAt = new Date(start + i);
    return { id: newId("ltw"), orgId, projectId, payAppId, ...v, createdBy: userId, createdAt };
  });
  // One batch: all or nothing.
  const [first, ...rest] = rows.map((r) => ctx.db.insert(lowerTierWaivers).values(r));
  if (first) await ctx.db.batch([first, ...rest]);
  const day = today(ctx);
  const ids = new Set(rows.map((r) => r.id));
  return (await rowsOf(ctx, orgId, projectId, payAppId))
    .filter((r) => ids.has(r.id))
    .map((r) => toDto(r, day));
}

export async function createLowerTierWaiver(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  input: LowerTierWaiverInputBody,
  userId: string | null,
): Promise<LowerTierWaiverDto> {
  const { payAppId, ...fields } = input;
  const [dto] = await createLowerTierWaivers(ctx, orgId, projectId, payAppId, [fields], userId);
  if (!dto) throw notFound("Lower-tier waiver");
  return dto;
}

async function getRow(ctx: AppContext, orgId: string, projectId: string, id: string) {
  const row = await ctx.db
    .select()
    .from(lowerTierWaivers)
    .where(
      and(
        eq(lowerTierWaivers.id, id),
        eq(lowerTierWaivers.orgId, orgId),
        eq(lowerTierWaivers.projectId, projectId),
      ),
    )
    .get();
  if (!row) throw notFound("Lower-tier waiver");
  return row;
}

export async function updateLowerTierWaiver(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  id: string,
  patch: LowerTierWaiverUpdateBody,
): Promise<LowerTierWaiverDto> {
  await assertLienWaivers(ctx, orgId);
  const row = await getRow(ctx, orgId, projectId, id);
  const next = values({
    party: patch.party ?? row.party,
    partyKind: patch.partyKind === undefined ? row.partyKind : patch.partyKind,
    partyEmail: patch.partyEmail === undefined ? row.partyEmail : patch.partyEmail,
    kind: patch.kind ?? row.kind,
    throughDate: patch.throughDate === undefined ? row.throughDate : patch.throughDate,
    amountCents: patch.amountCents === undefined ? row.amountCents : patch.amountCents,
    requestedOn: patch.requestedOn === undefined ? row.requestedOn : patch.requestedOn,
    receivedOn: patch.receivedOn === undefined ? row.receivedOn : patch.receivedOn,
    note: patch.note === undefined ? row.note : patch.note,
  });
  check(ctx, next);
  await ctx.db
    .update(lowerTierWaivers)
    .set(next)
    .where(and(eq(lowerTierWaivers.id, id), eq(lowerTierWaivers.orgId, orgId)));
  const files = await filesByRow(ctx, orgId, projectId, row.payAppId);
  return toDto(await getRow(ctx, orgId, projectId, id), today(ctx), files.get(id));
}

export async function deleteLowerTierWaiver(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  id: string,
): Promise<void> {
  await assertLienWaivers(ctx, orgId);
  await getRow(ctx, orgId, projectId, id);
  // A file filed on the row stays on the pay application as ordinary backup.
  await ctx.db.batch([
    ctx.db
      .update(payAppAttachments)
      .set({ lowerTierWaiverId: null })
      .where(and(eq(payAppAttachments.orgId, orgId), eq(payAppAttachments.lowerTierWaiverId, id))),
    ctx.db
      .delete(lowerTierWaivers)
      .where(and(eq(lowerTierWaivers.id, id), eq(lowerTierWaivers.orgId, orgId))),
  ]);
}

/**
 * The company's lower-tier waivers not yet received on its active jobs, with each job's name and the
 * pay application's number, for the list across jobs (projects page, weekly email). Closed jobs are
 * left out (the job is finished and paid out or written off), and so is the sample job unless asked
 * for: its rows are invented.
 */
export async function companyLowerTierInputs(
  ctx: AppContext,
  orgId: string,
  opts: { excludeSample?: boolean } = {},
): Promise<CompanyLowerTierInput[]> {
  const conds = [
    eq(lowerTierWaivers.orgId, orgId),
    eq(projects.orgId, orgId),
    eq(payApps.orgId, orgId),
    eq(projects.status, "active"),
    isNull(lowerTierWaivers.receivedOn),
  ];
  if (opts.excludeSample) conds.push(eq(projects.isSample, false));
  return ctx.db
    .select({
      id: lowerTierWaivers.id,
      projectId: lowerTierWaivers.projectId,
      projectName: projects.name,
      projectNumber: projects.number,
      gcName: projects.gcName,
      payAppId: lowerTierWaivers.payAppId,
      payAppNumber: payApps.number,
      party: lowerTierWaivers.party,
      requestedOn: lowerTierWaivers.requestedOn,
      receivedOn: lowerTierWaivers.receivedOn,
    })
    .from(lowerTierWaivers)
    .innerJoin(projects, eq(projects.id, lowerTierWaivers.projectId))
    .innerJoin(payApps, eq(payApps.id, lowerTierWaivers.payAppId))
    .where(and(...conds))
    .orderBy(asc(lowerTierWaivers.createdAt), asc(lowerTierWaivers.id))
    .all();
}

/** Pay applications with lower-tier waivers still out, across active jobs (the sample job included: it is on the page). */
export async function listLowerTierToChase(
  ctx: AppContext,
  orgId: string,
): Promise<LowerTierPayAppToChase[]> {
  return lowerTierToChase(await companyLowerTierInputs(ctx, orgId), today(ctx));
}
