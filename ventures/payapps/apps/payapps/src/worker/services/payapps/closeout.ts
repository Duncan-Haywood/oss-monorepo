// The close-out checklist on a job: add documents (one at a time or the standard list), change,
// delete, and the checklist with each item's status for today, read with the job's punch list and
// the retainage held on its latest pay application, so the job page can say what still stands
// between the contractor and their retainage. Every query filters by org_id and the job. The rules
// are pure in @shared/closeout.
import type {
  CloseoutItemInputBody,
  CloseoutItemUpdateBody,
  CloseoutStandardBody,
} from "@shared/api/schemas";
import type { CloseoutDto, CloseoutItemDto } from "@shared/api/types";
import {
  type CloseoutKind,
  closeoutDateProblem,
  closeoutDaysOverdue,
  closeoutReadiness,
  closeoutStatus,
  type RetainagePosition,
  standardItemsToAdd,
  summarizeCloseout,
} from "@shared/closeout";
import { summarizePunchList } from "@shared/punch-list";
import { and, asc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { closeoutFiles, closeoutItems, organization, punchItems } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { getProjectRow, loadBundle, type ProjectBundle, type ProjectRow } from "./bundle";
import { closeoutFileCounts, closeoutFileKind, inCloseoutBinder } from "./closeout-files";

type CloseoutRow = typeof closeoutItems.$inferSelect;

/** The most documents one job's checklist holds; a large job's spec lists a few dozen. */
export const MAX_CLOSEOUT_ITEMS = 200;

const today = (ctx: AppContext) => ctx.now().toISOString().slice(0, 10);

/** Blank strings stored as null, so a cleared field reads as "not entered". */
const blank = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

function toDto(r: CloseoutRow, day: string, files = 0): CloseoutItemDto {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    requiredBy: r.requiredBy,
    dueOn: r.dueOn,
    sentOn: r.sentOn,
    acceptedOn: r.acceptedOn,
    acceptedBy: r.acceptedBy,
    waivedNote: r.waivedNote,
    note: r.note,
    status: closeoutStatus(r, day),
    daysOverdue: closeoutDaysOverdue(r, day),
    files,
  };
}

async function rows(ctx: AppContext, orgId: string, projectId: string) {
  return ctx.db
    .select()
    .from(closeoutItems)
    .where(and(eq(closeoutItems.orgId, orgId), eq(closeoutItems.projectId, projectId)))
    .orderBy(asc(closeoutItems.sortOrder), asc(closeoutItems.createdAt))
    .all();
}

/**
 * The retainage on the latest pay application sent (not a draft), and whether that application
 * bills the whole contract: the same reading the cash report makes (src/shared/cash-report.ts).
 */
export function retainagePosition(
  b: Pick<ProjectBundle, "payApps" | "computed">,
): RetainagePosition {
  const sent = b.payApps.filter((a) => a.status !== "draft").sort((x, y) => x.number - y.number);
  const latest = sent.at(-1);
  const computed = latest ? b.computed.find((c) => c.periodId === latest.id) : undefined;
  if (!latest || !computed) return { heldCents: 0, lastApplication: null, workComplete: false };
  return {
    heldCents: computed.summary.totalRetainageCents,
    lastApplication: latest.number,
    workComplete:
      computed.summary.contractSumToDateCents > 0 && computed.totals.balanceToFinishCents <= 0,
  };
}

export async function listCloseout(
  ctx: AppContext,
  orgId: string,
  projectId: string,
): Promise<CloseoutDto> {
  const bundle = await loadBundle(ctx, orgId, projectId);
  const [list, punch, counts] = await Promise.all([
    rows(ctx, orgId, projectId),
    ctx.db
      .select()
      .from(punchItems)
      .where(and(eq(punchItems.orgId, orgId), eq(punchItems.projectId, projectId)))
      .all(),
    closeoutFileCounts(ctx, orgId, projectId),
  ]);
  const day = today(ctx);
  const summary = summarizeCloseout(list, day);
  const punchSummary = summarizePunchList(punch, day);
  const retainage = retainagePosition(bundle);
  return {
    items: list.map((r) => toDto(r, day, counts.get(r.id) ?? 0)),
    summary,
    punch: punchSummary,
    retainage,
    readiness: closeoutReadiness(summary, punchSummary, retainage),
    today: day,
  };
}

