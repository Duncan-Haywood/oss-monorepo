// T&M tickets per job: create, change, sign, delete, the log with its summary, the signature image,
// one ticket (or several) for the PDF, the log for the CSV, and a change order billing signed,
// priced tickets. Every query filters by org_id and the job; the rules (lines, quantities, prices,
// what a signature locks) are pure in @shared/tm-tickets. On every plan, like the RFI and
// submittal logs: a ticket is part of running the job, and the change order it feeds is billed.
import type {
  TmChangeOrderBody,
  TmRateSheetBody,
  TmSignatureBody,
  TmTicketInputBody,
  TmTicketUpdateBody,
} from "@shared/api/schemas";
import type { TmRateSheetDto, TmTicketDto, TmTicketLogDto } from "@shared/api/types";
import { ROLE_RANK } from "@shared/enums";
import {
  addDays,
  base64ToBytes,
  type CompanyTmTicketInput,
  changeOrderDescription,
  jobRates,
  nextChangeOrderNumber,
  nextTicketNumber,
  priceTicket,
  rateSheetFromTickets,
  rateSheetProblem,
  ratesFromTickets,
  signatureProblem,
  signedFactsKey,
  summarizeTickets,
  type TmRateSheet,
  type TmTicketFacts,
  ticketStage,
  tmLabel,
  tmTicketProblem,
} from "@shared/tm-tickets";
import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { AppContext } from "../../context";
import { allInChunks } from "../../db/in-chunks";
import {
  changeOrders,
  organization,
  projects,
  sovLines,
  tmRateSheets,
  tmTickets,
  user,
} from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import type { Tenant } from "../../types";
import { getProjectRow, type ProjectRow } from "./bundle";
import { createChangeOrder } from "./change-orders";
import { tmTicketFileCounts } from "./tm-ticket-files";

type Row = typeof tmTickets.$inferSelect;
type CoInfo = { number: string; status: "pending" | "approved" | "rejected" };

const today = (ctx: AppContext) => ctx.now().toISOString().slice(0, 10);
/** Tomorrow in UTC: a contractor west of UTC writes up tonight's work after UTC midnight. */
const latest = (ctx: AppContext) => addDays(today(ctx), 1);

/** Blank strings stored as null, so a cleared field reads as "not entered". */
const blank = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

const isSigned = (r: Pick<Row, "signedName" | "signedOn">) => !!r.signedName && !!r.signedOn;

function toDto(
  r: Row,
  names: Map<string, string>,
  cos: Map<string, CoInfo>,
  fileCount = 0,
): TmTicketDto {
  const co = r.changeOrderId ? (cos.get(r.changeOrderId) ?? null) : null;
  return {
    id: r.id,
    number: r.number,
    workDate: r.workDate,
    description: r.description,
    location: r.location,
    directedBy: r.directedBy,
    reference: r.reference,
    labor: r.labor,
    material: r.material,
    equipment: r.equipment,
    laborMarkupBps: r.laborMarkupBps,
    materialMarkupBps: r.materialMarkupBps,
    equipmentMarkupBps: r.equipmentMarkupBps,
    notes: r.notes,
    pricing: priceTicket(r),
    signedName: r.signedName,
    signedTitle: r.signedTitle,
    signedOn: r.signedOn,
    hasSignatureImage: !!r.signatureJpeg,
    changeOrderId: co ? r.changeOrderId : null,
    changeOrderNumber: co?.number ?? null,
    stage: ticketStage({ signed: isSigned(r), changeOrderStatus: co?.status ?? null }),
    fileCount,
    createdByName: r.createdBy ? (names.get(r.createdBy) ?? null) : null,
    updatedByName: r.updatedBy ? (names.get(r.updatedBy) ?? null) : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

async function userNames(ctx: AppContext, list: Row[]) {
  const ids = [
    ...new Set(list.flatMap((r) => [r.createdBy, r.updatedBy]).filter((x): x is string => !!x)),
  ];
  if (ids.length === 0) return new Map<string, string>();
  const found = await allInChunks(ids, (slice) =>
    ctx.db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, slice)).all(),
  );
  return new Map(found.map((u) => [u.id, u.name]));
}

