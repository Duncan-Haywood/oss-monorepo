// Read models for the applications API (all tenant-scoped by orgId).
import type { ApplicationStatus } from "@shared/enums";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  applicationFlags,
  applications,
  applicationVersions,
  opportunities,
  submissions,
} from "../../db/schema";
import { notFound } from "../../lib/errors";
import { getFactsByIds } from "../knowledge";
import { citedFactIds, loadApplication, loadVersion, loadVisibleOpportunity } from "./steps";

export async function listApplications(
  ctx: AppContext,
  orgId: string,
  opts: { statuses?: ApplicationStatus[] } = {},
) {
  const where = [eq(applications.orgId, orgId)];
  if (opts.statuses && opts.statuses.length > 0) {
    where.push(inArray(applications.status, opts.statuses));
  }
  const rows = await ctx.db
    .select({
      app: applications,
      opportunity: {
        id: opportunities.id,
        title: opportunities.title,
        funderName: opportunities.funderName,
        closeDate: opportunities.closeDate,
      },
    })
    .from(applications)
    .innerJoin(opportunities, eq(opportunities.id, applications.opportunityId))
    .where(and(...where))
    .orderBy(desc(applications.updatedAt))
    .limit(200)
    .all();
  return rows.map((r) => ({ ...r.app, opportunity: r.opportunity }));
}

export async function getApplicationDetail(ctx: AppContext, orgId: string, applicationId: string) {
  const ids = { orgId, applicationId };
  const app = await loadApplication(ctx, ids);
  const opportunity = await loadVisibleOpportunity(ctx, orgId, app.opportunityId);
  if (!opportunity) throw notFound("Opportunity");
  const currentVersion = app.currentVersionId
    ? ((await loadVersion(ctx, ids, app.currentVersionId)) ?? null)
    : null;
  const versions = await ctx.db
    .select({
      id: applicationVersions.id,
      versionNumber: applicationVersions.versionNumber,
      createdAt: applicationVersions.createdAt,
      authorType: applicationVersions.authorType,
    })
    .from(applicationVersions)
    .where(
      and(
        eq(applicationVersions.orgId, orgId),
        eq(applicationVersions.applicationId, applicationId),
      ),
    )
    .orderBy(desc(applicationVersions.versionNumber))
    .all();
  const flags = currentVersion
    ? await ctx.db
        .select()
        .from(applicationFlags)
        .where(
          and(
            eq(applicationFlags.orgId, orgId),
            eq(applicationFlags.applicationId, applicationId),
            eq(applicationFlags.versionId, currentVersion.id),
          ),
        )
        .orderBy(applicationFlags.createdAt)
        .all()
    : [];
  const citedIds = currentVersion ? citedFactIds(currentVersion.content) : [];
  // Chunked IN lists: a draft can cite more facts than D1's 100 bound parameters.
  const citedFacts = citedIds.length > 0 ? await getFactsByIds(ctx, orgId, citedIds) : [];
  const subs = await ctx.db
    .select()
    .from(submissions)
    .where(and(eq(submissions.orgId, orgId), eq(submissions.applicationId, applicationId)))
    .orderBy(desc(submissions.createdAt))
    .all();
  return { ...app, opportunity, currentVersion, versions, flags, citedFacts, submissions: subs };
}
