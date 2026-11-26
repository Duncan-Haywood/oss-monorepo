// GET /submissions/dashboard — org-level pipeline numbers for the home screen.
import type { ApplicationStatus } from "@shared/enums";
import { and, desc, eq, gte, notInArray, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import { applications, auditLog, opportunities } from "../../db/schema";
import { TERMINAL_STATUSES } from "./index";

const DAY = 86_400_000;

export interface DashboardData {
  counts: { byStatus: Partial<Record<ApplicationStatus, number>> };
  upcomingDeadlines: {
    applicationId: string;
    title: string;
    status: ApplicationStatus;
    deadline: string;
    daysLeft: number;
    opportunityId: string;
    funderName: string;
  }[];
  pendingReviews: number;
  awardedCents: number;
  submittedThisMonth: number;
  recentActivity: {
    id: string;
    action: string;
    actorType: string;
    createdAt: string;
    targetType: string | null;
    targetId: string | null;
  }[];
}

export async function getDashboard(ctx: AppContext, orgId: string): Promise<DashboardData> {
  const now = ctx.now();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const horizon = now.getTime() + 30 * DAY;

  const [statusRows, awarded, submittedRow, openApps, activity] = await Promise.all([
    ctx.db
      .select({ status: applications.status, n: sql<number>`count(*)` })
      .from(applications)
      .where(eq(applications.orgId, orgId))
      .groupBy(applications.status)
      .all(),
    ctx.db
      .select({ total: sql<number | null>`sum(${applications.awardedAmountCents})` })
      .from(applications)
      .where(and(eq(applications.orgId, orgId), eq(applications.status, "awarded")))
      .get(),
    ctx.db
      .select({ n: sql<number>`count(*)` })
      .from(applications)
      .where(and(eq(applications.orgId, orgId), gte(applications.submittedAt, monthStart)))
      .get(),
    ctx.db
      .select({
        id: applications.id,
        title: applications.title,
        status: applications.status,
        deadline: applications.deadline,
        closeDate: opportunities.closeDate,
        opportunityId: opportunities.id,
        funderName: opportunities.funderName,
      })
      .from(applications)
      .innerJoin(opportunities, eq(opportunities.id, applications.opportunityId))
      .where(
        and(
          eq(applications.orgId, orgId),
          notInArray(applications.status, [...TERMINAL_STATUSES, "failed"]),
        ),
      )
      .all(),
    ctx.db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        actorType: auditLog.actorType,
        createdAt: auditLog.createdAt,
        targetType: auditLog.targetType,
        targetId: auditLog.targetId,
      })
      .from(auditLog)
      .where(eq(auditLog.orgId, orgId))
      .orderBy(desc(auditLog.createdAt))
      .limit(10)
      .all(),
  ]);

  const byStatus: Partial<Record<ApplicationStatus, number>> = {};
  for (const r of statusRows) byStatus[r.status] = Number(r.n);

  const upcomingDeadlines = openApps
    .map((a) => ({ a, deadline: a.deadline ?? a.closeDate }))
    .filter(
      (x): x is { a: (typeof openApps)[number]; deadline: Date } =>
        !!x.deadline && x.deadline.getTime() >= now.getTime() && x.deadline.getTime() <= horizon,
    )
    .sort((x, y) => x.deadline.getTime() - y.deadline.getTime())
    .map(({ a, deadline }) => ({
      applicationId: a.id,
      title: a.title,
      status: a.status,
      deadline: deadline.toISOString(),
      daysLeft: Math.ceil((deadline.getTime() - now.getTime()) / DAY),
      opportunityId: a.opportunityId,
      funderName: a.funderName,
    }));

  return {
    counts: { byStatus },
    upcomingDeadlines,
    pendingReviews: byStatus.in_review ?? 0,
    awardedCents: Number(awarded?.total ?? 0),
    submittedThisMonth: Number(submittedRow?.n ?? 0),
    recentActivity: activity.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  };
}
