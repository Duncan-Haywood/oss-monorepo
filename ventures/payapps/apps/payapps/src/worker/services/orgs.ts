// Organizations (the subcontractor's company) and their members.

import type { MeDto, MemberDto } from "@shared/api/types";
import { type MemberRole, ROLE_RANK } from "@shared/enums";
import { and, asc, eq } from "drizzle-orm";
import type { AppContext } from "../context";
import { member, organization, user } from "../db/schema";
import { badRequest, conflict, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import type { Tenant } from "../types";
import { assertCanAddMember } from "./billing";

const asRole = (r: string): MemberRole => (r in ROLE_RANK ? (r as MemberRole) : "viewer");

export async function createOrg(ctx: AppContext, userId: string, name: string) {
  const orgId = newId("org");
  await ctx.db.batch([
    ctx.db.insert(organization).values({ id: orgId, name, slug: orgId }),
    ctx.db
      .insert(member)
      .values({ id: newId("mem"), organizationId: orgId, userId, role: "owner" }),
  ]);
  ctx.logger.info("org.created", { orgId });
  return { orgId };
}

export async function listMemberships(
  ctx: AppContext,
  userId: string,
): Promise<MeDto["memberships"]> {
  const rows = await ctx.db
    .select({ orgId: organization.id, orgName: organization.name, role: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(asc(organization.name));
  return rows.map((r) => ({ ...r, role: asRole(r.role) }));
}

export async function listMembers(ctx: AppContext, orgId: string): Promise<MemberDto[]> {
  const rows = await ctx.db
    .select({
      id: member.id,
      userId: member.userId,
      name: user.name,
      email: user.email,
      role: member.role,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, orgId))
    .orderBy(asc(user.name));
  return rows.map((r) => ({ ...r, role: asRole(r.role) }));
}

/**
 * Adds an existing PayApps user to the org by email. (Email invitations need an email port; see
 * ROADMAP.md.) The same answer for unknown addresses would leak nothing more than "not found" does
 * here, since only admins of the org can call it.
 */
export async function addMember(
  ctx: AppContext,
  tenant: Tenant,
  email: string,
  role: MemberRole,
): Promise<MemberDto> {
  const u = await ctx.db.select().from(user).where(eq(user.email, email)).get();
  if (!u) throw notFound("User with that email");
  const existing = await ctx.db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, tenant.orgId), eq(member.userId, u.id)))
    .get();
  if (existing) throw conflict("That user is already a member");
  await assertCanAddMember(ctx, tenant.orgId);
  const id = newId("mem");
  await ctx.db.insert(member).values({ id, organizationId: tenant.orgId, userId: u.id, role });
  return { id, userId: u.id, name: u.name, email: u.email, role };
}

async function getMember(ctx: AppContext, orgId: string, memberId: string) {
  const row = await ctx.db
    .select()
    .from(member)
    .where(and(eq(member.id, memberId), eq(member.organizationId, orgId)))
    .get();
  if (!row) throw notFound("Member");
  return row;
}

async function ownerCount(ctx: AppContext, orgId: string) {
  const owners = await ctx.db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, orgId), eq(member.role, "owner")));
  return owners.length;
}

export async function changeMemberRole(
  ctx: AppContext,
  tenant: Tenant,
  memberId: string,
  role: MemberRole,
) {
  const row = await getMember(ctx, tenant.orgId, memberId);
  // Only owners may grant or take away ownership.
  if ((role === "owner" || row.role === "owner") && tenant.role !== "owner") {
    throw badRequest("Only an owner can change ownership");
  }
  if (row.role === "owner" && role !== "owner" && (await ownerCount(ctx, tenant.orgId)) <= 1) {
    throw badRequest("An organization needs at least one owner");
  }
  await ctx.db
    .update(member)
    .set({ role })
    .where(and(eq(member.id, memberId), eq(member.organizationId, tenant.orgId)));
}

export async function removeMember(ctx: AppContext, tenant: Tenant, memberId: string) {
  const row = await getMember(ctx, tenant.orgId, memberId);
  if (row.role === "owner" && tenant.role !== "owner")
    throw badRequest("Only an owner can remove an owner");
  if (row.role === "owner" && (await ownerCount(ctx, tenant.orgId)) <= 1) {
    throw badRequest("An organization needs at least one owner");
  }
  await ctx.db
    .delete(member)
    .where(and(eq(member.id, memberId), eq(member.organizationId, tenant.orgId)));
}
