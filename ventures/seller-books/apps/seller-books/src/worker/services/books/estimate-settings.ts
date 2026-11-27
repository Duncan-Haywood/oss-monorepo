// The seller's own figures for the quarterly estimated-tax page, saved per shop and tax year: filing
// status, wages, withholding, other income, last year's tax, the mileage rate and the estimated payments
// sent toward each due date. Dollars at the API, integer cents in D1. Every query filters by orgId.
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { estimateSettings } from "../../db/schema";

export type Filing = "single" | "mfj" | "hoh";

/** As the page and the API carry them: dollars, `paid` one per due date (April, June, September, January). */
export interface EstimateSettings {
  filing: Filing;
  wages: number;
  otherIncome: number;
  withholding: number;
  priorYearTax: number | null;
  priorAgiOver150k: boolean;
  mileageRate: number | null;
  paid: [number, number, number, number];
  updatedAt?: string;
}

const toCents = (d: number) => Math.round(d * 100);
const toDollars = (c: number) => c / 100;

export async function getEstimateSettings(
  ctx: AppContext,
  orgId: string,
  year: number,
): Promise<EstimateSettings | null> {
  const [row] = await ctx.db
    .select()
    .from(estimateSettings)
    .where(and(eq(estimateSettings.orgId, orgId), eq(estimateSettings.year, year)));
  if (!row) return null;
  return {
    filing: row.filing,
    wages: toDollars(row.wagesCents),
    otherIncome: toDollars(row.otherIncomeCents),
    withholding: toDollars(row.withholdingCents),
    priorYearTax: row.priorYearTaxCents == null ? null : toDollars(row.priorYearTaxCents),
    priorAgiOver150k: row.priorAgiOver150k,
    mileageRate: row.mileageRate,
    paid: [
      toDollars(row.paidQ1Cents),
      toDollars(row.paidQ2Cents),
      toDollars(row.paidQ3Cents),
      toDollars(row.paidQ4Cents),
    ],
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function putEstimateSettings(
  ctx: AppContext,
  orgId: string,
  year: number,
  s: EstimateSettings,
): Promise<void> {
  const values = {
    filing: s.filing,
    wagesCents: toCents(s.wages),
    otherIncomeCents: toCents(s.otherIncome),
    withholdingCents: toCents(s.withholding),
    priorYearTaxCents: s.priorYearTax == null ? null : toCents(s.priorYearTax),
    priorAgiOver150k: s.priorAgiOver150k,
    mileageRate: s.mileageRate,
    paidQ1Cents: toCents(s.paid[0]),
    paidQ2Cents: toCents(s.paid[1]),
    paidQ3Cents: toCents(s.paid[2]),
    paidQ4Cents: toCents(s.paid[3]),
  };
  await ctx.db
    .insert(estimateSettings)
    .values({ orgId, year, ...values })
    .onConflictDoUpdate({
      target: [estimateSettings.orgId, estimateSettings.year],
      set: { ...values, updatedAt: new Date() },
    });
}

/** Removes the year's figures; false when there were none. */
export async function deleteEstimateSettings(ctx: AppContext, orgId: string, year: number) {
  const res = await ctx.db
    .delete(estimateSettings)
    .where(and(eq(estimateSettings.orgId, orgId), eq(estimateSettings.year, year)))
    .returning({ year: estimateSettings.year });
  return res.length > 0;
}