async function jobChangeOrders(ctx: AppContext, orgId: string, projectId: string) {
  const list = await ctx.db
    .select({ id: changeOrders.id, number: changeOrders.number, status: changeOrders.status })
    .from(changeOrders)
    .where(and(eq(changeOrders.orgId, orgId), eq(changeOrders.projectId, projectId)))
    .all();
  return new Map<string, CoInfo>(list.map((c) => [c.id, { number: c.number, status: c.status }]));
}

async function rows(ctx: AppContext, orgId: string, projectId: string) {
  return ctx.db
    .select()
    .from(tmTickets)
    .where(and(eq(tmTickets.orgId, orgId), eq(tmTickets.projectId, projectId)))
    .orderBy(desc(tmTickets.workDate), desc(tmTickets.number))
    .all();
}

async function getRow(ctx: AppContext, orgId: string, projectId: string, id: string) {
  const row = await ctx.db
    .select()
    .from(tmTickets)
    .where(
      and(eq(tmTickets.id, id), eq(tmTickets.orgId, orgId), eq(tmTickets.projectId, projectId)),
    )
    .get();
  if (!row) throw notFound("T&M ticket");
  return row;
}

async function oneDto(ctx: AppContext, orgId: string, projectId: string, id: string) {
  const row = await getRow(ctx, orgId, projectId, id);
  const [names, cos, files] = await Promise.all([
    userNames(ctx, [row]),
    jobChangeOrders(ctx, orgId, projectId),
    tmTicketFileCounts(ctx, orgId, projectId),
  ]);
  return toDto(row, names, cos, files.get(id) ?? 0);
}

/** One ticket as the log shows it (404 when it is not on this job of this company). */
export const getTmTicket = oneDto;

function check(facts: TmTicketFacts, ctx: AppContext) {
  const problem = tmTicketProblem(facts, latest(ctx));
  if (problem) throw badRequest(problem);
}

const isUniqueViolation = (err: unknown) =>
  err instanceof Error && /UNIQUE constraint failed/i.test(`${err.message} ${err.cause}`);
const numberTaken = (n: number) =>
  conflict(`${tmLabel(n)} already exists on this job: pick another number`);

const cleanLabor = (l: TmTicketInputBody["labor"]) =>
  l.map((x) => ({ ...x, trade: x.trade.trim() }));
const cleanMaterial = (l: TmTicketInputBody["material"]) =>
  l.map((x) => ({
    description: x.description.trim(),
    quantity: x.quantity,
    unit: blank(x.unit),
    unitCostCents: x.unitCostCents,
  }));
const cleanEquipment = (l: TmTicketInputBody["equipment"]) =>
  l.map((x) => ({ ...x, description: x.description.trim() }));

export async function tmTicketLog(
  ctx: AppContext,
  tenant: Tenant,
  projectId: string,
): Promise<TmTicketLogDto> {
  const p = await getProjectRow(ctx, tenant.orgId, projectId);
  const [list, cos, files, sov] = await Promise.all([
    rows(ctx, tenant.orgId, projectId),
    jobChangeOrders(ctx, tenant.orgId, projectId),
    tmTicketFileCounts(ctx, tenant.orgId, projectId),
    ctx.db
      .select({
        id: sovLines.id,
        itemNumber: sovLines.itemNumber,
        description: sovLines.description,
      })
      .from(sovLines)
      .where(and(eq(sovLines.orgId, tenant.orgId), eq(sovLines.projectId, projectId)))
      .orderBy(asc(sovLines.sortOrder))
      .all(),
  ]);
  const [names, sheet] = await Promise.all([
    userNames(ctx, list),
    rateSheetDto(ctx, tenant.orgId, projectId),
  ]);
  const items = list.map((r) => toDto(r, names, cos, files.get(r.id) ?? 0));
  const draft = rateSheetFromTickets(list);
  const hasDraft = draft.labor.length + draft.material.length + draft.equipment.length > 0;
  return {
    projectName: p.name,
    gcName: p.gcName,
    items,
    summary: summarizeTickets(
      items.map((t) => ({
        workDate: t.workDate,
        stage: t.stage,
        totalCents: t.pricing.totalCents,
        manHours: t.pricing.manHours,
      })),
    ),
    nextNumber: nextTicketNumber(list.map((r) => r.number)),
    latestDate: latest(ctx),
    rates: jobRates(sheet, ratesFromTickets(list)),
    rateSheet: sheet,
    rateSheetDraft: hasDraft ? draft : null,
    sovLines: sov,
    suggestedChangeOrderNumber: nextChangeOrderNumber([...cos.values()].map((c) => c.number)),
    canEdit: ROLE_RANK[tenant.role] >= ROLE_RANK.editor,
  };
}

