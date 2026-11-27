// Organizations, membership and the org profile (system description). Org/member rows are our own
// tables; Better Auth only owns users and sessions.
import { type MemberRole, ROLE_RANK } from "@shared/enums";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { member, organization, orgProfile, user } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { audit } from "../audit";

export async function createOrg(
  ctx: AppContext,
  userId: string,
  input: { name: string; legalName?: string; targetLevel: 1 | 2 },
) {
  const orgId = newId("org");
  await ctx.db.batch([
    ctx.db.insert(organization).values({ id: orgId, name: input.name, slug: orgId }),
    ctx.db
      .insert(member)
      .values({ id: newId("mem"), organizationId: orgId, userId, role: "owner" }),
    ctx.db.insert(orgProfile).values({
      orgId,
      targetLevel: input.targetLevel,
      legalName: input.legalName ?? input.name,
    }),
  ]);
  await audit(ctx, {
    orgId,
    actorUserId: userId,
    action: "org.create",
    targetType: "org",
    targetId: orgId,
  });
  return { orgId };
}

export async function listOrgsForUser(ctx: AppContext, userId: string) {
  return ctx.db
    .select({ id: organization.id, name: organization.name, role: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .all();
}

export async function getOrg(ctx: AppContext, orgId: string) {
  const org = await ctx.db
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .where(eq(organization.id, orgId))
    .get();
  if (!org) throw notFound("Organization");
  const profile = await getProfile(ctx, orgId);
  return { org, profile };
}

export async function getProfile(ctx: AppContext, orgId: string) {
  const row = await ctx.db.select().from(orgProfile).where(eq(orgProfile.orgId, orgId)).get();
  if (row) return row;
  await ctx.db.insert(orgProfile).values({ orgId }).onConflictDoNothing();
  const created = await ctx.db.select().from(orgProfile).where(eq(orgProfile.orgId, orgId)).get();
  if (!created) throw notFound("Organization profile");
  return created;
}

export type ProfilePatch = Partial<Omit<typeof orgProfile.$inferInsert, "orgId" | "updatedAt">>;

export async function updateProfile(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  patch: ProfilePatch,
) {
  await getProfile(ctx, orgId);
  await ctx.db.update(orgProfile).set(patch).where(eq(orgProfile.orgId, orgId));
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "profile.update",
    targetType: "org",
    targetId: orgId,
  });
  return getProfile(ctx, orgId);
}

export async function listMembers(ctx: AppContext, orgId: string) {
  return ctx.db
    .select({
      id: member.id,
      userId: member.userId,
      name: user.name,
      email: user.email,
      role: member.role,
      createdAt: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, orgId))
    .all();
}

export async function isMember(ctx: AppContext, orgId: string, userId: string) {
  const row = await ctx.db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)))
    .get();
  return !!row;
}

/**
 * Adds an existing account by email. There are no emailed invitations yet; the person signs up first,
 * then an admin adds them. The response is the same shape whether or not the email exists only for
 * admins, who are already trusted with the member list. Where sign-in requires a confirmed address,
 * so does being added: an account someone created with another person's address, and never
 * confirmed, must not be put into an organization under that address.
 */
export async function addMember(
  ctx: AppContext,
  orgId: string,
  actor: { userId: string; role: MemberRole },
  input: { email: string; role: MemberRole },
  opts: { requireVerifiedEmail: boolean } = { requireVerifiedEmail: true },
) {
  if (input.role === "owner" && actor.role !== "owner")
    throw badRequest("Only an owner can add an owner");
  const u = await ctx.db
    .select({ id: user.id, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.email, input.email.trim().toLowerCase()))
    .get();
  if (!u) throw notFound("Account with that email (ask them to sign up first)");
  if (opts.requireVerifiedEmail && !u.emailVerified) {
    throw badRequest(
      "That account hasn't confirmed its email address yet. Ask them to open the confirmation link we emailed, then add them again.",
    );
  }
  if (await isMember(ctx, orgId, u.id)) throw conflict("Already a member");
  const id = newId("mem");
  await ctx.db.insert(member).values({ id, organizationId: orgId, userId: u.id, role: input.role });
  await audit(ctx, {
    orgId,
    actorUserId: actor.userId,
    action: "member.add",
    targetType: "member",
    targetId: id,
  });
  return { id };
}

async function memberOf(ctx: AppContext, orgId: string, memberId: string) {
  const row = await ctx.db
    .select()
    .from(member)
    .where(and(eq(member.id, memberId), eq(member.organizationId, orgId)))
    .get();
  if (!row) throw notFound("Member");
  return row;
}

async function ownerCount(ctx: AppContext, orgId: string) {
  const rows = await ctx.db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, orgId), eq(member.role, "owner")))
    .all();
  return rows.length;
}

export async function updateMemberRole(
  ctx: AppContext,
  orgId: string,
  actor: { userId: string; role: MemberRole },
  memberId: string,
  role: MemberRole,
) {
  const m = await memberOf(ctx, orgId, memberId);
  const touchesOwner = m.role === "owner" || role === "owner";
  if (touchesOwner && actor.role !== "owner")
    throw badRequest("Only an owner can change owner roles");
  if (m.role === "owner" && role !== "owner" && (await ownerCount(ctx, orgId)) <= 1) {
    throw badRequest("An organization needs at least one owner");
  }
  await ctx.db
    .update(member)
    .set({ role })
    .where(and(eq(member.id, memberId), eq(member.organizationId, orgId)));
  await audit(ctx, {
    orgId,
    actorUserId: actor.userId,
    action: "member.role",
    targetType: "member",
    targetId: memberId,
  });
}

export async function removeMember(
  ctx: AppContext,
  orgId: string,
  actor: { userId: string; role: MemberRole },
  memberId: string,
) {
  const m = await memberOf(ctx, orgId, memberId);
  if (m.role === "owner" && actor.role !== "owner")
    throw badRequest("Only an owner can remove an owner");
  if (ROLE_RANK[m.role as MemberRole] === ROLE_RANK.owner && (await ownerCount(ctx, orgId)) <= 1) {
    throw badRequest("An organization needs at least one owner");
  }
  await ctx.db.delete(member).where(and(eq(member.id, memberId), eq(member.organizationId, orgId)));
  await audit(ctx, {
    orgId,
    actorUserId: actor.userId,
    action: "member.remove",
    targetType: "member",
    targetId: memberId,
  });
}
