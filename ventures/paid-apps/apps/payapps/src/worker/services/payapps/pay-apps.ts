// Pay applications (one per billing period). Applications are numbered 1..n per project; only the
// latest may be a draft, and only drafts can change. Submitting freezes the application: its inputs,
// the change orders dated into it and the original SOV can no longer change.
import type {
  createPayAppSchema,
  PayAppLinesInput,
  RetainageReleaseInput,
  updatePayAppSchema,
} from "@shared/api/schemas";
import type { RetainageReleaseDto } from "@shared/api/types";
import { expectedCents, receivedCents, statusAfterPayments } from "@shared/payments";
import { planRetainageRelease } from "@shared/retainage-release";
import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import type { AppContext } from "../../context";
import { payAppLines, payApps } from "../../db/schema";
import { AppError, badRequest, conflict } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { assertWithinJobLimit } from "../billing";
import {
  findPayApp,
  loadBundle,
  openingOf,
  type ProjectBundle,
  payAppDetailDto,
  paymentsOf,
} from "./bundle";
import { assertCertifiable, recordPayment } from "./payments";

function checkPeriod(from: string, to: string, applicationDate: string) {
  if (from > to) throw badRequest("Period start must be on or before period end");
  if (applicationDate < from)
    throw badRequest("Application date cannot be before the period starts");
}

export async function createPayApp(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  input: z.infer<typeof createPayAppSchema>,
) {
  const b = await loadBundle(ctx, orgId, projectId);
  const last = b.payApps.at(-1);
  if (last?.status === "draft") {
    throw conflict(`Pay application #${last.number} is still a draft; submit or delete it first`);
  }
  if (b.sov.length === 0) throw badRequest("Add a schedule of values before billing");
  await assertWithinJobLimit(ctx, orgId);
  checkPeriod(input.periodFrom, input.periodTo, input.applicationDate);
  if (last && input.periodFrom <= last.periodTo) {
    throw badRequest(
      `Period must start after ${last.periodTo}, the end of the previous application`,
    );
  }
  const opening = openingOf(b.project);
  if (!last && opening && input.periodFrom <= opening.periodTo) {
    throw badRequest(
      `Period must start after ${opening.periodTo}, the end of application #${opening.appNumber}`,
    );
  }
  const id = newId("pay");
  await ctx.db.insert(payApps).values({
    id,
    orgId,
    projectId,
    // A mid-job start continues the numbering of the applications made elsewhere.
    number: (last?.number ?? opening?.appNumber ?? 0) + 1,
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
    applicationDate: input.applicationDate,
    // A new application inherits the previous rate (e.g. after a reduction to 5%), else the project's.
    retainagePctBps: input.retainagePctBps ?? last?.retainagePctBps ?? b.project.retainagePctBps,
    storedRetainagePctBps:
      input.storedRetainagePctBps ?? last?.storedRetainagePctBps ?? b.project.storedRetainagePctBps,
  });
  return id;
}

function requireDraft(b: ProjectBundle, payAppId: string) {
  const found = findPayApp(b, payAppId);
  if (found.app.status !== "draft") {
    throw conflict(
      `Pay application #${found.app.number} is ${found.app.status} and can no longer change`,
    );
  }
  return found;
}

export async function updatePayApp(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  patch: z.infer<typeof updatePayAppSchema>,
) {
  const b = await loadBundle(ctx, orgId, projectId);
  const { app, index } = requireDraft(b, payAppId);
  const next = { ...app, ...patch };
  checkPeriod(next.periodFrom, next.periodTo, next.applicationDate);
  const prev = b.payApps[index - 1];
  if (prev && next.periodFrom <= prev.periodTo) {
    throw badRequest(
      `Period must start after ${prev.periodTo}, the end of the previous application`,
    );
  }
  const opening = openingOf(b.project);
  if (!prev && opening && next.periodFrom <= opening.periodTo) {
    throw badRequest(
      `Period must start after ${opening.periodTo}, the end of application #${opening.appNumber}`,
    );
  }
  await ctx.db
    .update(payApps)
    .set(patch)
    .where(and(eq(payApps.id, payAppId), eq(payApps.orgId, orgId)));
}

/** Replaces the entries of a draft (lines not listed are cleared). */
export async function setPayAppLines(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  input: PayAppLinesInput,
) {
  const b = await loadBundle(ctx, orgId, projectId);
  requireDraft(b, payAppId);
  const known = new Set(b.sov.map((l) => l.id));
  const seen = new Set<string>();
  for (const l of input.lines) {
    if (!known.has(l.sovLineId)) throw badRequest("Unknown schedule of values line");
    if (seen.has(l.sovLineId)) throw badRequest("Each line may appear once");
    seen.add(l.sovLineId);
  }
  const rows = input.lines
    .filter((l) => l.workThisPeriodCents || l.storedMaterialsCents || l.retainageReleasedCents)
    .map((l) => ({ id: newId("pal"), orgId, payAppId, ...l }));
  await ctx.db.batch([
    ctx.db
      .delete(payAppLines)
      .where(and(eq(payAppLines.payAppId, payAppId), eq(payAppLines.orgId, orgId))),
    ...(rows.length ? [ctx.db.insert(payAppLines).values(rows)] : []),
  ]);
}