async function getRow(ctx: AppContext, orgId: string, projectId: string, itemId: string) {
  const row = await ctx.db
    .select()
    .from(closeoutItems)
    .where(
      and(
        eq(closeoutItems.id, itemId),
        eq(closeoutItems.orgId, orgId),
        eq(closeoutItems.projectId, projectId),
      ),
    )
    .get();
  if (!row) throw notFound("Close-out item");
  return row;
}

function checkDates(facts: { sentOn: string | null; acceptedOn: string | null }, ctx: AppContext) {
  const problem = closeoutDateProblem(facts, today(ctx));
  if (problem) throw badRequest(problem);
}

function values(input: CloseoutItemInputBody) {
  return {
    kind: input.kind,
    title: input.title,
    requiredBy: blank(input.requiredBy),
    dueOn: input.dueOn ?? null,
    sentOn: input.sentOn ?? null,
    acceptedOn: input.acceptedOn ?? null,
    acceptedBy: blank(input.acceptedBy),
    waivedNote: blank(input.waivedNote),
    note: blank(input.note),
  };
}

const nextSort = (list: CloseoutRow[]) => list.reduce((m, r) => Math.max(m, r.sortOrder), 0) + 1;

export async function createCloseoutItem(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  input: CloseoutItemInputBody,
): Promise<CloseoutItemDto> {
  await getProjectRow(ctx, orgId, projectId);
  const existing = await rows(ctx, orgId, projectId);
  if (existing.length >= MAX_CLOSEOUT_ITEMS) {
    throw badRequest(`A job's close-out checklist holds up to ${MAX_CLOSEOUT_ITEMS} items`);
  }
  const v = values(input);
  checkDates(v, ctx);
  const id = newId("clo");
  await ctx.db
    .insert(closeoutItems)
    .values({ id, orgId, projectId, sortOrder: nextSort(existing), ...v });
  return toDto(await getRow(ctx, orgId, projectId, id), today(ctx));
}

/**
 * The standard list (src/shared/closeout.ts), plus consent of surety when the job is bonded, less
 * the kinds the job already has: pressing it twice adds nothing the second time.
 */
export async function addStandardCloseout(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  input: CloseoutStandardBody,
): Promise<CloseoutDto> {
  await getProjectRow(ctx, orgId, projectId);
  const existing = await rows(ctx, orgId, projectId);
  const kinds = existing.map((r) => r.kind as CloseoutKind);
  const wanted = standardItemsToAdd(kinds);
  if (input.bonded && !kinds.includes("consent_of_surety")) {
    wanted.push({
      kind: "consent_of_surety",
      title: "Consent of surety to final payment (bonded job)",
    });
  }
  if (existing.length + wanted.length > MAX_CLOSEOUT_ITEMS) {
    throw badRequest(`A job's close-out checklist holds up to ${MAX_CLOSEOUT_ITEMS} items`);
  }
  let sort = nextSort(existing);
  const inserts = wanted.map((w) =>
    ctx.db.insert(closeoutItems).values({
      id: newId("clo"),
      orgId,
      projectId,
      kind: w.kind,
      title: w.title,
      dueOn: input.dueOn ?? null,
      sortOrder: sort++,
    }),
  );
  const [first, ...rest] = inserts;
  if (first) await ctx.db.batch([first, ...rest]);
  return listCloseout(ctx, orgId, projectId);
}

