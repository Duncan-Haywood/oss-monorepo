// Texas notices of claim sent (Tex. Prop. Code §§ 53.056, 53.057), under the notice panel when the
// job's state is TX: whether the job is a residential construction project (saved with the job; it
// turns on the per-month reminder), the months the job's pay apps leave unpaid with each month's
// notice date (src/shared/tx-notices.ts), and each notice recorded per recipient with how it went
// (§ 53.003(b)) and the mail or tracking number. Crew plan and up, like the notice. Not legal advice.
import {
  TX_DELIVERY_METHOD_LABELS,
  TX_DELIVERY_METHODS,
  TX_NOTICE_RECIPIENT_LABELS,
  TX_NOTICE_RECIPIENTS,
  txSendTiming,
} from "@lien-waivers";
import type { TxNoticeSendBody } from "@shared/api/schemas";
import type { TxNoticeLogDto, TxNoticeSendDto } from "@shared/api/types";
import { expectedCents, paymentPosition } from "@shared/payments";
import { txUnpaidMonths } from "@shared/tx-notices";
import { and, asc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { projects, txNoticeSends } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { assertLienWaivers } from "../billing";
import { loadBundle, paymentsOf } from "./bundle";

type SendRow = typeof txNoticeSends.$inferSelect;
type ProjectKind = "commercial" | "residential";

async function loadProject(ctx: AppContext, orgId: string, projectId: string) {
  const p = await ctx.db
    .select({ txProjectKind: projects.txProjectKind, isSample: projects.isSample })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)))
    .get();
  if (!p) throw notFound("Project");
  return p;
}

function timing(r: SendRow, residential: boolean) {
  try {
    return txSendTiming({
      kind: r.kind,
      workMonth: r.workMonth,
      residential,
      method: r.method,
      sentOn: r.sentOn,
    });
  } catch (e) {
    throw badRequest(e instanceof Error ? e.message : "Bad date");
  }
}

export function txSendDto(r: SendRow, kind: ProjectKind | null): TxNoticeSendDto {
  const t = timing(r, kind === "residential");
  return {
    id: r.id,
    kind: r.kind,
    workMonth: r.workMonth,
    recipient: r.recipient,
    recipientNameAddress: r.recipientNameAddress,
    method: r.method,
    sentOn: r.sentOn,
    tracking: r.tracking,
    amountCents: r.amountCents,
    dueOn: t.due?.due ?? null,
    onTime: t.onTime,
    timing: t.text,
  };
}

/** Each pay app's balance, read the way the cash report reads it (src/shared/cash-report.ts). */
async function appBalances(ctx: AppContext, orgId: string, projectId: string) {
  const b = await loadBundle(ctx, orgId, projectId);
  const computed = new Map(b.computed.map((c) => [c.periodId, c]));
  return b.payApps.flatMap((a) => {
    const c = computed.get(a.id);
    if (!c) return [];
    const pos = paymentPosition(
      a.status,
      expectedCents(a.certifiedAmountCents, c.summary.currentPaymentDueCents),
      paymentsOf(b, a.id).map((p) => ({ amountCents: p.amountCents, receivedOn: p.receivedOn })),
      a.status === "paid" ? a.shortClosedCents : null,
    );
    return [
      {
        number: a.number,
        sent: a.status !== "draft",
        periodFrom: a.periodFrom,
        periodTo: a.periodTo,
        remainingCents: pos.remainingCents,
      },
    ];
  });
}

export async function txNoticeLog(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  recipientPrefill: TxNoticeLogDto["recipientPrefill"],
): Promise<TxNoticeLogDto> {
  const [p, rows] = await Promise.all([
    loadProject(ctx, orgId, projectId),
    ctx.db
      .select()
      .from(txNoticeSends)
      .where(and(eq(txNoticeSends.orgId, orgId), eq(txNoticeSends.projectId, projectId)))
      .orderBy(asc(txNoticeSends.sentOn), asc(txNoticeSends.createdAt))
      .all(),
  ]);
  const kind = p.txProjectKind ?? null;
  const unpaidMonths = kind
    ? txUnpaidMonths(await appBalances(ctx, orgId, projectId), rows, kind === "residential")
    : [];
  return {
    projectKind: kind,
    sends: rows.map((r) => txSendDto(r, kind)),
    unpaidMonths,
    methods: TX_DELIVERY_METHODS.map((id) => ({ id, label: TX_DELIVERY_METHOD_LABELS[id] })),
    recipients: TX_NOTICE_RECIPIENTS.map((id) => ({ id, label: TX_NOTICE_RECIPIENT_LABELS[id] })),
    recipientPrefill,
  };
}

/** Residential or not (§ 53.001(10)); null stops tracking the job's Texas notices. */
export async function setTxProjectKind(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  projectKind: ProjectKind | null,
) {
  await assertLienWaivers(ctx, orgId);
  const p = await loadProject(ctx, orgId, projectId);
  await ctx.db
    .update(projects)
    .set({ txProjectKind: projectKind })
    .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)));
  return { projectKind, changed: (p.txProjectKind ?? null) !== projectKind, isSample: p.isSample };
}

/** Record a Texas notice of claim as sent to one recipient. */
export async function recordTxNoticeSend(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  userId: string,
  input: TxNoticeSendBody,
): Promise<{ send: TxNoticeSendDto; isSample: boolean }> {
  await assertLienWaivers(ctx, orgId);
  const p = await loadProject(ctx, orgId, projectId);
  const row: SendRow = {
    id: crypto.randomUUID(),
    orgId,
    projectId,
    kind: input.kind,
    workMonth: input.kind === "retainage" ? null : (input.workMonth ?? null),
    recipient: input.recipient,
    recipientNameAddress: input.recipientNameAddress,
    method: input.method,
    sentOn: input.sentOn,
    tracking: input.tracking?.trim() || null,
    amountCents: input.amountCents ?? null,
    createdBy: userId,
    createdAt: ctx.now(),
  };
  const send = txSendDto(row, p.txProjectKind ?? null);
  await ctx.db.insert(txNoticeSends).values(row);
  return { send, isSample: p.isSample };
}

export async function deleteTxNoticeSend(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  sendId: string,
) {
  await assertLienWaivers(ctx, orgId);
  const p = await loadProject(ctx, orgId, projectId);
  const r = await ctx.db
    .select()
    .from(txNoticeSends)
    .where(
      and(
        eq(txNoticeSends.id, sendId),
        eq(txNoticeSends.orgId, orgId),
        eq(txNoticeSends.projectId, projectId),
      ),
    )
    .get();
  if (!r) throw notFound("Notice");
  await ctx.db
    .delete(txNoticeSends)
    .where(and(eq(txNoticeSends.id, sendId), eq(txNoticeSends.orgId, orgId)));
  return { send: r, isSample: p.isSample };
}
