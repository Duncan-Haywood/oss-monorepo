// Getting-started guide (GET /api/orgs/:orgId/guide). Progress is computed from the org's real data on
// every call: no table of its own. Every query below filters by the caller's orgId and is a bounded
// count (or a LIMIT 1 existence check), so the endpoint stays cheap enough to poll from the shell.
import type { GuideDto } from "@shared/guide";
import { and, count, eq, inArray, isNotNull, ne } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  applicationFlags,
  applications,
  applicationVersions,
  auditLog,
  documents,
  facts,
  feedback,
  interviews,
  invitation,
  member,
  opportunityMatches,
  orgProfiles,
  orgSettings,
  projects,
  reviews,
} from "../../db/schema";
import { buildGuide, type GuideState, missingProfileFields } from "./steps";

export * from "./steps";

/** Settings keys whose explicit save counts as "chose an automation level". */
const AUTOMATION_KEYS = new Set(["automationLevel", "autopilotEnabled"]);

export async function getGuideState(ctx: AppContext, orgId: string): Promise<GuideState> {
  const db = ctx.db;
  const n = (row: { n: number } | undefined) => Number(row?.n ?? 0);

  const [
    profile,
    settings,
    docRows,
    factRows,
    interviewRows,
    projectCount,
    shortlistCount,
    draftCount,
    userVersion,
    resolvedFlag,
    reviewRow,
    feedbackRow,
    settingsAudits,
    memberCount,
    inviteCount,
  ] = await Promise.all([
    db
      .select({
        legalName: orgProfiles.legalName,
        ein: orgProfiles.ein,
        city: orgProfiles.city,
        state: orgProfiles.state,
        focusAreas: orgProfiles.focusAreas,
        serviceAreas: orgProfiles.serviceAreas,
      })
      .from(orgProfiles)
      .where(eq(orgProfiles.orgId, orgId))
      .get(),
    db
      .select({ automationLevel: orgSettings.automationLevel })
      .from(orgSettings)
      .where(eq(orgSettings.orgId, orgId))
      .get(),
    db
      .select({ kind: documents.kind, n: count() })
      .from(documents)
      .where(and(eq(documents.orgId, orgId), ne(documents.status, "failed")))
      .groupBy(documents.kind)
      .all(),
    db
      .select({ status: facts.status, n: count() })
      .from(facts)
      .where(and(eq(facts.orgId, orgId), inArray(facts.status, ["proposed", "confirmed"])))
      .groupBy(facts.status)
      .all(),
    db
      .select({ status: interviews.status, n: count() })
      .from(interviews)
      .where(eq(interviews.orgId, orgId))
      .groupBy(interviews.status)
      .all(),
    db
      .select({ n: count() })
      .from(projects)
      .where(and(eq(projects.orgId, orgId), ne(projects.status, "archived")))
      .get(),
    db
      .select({ n: count() })
      .from(opportunityMatches)
      .where(
        and(
          eq(opportunityMatches.orgId, orgId),
          inArray(opportunityMatches.status, ["shortlisted", "drafting", "applied"]),
        ),
      )
      .get(),
    db
      .select({ n: count() })
      .from(applications)
      .where(and(eq(applications.orgId, orgId), isNotNull(applications.currentVersionId)))
      .get(),
    db
      .select({ id: applicationVersions.id })
      .from(applicationVersions)
      .where(and(eq(applicationVersions.orgId, orgId), eq(applicationVersions.authorType, "user")))
      .limit(1)
      .get(),
    db
      .select({ id: applicationFlags.id })
      .from(applicationFlags)
      .where(and(eq(applicationFlags.orgId, orgId), isNotNull(applicationFlags.resolvedBy)))
      .limit(1)
      .get(),
    db.select({ id: reviews.id }).from(reviews).where(eq(reviews.orgId, orgId)).limit(1).get(),
    db.select({ id: feedback.id }).from(feedback).where(eq(feedback.orgId, orgId)).limit(1).get(),
    db
      .select({ metadata: auditLog.metadata })
      .from(auditLog)
      .where(and(eq(auditLog.orgId, orgId), eq(auditLog.action, "org.settings_updated")))
      .limit(50)
      .all(),
    db.select({ n: count() }).from(member).where(eq(member.organizationId, orgId)).get(),
    db
      .select({ n: count() })
      .from(invitation)
      .where(and(eq(invitation.organizationId, orgId), eq(invitation.status, "pending")))
      .get(),
  ]);

  const byKind = new Map(docRows.map((r) => [r.kind, Number(r.n)]));
  const factBy = new Map(factRows.map((r) => [r.status, Number(r.n)]));
  const interviewBy = new Map(interviewRows.map((r) => [r.status, Number(r.n)]));
  const savedAutomation = settingsAudits.some((r) => {
    const keys = (r.metadata as { changedKeys?: unknown } | null)?.changedKeys;
    return Array.isArray(keys) && keys.some((k) => AUTOMATION_KEYS.has(String(k)));
  });

  return {
    profileMissing: missingProfileFields(profile),
    documents: [...byKind.values()].reduce((a, b) => a + b, 0),
    pastApplications: byKind.get("past_application") ?? 0,
    confirmedFacts: factBy.get("confirmed") ?? 0,
    proposedFacts: factBy.get("proposed") ?? 0,
    completedInterviews: interviewBy.get("completed") ?? 0,
    activeInterviews: interviewBy.get("active") ?? 0,
    projects: n(projectCount),
    shortlisted: n(shortlistCount),
    drafts: n(draftCount),
    draftChecked: Boolean(userVersion || resolvedFlag || reviewRow || feedbackRow),
    automationChosen: settings?.automationLevel != null || savedAutomation,
    otherMembers: Math.max(0, n(memberCount) - 1),
    pendingInvitations: n(inviteCount),
  };
}

export async function getGuide(ctx: AppContext, orgId: string): Promise<GuideDto> {
  return buildGuide(await getGuideState(ctx, orgId));
}