export async function createTmTicket(
  ctx: AppContext,
  tenant: Tenant,
  projectId: string,
  input: TmTicketInputBody,
): Promise<TmTicketDto> {
  await getProjectRow(ctx, tenant.orgId, projectId);
  const number =
    input.number ??
    nextTicketNumber((await rows(ctx, tenant.orgId, projectId)).map((r) => r.number));
  const values = {
    number,
    workDate: input.workDate,
    description: input.description.trim(),
    location: blank(input.location),
    directedBy: blank(input.directedBy),
    reference: blank(input.reference),
    labor: cleanLabor(input.labor),
    material: cleanMaterial(input.material),
    equipment: cleanEquipment(input.equipment),
    laborMarkupBps: input.laborMarkupBps,
    materialMarkupBps: input.materialMarkupBps,
    equipmentMarkupBps: input.equipmentMarkupBps,
    notes: blank(input.notes),
  };
  check(values, ctx);
  const id = newId("tmt");
  try {
    await ctx.db.insert(tmTickets).values({
      id,
      orgId: tenant.orgId,
      projectId,
      ...values,
      createdBy: tenant.userId,
      updatedBy: tenant.userId,
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw numberTaken(number);
    throw err;
  }
  return oneDto(ctx, tenant.orgId, projectId, id);
}

/**
 * Changes a ticket. Once it is signed, the date, the work, the location and every quantity are what
 * the GC signed for: a change to any of them is refused until the signature is taken off. Rates,
 * markups, the reference, who directed it and the notes stay editable (pricing happens after the
 * signature). A ticket on a change order is billed: only its notes change.
 */
export async function updateTmTicket(
  ctx: AppContext,
  tenant: Tenant,
  projectId: string,
  ticketId: string,
  input: TmTicketUpdateBody,
): Promise<TmTicketDto> {
  const row = await getRow(ctx, tenant.orgId, projectId, ticketId);
  const patch: Partial<typeof tmTickets.$inferInsert> = {};
  if (input.number !== undefined) patch.number = input.number;
  if (input.workDate !== undefined) patch.workDate = input.workDate;
  if (input.description !== undefined) patch.description = input.description.trim();
  for (const k of ["location", "directedBy", "reference", "notes"] as const) {
    if (input[k] !== undefined) patch[k] = blank(input[k]);
  }
  if (input.labor !== undefined) patch.labor = cleanLabor(input.labor);
  if (input.material !== undefined) patch.material = cleanMaterial(input.material);
  if (input.equipment !== undefined) patch.equipment = cleanEquipment(input.equipment);
  for (const k of ["laborMarkupBps", "materialMarkupBps", "equipmentMarkupBps"] as const) {
    if (input[k] !== undefined) patch[k] = input[k];
  }
  const next = { ...row, ...patch } as Row;
  check(next, ctx);
  if (row.changeOrderId) {
    const billed = Object.keys(patch).filter(
      (k) =>
        k !== "notes" &&
        JSON.stringify(patch[k as keyof typeof patch]) !== JSON.stringify(row[k as keyof Row]),
    );
    if (billed.length > 0) {
      throw conflict(
        `${tmLabel(row.number)} is on a change order: delete that change order to change the ticket`,
      );
    }
  } else if (isSigned(row) && signedFactsKey(next) !== signedFactsKey(row)) {
    throw conflict(
      `${tmLabel(row.number)} is signed: take the signature off to change the work or the quantities (rates and markups can still change)`,
    );
  }
  if (Object.keys(patch).length > 0) {
    try {
      await ctx.db
        .update(tmTickets)
        .set({ ...patch, updatedBy: tenant.userId })
        .where(
          and(
            eq(tmTickets.id, ticketId),
            eq(tmTickets.orgId, tenant.orgId),
            eq(tmTickets.projectId, projectId),
          ),
        );
    } catch (err) {
      if (isUniqueViolation(err)) throw numberTaken(next.number);
      throw err;
    }
  }
  return oneDto(ctx, tenant.orgId, projectId, ticketId);
}

/** Records the GC representative's signature: a drawn image (JPEG) or, without one, signed on paper. */
export async function signTmTicket(
  ctx: AppContext,
  tenant: Tenant,
  projectId: string,
  ticketId: string,
  input: TmSignatureBody,
): Promise<TmTicketDto> {
  const row = await getRow(ctx, tenant.orgId, projectId, ticketId);
  if (row.changeOrderId) throw conflict(`${tmLabel(row.number)} is already on a change order`);
  if (input.signedOn > latest(ctx)) throw badRequest("The signature cannot be dated after today");
  if (input.signedOn < row.workDate) {
    throw badRequest("The signature cannot be dated before the work it signs for");
  }
  const jpeg = input.signatureJpeg?.trim() || null;
  if (jpeg) {
    const problem = signatureProblem(jpeg);
    if (problem) throw badRequest(problem);
  }
  await ctx.db
    .update(tmTickets)
    .set({
      signedName: input.signedName.trim(),
      signedTitle: blank(input.signedTitle),
      signedOn: input.signedOn,
      signatureJpeg: jpeg,
      updatedBy: tenant.userId,
    })
    .where(
      and(
        eq(tmTickets.id, ticketId),
        eq(tmTickets.orgId, tenant.orgId),
        eq(tmTickets.projectId, projectId),
      ),
    );
  return oneDto(ctx, tenant.orgId, projectId, ticketId);
}

/** Takes the signature off (to correct the quantities, then sign again). */
export async function unsignTmTicket(
  ctx: AppContext,
  tenant: Tenant,
  projectId: string,
  ticketId: string,
): Promise<TmTicketDto> {
  const row = await getRow(ctx, tenant.orgId, projectId, ticketId);
  if (row.changeOrderId) {
    throw conflict(`${tmLabel(row.number)} is on a change order: delete that change order first`);
  }
  await ctx.db
    .update(tmTickets)
    .set({
      signedName: null,
      signedTitle: null,
      signedOn: null,
      signatureJpeg: null,
      updatedBy: tenant.userId,
    })
    .where(
      and(
        eq(tmTickets.id, ticketId),
        eq(tmTickets.orgId, tenant.orgId),
        eq(tmTickets.projectId, projectId),
      ),
    );
  return oneDto(ctx, tenant.orgId, projectId, ticketId);
}

export async function deleteTmTicket(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  ticketId: string,
) {
  const row = await getRow(ctx, orgId, projectId, ticketId);
  if (row.changeOrderId) {
    throw conflict(`${tmLabel(row.number)} is on a change order: delete that change order first`);
  }
  await ctx.db
    .delete(tmTickets)
    .where(
      and(
        eq(tmTickets.id, ticketId),
        eq(tmTickets.orgId, orgId),
        eq(tmTickets.projectId, projectId),
      ),
    );
}

/** The drawn signature's JPEG bytes, or a 404 when the ticket has none. */
export async function tmSignatureImage(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  ticketId: string,
): Promise<Uint8Array> {
  const row = await getRow(ctx, orgId, projectId, ticketId);
  const bytes = row.signatureJpeg ? base64ToBytes(row.signatureJpeg) : null;
  if (!bytes) throw notFound("Signature image");
  return bytes;
}

/**
 * One change order for the tickets picked: each must be signed, fully priced and on no change order.
 * Its amount is their total, on one schedule-of-values line (an existing one, or a new line the
 * change order adds, as the project page does), pending until the GC approves it.
 */
export async function changeOrderFromTickets(
  ctx: AppContext,
  tenant: Tenant,
  projectId: string,
  input: TmChangeOrderBody,
): Promise<{
  changeOrderId: string;
  number: string;
  description: string;
  amountCents: number;
  tickets: number[];
  /** Each ticket billed, lowest number first, with its own total (for the job history). */
  billed: { id: string; number: number; amountCents: number }[];
}> {
  const ids = [...new Set(input.ticketIds)];
  const list = await ctx.db
    .select()
    .from(tmTickets)
    .where(
      and(
        eq(tmTickets.orgId, tenant.orgId),
        eq(tmTickets.projectId, projectId),
        inArray(tmTickets.id, ids),
      ),
    )
    .all();
  if (list.length !== ids.length) throw notFound("T&M ticket");
  list.sort((a, b) => a.number - b.number); // the first problem named is the lowest ticket
  let amount = 0;
  const billed: { id: string; number: number; amountCents: number }[] = [];
  for (const t of list) {
    if (t.changeOrderId) throw conflict(`${tmLabel(t.number)} is already on a change order`);
    if (!isSigned(t)) throw badRequest(`${tmLabel(t.number)} is not signed yet`);
    const total = priceTicket(t).totalCents;
    if (total === null) throw badRequest(`${tmLabel(t.number)} has lines with no rate yet`);
    amount += total;
    billed.push({ id: t.id, number: t.number, amountCents: total });
  }
  if (amount === 0) throw badRequest("The tickets add up to $0.00: there is nothing to bill");
  const description = changeOrderDescription(list);
  const coId = await createChangeOrder(ctx, tenant.orgId, projectId, {
    number: input.number,
    description,
    submittedOn: input.submittedOn ?? null,
    scheduleDays: null,
    items: [
      "sovLineId" in input.target
        ? { sovLineId: input.target.sovLineId, amountCents: amount }
        : {
            newLine: {
              itemNumber: input.target.newLine.itemNumber,
              description: description.slice(0, 300),
            },
            amountCents: amount,
          },
    ],
  });
  await ctx.db
    .update(tmTickets)
    .set({ changeOrderId: coId, updatedBy: tenant.userId })
    .where(
      and(
        eq(tmTickets.orgId, tenant.orgId),
        eq(tmTickets.projectId, projectId),
        inArray(tmTickets.id, ids),
      ),
    );
  return {
    changeOrderId: coId,
    number: input.number,
    description,
    amountCents: amount,
    tickets: list.map((t) => t.number),
    billed,
  };
}

export interface TmTicketDocument {
  contractor: { name: string };
  project: Pick<
    ProjectRow,
    "name" | "number" | "location" | "gcName" | "ownerName" | "architectName" | "isSample"
  >;
  /** Oldest work first. */
  tickets: TmTicketDto[];
  /** The drawn signatures by ticket id (JPEG bytes). */
  signatures: Map<string, Uint8Array>;
  /** Print the prices (the office copy and the change-order backup) or only quantities (the field copy). */
  withPrices: boolean;
}

async function contractor(ctx: AppContext, orgId: string) {
  const org = await ctx.db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, orgId))
    .get();
  if (!org) throw notFound("Organization");
  return org;
}

