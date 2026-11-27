// The getting-started checklist (src/shared/getting-started.ts holds the rules): a few counts per
// company, every query filtered by the tenant's org. Read-only, computed on each request.
import { type GettingStartedJob, gettingStarted } from "@shared/getting-started";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../../context";
import { allInChunks } from "../../db/in-chunks";
import { payAppPayments, payApps, projects, qboConnections, sovLines } from "../../db/schema";
import { orgPlan, usage } from "../billing";
import { pendingCount } from "../invitations";

export async function orgGettingStarted(ctx: AppContext, orgId: string) {
  const [rows, { plan }, used, pending, qbo] = await Promise.all([
    ctx.db
      .select({ id: projects.id, name: projects.name, isSample: projects.isSample })
      .from(projects)
      .where(eq(projects.orgId, orgId))
      .orderBy(asc(projects.createdAt), asc(projects.id))
      .all(),
    orgPlan(ctx, orgId),
    usage(ctx, orgId),
    pendingCount(ctx, orgId),
    ctx.db
      .select({ orgId: qboConnections.orgId })
      .from(qboConnections)
      .where(eq(qboConnections.orgId, orgId))
      .get(),
  ]);
  const real = rows.filter((r) => !r.isSample);
  const ids = real.map((r) => r.id);

  // Per job, in slices of job ids (D1's 100-parameter cap; a company past ~98 jobs broke the
  // checklist). Grouping and the pay-app order are per job, and a job sits in one slice.
  const [lines, apps, pays] = await Promise.all([
    allInChunks(ids, (slice) =>
      ctx.db
        .select({ projectId: sovLines.projectId, n: count() })
        .from(sovLines)
        .where(and(eq(sovLines.orgId, orgId), inArray(sovLines.projectId, slice)))
        .groupBy(sovLines.projectId)
        .all(),
    ),
    allInChunks(ids, (slice) =>
      ctx.db
        .select({
          id: payApps.id,
          projectId: payApps.projectId,
          number: payApps.number,
          status: payApps.status,
        })
        .from(payApps)
        .where(and(eq(payApps.orgId, orgId), inArray(payApps.projectId, slice)))
        .orderBy(asc(payApps.number))
        .all(),
    ),
    allInChunks(ids, (slice) =>
      ctx.db
        .select({ payAppId: payAppPayments.payAppId, n: count() })
        .from(payAppPayments)
        .innerJoin(payApps, eq(payApps.id, payAppPayments.payAppId))
        .where(
          and(
            eq(payAppPayments.orgId, orgId),
            eq(payApps.orgId, orgId),
            inArray(payApps.projectId, slice),
          ),
        )
        .groupBy(payAppPayments.payAppId)
        .all(),
    ),
  ]);

  const lineCount = new Map(lines.map((l) => [l.projectId, l.n]));
  const payCount = new Map(pays.map((p) => [p.payAppId, p.n]));
  const jobs: GettingStartedJob[] = real.map((r) => ({
    id: r.id,
    name: r.name,
    sovLineCount: lineCount.get(r.id) ?? 0,
    payApps: apps
      .filter((a) => a.projectId === r.id)
      .map((a) => ({
        id: a.id,
        number: a.number,
        status: a.status,
        paymentCount: payCount.get(a.id) ?? 0,
      })),
  }));

  return gettingStarted({
    jobs,
    hasSample: rows.some((r) => r.isSample),
    memberCount: used.members,
    pendingInvitationCount: pending,
    quickbooksConnected: Boolean(qbo),
    quickbooksOnPlan: plan.quickbooks,
  });
}
