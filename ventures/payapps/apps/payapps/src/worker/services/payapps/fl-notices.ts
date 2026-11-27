// Florida Notices to Owner served (Fla. Stat. §§ 713.06(2), 713.18), under the notice panel when the
// job's state is FL: the day the company first furnished work (saved with the job, so the 45-day
// serve-by and 40-day mail-by dates and the cash page's reminder follow from it), and each notice or
// copy recorded per person with how and when it went. When it counts as served comes from
// packages/lien-waivers (fl-service.ts): on mailing for registered, Global Express Guaranteed or
// certified mail within the 40 days, otherwise on delivery. Crew plan and up, like the notice.
// Not legal advice; see the package README.
import {
  FL_NOTICE_RECIPIENT_LABELS,
  FL_NOTICE_RECIPIENTS,
  FL_REMINDER_RECIPIENTS,
  FL_SERVICE_METHOD_LABELS,
  FL_SERVICE_METHODS,
  type FlNoticeRecipient,
  flNoticeDates,
  flNoticeService,
  flServiceText,
} from "@lien-waivers";
import type { FlNoticeSendBody } from "@shared/api/schemas";
import type { FlNoticeLogDto, FlNoticeSendDto } from "@shared/api/types";
import { and, asc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { flNoticeSends, projects } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { assertLienWaivers } from "../billing";

type SendRow = typeof flNoticeSends.$inferSelect;

async function loadProject(ctx: AppContext, orgId: string, projectId: string) {
  const p = await ctx.db
    .select({ flFirstFurnishedOn: projects.flFirstFurnishedOn, isSample: projects.isSample })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)))
    .get();
  if (!p) throw notFound("Project");
  return p;
}

/** The package's rule, with its RangeError turned into a 400. */
function service(firstFurnishedOn: string, r: Pick<SendRow, "method" | "sentOn" | "deliveredOn">) {
  try {
    return flNoticeService(firstFurnishedOn, {
      method: r.method,
      on: r.sentOn,
      deliveredOn: r.deliveredOn,
    });
  } catch (e) {
    throw badRequest(e instanceof Error ? e.message : "Bad date");
  }
}

export function flSendDto(r: SendRow, firstFurnishedOn: string | null): FlNoticeSendDto {
  const s = firstFurnishedOn ? service(firstFurnishedOn, r) : null;
  return {
    id: r.id,
    recipient: r.recipient,
    recipientNameAddress: r.recipientNameAddress,
    method: r.method,
    sentOn: r.sentOn,
    deliveredOn: r.deliveredOn,
    tracking: r.tracking,
    servedOn: s?.servedOn ?? null,
    basis: s?.basis ?? null,
    onTime: s?.onTime ?? null,
    timing: s ? flServiceText(s) : null,
  };
}

/** The recipients the reminder waits on with no notice recorded (the owner, § 713.06(2)(a)). */
export function flMissingRecipients(sends: readonly { recipient: FlNoticeRecipient }[]) {
  const have = new Set(sends.map((s) => s.recipient));
  return FL_REMINDER_RECIPIENTS.filter((r) => !have.has(r));
}

export async function flNoticeLog(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  recipientPrefill: FlNoticeLogDto["recipientPrefill"],
): Promise<FlNoticeLogDto> {
  const [p, rows] = await Promise.all([
    loadProject(ctx, orgId, projectId),
    ctx.db
      .select()
      .from(flNoticeSends)
      .where(and(eq(flNoticeSends.orgId, orgId), eq(flNoticeSends.projectId, projectId)))
      .orderBy(asc(flNoticeSends.sentOn), asc(flNoticeSends.createdAt))
      .all(),
  ]);
  const first = p.flFirstFurnishedOn;
  const dates = first ? flNoticeDates(first) : null;
  return {
    firstFurnishedOn: first,
    serveBy: dates?.serveBy ?? null,
    mailBy: dates?.mailBy ?? null,
    sends: rows.map((r) => flSendDto(r, first)),
    missing: flMissingRecipients(rows),
    methods: FL_SERVICE_METHODS.map((id) => ({ id, label: FL_SERVICE_METHOD_LABELS[id] })),
    recipients: FL_NOTICE_RECIPIENTS.map((id) => ({ id, label: FL_NOTICE_RECIPIENT_LABELS[id] })),
    recipientPrefill,
  };
}