export async function updateCloseoutItem(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  itemId: string,
  input: CloseoutItemUpdateBody,
): Promise<CloseoutItemDto> {
  const row = await getRow(ctx, orgId, projectId, itemId);
  const patch: Partial<typeof closeoutItems.$inferInsert> = {};
  if (input.kind !== undefined) patch.kind = input.kind;
  if (input.title !== undefined) patch.title = input.title;
  for (const key of ["requiredBy", "acceptedBy", "waivedNote", "note"] as const) {
    if (input[key] !== undefined) patch[key] = blank(input[key]);
  }
  for (const key of ["dueOn", "sentOn", "acceptedOn"] as const) {
    if (input[key] !== undefined) patch[key] = input[key] ?? null;
  }
  checkDates(
    {
      sentOn: patch.sentOn !== undefined ? patch.sentOn : row.sentOn,
      acceptedOn: patch.acceptedOn !== undefined ? patch.acceptedOn : row.acceptedOn,
    },
    ctx,
  );
  if (Object.keys(patch).length > 0) {
    await ctx.db
      .update(closeoutItems)
      .set(patch)
      .where(
        and(
          eq(closeoutItems.id, itemId),
          eq(closeoutItems.orgId, orgId),
          eq(closeoutItems.projectId, projectId),
        ),
      );
  }
  const counts = await closeoutFileCounts(ctx, orgId, projectId);
  return toDto(await getRow(ctx, orgId, projectId, itemId), today(ctx), counts.get(itemId) ?? 0);
}

export async function deleteCloseoutItem(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  itemId: string,
) {
  await getRow(ctx, orgId, projectId, itemId);
  await ctx.db
    .delete(closeoutItems)
    .where(
      and(
        eq(closeoutItems.id, itemId),
        eq(closeoutItems.orgId, orgId),
        eq(closeoutItems.projectId, projectId),
      ),
    );
}

/** One file that goes in the binder, with the document it belongs to. */
export interface CloseoutBinderFile {
  id: string;
  itemId: string;
  fileName: string;
  kind: string;
  contentType: string;
  sizeBytes: number;
  r2Key: string;
}

export interface CloseoutBinder {
  contractor: { name: string };
  project: Pick<
    ProjectRow,
    | "name"
    | "number"
    | "location"
    | "gcName"
    | "gcPmName"
    | "gcPmEmail"
    | "ownerName"
    | "architectName"
    | "isSample"
  >;
  /** Every item on the checklist, in its order, with its status for today and file count. */
  items: CloseoutItemDto[];
  /**
   * The files that go behind the transmittal: each required document's files (not the GC's own
   * receipt), documents in checklist order, files oldest first within each.
   */
  files: CloseoutBinderFile[];
  today: string;
}

/**
 * What the close-out binder prints: the job's parties, the checklist as entered, and the files kept
 * with each document that is required. A document marked not required stays on the transmittal
 * (with its reason) but its files do not go in.
 */
export async function loadCloseoutBinder(
  ctx: AppContext,
  orgId: string,
  projectId: string,
): Promise<CloseoutBinder> {
  const [project, list, org, fileRows] = await Promise.all([
    getProjectRow(ctx, orgId, projectId),
    rows(ctx, orgId, projectId),
    ctx.db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, orgId))
      .get(),
    ctx.db
      .select()
      .from(closeoutFiles)
      .where(and(eq(closeoutFiles.orgId, orgId), eq(closeoutFiles.projectId, projectId)))
      .orderBy(asc(closeoutFiles.createdAt), asc(closeoutFiles.id))
      .all(),
  ]);
  if (!org) throw notFound("Organization");
  const day = today(ctx);
  const counts = new Map<string, number>();
  for (const f of fileRows) counts.set(f.itemId, (counts.get(f.itemId) ?? 0) + 1);
  const files = list
    .filter((it) => !it.waivedNote)
    .flatMap((it) =>
      fileRows
        .filter((f) => f.itemId === it.id && inCloseoutBinder(f.category))
        .map((f) => ({
          id: f.id,
          itemId: it.id,
          fileName: f.fileName,
          kind: closeoutFileKind(f.category),
          contentType: f.contentType,
          sizeBytes: f.sizeBytes,
          r2Key: f.r2Key,
        })),
    );
  return {
    contractor: { name: org.name },
    project,
    items: list.map((r) => toDto(r, day, counts.get(r.id) ?? 0)),
    files,
    today: day,
  };
}
