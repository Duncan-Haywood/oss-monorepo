// Interest earned on applications paid late (src/shared/cash-report.ts, paidLateApps), marked
// billed to the GC or waived so the cash page's list can be cleared before its year is up. The mark
// keeps the interest figure of the day it was made; deleting a payment (the application reopens)
// clears it (services/payapps/payments.ts).

import { projectCash } from "@shared/cash-report";
import type { InterestSettlement } from "@shared/enums";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { payApps } from "../../db/schema";
import { conflict } from "../../lib/errors";
import { findPayApp, loadBundle } from "./bundle";
import { isoDay, toCashInput } from "./cash";

export type InterestSettlementInput =
  | { settlement: InterestSettlement; on: string; note?: string | null }
  | { settlement: null };

/** What was marked (or cleared), for the history: the interest figure and the day. */
export interface InterestSettlementChange {
  number: number;
  cents: number;
  on: string | null;
  before: InterestSettlement | null;
}

/**
 * Mark the interest a late payment earned as billed or waived (or clear the mark). Refused unless the
 * application is on the job's paid-late list today: paid in full after its due date, within the
 * cash report's window, on a job with a late-payment rate. The day may not be in the future or
 * before the payment that ended the accrual.
 */
export async function setInterestSettlement(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  input: InterestSettlementInput,
): Promise<InterestSettlementChange> {
  const b = await loadBundle(ctx, orgId, projectId);
  const { app } = findPayApp(b, payAppId);
  const today = isoDay(ctx.now());
  const cash = projectCash(toCashInput(b), today);
  if (input.settlement === null) {
    if (app.interestSettlement === null)
      throw conflict("This application's interest is not marked");
    await ctx.db
      .update(payApps)
      .set({
        interestSettlement: null,
        interestSettledOn: null,
        interestSettledCents: null,
        interestSettledNote: null,
      })
      .where(and(eq(payApps.id, app.id), eq(payApps.orgId, orgId)));
    return {
      number: app.number,
      cents: app.interestSettledCents ?? 0,
      on: app.interestSettledOn,
      before: app.interestSettlement,
    };
  }
  const late = [...cash.paidLate, ...cash.paidLateSettled].find((a) => a.payAppId === app.id);
  if (!late)
    throw conflict(
      "Only an application paid in full after its due date, on a job with a late-payment rate, has interest to mark",
    );
  if (input.on > today) throw conflict("The date can't be in the future");
  if (input.on < late.paidOn)
    throw conflict(`The date can't be before the last payment came in (${late.paidOn})`);
  await ctx.db
    .update(payApps)
    .set({
      interestSettlement: input.settlement,
      interestSettledOn: input.on,
      interestSettledCents: late.interestCents,
      interestSettledNote: input.note?.trim() || null,
    })
    .where(and(eq(payApps.id, app.id), eq(payApps.orgId, orgId)));
  return {
    number: app.number,
    cents: late.interestCents,
    on: input.on,
    before: app.interestSettlement,
  };
}