/** Set or clear the day the company first furnished work (the § 713.06(2)(a) start). */
export async function setFlFirstFurnished(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  firstFurnishedOn: string | null,
) {
  await assertLienWaivers(ctx, orgId);
  const p = await loadProject(ctx, orgId, projectId);
  if (firstFurnishedOn) {
    try {
      flNoticeDates(firstFurnishedOn);
    } catch {
      throw badRequest(`Not a date: ${firstFurnishedOn}`);
    }
  }
  await ctx.db
    .update(projects)
    .set({ flFirstFurnishedOn: firstFurnishedOn })
    .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)));
  return {
    firstFurnishedOn,
    changed: (p.flFirstFurnishedOn ?? null) !== firstFurnishedOn,
    isSample: p.isSample,
  };
}

/** A placeholder first day for checking a record's own dates when the job has none yet. */
const checkDates = (r: Pick<SendRow, "method" | "sentOn" | "deliveredOn">, first: string | null) =>
  service(first ?? r.sentOn, r);

/** Record a Florida Notice to Owner, or a copy, as served on one person. */
export async function recordFlNoticeSend(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  userId: string,
  input: FlNoticeSendBody,
): Promise<{ send: FlNoticeSendDto; isSample: boolean }> {
  await assertLienWaivers(ctx, orgId);
  const p = await loadProject(ctx, orgId, projectId);
  const row: SendRow = {
    id: crypto.randomUUID(),
    orgId,
    projectId,
    recipient: input.recipient,
    recipientNameAddress: input.recipientNameAddress,
    method: input.method,
    sentOn: input.sentOn,
    deliveredOn: input.deliveredOn || null,
    tracking: input.tracking?.trim() || null,
    createdBy: userId,
    createdAt: ctx.now(),
  };
  checkDates(row, p.flFirstFurnishedOn);
  await ctx.db.insert(flNoticeSends).values(row);
  return { send: flSendDto(row, p.flFirstFurnishedOn), isSample: p.isSample };
}

async function loadSend(ctx: AppContext, orgId: string, projectId: string, sendId: string) {
  const r = await ctx.db
    .select()
    .from(flNoticeSends)
    .where(
      and(
        eq(flNoticeSends.id, sendId),
        eq(flNoticeSends.orgId, orgId),
        eq(flNoticeSends.projectId, projectId),
      ),
    )
    .get();
  if (!r) throw notFound("Notice");
  return r;
}

/** Enter or clear the delivery date once the evidence of delivery is back. */
export async function setFlNoticeDelivered(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  sendId: string,
  deliveredOn: string | null,
): Promise<{ send: FlNoticeSendDto; isSample: boolean; changed: boolean }> {
  await assertLienWaivers(ctx, orgId);
  const [p, r] = await Promise.all([
    loadProject(ctx, orgId, projectId),
    loadSend(ctx, orgId, projectId, sendId),
  ]);
  const next: SendRow = { ...r, deliveredOn };
  checkDates(next, p.flFirstFurnishedOn);
  await ctx.db
    .update(flNoticeSends)
    .set({ deliveredOn })
    .where(and(eq(flNoticeSends.id, sendId), eq(flNoticeSends.orgId, orgId)));
  return {
    send: flSendDto(next, p.flFirstFurnishedOn),
    isSample: p.isSample,
    changed: (r.deliveredOn ?? null) !== deliveredOn,
  };
}

export async function deleteFlNoticeSend(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  sendId: string,
) {
  await assertLienWaivers(ctx, orgId);
  const [p, r] = await Promise.all([
    loadProject(ctx, orgId, projectId),
    loadSend(ctx, orgId, projectId, sendId),
  ]);
  await ctx.db
    .delete(flNoticeSends)
    .where(and(eq(flNoticeSends.id, sendId), eq(flNoticeSends.orgId, orgId)));
  return { send: r, isSample: p.isSample };
}
