// Approval policy storage: one ordered rule list per org (approval_policies). Every read and write
// is scoped by the caller's tenant orgId; specific approvers must be members who can approve.
import {
  APPROVER_ROLES,
  type ApprovalPolicyDto,
  type ApprovalPolicyInput,
  type ApprovalRule,
  DEFAULT_APPROVAL_RULE,
} from "@shared/approvals";
import { and, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../../context";
import { member } from "../../db/schema";
import { approvalPolicies } from "../../db/schema/approvals";
import { chunk, D1_IN_CHUNK } from "../../lib/chunk";
import { badRequest } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { audit } from "../privacy/audit";

/** `newId` has no approval prefixes yet (lib/ids.ts is shared); derive them like members do. */
export const ruleId = () => newId("org").replace(/^org_/, "rule_").slice(0, 24);
export const delegationId = () => newId("org").replace(/^org_/, "dlg_");

/**
 * True when D1 says one of our tables does not exist. Until db/schema/index.ts exports approvals.ts
 * (integration pass) the tables are missing from migrations and the test schema; the pipeline then
 * behaves exactly as before (default rule, no delegations) instead of failing every approval.
 */
export function isMissingApprovalTable(e: unknown): boolean {
  const text = (x: unknown): string =>
    x instanceof Error ? `${x.message} ${text((x as Error & { cause?: unknown }).cause)}` : "";
  return /no such table: approval_(policies|delegations)/.test(text(e));
}

export async function loadRules(ctx: AppContext, orgId: string): Promise<ApprovalRule[]> {
  try {
    const row = await ctx.db
      .select({ rules: approvalPolicies.rules })
      .from(approvalPolicies)
      .where(eq(approvalPolicies.orgId, orgId))
      .get();
    return Array.isArray(row?.rules) ? row.rules : [];
  } catch (e) {
    if (!isMissingApprovalTable(e)) throw e;
    ctx.logger.warn("approvals.table_missing", { table: "approval_policies" });
    return [];
  }
}

export async function getApprovalPolicy(
  ctx: AppContext,
  orgId: string,
): Promise<ApprovalPolicyDto> {
  const row = await ctx.db
    .select()
    .from(approvalPolicies)
    .where(eq(approvalPolicies.orgId, orgId))
    .get();
  return {
    rules: row?.rules ?? [],
    defaultRule: DEFAULT_APPROVAL_RULE,
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    updatedBy: row?.updatedBy ?? null,
  };
}

/** Members of `orgId` (among `userIds`) who can approve: reviewer or above. */
export async function approverMemberIds(
  ctx: AppContext,
  orgId: string,
  userIds: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  for (const part of chunk([...new Set(userIds)], D1_IN_CHUNK - 10)) {
    const rows = await ctx.db
      .select({ userId: member.userId })
      .from(member)
      .where(
        and(
          eq(member.organizationId, orgId),
          inArray(member.userId, part),
          inArray(member.role, [...APPROVER_ROLES]),
        ),
      )
      .all();
    for (const r of rows) out.add(r.userId);
  }
  return out;
}

export async function saveApprovalPolicy(
  ctx: AppContext,
  input: { orgId: string; userId: string; requestId?: string } & ApprovalPolicyInput,
): Promise<ApprovalPolicyDto> {
  const { orgId } = input;
  const specific = [...new Set(input.rules.flatMap((r) => r.require.specificUserIds ?? []))];
  const allowed = await approverMemberIds(ctx, orgId, specific);
  const unknown = specific.filter((id) => !allowed.has(id));
  if (unknown.length > 0) {
    throw badRequest("Specific approvers must be members of this organization who can approve", {
      userIds: unknown,
    });
  }
  const rules: ApprovalRule[] = input.rules.map((r) => ({
    id: r.id ?? ruleId(),
    name: r.name,
    when: r.when,
    require: {
      approvers: r.require.approvers,
      roles: [...new Set(r.require.roles)],
      excludeAuthor: r.require.excludeAuthor,
      ...(r.require.specificUserIds?.length
        ? { specificUserIds: [...new Set(r.require.specificUserIds)] }
        : {}),
    },
  }));
  await ctx.db
    .insert(approvalPolicies)
    .values({ orgId, rules, updatedBy: input.userId })
    .onConflictDoUpdate({
      target: approvalPolicies.orgId,
      set: { rules, updatedBy: input.userId, updatedAt: new Date() },
    });
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: input.userId,
    action: "approval_policy.updated",
    targetType: "approval_policy",
    targetId: orgId,
    metadata: {
      rules: rules.map((r) => ({
        id: r.id,
        name: r.name,
        when: r.when,
        approvers: r.require.approvers,
        roles: r.require.roles,
        specificUserIds: r.require.specificUserIds ?? [],
        excludeAuthor: r.require.excludeAuthor,
      })),
    },
    requestId: input.requestId,
  });
  return getApprovalPolicy(ctx, orgId);
}
