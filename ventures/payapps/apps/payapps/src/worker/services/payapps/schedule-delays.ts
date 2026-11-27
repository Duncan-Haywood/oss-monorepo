// The job's delay log: the daily reports' lost hours grouped by the schedule activity each delay held
// up (rules in @shared/schedule-delays). Read on screen, printed as a PDF, and attached to a change
// order as the backup for a time extension. Every query filters by org_id and the job.
import type { DelayBackupBody, DelayLogQuery } from "@shared/api/schemas";
import type { DelayLogDto } from "@shared/api/types";
import { ROLE_RANK } from "@shared/enums";
import { activityDelayLabel, type DelayLog, delayLog } from "@shared/schedule-delays";
import { and, asc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { changeOrders, dailyReports, organization, scheduleActivities } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import type { Tenant } from "../../types";
import { getProjectRow, type ProjectRow } from "./bundle";

type Filter = Pick<DelayLogQuery, "activityId" | "from" | "to">;

async function load(ctx: AppContext, orgId: string, projectId: string, f: Filter) {
  if (f.from && f.to && f.from > f.to) throw badRequest("The range starts after it ends");
  const [project, activities, reports] = await Promise.all([
    getProjectRow(ctx, orgId, projectId),
    ctx.db
      .select({
        id: scheduleActivities.id,
        number: scheduleActivities.number,
        name: scheduleActivities.name,
        startOn: scheduleActivities.startOn,
        finishOn: scheduleActivities.finishOn,
      })
      .from(scheduleActivities)
      .where(and(eq(scheduleActivities.orgId, orgId), eq(scheduleActivities.projectId, projectId)))
      .orderBy(asc(scheduleActivities.number))
      .all(),
    ctx.db
      .select({
        id: dailyReports.id,
        reportDate: dailyReports.reportDate,
        delayHours: dailyReports.delayHours,
        delays: dailyReports.delays,
        weather: dailyReports.weather,
        delayActivityId: dailyReports.delayActivityId,
      })
      .from(dailyReports)
      .where(and(eq(dailyReports.orgId, orgId), eq(dailyReports.projectId, projectId)))
      .all(),
  ]);
  if (f.activityId && !activities.some((a) => a.id === f.activityId)) {
    throw notFound("Schedule activity");
  }
  const log = delayLog(reports, activities, {
    activityId: f.activityId ?? null,
    from: f.from ?? null,
    to: f.to ?? null,
  });
  return {
    project,
    log,
    activities: activities.map((a) => ({ id: a.id, label: activityDelayLabel(a) })),
  };
}

export async function getDelayLog(
  ctx: AppContext,
  tenant: Tenant,
  projectId: string,
  f: Filter,
): Promise<DelayLogDto> {
  const { project, log, activities } = await load(ctx, tenant.orgId, projectId, f);
  return {
    ...log,
    projectName: project.name,
    activities,
    canEdit: ROLE_RANK[tenant.role] >= ROLE_RANK.editor,
  };
}

export interface DelayLogDocument {
  contractor: { name: string };
  project: Pick<ProjectRow, "name" | "number" | "location" | "gcName" | "ownerName" | "isSample">;
  log: DelayLog;
  /** The change order the log is backup for, when attached to one. */
  changeOrder: { number: string; description: string; scheduleDays: number | null } | null;
  /** ISO date the log was printed. */
  printedOn: string;
}

/** What the delay-log PDF prints; `changeOrderId` names the change order it backs up. */
export async function loadDelayLogDocument(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  f: Filter | DelayBackupBody,
  changeOrderId?: string,
): Promise<DelayLogDocument> {
  const filter: Filter = {
    activityId: f.activityId ?? undefined,
    from: f.from ?? undefined,
    to: f.to ?? undefined,
  };
  const [{ project, log }, org, co] = await Promise.all([
    load(ctx, orgId, projectId, filter),
    ctx.db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, orgId))
      .get(),
    changeOrderId
      ? ctx.db
          .select({
            number: changeOrders.number,
            description: changeOrders.description,
            scheduleDays: changeOrders.scheduleDays,
          })
          .from(changeOrders)
          .where(
            and(
              eq(changeOrders.id, changeOrderId),
              eq(changeOrders.orgId, orgId),
              eq(changeOrders.projectId, projectId),
            ),
          )
          .get()
      : Promise.resolve(null),
  ]);
  if (!org) throw notFound("Organization");
  if (changeOrderId && !co) throw notFound("Change order");
  return {
    contractor: { name: org.name },
    project,
    log,
    changeOrder: co ?? null,
    printedOn: ctx.now().toISOString().slice(0, 10),
  };
}
