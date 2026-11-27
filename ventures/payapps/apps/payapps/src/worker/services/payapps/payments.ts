// Payments received against a pay application (src/shared/payments.ts holds the rules). A GC often
// pays an application in pieces or short; each check or transfer is recorded here, the cash report
// ages only what is still owed, and the application turns paid when the payments reach the amount
// expected. Deleting a payment from a paid application reopens it (certified if the GC certified it,
// else submitted), so a mistyped payment can always be undone.
import type { ShortCloseReason } from "@shared/enums";
import {
  expectedCents,
  ownerPaidManyProblem,
  ownerPaidProblem,
  paymentProblem,
  receivedCents,
  shortBalanceCents,
  shortCloseProblem,
  statusAfterPayments,
  unrecordedPaidCents,
  unrecordedPaymentProblem,
} from "@shared/payments";
import { and, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../../context";
import { payAppPayments, payApps, qboCreditMemoSyncs, qboPaymentSyncs } from "../../db/schema";
import { AppError, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { findPayApp, loadBundle, paymentsOf } from "./bundle";
import { isoDay } from "./cash";

export interface RecordPaymentInput {
  amountCents: number;
  receivedOn: string;
  reference?: string | null;
}

export async function recordPayment(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  input: RecordPaymentInput,
  userId: string,
): Promise<string> {
  const b = await loadBundle(ctx, orgId, projectId);
  const { app, computed } = findPayApp(b, payAppId);
  const expected = expectedCents(app.certifiedAmountCents, computed.summary.currentPaymentDueCents);
  const existing = paymentsOf(b, app.id);
  const payment = { amountCents: input.amountCents, receivedOn: input.receivedOn };
  const problem = paymentProblem(app.status, expected, existing, payment, isoDay(ctx.now()));
  if (problem) throw conflict(problem);

  const id = newId("pmt");
  const insert = ctx.db.insert(payAppPayments).values({
    id,
    orgId,
    payAppId: app.id,
    amountCents: input.amountCents,
    receivedOn: input.receivedOn,
    reference: input.reference?.trim() || null,
    createdBy: userId,
  });
  const next = statusAfterPayments(app.status, expected, [...existing, payment]);
  if (next === app.status) {
    await insert;
    return id;
  }
  await ctx.db.batch([
    insert,
    ctx.db
      .update(payApps)
      .set({ status: next, paidAt: ctx.now() })
      .where(and(eq(payApps.id, app.id), eq(payApps.orgId, orgId))),
  ]);
  return id;
}

/**
 * Records, as one payment, the money an application marked paid in full counts as received with no
 * payment behind it (the date and check were never entered). The application stays paid; the new
 * row can then go to QuickBooks like any other payment. Returns the amount recorded and its id.
 */
export async function recordUnrecordedPayment(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  input: { receivedOn: string; reference?: string | null },
  userId: string,
): Promise<{ amountCents: number; paymentId: string }> {
  const b = await loadBundle(ctx, orgId, projectId);
  const { app, computed } = findPayApp(b, payAppId);
  const expected = expectedCents(app.certifiedAmountCents, computed.summary.currentPaymentDueCents);
  const amount = unrecordedPaidCents(
    app.status,
    expected,
    paymentsOf(b, app.id),
    app.shortClosedCents,
  );
  const problem = unrecordedPaymentProblem(app.status, amount, input.receivedOn, isoDay(ctx.now()));
  if (problem) throw conflict(problem);
  const paymentId = newId("pmt");
  await ctx.db.insert(payAppPayments).values({
    id: paymentId,
    orgId,
    payAppId: app.id,
    amountCents: amount,
    receivedOn: input.receivedOn,
    reference: input.reference?.trim() || null,
    createdBy: userId,
  });
  return { amountCents: amount, paymentId };
}

export async function deletePayment(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  paymentId: string | undefined,
  opts: { confirmQuickBooks?: boolean } = {},
) {
  const b = await loadBundle(ctx, orgId, projectId);
  const { app } = findPayApp(b, payAppId);
  const row = paymentsOf(b, app.id).find((p) => p.id === paymentId);
  if (!row) throw notFound("Payment");
  // A payment already in QuickBooks stays there: deleting it here alone would leave the books
  // and PayApps disagreeing, so the editor confirms they will delete it in QuickBooks too.
  if (!opts.confirmQuickBooks) {
    const inQbo = await ctx.db
      .select({ id: qboPaymentSyncs.paymentId })
      .from(qboPaymentSyncs)
      .where(and(eq(qboPaymentSyncs.orgId, orgId), eq(qboPaymentSyncs.paymentId, row.id)))
      .get();
    if (inQbo) {
      throw new AppError(
        409,
        "payment_in_quickbooks",
        "This payment is in QuickBooks. Deleting it here does not delete it there: delete it in QuickBooks too, then confirm.",
      );
    }
  }
  const remove = ctx.db
    .delete(payAppPayments)
    .where(and(eq(payAppPayments.id, row.id), eq(payAppPayments.orgId, orgId)));
  if (app.status !== "paid") {
    await remove;
    return;
  }
  // Reopening a balance closed short that is a credit memo in QuickBooks: same question.
  if (app.shortClosedCents !== null && !opts.confirmQuickBooks) {
    await assertNoCreditInQuickBooks(ctx, orgId, app.id);
  }
  await ctx.db.batch([
    remove,
    forgetCredit(ctx, orgId, app.id),
    ctx.db
      .update(payApps)
      .set({ status: app.certifiedAt ? "certified" : "submitted", paidAt: null, ...NO_SHORT })
      .where(and(eq(payApps.id, app.id), eq(payApps.orgId, orgId))),
  ]);
}

const NO_SHORT = {
  shortClosedCents: null,
  shortReason: null,
  shortNote: null,
  shortClosedOn: null,
} as const;

export interface CloseShortInput {
  reason: ShortCloseReason;
  closedOn: string;
  note?: string | null;
}

/**
 * Close the unpaid balance of an application paid short: the GC backcharged it, it is in dispute,
 * or it is written off. The balance at this moment is recorded and the application turns paid, so
 * the cash report stops aging it and counts it under its reason instead.
 */
export async function closeShort(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  input: CloseShortInput,
) {
  const b = await loadBundle(ctx, orgId, projectId);
  const { app, computed } = findPayApp(b, payAppId);
  const expected = expectedCents(app.certifiedAmountCents, computed.summary.currentPaymentDueCents);
  const payments = paymentsOf(b, app.id);
  const problem = shortCloseProblem(app, expected, payments, input, isoDay(ctx.now()));
  if (problem) throw conflict(problem);
  await ctx.db
    .update(payApps)
    .set({
      status: "paid",
      paidAt: ctx.now(),
      shortClosedCents: shortBalanceCents(expected, payments),
      shortReason: input.reason,
      shortNote: input.note?.trim() || null,
      shortClosedOn: input.closedOn,
    })
    .where(and(eq(payApps.id, app.id), eq(payApps.orgId, orgId), eq(payApps.status, app.status)));
}

/**
 * Pay-when-paid: record (or clear, with null) the day the owner paid the GC for this application.
 * The cash report then counts the job's pay terms from it (src/shared/cash-report.ts, payDueOn).
 */
export async function setOwnerPaid(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  ownerPaidOn: string | null,
) {
  const b = await loadBundle(ctx, orgId, projectId);
  const { app } = findPayApp(b, payAppId);
  const problem = ownerPaidProblem(app, b.project.payTermsBasis, ownerPaidOn, isoDay(ctx.now()));
  if (problem) throw conflict(problem);
  await ctx.db
    .update(payApps)
    .set({ ownerPaidOn })
    .where(and(eq(payApps.id, app.id), eq(payApps.orgId, orgId)));
}

/**
 * Pay-when-paid: record one owner's payment date on several sent applications of the job at once (a
 * GC reporting that one owner payment covered more than one period). All or nothing: every id must
 * be an application of this job and pass the single-application rule. Returns the applications
 * whose date actually changed, with the date each had before, for the history.
 */
export async function setOwnerPaidMany(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppIds: readonly string[],
  ownerPaidOn: string,
) {
  const b = await loadBundle(ctx, orgId, projectId);
  const apps = payAppIds.map((id) => findPayApp(b, id).app);
  const problem = ownerPaidManyProblem(
    apps,
    b.project.payTermsBasis,
    ownerPaidOn,
    isoDay(ctx.now()),
  );
  if (problem) throw conflict(problem);
  const changed = apps.filter((a) => a.ownerPaidOn !== ownerPaidOn);
  if (changed.length > 0) {
    await ctx.db
      .update(payApps)
      .set({ ownerPaidOn })
      .where(
        and(
          eq(payApps.orgId, orgId),
          eq(payApps.projectId, projectId),
          inArray(
            payApps.id,
            changed.map((a) => a.id),
          ),
        ),
      );
  }
  return changed.map((a) => ({
    id: a.id,
    number: a.number,
    status: a.status,
    before: a.ownerPaidOn,
  }));
}

/** Undo a short close: the balance is owed again (certified if the GC certified it, else submitted). */
export async function reopenShort(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  opts: { confirmQuickBooks?: boolean } = {},
) {
  const b = await loadBundle(ctx, orgId, projectId);
  const { app } = findPayApp(b, payAppId);
  if (app.status !== "paid" || app.shortClosedCents === null)
    throw conflict("This application has no balance closed short");
  if (!opts.confirmQuickBooks) await assertNoCreditInQuickBooks(ctx, orgId, app.id);
  await ctx.db.batch([
    ctx.db
      .update(payApps)
      .set({ status: app.certifiedAt ? "certified" : "submitted", paidAt: null, ...NO_SHORT })
      .where(and(eq(payApps.id, app.id), eq(payApps.orgId, orgId))),
    forgetCredit(ctx, orgId, app.id),
  ]);
}

/**
 * A balance closed short that was sent to QuickBooks as a credit memo stays there: reopening it here
 * alone would leave the books and PayApps disagreeing, so the editor confirms they will delete or
 * void the credit memo in QuickBooks too.
 */
async function assertNoCreditInQuickBooks(ctx: AppContext, orgId: string, payAppId: string) {
  const row = await ctx.db
    .select({ docNumber: qboCreditMemoSyncs.docNumber })
    .from(qboCreditMemoSyncs)
    .where(and(eq(qboCreditMemoSyncs.orgId, orgId), eq(qboCreditMemoSyncs.payAppId, payAppId)))
    .get();
  if (row) {
    throw new AppError(
      409,
      "credit_in_quickbooks",
      `The balance closed short is in QuickBooks as a credit${row.docNumber ? ` (credit memo ${row.docNumber})` : ""}. Reopening it here does not remove it there: delete or void it in QuickBooks too, then confirm.`,
    );
  }
}

const forgetCredit = (ctx: AppContext, orgId: string, payAppId: string) =>
  ctx.db
    .delete(qboCreditMemoSyncs)
    .where(and(eq(qboCreditMemoSyncs.orgId, orgId), eq(qboCreditMemoSyncs.payAppId, payAppId)));

/** A certified amount below the money already received would leave a negative balance. */
export function assertCertifiable(
  b: Parameters<typeof paymentsOf>[0],
  payAppId: string,
  certifiedAmountCents: number,
) {
  const received = receivedCents(paymentsOf(b, payAppId));
  if (certifiedAmountCents < received) {
    throw conflict(
      "The certified amount is less than the payments already recorded; delete the payment that is wrong first",
    );
  }
}
