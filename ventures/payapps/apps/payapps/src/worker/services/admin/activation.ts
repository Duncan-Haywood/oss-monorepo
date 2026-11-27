// The getting-started checklist counted across companies, for the owner's metrics: how many
// reached each step and on which required step each one stalled. Cross-tenant, so it selects ids,
// statuses and counts only (no names, amounts or any other tenant content), and every step is
// decided by the same rules the company's own checklist uses (src/shared/getting-started.ts).
import {
  type ActivationFunnel,
  type ActivationStepDef,
  activationCohorts,
  type OrgActivation,
} from "@admin-metrics";
import {
  type GettingStartedInput,
  type GettingStartedJob,
  gettingStarted,
} from "@shared/getting-started";
import { asc, count, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  invitation,
  member,
  organization,
  payAppPayments,
  payApps,
  projects,
  qboConnections,
  sovLines,
} from "../../db/schema";
import { livePending } from "../invitations";

/** Short labels for the console; the keys and order are the checklist's own. */
const LABELS: Record<string, string> = {
  job: "Added a job",
  sov: "Entered a schedule of values",
  "pay-app": "Started a pay application",
  send: "Sent one to the GC",
  paid: "Recorded the GC's payment",
  team: "Invited a teammate (optional)",
  quickbooks: "Connected QuickBooks (optional)",
};

export async function activationFunnel(
  ctx: AppContext,
  since: Date,
  windowDays: number,
): Promise<ActivationFunnel> {
  const { db } = ctx;
  const [orgs, jobs, lines, apps, pays, members, pending, qbo] = await Promise.all([
    db.select({ id: organization.id, createdAt: organization.createdAt }).from(organization).all(),
    db
      .select({ id: projects.id, orgId: projects.orgId })
      .from(projects)
      // The sample job never counts, as on the checklist.
      .where(eq(projects.isSample, false))
      .orderBy(asc(projects.createdAt), asc(projects.id))
      .all(),
    db
      .select({ projectId: sovLines.projectId, n: count() })
      .from(sovLines)
      .groupBy(sovLines.projectId)
      .all(),
    db
      .select({
        id: payApps.id,
        projectId: payApps.projectId,
        number: payApps.number,
        status: payApps.status,
      })
      .from(payApps)
      .orderBy(asc(payApps.number))
      .all(),
    db
      .select({ payAppId: payAppPayments.payAppId, n: count() })
      .from(payAppPayments)
      .groupBy(payAppPayments.payAppId)
      .all(),
    db
      .select({ orgId: member.organizationId, n: count() })
      .from(member)
      .groupBy(member.organizationId)
      .all(),
    db
      .select({ orgId: invitation.organizationId, n: count() })
      .from(invitation)
      .where(livePending(ctx))
      .groupBy(invitation.organizationId)
      .all(),
    db.select({ orgId: qboConnections.orgId }).from(qboConnections).all(),
  ]);

  const lineCount = new Map(lines.map((l) => [l.projectId, l.n]));
  const payCount = new Map(pays.map((p) => [p.payAppId, p.n]));
  const appsByJob = new Map<string, GettingStartedJob["payApps"]>();
  for (const a of apps) {
    const list = appsByJob.get(a.projectId) ?? [];
    list.push({
      id: a.id,
      number: a.number,
      status: a.status,
      paymentCount: payCount.get(a.id) ?? 0,
    });
    appsByJob.set(a.projectId, list);
  }
  const jobsByOrg = new Map<string, GettingStartedJob[]>();
  for (const j of jobs) {
    const list = jobsByOrg.get(j.orgId) ?? [];
    // The name only feeds the checklist's wording, which is dropped here: never selected.
    list.push({
      id: j.id,
      name: "",
      sovLineCount: lineCount.get(j.id) ?? 0,
      payApps: appsByJob.get(j.id) ?? [],
    });
    jobsByOrg.set(j.orgId, list);
  }
  const memberCount = new Map(members.map((m) => [m.orgId, m.n]));
  const pendingCount = new Map(pending.map((p) => [p.orgId, p.n]));
  const connected = new Set(qbo.map((q) => q.orgId));

  const input = (orgId: string): GettingStartedInput => ({
    jobs: jobsByOrg.get(orgId) ?? [],
    hasSample: false,
    memberCount: memberCount.get(orgId) ?? 0,
    pendingInvitationCount: pendingCount.get(orgId) ?? 0,
    quickbooksConnected: connected.has(orgId),
    // Only changes the wording and link of the QuickBooks step, never whether it is done.
    quickbooksOnPlan: true,
  });
  // The step list and its order come from the checklist itself.
  const defs: ActivationStepDef[] = gettingStarted(input("")).steps.map((s) => ({
    key: s.key,
    label: LABELS[s.key] ?? s.title,
    optional: s.optional,
  }));
  const rows: OrgActivation[] = orgs.map((o) => ({
    createdAt: o.createdAt,
    done: Object.fromEntries(gettingStarted(input(o.id)).steps.map((s) => [s.key, s.done])),
  }));

  return {
    definition:
      "A company is one sign-up's organization; each step is done exactly as its own getting-started checklist decides (the sample job never counts). Stalled = the first required step not yet done.",
    cohorts: activationCohorts(defs, rows, since, windowDays),
  };
}
