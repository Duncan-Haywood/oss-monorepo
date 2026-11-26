// Delegation of approval authority: an out-of-office approver lets a colleague's approval count as
// theirs until a date. Only approvers (reviewer+) can delegate or receive; you delegate your own
// authority, or an admin sets it up for you. Every change is audited. Scoped by tenant orgId.
import { type DelegationDto, type DelegationInput, MAX_DELEGATION_DAYS } from "@shared/approvals";
import { ROLE_RANK } from "@shared/enums";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { AppContext } from "../../context";
import { user } from "../../db/schema";
import { approvalDelegations } from "../../db/schema/approvals";
import { badRequest, forbidden, notFound } from "../../lib/errors";
import type { Tenant } from "../../types";
import { audit } from "../privacy/audit";
import type { DelegationWindow } from "./matching";
import { approverMemberIds, delegationId, isMissingApprovalTable } from "./policies";

const DAY_MS = 86_400_000;

export type DelegationRow = typeof approvalDelegations.$inferSelect;

/** Every delegation in the org that could still matter for counting (not revoked before it began). */
export async function loadDelegationWindows(
  ctx: AppContext,
  orgId: string,
): Promise<DelegationWindow[]> {
  try {
    const rows = await ctx.db
      .select({
        fromUserId: approvalDelegations.fromUserId,
        toUserId: approvalDelegations.toUserId,
        createdAt: approvalDelegations.createdAt,
        until: approvalDelegations.until,
        revokedAt: approvalDelegations.revokedAt,
      })
      .from(approvalDelegations)
      .where(eq(approvalDelegations.orgId, orgId))
      .orderBy(asc(approvalDelegations.createdAt))
      .limit(500)
      .all();
    return rows;
  } catch (e) {
    if (!isMissingApprovalTable(e)) throw e;
    ctx.logger.warn("approvals.table_missing", { table: "approval_delegations" });
    return [];
  }
}

const fromUser = alias(user, "from_user");
const toUser = alias(user, "to_user");

const toDto = (r: {
  d: DelegationRow;
  fromName: string | null;
  toName: string | null;
}): DelegationDto => ({
  id: r.d.id,
  fromUserId: r.d.fromUserId,
  fromName: r.fromName ?? "",
  toUserId: r.d.toUserId,
  toName: r.toName ?? "",
  until: r.d.until.toISOString(),
  createdBy: r.d.createdBy,
  createdAt: r.d.createdAt.toISOString(),
});

/** Delegations in effect now or later (not expired, not revoked). */
export async function listDelegations(ctx: AppContext, orgId: string): Promise<DelegationDto[]> {
  const rows = await ctx.db
    .select({ d: approvalDelegations, fromName: fromUser.name, toName: toUser.name })
    .from(approvalDelegations)
    .leftJoin(fromUser, eq(fromUser.id, approvalDelegations.fromUserId))
    .leftJoin(toUser, eq(toUser.id, approvalDelegations.toUserId))
    .where(
      and(
        eq(approvalDelegations.orgId, orgId),
        isNull(approvalDelegations.revokedAt),
        gt(approvalDelegations.until, ctx.now()),
      ),
    )
    .orderBy(asc(approvalDelegations.until))
    .limit(200)
    .all();
  return rows.map(toDto);
}

async function getDelegation(ctx: AppContext, orgId: string, id: string): Promise<DelegationDto> {
  const row = await ctx.db
    .select({ d: approvalDelegations, fromName: fromUser.name, toName: toUser.name })
    .from(approvalDelegations)
    .leftJoin(fromUser, eq(fromUser.id, approvalDelegations.fromUserId))
    .leftJoin(toUser, eq(toUser.id, approvalDelegations.toUserId))
    .where(and(eq(approvalDelegations.id, id), eq(approvalDelegations.orgId, orgId)))
    .get();
  if (!row) throw notFound("Delegation");
  return toDto(row);
}

const isAdmin = (t: Tenant) => ROLE_RANK[t.role] >= ROLE_RANK.admin;

export async function createDelegation(
  ctx: AppContext,
  tenant: Tenant,
  input: DelegationInput,
  requestId?: string,
): Promise<DelegationDto> {
  const { orgId } = tenant;
  if (input.fromUserId !== tenant.userId && !isAdmin(tenant)) {
    throw forbidden("You can only delegate your own approvals. Ask an admin to set this up.");
  }
  if (input.fromUserId === input.toUserId) throw badRequest("Pick someone else to delegate to");
  const until = new Date(input.until);
  const now = ctx.now();
  if (until.getTime() <= now.getTime()) throw badRequest("The end date must be in the future");
  if (until.getTime() > now.getTime() + MAX_DELEGATION_DAYS * DAY_MS) {
    throw badRequest(`Delegations can last at most ${MAX_DELEGATION_DAYS} days`);
  }
  const approvers = await approverMemberIds(ctx, orgId, [input.fromUserId, input.toUserId]);
  if (!approvers.has(input.fromUserId) || !approvers.has(input.toUserId)) {
    // Same answer for "not a member" and "a viewer": never reveal other orgs' users.
    throw badRequest("Both people must be members of this organization who can approve");
  }

  // One live delegation per pair: setting it again moves the end date.
  const existing = await ctx.db
    .select({ id: approvalDelegations.id, until: approvalDelegations.until })
    .from(approvalDelegations)
    .where(
      and(
        eq(approvalDelegations.orgId, orgId),
        eq(approvalDelegations.fromUserId, input.fromUserId),
        eq(approvalDelegations.toUserId, input.toUserId),
        isNull(approvalDelegations.revokedAt),
        gt(approvalDelegations.until, now),
      ),
    )
    .get();
  let id: string;
  if (existing) {
    id = existing.id;
    await ctx.db
      .update(approvalDelegations)
      .set({ until })
      .where(and(eq(approvalDelegations.id, id), eq(approvalDelegations.orgId, orgId)));
  } else {
    id = delegationId();
    await ctx.db.insert(approvalDelegations).values({
      id,
      orgId,
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      until,
      createdBy: tenant.userId,
      createdAt: now,
    });
  }
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: tenant.userId,
    action: existing ? "approval.delegation_extended" : "approval.delegation_created",
    targetType: "approval_delegation",
    targetId: id,
    metadata: {
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      until: until.toISOString(),
      ...(existing ? { previousUntil: existing.until.toISOString() } : {}),
    },
    requestId,
  });
  return getDelegation(ctx, orgId, id);
}

export async function revokeDelegation(
  ctx: AppContext,
  tenant: Tenant,
  id: string,
  requestId?: string,
): Promise<void> {
  const d = await getDelegation(ctx, tenant.orgId, id);
  const involved = d.fromUserId === tenant.userId || d.toUserId === tenant.userId;
  if (!involved && !isAdmin(tenant)) {
    throw forbidden("Only the people involved or an admin can end this delegation");
  }
  await ctx.db
    .update(approvalDelegations)
    .set({ revokedAt: ctx.now(), revokedBy: tenant.userId })
    .where(
      and(
        eq(approvalDelegations.id, id),
        eq(approvalDelegations.orgId, tenant.orgId),
        isNull(approvalDelegations.revokedAt),
      ),
    );
  await audit(ctx, {
    orgId: tenant.orgId,
    actorType: "user",
    actorId: tenant.userId,
    action: "approval.delegation_revoked",
    targetType: "approval_delegation",
    targetId: id,
    metadata: { fromUserId: d.fromUserId, toUserId: d.toUserId },
    requestId,
  });
}
