// The company's holidays: the weekdays its crews do not work, left out of every job schedule's
// workday math and the crew lookahead (HolidayCalendar in @shared/schedule). Listed, added (typed,
// or the federal list the contractor then edits) and deleted; every query filters by org_id.
import type { AddHolidaysBody } from "@shared/api/schemas";
import type { CompanyHolidaysDto } from "@shared/api/types";
import { type HolidayCalendar, holidayCalendar, MAX_COMPANY_HOLIDAYS } from "@shared/schedule";
import { and, asc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { companyHolidays } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";

export async function listHolidays(ctx: AppContext, orgId: string): Promise<CompanyHolidaysDto> {
  const holidays = await ctx.db
    .select({ id: companyHolidays.id, on: companyHolidays.on, name: companyHolidays.name })
    .from(companyHolidays)
    .where(eq(companyHolidays.orgId, orgId))
    .orderBy(asc(companyHolidays.on))
    .all();
  return { holidays, max: MAX_COMPANY_HOLIDAYS };
}

/** The company's holidays as the workday math reads them. */
export async function loadHolidayCalendar(
  ctx: AppContext,
  orgId: string,
): Promise<HolidayCalendar> {
  return holidayCalendar((await listHolidays(ctx, orgId)).holidays);
}

/**
 * Adds holidays. A date already listed keeps the name it has (adding the federal list twice changes
 * nothing), and a date twice in one request is added once. Refused as a whole past the cap.
 */
export async function addHolidays(
  ctx: AppContext,
  orgId: string,
  input: AddHolidaysBody,
): Promise<CompanyHolidaysDto> {
  const existing = await listHolidays(ctx, orgId);
  const taken = new Set(existing.holidays.map((h) => h.on));
  const fresh = new Map<string, string>();
  for (const h of input.holidays) if (!taken.has(h.on) && !fresh.has(h.on)) fresh.set(h.on, h.name);
  if (existing.holidays.length + fresh.size > MAX_COMPANY_HOLIDAYS) {
    throw badRequest(
      `A company lists up to ${MAX_COMPANY_HOLIDAYS} holidays; delete past years' first`,
    );
  }
  if (fresh.size > 0) {
    await ctx.db
      .insert(companyHolidays)
      .values([...fresh].map(([on, name]) => ({ id: newId("hol"), orgId, on, name })))
      // Two editors adding the same day at once: the second keeps the first's row.
      .onConflictDoNothing();
  }
  return listHolidays(ctx, orgId);
}

export async function deleteHoliday(ctx: AppContext, orgId: string, holidayId: string) {
  const row = await ctx.db
    .select({ id: companyHolidays.id })
    .from(companyHolidays)
    .where(and(eq(companyHolidays.id, holidayId), eq(companyHolidays.orgId, orgId)))
    .get();
  if (!row) throw notFound("Holiday");
  await ctx.db
    .delete(companyHolidays)
    .where(and(eq(companyHolidays.id, holidayId), eq(companyHolidays.orgId, orgId)));
}