/** What the PDF prints: one ticket by id, or every ticket on a change order (its backup). */
export async function loadTmTicketDocument(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  pick: { ticketId: string } | { changeOrderId: string },
  withPrices: boolean,
): Promise<TmTicketDocument> {
  const [project, org, cos] = await Promise.all([
    getProjectRow(ctx, orgId, projectId),
    contractor(ctx, orgId),
    jobChangeOrders(ctx, orgId, projectId),
  ]);
  let list: Row[];
  if ("ticketId" in pick) {
    list = [await getRow(ctx, orgId, projectId, pick.ticketId)];
  } else {
    list = (await rows(ctx, orgId, projectId))
      .filter((r) => r.changeOrderId === pick.changeOrderId)
      .reverse();
    if (list.length === 0) throw notFound("T&M tickets on that change order");
  }
  const names = await userNames(ctx, list);
  const signatures = new Map<string, Uint8Array>();
  for (const r of list) {
    const bytes = r.signatureJpeg ? base64ToBytes(r.signatureJpeg) : null;
    if (bytes) signatures.set(r.id, bytes);
  }
  return {
    contractor: org,
    project,
    tickets: list.map((r) => toDto(r, names, cos)),
    signatures,
    withPrices,
  };
}

/** The job's tickets for the CSV, oldest first, plus the job (file name). */
export async function loadTmTicketLog(ctx: AppContext, orgId: string, projectId: string) {
  const [project, list, cos] = await Promise.all([
    getProjectRow(ctx, orgId, projectId),
    rows(ctx, orgId, projectId),
    jobChangeOrders(ctx, orgId, projectId),
  ]);
  list.reverse();
  const names = await userNames(ctx, list);
  return { project, tickets: list.map((r) => toDto(r, names, cos)) };
}

