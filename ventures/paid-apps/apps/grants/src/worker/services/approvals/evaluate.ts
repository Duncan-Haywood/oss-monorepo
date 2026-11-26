// Evaluate an application version against the org's approval policy (and the two-person rule), and
// gate review decisions: an "approved" decision is recorded as one approval, and submission goes
// ahead only once enough of the right people have approved this exact version.
import {
  type ApprovalStatusDto,
  type ApprovalSubject,
  approvalCountLabel,
  requiredApprovals,
  selectApprovalRule,
} from "@shared/approvals";
import type { FunderType, MemberRole } from "@shared/enums";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  applications,
  applicationVersions,
  funders,
  member,
  opportunities,
  reviews,
  user,
} from "../../db/schema";
import { AppError, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { notify } from "../notifications";
import { loadSettings } from "../pipeline/steps";
import { audit } from "../privacy/audit";
import { loadDelegationWindows } from "./delegations";
import {
  approvalWouldCount,
  type CountInput,
  type CountResult,
  countApprovals,
  delegationActive,
  type MemberInfo,
} from "./matching";
import { loadRules } from "./policies";
import { twoPersonRuleApplies } from "./two-person";

export interface ApprovalIds {
  orgId: string;
  applicationId: string;
  versionId: string;
}

export interface ApprovalEvaluation extends ApprovalStatusDto {
  /** Internal: who could still approve (identities), for notifications. */
  openIdentities: string[];
}

interface Loaded {
  count: CountInput;
  result: CountResult;
  rule: { id: string; name: string };
  twoPersonRule: boolean;
  applicationTitle: string;
}

async function loadMembers(ctx: AppContext, orgId: string): Promise<Map<string, MemberInfo>> {
  const rows = await ctx.db
    .select({ userId: member.userId, role: member.role, name: user.name })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, orgId))
    .all();
  return new Map(
    rows.map((r) => [r.userId, { userId: r.userId, name: r.name, role: r.role as MemberRole }]),
  );
}

async function load(ctx: AppContext, ids: ApprovalIds): Promise<Loaded> {
  const { orgId, applicationId, versionId } = ids;
  const app = await ctx.db
    .select({
      id: applications.id,
      title: applications.title,
      createdBy: applications.createdBy,
      reviewTier: applications.reviewTier,
      requestedAmountCents: applications.requestedAmountCents,
      funderId: opportunities.funderId,
      funderType: funders.type,
    })
    .from(applications)
    .innerJoin(opportunities, eq(opportunities.id, applications.opportunityId))
    .leftJoin(funders, eq(funders.id, opportunities.funderId))
    .where(and(eq(applications.id, applicationId), eq(applications.orgId, orgId)))
    .get();
  if (!app) throw notFound("Application");
  const version = await ctx.db
    .select({ id: applicationVersions.id })
    .from(applicationVersions)
    .where(
      and(
        eq(applicationVersions.id, versionId),
        eq(applicationVersions.orgId, orgId),
        eq(applicationVersions.applicationId, applicationId),
      ),
    )
    .get();
  if (!version) throw notFound("Application version");

  const [rules, settings, members, delegations, approvals, editors] = await Promise.all([
    loadRules(ctx, orgId),
    loadSettings(ctx, orgId),
    loadMembers(ctx, orgId),
    loadDelegationWindows(ctx, orgId),
    ctx.db
      .select({ userId: reviews.reviewerId, at: reviews.createdAt })
      .from(reviews)
      .where(
        and(
          eq(reviews.orgId, orgId),
          eq(reviews.applicationId, applicationId),
          eq(reviews.versionId, versionId),
          eq(reviews.decision, "approved"),
        ),
      )
      .orderBy(asc(reviews.createdAt))
      .all(),
    ctx.db
      .selectDistinct({ authorId: applicationVersions.authorId })
      .from(applicationVersions)
      .where(
        and(
          eq(applicationVersions.orgId, orgId),
          eq(applicationVersions.applicationId, applicationId),
          eq(applicationVersions.authorType, "user"),
          isNotNull(applicationVersions.authorId),
        ),
      )
      .all(),
  ]);

  const subject: ApprovalSubject = {
    requestedAmountCents: app.requestedAmountCents ?? null,
    funderType: (app.funderType as FunderType | null) ?? null,
    funderId: app.funderId ?? null,
    tier: app.reviewTier ?? null,
  };
  const { rule } = selectApprovalRule(rules, subject);
  const twoPersonRule = twoPersonRuleApplies(settings, subject.requestedAmountCents);
  const authors = new Set<string>();
  if (app.createdBy) authors.add(app.createdBy);
  for (const e of editors) if (e.authorId) authors.add(e.authorId);
  const count: CountInput = {
    rule,
    needed: requiredApprovals(rule, twoPersonRule),
    members,
    approvals,
    delegations,
    authors,
  };
  return {
    count,
    result: countApprovals(count),
    rule: { id: rule.id, name: rule.name },
    twoPersonRule,
    applicationTitle: app.title,
  };
}

const toEvaluation = (l: Loaded, versionId: string): ApprovalEvaluation => ({
  satisfied: l.result.satisfied,
  needed: l.result.needed,
  have: l.result.have,
  missingDescription: l.result.missingDescription,
  rule: l.rule,
  twoPersonRule: l.twoPersonRule,
  versionId,
  openIdentities: l.result.openIdentities,
});