/**
 * Plans a retainage release on a draft from its last saved entries (`src/shared/retainage-release.ts`)
 * and, with `apply`, writes the planned amounts as each line's "retainage released this period",
 * replacing what those lines released before. Other lines and every other entry are kept.
 */
export async function releaseRetainage(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  input: RetainageReleaseInput,
): Promise<Omit<RetainageReleaseDto, "detail">> {
  const b = await loadBundle(ctx, orgId, projectId);
  const { app, computed } = requireDraft(b, payAppId);
  const plan = planRetainageRelease(
    computed.lines,
    input.scope === "selected"
      ? { kind: "selected", sovLineIds: input.sovLineIds ?? [] }
      : { kind: input.scope },
    input.percentBps !== undefined
      ? { kind: "percent", bps: input.percentBps }
      : { kind: "amount", cents: input.amountCents ?? 0 },
  );
  if (!input.apply) return { plan, applied: false };
  if (plan.issues.length) {
    throw new AppError(422, "release_not_possible", plan.issues[0]?.message ?? "", plan.issues);
  }
  const entries = new Map(
    b.lines
      .filter((l) => l.payAppId === app.id)
      .map((l) => [
        l.sovLineId,
        {
          sovLineId: l.sovLineId,
          workThisPeriodCents: l.workThisPeriodCents,
          storedMaterialsCents: l.storedMaterialsCents,
          retainageReleasedCents: l.retainageReleasedCents,
        },
      ]),
  );
  for (const l of plan.lines) {
    const e = entries.get(l.sovLineId) ?? {
      sovLineId: l.sovLineId,
      workThisPeriodCents: 0,
      storedMaterialsCents: 0,
      retainageReleasedCents: 0,
    };
    entries.set(l.sovLineId, { ...e, retainageReleasedCents: l.releaseCents });
  }
  await setPayAppLines(ctx, orgId, projectId, payAppId, { lines: [...entries.values()] });
  return { plan, applied: true };
}

export async function submitPayApp(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
) {
  const b = await loadBundle(ctx, orgId, projectId);
  requireDraft(b, payAppId);
  const detail = payAppDetailDto(b, payAppId);
  if (detail.blockers.length) {
    throw new AppError(
      422,
      "pay_app_has_errors",
      "Fix the listed problems before submitting",
      detail.blockers,
    );
  }
  await ctx.db
    .update(payApps)
    .set({ status: "submitted", submittedAt: ctx.now() })
    .where(and(eq(payApps.id, payAppId), eq(payApps.orgId, orgId)));
}

export async function certifyPayApp(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  certifiedAmountCents: number | undefined,
) {
  const b = await loadBundle(ctx, orgId, projectId);
  const { app, computed } = findPayApp(b, payAppId);
  if (app.status !== "submitted")
    throw conflict("Only a submitted pay application can be certified");
  const amount = certifiedAmountCents ?? computed.summary.currentPaymentDueCents;
  assertCertifiable(b, app.id, amount);
  // Payments recorded before the certificate came in may already cover it.
  const status = statusAfterPayments("certified", amount, paymentsOf(b, app.id));
  await ctx.db
    .update(payApps)
    .set({
      status,
      certifiedAt: ctx.now(),
      certifiedAmountCents: amount,
      ...(status === "paid" ? { paidAt: ctx.now() } : {}),
    })
    .where(and(eq(payApps.id, payAppId), eq(payApps.orgId, orgId)));
}

/**
 * Marks a sent application paid in full. Given the date the money came in (and optionally the check
 * number), the balance still owed is recorded as one payment, which turns the application paid by
 * the same rule as any payment; it then reaches QuickBooks and the cash report like any other.
 * Returns the payment recorded (null when only the status changed).
 */
export async function markPayAppPaid(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  userId: string,
  received: { receivedOn?: string; reference?: string | null } = {},
): Promise<{
  amountCents: number;
  receivedOn: string;
  reference: string | null;
  paymentId: string;
} | null> {
  const b = await loadBundle(ctx, orgId, projectId);
  const { app, computed } = findPayApp(b, payAppId);
  if (app.status !== "submitted" && app.status !== "certified") {
    throw conflict("Only a submitted or certified pay application can be marked paid");
  }
  if (received.receivedOn) {
    const expected = expectedCents(
      app.certifiedAmountCents,
      computed.summary.currentPaymentDueCents,
    );
    const balance = expected - receivedCents(paymentsOf(b, app.id));
    if (balance > 0) {
      const reference = received.reference?.trim() || null;
      const paymentId = await recordPayment(
        ctx,
        orgId,
        projectId,
        payAppId,
        { amountCents: balance, receivedOn: received.receivedOn, reference },
        userId,
      );
      return { amountCents: balance, receivedOn: received.receivedOn, reference, paymentId };
    }
  }
  await ctx.db
    .update(payApps)
    .set({ status: "paid", paidAt: ctx.now() })
    .where(and(eq(payApps.id, payAppId), eq(payApps.orgId, orgId)));
  return null;
}

export async function deletePayApp(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
) {
  const b = await loadBundle(ctx, orgId, projectId);
  requireDraft(b, payAppId);
  await ctx.db.delete(payApps).where(and(eq(payApps.id, payAppId), eq(payApps.orgId, orgId)));
}
