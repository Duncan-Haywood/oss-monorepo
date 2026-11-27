// The crew lookahead: every active job's open schedule activities in the window, grouped by the
// trade or crew typed on them (who is where next week), with the workdays a crew has work on two
// jobs, the company's holidays left out of the day columns. Read-only across the company's jobs; every query filters by org_id on both tables. The
// grouping and the overlap days are pure in @shared/schedule (crewLookahead).
import type { CrewLookaheadDto } from "@shared/api/types";
import {
  type CrewLookaheadInput,
  crewLookahead,
  lookaheadWindow,
  MAX_CREW_LOOKAHEAD_ROWS,
} from "@shared/schedule";
import { and, asc, eq, lt, lte } from "drizzle-orm";
import type { AppContext } from "../../context";
import { organization, projects, scheduleActivities } from "../../db/schema";
import { notFound } from "../../lib/errors";
import { loadHolidayCalendar } from "./holidays";

const today = (ctx: AppContext) => ctx.now().toISOString().slice(0, 10);

export async function getCrewLookahead(
  ctx: AppContext,
  orgId: string,
  weeks = 2,
): Promise<CrewLookaheadDto> {
  const day = today(ctx);
  const window = lookaheadWindow(day, weeks, await loadHolidayCalendar(ctx, orgId));
  // Open activities that start by the window's end: late ones from before it stay on the plate.
  const rows: CrewLookaheadInput[] = await ctx.db
    .select({
      projectId: scheduleActivities.projectId,
      projectName: projects.name,
      projectNumber: projects.number,
      isSample: projects.isSample,
      number: scheduleActivities.number,
      name: scheduleActivities.name,
      trade: scheduleActivities.trade,
      startOn: scheduleActivities.startOn,
      finishOn: scheduleActivities.finishOn,
      percentComplete: scheduleActivities.percentComplete,
    })
    .from(scheduleActivities)
    .innerJoin(projects, eq(projects.id, scheduleActivities.projectId))
    .where(
      and(
        eq(scheduleActivities.orgId, orgId),
        eq(projects.orgId, orgId),
        eq(projects.status, "active"),
        lt(scheduleActivities.percentComplete, 100),
        lte(scheduleActivities.startOn, window.to),
      ),
    )
    .orderBy(asc(scheduleActivities.startOn), asc(scheduleActivities.number))
    .limit(MAX_CREW_LOOKAHEAD_ROWS + 1)
    .all();
  const truncated = rows.length > MAX_CREW_LOOKAHEAD_ROWS;
  const list = truncated ? rows.slice(0, MAX_CREW_LOOKAHEAD_ROWS) : rows;
  const groups = crewLookahead(list, window, day);
  const jobs = new Set(groups.flatMap((g) => g.activities.map((a) => a.projectId)));
  return { groups, lookahead: window, jobCount: jobs.size, truncated, today: day };
}

export interface CrewLookaheadDocument {
  contractor: { name: string };
  lookahead: CrewLookaheadDto;
}

export async function loadCrewLookaheadDocument(
  ctx: AppContext,
  orgId: string,
  weeks = 2,
): Promise<CrewLookaheadDocument> {
  const [lookahead, org] = await Promise.all([
    getCrewLookahead(ctx, orgId, weeks),
    ctx.db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, orgId))
      .get(),
  ]);
  if (!org) throw notFound("Organization");
  return { contractor: { name: org.name }, lookahead };
}