/** Where a version stands against the policy: who approved, how many are needed, who is missing. */
export async function evaluateApproval(
  ctx: AppContext,
  ids: ApprovalIds,
): Promise<ApprovalEvaluation> {
  return toEvaluation(await load(ctx, ids), ids.versionId);
}

/** The API shape (drops internal fields). */
export function toApprovalStatusDto(e: ApprovalEvaluation): ApprovalStatusDto {
  const { openIdentities: _omit, ...dto } = e;
  return dto;
}

export interface ApprovalGate {
  /** true: this approval completes the policy, submit now. false: keep the application in review. */
  proceed: boolean;
  /** true when this call already wrote the approval's `reviews` row (the caller must not). */
  recorded: boolean;
  evaluation: ApprovalEvaluation;
  /** "1 of 2 approvals. Waiting for an admin" (empty when proceeding). */
  message: string;
}

/**
 * Called by submitReviewDecision for an "approved" decision, before the submission claim.
 *  - Already satisfied (e.g. retrying a failed submission): proceed, the caller records as usual.
 *  - This approval completes the policy: proceed (the caller claims, records and submits).
 *  - Otherwise: record the approval here, audit it, notify who is still needed, and tell the caller
 *    to leave the application in review. Re-checked after recording, so of two concurrent partial
 *    approvals that together complete the policy, at least one proceeds.
 * Throws 403 when this person's approval cannot count, 409 when they already approved this version.
 */
export async function gateApproval(
  ctx: AppContext,
  ids: ApprovalIds & { approverId: string; comments: string; requestId?: string },
): Promise<ApprovalGate> {
  const before = await load(ctx, ids);
  if (before.result.satisfied) {
    return {
      proceed: true,
      recorded: false,
      evaluation: toEvaluation(before, ids.versionId),
      message: "",
    };
  }
  const already = before.count.approvals.some((a) => a.userId === ids.approverId);
  if (already) {
    throw new AppError(
      409,
      "already_approved",
      `You already approved this version. ${approvalCountLabel(before.result.have.length, before.result.needed)} — ${before.result.missingDescription}.`,
    );
  }
  const now = ctx.now();
  if (!approvalWouldCount(before.count, { userId: ids.approverId, at: now })) {
    throw new AppError(
      403,
      "approval_not_eligible",
      `Your approval can't count toward "${before.rule.name}": ${lowerFirst(before.result.missingDescription)}.`,
    );
  }
  const completes = countApprovals({
    ...before.count,
    approvals: [...before.count.approvals, { userId: ids.approverId, at: now }],
  }).satisfied;
  if (completes) {
    return {
      proceed: true,
      recorded: false,
      evaluation: toEvaluation(before, ids.versionId),
      message: "",
    };
  }

  await ctx.db.insert(reviews).values({
    id: newId("rev"),
    orgId: ids.orgId,
    applicationId: ids.applicationId,
    versionId: ids.versionId,
    reviewerId: ids.approverId,
    decision: "approved",
    comments: ids.comments,
  });
  const after = await load(ctx, ids);
  const evaluation = toEvaluation(after, ids.versionId);
  const label = approvalCountLabel(after.result.have.length, after.result.needed);
  await audit(ctx, {
    orgId: ids.orgId,
    actorType: "user",
    actorId: ids.approverId,
    action: "application.approval_recorded",
    targetType: "application",
    targetId: ids.applicationId,
    metadata: {
      versionId: ids.versionId,
      ruleId: after.rule.id,
      have: after.result.have.length,
      needed: after.result.needed,
      twoPersonRule: after.twoPersonRule,
      onBehalfOf:
        after.result.have.find((h) => h.userId === ids.approverId)?.onBehalfOf?.userId ?? null,
    },
    requestId: ids.requestId,
  });
  if (after.result.satisfied) {
    // A concurrent approval completed the policy meanwhile: this request submits (or loses the
    // claim to the other one, which then submits).
    return { proceed: true, recorded: true, evaluation, message: "" };
  }
  await notifyMissingApprovers(ctx, ids, after, label);
  return {
    proceed: false,
    recorded: true,
    evaluation,
    message: `${label}. ${after.result.missingDescription}`,
  };
}

const lowerFirst = (s: string) => (s ? s[0]?.toLowerCase() + s.slice(1) : s);

/** Tell the people who could still approve (and their active delegates). Never throws. */
async function notifyMissingApprovers(
  ctx: AppContext,
  ids: ApprovalIds & { approverId: string },
  l: Loaded,
  label: string,
) {
  const now = ctx.now();
  const recipients = new Set(l.result.openIdentities);
  for (const d of l.count.delegations) {
    if (recipients.has(d.fromUserId) && delegationActive(d, now)) recipients.add(d.toUserId);
  }
  recipients.delete(ids.approverId);
  for (const a of l.count.approvals) recipients.delete(a.userId);
  if (recipients.size === 0) return;
  await notify(ctx, {
    orgId: ids.orgId,
    recipients: [...recipients],
    kind: "application.ready_for_review",
    title: `Approval needed: ${l.applicationTitle}`,
    body: `${label}. ${l.result.missingDescription}.`,
    link: `/orgs/${ids.orgId}/applications/${ids.applicationId}`,
    severity: "action",
    dedupeKey: `approval:${ids.applicationId}:${ids.versionId}:${l.result.have.length}`,
  });
}