// ---------------------------------------------------------------------------------------------
// The job's rate sheet (one row per job). Saved whole and replaced whole: the page edits the list
// and sends it back, so there is no per-rate route to keep in step.

async function rateSheetDto(
  ctx: AppContext,
  orgId: string,
  projectId: string,
): Promise<TmRateSheetDto | null> {
  const row = await ctx.db
    .select()
    .from(tmRateSheets)
    .where(and(eq(tmRateSheets.orgId, orgId), eq(tmRateSheets.projectId, projectId)))
    .get();
  if (!row) return null;
  const by = row.updatedBy
    ? await ctx.db.select({ name: user.name }).from(user).where(eq(user.id, row.updatedBy)).get()
    : undefined;
  return {
    labor: row.labor,
    material: row.material,
    equipment: row.equipment,
    laborMarkupBps: row.laborMarkupBps,
    materialMarkupBps: row.materialMarkupBps,
    equipmentMarkupBps: row.equipmentMarkupBps,
    source: row.source,
    updatedByName: by?.name ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const cleanRates = (list: TmRateSheetBody["labor"], withUnit: boolean) =>
  list.map((l) => ({
    name: l.name.trim(),
    rateCents: l.rateCents,
    unit: withUnit ? blank(l.unit) : null,
  }));

/** Saves the job's rate sheet (creates it or replaces it whole). Tickets are not repriced. */
export async function saveTmRateSheet(
  ctx: AppContext,
  tenant: Tenant,
  projectId: string,
  input: TmRateSheetBody,
): Promise<TmRateSheetDto> {
  await getProjectRow(ctx, tenant.orgId, projectId);
  const sheet: TmRateSheet = {
    labor: cleanRates(input.labor, false),
    material: cleanRates(input.material, true),
    equipment: cleanRates(input.equipment, false),
    laborMarkupBps: input.laborMarkupBps,
    materialMarkupBps: input.materialMarkupBps,
    equipmentMarkupBps: input.equipmentMarkupBps,
    source: blank(input.source),
  };
  const problem = rateSheetProblem(sheet);
  if (problem) throw badRequest(problem);
  await ctx.db
    .insert(tmRateSheets)
    .values({
      id: newId("tmr"),
      orgId: tenant.orgId,
      projectId,
      ...sheet,
      updatedBy: tenant.userId,
    })
    .onConflictDoUpdate({
      target: [tmRateSheets.orgId, tmRateSheets.projectId],
      set: { ...sheet, updatedBy: tenant.userId, updatedAt: ctx.now() },
    });
  const out = await rateSheetDto(ctx, tenant.orgId, projectId);
  if (!out) throw notFound("Rate sheet");
  return out;
}

/** Removes the job's rate sheet; new tickets go back to the rates and markups of earlier tickets. */
export async function deleteTmRateSheet(ctx: AppContext, orgId: string, projectId: string) {
  await getProjectRow(ctx, orgId, projectId);
  await ctx.db
    .delete(tmRateSheets)
    .where(and(eq(tmRateSheets.orgId, orgId), eq(tmRateSheets.projectId, projectId)));
}

/**
 * Signed tickets on no change order across the company's active jobs, for the weekly email
 * (src/shared/tm-tickets.ts, ticketsToBill). Only what the email needs; the signature image is
 * never read here.
 */
export async function companyTmTicketInputs(
  ctx: AppContext,
  orgId: string,
  opts: { excludeSample?: boolean } = {},
): Promise<CompanyTmTicketInput[]> {
  const conds = [
    eq(tmTickets.orgId, orgId),
    eq(projects.orgId, orgId),
    eq(projects.status, "active"),
    isNotNull(tmTickets.signedName),
    isNotNull(tmTickets.signedOn),
    isNull(tmTickets.changeOrderId),
  ];
  if (opts.excludeSample) conds.push(eq(projects.isSample, false));
  const list = await ctx.db
    .select({
      projectId: tmTickets.projectId,
      projectName: projects.name,
      projectNumber: projects.number,
      gcName: projects.gcName,
      number: tmTickets.number,
      workDate: tmTickets.workDate,
      labor: tmTickets.labor,
      material: tmTickets.material,
      equipment: tmTickets.equipment,
      laborMarkupBps: tmTickets.laborMarkupBps,
      materialMarkupBps: tmTickets.materialMarkupBps,
      equipmentMarkupBps: tmTickets.equipmentMarkupBps,
    })
    .from(tmTickets)
    .innerJoin(projects, eq(projects.id, tmTickets.projectId))
    .where(and(...conds))
    .all();
  return list.map((t) => ({ ...t, signed: true, onChangeOrder: false }));
}
